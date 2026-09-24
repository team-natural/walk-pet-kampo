// P11: the hold, and the phone check that gates it (F-07-06, F-01-02). The rules worth pinning
// are the ones a screen cannot show — the eligibility gate, the seat count under an expired hold,
// and the attempt limit on a six-digit code.
import { env } from "cloudflare:workers";
import { activityLog, organizations, reservations, walkSlots, walkerPhoneVerificationTokens, walkerProfiles, walkers } from "@app/schema";
import { createDb } from "@app/schema/client";
import { ulid } from "@app/schema/ulid";
import { hashPassword } from "@app/server-kit/auth";
import { ConflictError, InvalidStateTransitionError, NotFoundError, RateLimitError } from "@app/server-kit/http";
import { RATE_LIMITS } from "@app/server-kit/rate-limit";
import { desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Session } from "../../src/lib/server/auth/session";
import { PhoneVerificationError, confirmPhoneVerification, requestPhoneVerification } from "../../src/lib/server/services/phone-verification";
import { checkReservationEligibility, createReservation, getOwnReservation, startPayment, transitionReservation } from "../../src/lib/server/services/reservations";

const db = createDb(env.DB);
const PHONE = "090-1234-5678";
const INPUT = { participantCount: 1, emergencyContactName: "山田 花子", emergencyContactPhone: "090-0000-0000" };

async function insertOrganization() {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(organizations)
    .values({ publicId: ulid(), name: `団体-${ulid()}`, slug: `org-${ulid().toLowerCase()}`, representativeName: "代表", addressVisibility: "prefecture_only", status: "approved", updatedAt: now })
    .returning();
  return row!;
}

async function insertWalkSlot(organizationId: number, overrides: Partial<typeof walkSlots.$inferInsert> = {}) {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(walkSlots)
    .values({
      publicId: ulid(),
      organizationId,
      title: "朝の荒川河川敷さんぽ",
      startAt: "2027-03-02T00:00:00.000Z",
      acceptanceStartAt: "2020-01-01T00:00:00.000Z",
      acceptanceEndAt: "2027-03-01T00:00:00.000Z",
      durationMinutes: 60,
      meetingPlace: "赤羽岩淵駅",
      areaPrefecture: "東京都",
      capacity: 2,
      requiredExperience: "none",
      status: "open",
      updatedAt: now,
      ...overrides,
    })
    .returning();
  return row!;
}

async function insertWalker(profile: Partial<typeof walkerProfiles.$inferInsert> = {}): Promise<Session> {
  const now = new Date().toISOString();
  const [walker] = await db
    .insert(walkers)
    .values({ publicId: ulid(), name: "参加者", email: `walker-${ulid().toLowerCase()}@example.test`, passwordHash: await hashPassword("correct horse battery staple"), status: "active", emailVerifiedAt: now, updatedAt: now })
    .returning();

  await db.insert(walkerProfiles).values({
    publicId: ulid(),
    walkerId: walker!.id,
    phone: PHONE,
    phoneVerifiedAt: now,
    status: "active",
    updatedAt: now,
    ...profile,
  });

  return { walkerId: walker!.id, walkerPublicId: walker!.publicId };
}

async function clearRateLimits() {
  const { keys } = await env.KV.list();
  await Promise.all(keys.map((key) => env.KV.delete(key.name)));
}

beforeEach(async () => {
  await db.delete(activityLog);
  await db.delete(reservations);
  await db.delete(walkSlots);
  await db.delete(walkerPhoneVerificationTokens);
  await db.delete(walkerProfiles);
  await db.delete(walkers);
  await db.delete(organizations);
  await clearRateLimits();
});

describe("eligibility (DEV-09 §2-7-3)", () => {
  it("names the step that is missing, rather than just refusing", async () => {
    const unverified = await insertWalker({ phoneVerifiedAt: null });
    const provisional = await insertWalker({ status: "provisional" });
    const ready = await insertWalker();

    await expect(checkReservationEligibility(db, unverified.walkerId)).resolves.toEqual({ block: "phone_unverified" });
    await expect(checkReservationEligibility(db, provisional.walkerId)).resolves.toEqual({ block: "profile_incomplete" });
    await expect(checkReservationEligibility(db, ready.walkerId)).resolves.toEqual({ block: null });
  });

  it("refuses to create a reservation for a walker who cannot book yet", async () => {
    const organization = await insertOrganization();
    const slot = await insertWalkSlot(organization.id);
    const session = await insertWalker({ phoneVerifiedAt: null });

    await expect(createReservation(db, env.KV, session, slot.publicId, INPUT)).rejects.toMatchObject({ reason: "phone_unverified" });
    expect(await db.select().from(reservations)).toHaveLength(0);
  });
});

