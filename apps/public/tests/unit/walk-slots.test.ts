// FG-06 and the public reads behind SCR-06/07. The subjects are the state machine (DEV-09 §2-6),
// the capacity floor (F-06-04) and what a visitor is allowed to see.
import { env } from "cloudflare:workers";
import { activityLog, dogs, organizationMembers, organizations, reservations, walkSlotDogs, walkSlots, walkers } from "@app/schema";
import { createDb } from "@app/schema/client";
import { ulid } from "@app/schema/ulid";
import { hashPassword } from "@app/server-kit/auth";
import { InvalidStateTransitionError, NotFoundError, ValidationError } from "@app/server-kit/http";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { isoToJstLocal, jstLocalToIso } from "../../src/lib/datetime";
import type { OrganizationSession } from "../../src/lib/server/auth/organization-session";
import { createDog } from "../../src/lib/server/services/dogs";
import { allowedWalkSlotTransitions, createWalkSlot, getOwnWalkSlot, getPublicWalkSlot, listOwnWalkSlots, searchWalkSlots, transitionWalkSlot, updateWalkSlot, type WalkSlotInput } from "../../src/lib/server/services/walk-slots";

const db = createDb(env.DB);

const DOG_INPUT = {
  name: "ハナ",
  breed: null,
  size: "medium" as const,
  gender: null,
  estimatedAge: null,
  weight: null,
  temperament: null,
  humanSociability: null,
  dogSociability: null,
  walkNotes: null,
  requiredExperience: "none" as const,
  beginnerAllowed: 1,
  childAllowed: 0,
  multiDogAllowed: 1,
  walkEligible: 1,
  introduction: null,
  internalNotes: null,
};

function slotInput(overrides: Partial<WalkSlotInput> = {}): WalkSlotInput {
  return {
    title: "朝の荒川河川敷さんぽ",
    description: "ゆっくり 1 時間歩きます。",
    startAt: "2026-10-03T00:00:00.000Z",
    acceptanceStartAt: "2026-09-19T00:00:00.000Z",
    acceptanceEndAt: "2026-10-01T00:00:00.000Z",
    durationMinutes: 60,
    meetingPlace: "赤羽岩淵駅 2 番出口",
    areaPrefecture: "東京都",
    areaCity: "北区",
    capacity: 4,
    staffAccompanied: 1,
    beginnerAllowed: 1,
    childAllowed: 0,
    minAge: 18,
    requiredExperience: "none",
    clothingNotes: null,
    precautions: null,
    weatherPolicy: null,
    cancellationPolicy: null,
    ...overrides,
  };
}

async function insertOrganization(status: (typeof organizations.$inferSelect)["status"] = "approved") {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(organizations)
    .values({ publicId: ulid(), name: `団体-${ulid()}`, slug: `org-${ulid().toLowerCase()}`, representativeName: "代表", addressVisibility: "prefecture_only", status, updatedAt: now })
    .returning();
  return row!;
}

async function sessionFor(organization: typeof organizations.$inferSelect): Promise<OrganizationSession> {
  const now = new Date().toISOString();
  const [member] = await db
    .insert(organizationMembers)
    .values({ organizationId: organization.id, role: "org_staff", name: "スタッフ", email: `member-${ulid().toLowerCase()}@example.test`, passwordHash: await hashPassword("correct horse battery staple"), status: "active", joinedAt: now, updatedAt: now })
    .returning();

  return { organizationMemberId: member!.id, organizationId: organization.id, organizationPublicId: organization.publicId, organizationName: organization.name, role: "org_staff", name: member!.name };
}

// A booked seat, without going through P11's reservation Service — which does not exist yet.
async function bookSeat(organizationId: number, walkSlotPublicId: string, status: (typeof reservations.$inferSelect)["status"], expiresAt: string | null = null) {
  const now = new Date().toISOString();
  const [slot] = await db.select().from(walkSlots).where(eq(walkSlots.publicId, walkSlotPublicId));
  const [walker] = await db
    .insert(walkers)
    .values({ publicId: ulid(), name: "参加者", email: `walker-${ulid().toLowerCase()}@example.test`, passwordHash: await hashPassword("correct horse battery staple"), status: "active", updatedAt: now })
    .returning();

  await db.insert(reservations).values({ publicId: ulid(), organizationId, walkSlotId: slot!.id, walkerId: walker!.id, emergencyContactNameSnapshot: "山田 花子", emergencyContactPhoneSnapshot: "090-0000-0000", status, expiresAt, updatedAt: now });
}

beforeEach(async () => {
  await db.delete(activityLog);
  await db.delete(reservations);
  await db.delete(walkSlotDogs);
  await db.delete(walkSlots);
  await db.delete(walkers);
  await db.delete(dogs);
  await db.delete(organizationMembers);
  await db.delete(organizations);
});

