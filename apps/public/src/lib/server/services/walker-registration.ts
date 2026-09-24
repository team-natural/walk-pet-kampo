// Registration, email verification and password reset for Walkers (F-01-01/04, F-02-01).
// Login is in ./auth.ts; this file covers everything that happens before a walker has one.
//
// Deliberately a sibling of organization-auth.ts rather than a shared module: same app, three
// account systems, no shared table, cookie or code path (DEV-02 §1-4).
import { hashPassword, newSessionToken } from "@app/server-kit/auth";
import { ValidationError } from "@app/server-kit/http";
import { walkerEmailVerificationTokens, walkerPasswordResetTokens, walkerProfiles, walkers } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { ulid } from "@app/schema/ulid";
import { and, eq, isNull } from "drizzle-orm";
import { TERMS_VERSION } from "../../legal";
import { destroyAllSessions } from "../auth/session";
import { activityLogInsert, walkerActor } from "./activity-log";
import { getWalkerByEmail } from "./walkers";

// DEV-07 §5-26: longer than the 60 minutes a reset link lives, because a confirmation mail is
// routinely opened hours later, and the cost of expiry here is a re-send rather than a lockout.
const EMAIL_TOKEN_TTL_HOURS = 24;
// DEV-07 §5-23.
const RESET_TOKEN_TTL_MINUTES = 60;

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function minutesFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

export class InvalidTokenError extends Error {}

export interface RegistrationInput {
  name: string;
  email: string;
  password: string;
}

// The single place that decides whether a walker may move to `active` (DEV-09 §2-4-3).
//
// Phone verification is NOT here: it happens at the first reservation instead (GOV-01 D-036), so
// `active` means "may book", not "contact details are verified". The reservation service checks
// phone_verified_at separately — see requirePhoneVerified in P11.
export function canActivate(walker: { emailVerifiedAt: string | null }, profile: { termsAgreedVersion: string | null; birthdate: string | null; phone: string | null; emergencyContactName: string | null; emergencyContactPhone: string | null }): boolean {
  return walker.emailVerifiedAt !== null && profile.termsAgreedVersion !== null && profile.birthdate !== null && profile.phone !== null && profile.emergencyContactName !== null && profile.emergencyContactPhone !== null;
}

// Registration creates both rows: the account and the profile that carries its status. The
// profile's detail columns stay null until SCR-22/23 (DEV-07 §5-3-1), which is exactly what
// `provisional` means.
export async function registerWalker(db: DbClient, input: RegistrationInput): Promise<{ walkerId: number; token: string }> {
  if (await getWalkerByEmail(db, input.email)) {
    // Not "this address is taken" — that answers whether an address has an account to anyone who
    // asks. The route turns this into the same confirmation an unused address gets, and the mail
    // tells the real owner what happened.
    throw new ValidationError({ email: ["このメールアドレスは登録できません。"] });
  }

  const now = new Date().toISOString();
  const [inserted] = await db.batch([
    db
      .insert(walkers)
      .values({ publicId: ulid(), name: input.name, email: input.email, passwordHash: await hashPassword(input.password), status: "active", updatedAt: now })
      .returning({ id: walkers.id }),
  ]);

  const walkerId = inserted[0]!.id;
  const token = newSessionToken();

  await db.batch([
    db.insert(walkerProfiles).values({ publicId: ulid(), walkerId, status: "provisional", termsAgreedAt: now, termsAgreedVersion: TERMS_VERSION, updatedAt: now }),
    db.insert(walkerEmailVerificationTokens).values({ walkerId, token, expiresAt: hoursFromNow(EMAIL_TOKEN_TTL_HOURS) }),
    activityLogInsert(db, {
      logName: "walker",
      description: "Walker registered",
      subjectType: "Walker",
      subjectId: walkerId,
      event: "walker.registered",
      actor: walkerActor(walkerId),
      properties: { termsAgreedVersion: TERMS_VERSION },
    }),
  ]);

  return { walkerId, token };
}