describe("createReservation (F-07-06)", () => {
  it("holds the seat in processing and logs it against the shelter", async () => {
    const organization = await insertOrganization();
    const slot = await insertWalkSlot(organization.id);
    const session = await insertWalker();

    const { publicId } = await createReservation(db, env.KV, session, slot.publicId, INPUT);

    const view = await getOwnReservation(db, session.walkerId, publicId);
    expect(view).toMatchObject({ status: "processing", participantCount: 1, emergencyContactName: "山田 花子", amount: 500 });
    expect(view.walkSlot.organizationName).toBe(organization.name);

    const [entry] = await db.select().from(activityLog).where(eq(activityLog.event, "reservation.processing"));
    expect(entry).toMatchObject({ causerType: "walker", causerId: session.walkerId, organizationId: organization.id });
  });

  it("refuses when the seats are gone, counting holds that have not expired", async () => {
    const organization = await insertOrganization();
    const slot = await insertWalkSlot(organization.id, { capacity: 1 });
    const first = await insertWalker();
    const second = await insertWalker();

    await createReservation(db, env.KV, first, slot.publicId, INPUT);

    await expect(createReservation(db, env.KV, second, slot.publicId, INPUT)).rejects.toBeInstanceOf(ConflictError);
  });

  it("lets the seat go once the payment window has passed (GOV-01 D-025)", async () => {
    const organization = await insertOrganization();
    const slot = await insertWalkSlot(organization.id, { capacity: 1 });
    const first = await insertWalker();
    const second = await insertWalker();

    const held = await createReservation(db, env.KV, first, slot.publicId, INPUT);
    await db
      .update(reservations)
      .set({ status: "awaiting_payment", expiresAt: new Date(Date.now() - 60_000).toISOString() })
      .where(eq(reservations.publicId, held.publicId));

    await expect(createReservation(db, env.KV, second, slot.publicId, INPUT)).resolves.toMatchObject({ publicId: expect.any(String) });
  });

  it("lets the seat go when a walker abandons the form half-way", async () => {
    const organization = await insertOrganization();
    const slot = await insertWalkSlot(organization.id, { capacity: 1 });
    const first = await insertWalker();
    const second = await insertWalker();

    // Still `processing` — nobody went to pay, and the tab was closed.
    const held = await createReservation(db, env.KV, first, slot.publicId, INPUT);
    await db
      .update(reservations)
      .set({ expiresAt: new Date(Date.now() - 60_000).toISOString() })
      .where(eq(reservations.publicId, held.publicId));

    await expect(createReservation(db, env.KV, second, slot.publicId, INPUT)).resolves.toMatchObject({ publicId: expect.any(String) });
  });

  it("refuses a walk that is not taking bookings", async () => {
    const organization = await insertOrganization();
    const session = await insertWalker();
    const draft = await insertWalkSlot(organization.id, { status: "draft" });
    const closed = await insertWalkSlot(organization.id, { acceptanceEndAt: "2020-01-02T00:00:00.000Z" });

    await expect(createReservation(db, env.KV, session, draft.publicId, INPUT)).rejects.toBeInstanceOf(ConflictError);
    await expect(createReservation(db, env.KV, session, closed.publicId, INPUT)).rejects.toBeInstanceOf(ConflictError);
  });

  it("stops a walker who is holding seats in a loop (DEV-02 §7)", async () => {
    const organization = await insertOrganization();
    const session = await insertWalker();
    const slot = await insertWalkSlot(organization.id, { capacity: 100 });

    for (let i = 0; i < RATE_LIMITS.reservationCreate.limit; i++) {
      await createReservation(db, env.KV, session, slot.publicId, INPUT);
    }

    await expect(createReservation(db, env.KV, session, slot.publicId, INPUT)).rejects.toBeInstanceOf(RateLimitError);
  });
});

