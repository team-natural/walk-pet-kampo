// Registration, email verification and password reset for Walkers. The state machine is the
// subject here: what `active` requires, and what it deliberately does not (GOV-01 D-036).
import { env } from "cloudflare:workers";
import { activityLog, walkerEmailVerificationTokens, walkerPasswordResetTokens, walkerProfiles, walkerSessions, walkers } from "@app/schema";
import { createDb } from "@app/schema/client";
import { newSessionToken, verifyPassword } from "@app/server-kit/auth";
import { ValidationError } from "@app/server-kit/http";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { TERMS_VERSION } from "../../src/lib/legal";
import { createSession } from "../../src/lib/server/auth/session";
import { InvalidTokenError, canActivate, refreshWalkerProfileStatus, registerWalker, requestPasswordReset, resetPassword, verifyEmail } from "../../src/lib/server/services/walker-registration";

const db = createDb(env.DB);
const INPUT = { name: "参加者", email: "walker-registration@example.test", password: "correct horse battery staple" };

// The columns SCR-22/23 fill in. Registration leaves them null (DEV-07 §5-3-1).
const PROFILE_DETAILS = { birthdate: "1990-01-01", phone: "090-0000-0000", emergencyContactName: "緊急 連絡先", emergencyContactPhone: "090-1111-1111" };

async function profileOf(walkerId: number) {
  const [row] = await db.select().from(walkerProfiles).where(eq(walkerProfiles.walkerId, walkerId)).limit(1);
  return row!;
}

beforeEach(async () => {
  await db.delete(activityLog);
  await db.delete(walkerEmailVerificationTokens);
  await db.delete(walkerPasswordResetTokens);
  await db.delete(walkerSessions);
  await db.delete(walkerProfiles);
  await db.delete(walkers);
});

describe("registerWalker", () => {
  it("creates the account and a provisional profile carrying the agreed terms version", async () => {
    const { walkerId } = await registerWalker(db, INPUT);

    const [walker] = await db.select().from(walkers).where(eq(walkers.id, walkerId));
    expect(walker).toMatchObject({ email: INPUT.email, status: "active", emailVerifiedAt: null });
    expect(await profileOf(walkerId)).toMatchObject({ status: "provisional", termsAgreedVersion: TERMS_VERSION, birthdate: null, phone: null });
  });

  it("stores the password hashed, and issues a verification token that is not the password", async () => {
    const { walkerId, token } = await registerWalker(db, INPUT);

    const [walker] = await db.select().from(walkers).where(eq(walkers.id, walkerId));
    expect(walker!.passwordHash).not.toContain(INPUT.password);
    await expect(verifyPassword(INPUT.password, walker!.passwordHash)).resolves.toBe(true);

    const [issued] = await db.select().from(walkerEmailVerificationTokens);
    expect(issued!.token).toBe(token);
    expect(issued!.usedAt).toBeNull();
  });

  it("refuses a second account on the same address", async () => {
    await registerWalker(db, INPUT);
    await expect(registerWalker(db, INPUT)).rejects.toBeInstanceOf(ValidationError);

    expect(await db.select().from(walkers)).toHaveLength(1);
  });
});