// Idempotent from the user's side: a second click on an already-used link says the same thing as
// the first, because the account is verified either way.
export async function verifyEmail(db: DbClient, token: string): Promise<void> {
  const [row] = await db
    .select()
    .from(walkerEmailVerificationTokens)
    .where(and(eq(walkerEmailVerificationTokens.token, token), isNull(walkerEmailVerificationTokens.usedAt)))
    .limit(1);

  if (!row || row.expiresAt <= new Date().toISOString()) throw new InvalidTokenError();

  const now = new Date().toISOString();
  await db.batch([db.update(walkers).set({ emailVerifiedAt: now, updatedAt: now }).where(eq(walkers.id, row.walkerId)), db.update(walkerEmailVerificationTokens).set({ usedAt: now }).where(eq(walkerEmailVerificationTokens.id, row.id)), activityLogInsert(db, { logName: "walker", description: "Walker email verified", subjectType: "Walker", subjectId: row.walkerId, event: "walker.email_verified", actor: walkerActor(row.walkerId) })]);

  await refreshWalkerProfileStatus(db, row.walkerId);
}

// Called after anything that could complete the set: email verification, profile save (P5).
// Only moves forward out of the two pre-active states — an admin's `restricted` or `suspended`
// must not be undone by the walker filling in a field.
export async function refreshWalkerProfileStatus(db: DbClient, walkerId: number): Promise<void> {
  const [walker] = await db.select().from(walkers).where(eq(walkers.id, walkerId)).limit(1);
  const [profile] = await db.select().from(walkerProfiles).where(eq(walkerProfiles.walkerId, walkerId)).limit(1);
  if (!walker || !profile) return;
  if (profile.status !== "provisional" && profile.status !== "pending_verification") return;

  const next = canActivate(walker, profile) ? "active" : hasProfileDetails(profile) ? "pending_verification" : "provisional";
  if (next === profile.status) return;

  const now = new Date().toISOString();
  await db.batch([
    db.update(walkerProfiles).set({ status: next, updatedAt: now }).where(eq(walkerProfiles.id, profile.id)),
    activityLogInsert(db, {
      logName: "walker_profile",
      description: `WalkerProfile ${profile.status} -> ${next}`,
      subjectType: "WalkerProfile",
      subjectId: profile.id,
      event: `walker_profile.${next}`,
      actor: walkerActor(walkerId),
      properties: { from: profile.status, to: next },
    }),
  ]);
}

function hasProfileDetails(profile: { birthdate: string | null; phone: string | null; emergencyContactName: string | null; emergencyContactPhone: string | null }): boolean {
  return profile.birthdate !== null && profile.phone !== null && profile.emergencyContactName !== null && profile.emergencyContactPhone !== null;
}

// Null when no link should be sent. The caller answers the same either way.
export async function requestPasswordReset(db: DbClient, email: string): Promise<{ token: string } | null> {
  const walker = await getWalkerByEmail(db, email);
  if (!walker || walker.status !== "active") return null;

  const token = newSessionToken();
  await db.insert(walkerPasswordResetTokens).values({ walkerId: walker.id, token, expiresAt: minutesFromNow(RESET_TOKEN_TTL_MINUTES) });
  return { token };
}

export async function resetPassword(db: DbClient, token: string, password: string): Promise<void> {
  const [row] = await db
    .select()
    .from(walkerPasswordResetTokens)
    .where(and(eq(walkerPasswordResetTokens.token, token), isNull(walkerPasswordResetTokens.usedAt)))
    .limit(1);

  if (!row || row.expiresAt <= new Date().toISOString()) throw new InvalidTokenError();

  const [walker] = await db.select().from(walkers).where(eq(walkers.id, row.walkerId)).limit(1);
  if (!walker || walker.status !== "active") throw new InvalidTokenError();

  const now = new Date().toISOString();
  await db.batch([
    db
      .update(walkers)
      .set({ passwordHash: await hashPassword(password), updatedAt: now })
      .where(eq(walkers.id, walker.id)),
    db.update(walkerPasswordResetTokens).set({ usedAt: now }).where(eq(walkerPasswordResetTokens.id, row.id)),
    activityLogInsert(db, { logName: "walker", description: "Walker password reset", subjectType: "Walker", subjectId: walker.id, event: "walker.password_reset", actor: walkerActor(walker.id) }),
  ]);

  // After the batch: the reset is what invalidates them, so they must not be gone if it failed.
  await destroyAllSessions(db, walker.id);
}