describe("the walk to payment (DEV-09 §2-7-2)", () => {
  it("sets the deadline that makes the hold releasable", async () => {
    const organization = await insertOrganization();
    const slot = await insertWalkSlot(organization.id);
    const session = await insertWalker();
    const { publicId } = await createReservation(db, env.KV, session, slot.publicId, INPUT);

    const { expiresAt } = await startPayment(db, session.walkerId, publicId);

    const view = await getOwnReservation(db, session.walkerId, publicId);
    expect(view.status).toBe("awaiting_payment");
    expect(view.expiresAt).toBe(expiresAt);
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("refuses a move the matrix does not have", async () => {
    const organization = await insertOrganization();
    const slot = await insertWalkSlot(organization.id);
    const session = await insertWalker();
    const { publicId } = await createReservation(db, env.KV, session, slot.publicId, INPUT);

    // processing → confirmed skips the payment entirely.
    await expect(transitionReservation(db, session.walkerId, publicId, "confirmed")).rejects.toBeInstanceOf(InvalidStateTransitionError);
  });

  it("hides another walker's reservation", async () => {
    const organization = await insertOrganization();
    const slot = await insertWalkSlot(organization.id);
    const mine = await insertWalker();
    const theirs = await insertWalker();
    const { publicId } = await createReservation(db, env.KV, theirs, slot.publicId, INPUT);

    await expect(getOwnReservation(db, mine.walkerId, publicId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(startPayment(db, mine.walkerId, publicId)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("phone verification (F-01-02)", () => {
  // Newest first: a re-send leaves the old row behind, and the code under test is the latest one.
  async function codeFor(walkerId: number): Promise<string> {
    const [token] = await db.select().from(walkerPhoneVerificationTokens).where(eq(walkerPhoneVerificationTokens.walkerId, walkerId)).orderBy(desc(walkerPhoneVerificationTokens.id)).limit(1);
    return token!.code;
  }

  it("verifies the number and lets the walker book", async () => {
    const session = await insertWalker({ phoneVerifiedAt: null });

    await requestPhoneVerification(db, session.walkerId);
    await confirmPhoneVerification(db, session.walkerId, await codeFor(session.walkerId));

    await expect(checkReservationEligibility(db, session.walkerId)).resolves.toEqual({ block: null });
  });

  it("spends the code, so the same SMS cannot be replayed", async () => {
    const session = await insertWalker({ phoneVerifiedAt: null });
    await requestPhoneVerification(db, session.walkerId);
    const code = await codeFor(session.walkerId);

    await confirmPhoneVerification(db, session.walkerId, code);
    await expect(confirmPhoneVerification(db, session.walkerId, code)).rejects.toBeInstanceOf(PhoneVerificationError);
  });

  it("gives up after five wrong guesses, because six digits are guessable", async () => {
    const session = await insertWalker({ phoneVerifiedAt: null });
    await requestPhoneVerification(db, session.walkerId);
    const code = await codeFor(session.walkerId);

    for (let i = 0; i < 5; i++) {
      await expect(confirmPhoneVerification(db, session.walkerId, "000000")).rejects.toBeInstanceOf(PhoneVerificationError);
    }

    // Even the right code no longer works — the row is spent.
    await expect(confirmPhoneVerification(db, session.walkerId, code)).rejects.toBeInstanceOf(PhoneVerificationError);
  });

  it("refuses an expired code", async () => {
    const session = await insertWalker({ phoneVerifiedAt: null });
    await requestPhoneVerification(db, session.walkerId);
    const code = await codeFor(session.walkerId);
    await db
      .update(walkerPhoneVerificationTokens)
      .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(walkerPhoneVerificationTokens.walkerId, session.walkerId));

    await expect(confirmPhoneVerification(db, session.walkerId, code)).rejects.toBeInstanceOf(PhoneVerificationError);
  });

  it("refuses a code sent to a number the walker has since changed", async () => {
    const session = await insertWalker({ phoneVerifiedAt: null });
    await requestPhoneVerification(db, session.walkerId);
    const code = await codeFor(session.walkerId);

    await db.update(walkerProfiles).set({ phone: "080-9999-9999" }).where(eq(walkerProfiles.walkerId, session.walkerId));

    await expect(confirmPhoneVerification(db, session.walkerId, code)).rejects.toBeInstanceOf(PhoneVerificationError);
  });

  it("retires the previous code when a new one is sent", async () => {
    const session = await insertWalker({ phoneVerifiedAt: null });
    await requestPhoneVerification(db, session.walkerId);
    const first = await codeFor(session.walkerId);

    await requestPhoneVerification(db, session.walkerId);

    await expect(confirmPhoneVerification(db, session.walkerId, first)).rejects.toBeInstanceOf(PhoneVerificationError);
  });
});