describe("verifyEmail", () => {
  it("marks the address verified and spends the token", async () => {
    const { walkerId, token } = await registerWalker(db, INPUT);

    await verifyEmail(db, token);

    const [walker] = await db.select().from(walkers).where(eq(walkers.id, walkerId));
    expect(walker!.emailVerifiedAt).not.toBeNull();
    await expect(verifyEmail(db, token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("rejects an unknown token", async () => {
    await expect(verifyEmail(db, newSessionToken())).rejects.toBeInstanceOf(InvalidTokenError);
  });
});

describe("the road to active (DEV-09 §2-4-3)", () => {
  it("stays provisional while the profile is empty, even once the email is verified", async () => {
    const { walkerId, token } = await registerWalker(db, INPUT);

    await verifyEmail(db, token);

    expect(await profileOf(walkerId)).toMatchObject({ status: "provisional" });
  });

  it("reaches pending_verification when the profile is filled but the email is not verified", async () => {
    const { walkerId } = await registerWalker(db, INPUT);

    await db.update(walkerProfiles).set(PROFILE_DETAILS).where(eq(walkerProfiles.walkerId, walkerId));
    await refreshWalkerProfileStatus(db, walkerId);

    expect(await profileOf(walkerId)).toMatchObject({ status: "pending_verification" });
  });

  it("reaches active once both are done", async () => {
    const { walkerId, token } = await registerWalker(db, INPUT);

    await db.update(walkerProfiles).set(PROFILE_DETAILS).where(eq(walkerProfiles.walkerId, walkerId));
    await verifyEmail(db, token);

    expect(await profileOf(walkerId)).toMatchObject({ status: "active" });
  });

  it("does not require a verified phone number (GOV-01 D-036)", async () => {
    // Phone verification happens at the first reservation, so `active` means "may book", not
    // "contact details are verified". P11's requirePhoneVerified is the other half.
    const { walkerId, token } = await registerWalker(db, INPUT);
    await db.update(walkerProfiles).set(PROFILE_DETAILS).where(eq(walkerProfiles.walkerId, walkerId));
    await verifyEmail(db, token);

    const profile = await profileOf(walkerId);
    expect(profile.phoneVerifiedAt).toBeNull();
    expect(profile.status).toBe("active");
  });

  it("never moves a restricted or suspended walker back on its own", async () => {
    // Only an admin lifts those (DEV-09 §2-4-3); filling in a field must not.
    const { walkerId, token } = await registerWalker(db, INPUT);
    await db
      .update(walkerProfiles)
      .set({ ...PROFILE_DETAILS, status: "suspended" })
      .where(eq(walkerProfiles.walkerId, walkerId));

    await verifyEmail(db, token);

    expect(await profileOf(walkerId)).toMatchObject({ status: "suspended" });
  });

  it("is decided in one place", () => {
    const verified = { emailVerifiedAt: "2026-09-24T00:00:00.000Z" };
    expect(canActivate(verified, { termsAgreedVersion: TERMS_VERSION, ...PROFILE_DETAILS })).toBe(true);
    expect(canActivate({ emailVerifiedAt: null }, { termsAgreedVersion: TERMS_VERSION, ...PROFILE_DETAILS })).toBe(false);
    expect(canActivate(verified, { termsAgreedVersion: null, ...PROFILE_DETAILS })).toBe(false);
    expect(canActivate(verified, { termsAgreedVersion: TERMS_VERSION, ...PROFILE_DETAILS, phone: null })).toBe(false);
  });
});

describe("password reset", () => {
  it("issues a token only for an address that can use it", async () => {
    await registerWalker(db, INPUT);

    await expect(requestPasswordReset(db, INPUT.email)).resolves.not.toBeNull();
    await expect(requestPasswordReset(db, "nobody@example.test")).resolves.toBeNull();
  });

  it("changes the password and ends every existing session", async () => {
    const { walkerId } = await registerWalker(db, INPUT);
    const stale = await createSession(db, walkerId, 30);
    const issued = await requestPasswordReset(db, INPUT.email);

    await resetPassword(db, issued!.token, "a-brand-new-password");

    const [walker] = await db.select().from(walkers).where(eq(walkers.id, walkerId));
    await expect(verifyPassword("a-brand-new-password", walker!.passwordHash)).resolves.toBe(true);
    expect(await db.select().from(walkerSessions).where(eq(walkerSessions.sessionToken, stale.token))).toHaveLength(0);
  });

  it("cannot be replayed", async () => {
    await registerWalker(db, INPUT);
    const issued = await requestPasswordReset(db, INPUT.email);

    await resetPassword(db, issued!.token, "first-new-password");
    await expect(resetPassword(db, issued!.token, "second-new-password")).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("does not touch the email verification tokens", async () => {
    // The two live in separate tables precisely so one cannot be spent as the other (DEV-07 §5-26).
    const { token: verification } = await registerWalker(db, INPUT);
    const issued = await requestPasswordReset(db, INPUT.email);

    await expect(resetPassword(db, verification, "a-brand-new-password")).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(verifyEmail(db, issued!.token)).rejects.toBeInstanceOf(InvalidTokenError);
  });
});