describe("createWalkSlot (F-06-01)", () => {
  it("starts as a draft with the chosen dogs attached", async () => {
    const organization = await insertOrganization();
    const session = await sessionFor(organization);
    const dog = await createDog(db, session, DOG_INPUT);

    const { publicId } = await createWalkSlot(db, session, slotInput(), [dog.publicId]);

    const slot = await getOwnWalkSlot(db, organization.id, publicId);
    expect(slot).toMatchObject({ title: "朝の荒川河川敷さんぽ", status: "draft", capacity: 4, remainingCapacity: 4 });
    expect(slot.dogs.map((entry) => entry.name)).toEqual(["ハナ"]);
    expect(slot.organization.name).toBe(organization.name);
  });

  it("refuses a dog from another shelter, or one that cannot walk", async () => {
    const mine = await insertOrganization();
    const theirs = await insertOrganization();
    const mySession = await sessionFor(mine);
    const theirDog = await createDog(db, await sessionFor(theirs), DOG_INPUT);
    const resting = await createDog(db, mySession, { ...DOG_INPUT, name: "休養中", walkEligible: 0 });

    await expect(createWalkSlot(db, mySession, slotInput(), [theirDog.publicId])).rejects.toBeInstanceOf(ValidationError);
    await expect(createWalkSlot(db, mySession, slotInput(), [resting.publicId])).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses a schedule that runs backwards", async () => {
    const organization = await insertOrganization();
    const session = await sessionFor(organization);

    await expect(createWalkSlot(db, session, slotInput({ acceptanceEndAt: "2026-09-01T00:00:00.000Z" }), [])).rejects.toBeInstanceOf(ValidationError);
    await expect(createWalkSlot(db, session, slotInput({ startAt: "2026-09-01T00:00:00.000Z" }), [])).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("transitionWalkSlot (DEV-09 §2-6-2)", () => {
  it("publishes, fills, closes and completes along the documented edges", async () => {
    const organization = await insertOrganization();
    const session = await sessionFor(organization);
    const { publicId } = await createWalkSlot(db, session, slotInput(), []);

    await transitionWalkSlot(db, session, publicId, "open");
    await transitionWalkSlot(db, session, publicId, "full");
    await transitionWalkSlot(db, session, publicId, "closed");
    await transitionWalkSlot(db, session, publicId, "completed");

    await expect(getOwnWalkSlot(db, organization.id, publicId)).resolves.toMatchObject({ status: "completed" });
    expect(allowedWalkSlotTransitions("completed")).toEqual([]);
  });

  it("refuses a move the matrix does not have", async () => {
    const organization = await insertOrganization();
    const session = await sessionFor(organization);
    const { publicId } = await createWalkSlot(db, session, slotInput(), []);

    // draft → cancelled: nothing has been published, so there is nothing to call off.
    await expect(transitionWalkSlot(db, session, publicId, "cancelled")).rejects.toBeInstanceOf(InvalidStateTransitionError);
  });

  it("keeps the cancellation reason in the audit trail", async () => {
    const organization = await insertOrganization();
    const session = await sessionFor(organization);
    const { publicId } = await createWalkSlot(db, session, slotInput(), []);
    await transitionWalkSlot(db, session, publicId, "open");

    await transitionWalkSlot(db, session, publicId, "cancelled", "weather");

    const [entry] = await db.select().from(activityLog).where(eq(activityLog.event, "walk_slot.cancelled"));
    expect(JSON.parse(entry!.properties!)).toMatchObject({ from: "open", to: "cancelled", reason: "weather" });
  });
});

describe("updateWalkSlot (F-06-04)", () => {
  it("will not drop the capacity below the seats already held", async () => {
    const organization = await insertOrganization();
    const session = await sessionFor(organization);
    const { publicId } = await createWalkSlot(db, session, slotInput(), []);
    await bookSeat(organization.id, publicId, "confirmed");
    await bookSeat(organization.id, publicId, "confirmed");

    await expect(updateWalkSlot(db, session, publicId, slotInput({ capacity: 1 }), [])).rejects.toBeInstanceOf(ValidationError);
    await updateWalkSlot(db, session, publicId, slotInput({ capacity: 2 }), []);

    await expect(getOwnWalkSlot(db, organization.id, publicId)).resolves.toMatchObject({ capacity: 2, remainingCapacity: 0 });
  });

  it("replaces the dog selection wholesale", async () => {
    const organization = await insertOrganization();
    const session = await sessionFor(organization);
    const first = await createDog(db, session, DOG_INPUT);
    const second = await createDog(db, session, { ...DOG_INPUT, name: "モモ" });
    const { publicId } = await createWalkSlot(db, session, slotInput(), [first.publicId]);

    await updateWalkSlot(db, session, publicId, slotInput(), [second.publicId]);

    const slot = await getOwnWalkSlot(db, organization.id, publicId);
    expect(slot.dogs.map((dog) => dog.name)).toEqual(["モモ"]);
  });

  it("hides another shelter's slot from every entry point", async () => {
    const mine = await insertOrganization();
    const theirs = await insertOrganization();
    const mySession = await sessionFor(mine);
    const { publicId } = await createWalkSlot(db, await sessionFor(theirs), slotInput(), []);

    await expect(listOwnWalkSlots(db, mine.id)).resolves.toHaveLength(0);
    await expect(getOwnWalkSlot(db, mine.id, publicId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateWalkSlot(db, mySession, publicId, slotInput(), [])).rejects.toBeInstanceOf(NotFoundError);
    await expect(transitionWalkSlot(db, mySession, publicId, "open")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("remaining seats (GOV-01 D-025)", () => {
  it("frees the seat of an awaiting_payment hold that has expired", async () => {
    const organization = await insertOrganization();
    const session = await sessionFor(organization);
    const { publicId } = await createWalkSlot(db, session, slotInput({ capacity: 2 }), []);

    await bookSeat(organization.id, publicId, "awaiting_payment", new Date(Date.now() + 60_000).toISOString());
    await expect(getOwnWalkSlot(db, organization.id, publicId)).resolves.toMatchObject({ remainingCapacity: 1 });

    await bookSeat(organization.id, publicId, "awaiting_payment", new Date(Date.now() - 60_000).toISOString());
    // Still 1: the second hold is past its deadline, whether or not the cleanup Cron has run.
    await expect(getOwnWalkSlot(db, organization.id, publicId)).resolves.toMatchObject({ remainingCapacity: 1 });
  });

  it("does not count a cancelled reservation", async () => {
    const organization = await insertOrganization();
    const session = await sessionFor(organization);
    const { publicId } = await createWalkSlot(db, session, slotInput({ capacity: 2 }), []);

    await bookSeat(organization.id, publicId, "cancelled_by_walker");

    await expect(getOwnWalkSlot(db, organization.id, publicId)).resolves.toMatchObject({ remainingCapacity: 2 });
  });
});

describe("the public view (SCR-06, SCR-07)", () => {
  async function publishedSlot(overrides: Partial<WalkSlotInput> = {}) {
    const organization = await insertOrganization();
    const session = await sessionFor(organization);
    const { publicId } = await createWalkSlot(db, session, slotInput(overrides), []);
    await transitionWalkSlot(db, session, publicId, "open");
    return { organization, session, publicId };
  }

  it("shows published slots of approved shelters only", async () => {
    await publishedSlot();

    const draftOrganization = await insertOrganization();
    await createWalkSlot(db, await sessionFor(draftOrganization), slotInput({ title: "下書き" }), []);

    const suspended = await insertOrganization("suspended");
    const suspendedSession = await sessionFor(suspended);
    const hidden = await createWalkSlot(db, suspendedSession, slotInput({ title: "停止中の団体" }), []);
    await transitionWalkSlot(db, suspendedSession, hidden.publicId, "open");

    const visible = await searchWalkSlots(db);
    expect(visible.map((slot) => slot.title)).toEqual(["朝の荒川河川敷さんぽ"]);
  });

  it("filters by area and by the JST calendar day", async () => {
    await publishedSlot();

    await expect(searchWalkSlots(db, { area: "北区" })).resolves.toHaveLength(1);
    await expect(searchWalkSlots(db, { area: "大阪" })).resolves.toHaveLength(0);

    // 2026-10-03T00:00Z is 09:00 on the 3rd in Tokyo — the 2nd must not match it.
    await expect(searchWalkSlots(db, { date: "2026-10-03" })).resolves.toHaveLength(1);
    await expect(searchWalkSlots(db, { date: "2026-10-02" })).resolves.toHaveLength(0);
  });

  it("answers 404 for a slot that is not published", async () => {
    const organization = await insertOrganization();
    const session = await sessionFor(organization);
    const { publicId } = await createWalkSlot(db, session, slotInput(), []);

    await expect(getPublicWalkSlot(db, publicId)).rejects.toBeInstanceOf(NotFoundError);

    await transitionWalkSlot(db, session, publicId, "open");
    await expect(getPublicWalkSlot(db, publicId)).resolves.toMatchObject({ title: "朝の荒川河川敷さんぽ" });
  });
});

describe("JST conversion (DEV-06 §1-2)", () => {
  it("round-trips a datetime-local value through the stored ISO string", () => {
    // The Worker runs in UTC, so without the explicit offset this would store 09:00Z.
    expect(jstLocalToIso("2026-10-03T09:00")).toBe("2026-10-03T00:00:00.000Z");
    expect(isoToJstLocal("2026-10-03T00:00:00.000Z")).toBe("2026-10-03T09:00");
    expect(isoToJstLocal("2026-10-02T15:00:00.000Z")).toBe("2026-10-03T00:00");
  });
});
