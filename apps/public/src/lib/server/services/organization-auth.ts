// OrganizationMember login, password reset and invitation acceptance (F-01-03/04, F-04-03).
// Session verification lives in ../auth/organization-session.ts; this file is about turning a
// credential — a password, a reset token, an invitation token — into a session.
//
// Walker's equivalents are in ./auth.ts and stay separate: same app, different table, different
// cookie, different code path (DEV-02 §1-4).
import { burnPasswordVerification, hashPassword, newSessionToken, verifyPassword } from "@app/server-kit/auth";
import { UnauthenticatedError } from "@app/server-kit/http";
import { invitations, organizationActivationTokens, organizationMemberPasswordResetTokens, organizationMembers, organizations } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { and, eq, isNull } from "drizzle-orm";
import { createOrganizationSession, destroyAllOrganizationSessions, destroyOrganizationSession } from "../auth/organization-session";
import { activityLogInsert } from "./activity-log";
import { getOrganizationMemberByEmail } from "./organization-members";

// DEV-07 §5-24. Short on purpose: the link is a bearer credential sitting in a mailbox.
const RESET_TOKEN_TTL_MINUTES = 60;

function minutesFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

// Same message for "no such account", "wrong password" and "suspended" — do not let a client
// tell them apart.
function invalidCredentials(): UnauthenticatedError {
  return new UnauthenticatedError("メールアドレスまたはパスワードが正しくありません。");
}

export async function login(db: DbClient, email: string, password: string, ttlDays: number) {
  const member = await getOrganizationMemberByEmail(db, email);

  // Burn one derivation on the miss paths too, or they answer far faster than a real account —
  // an enumeration oracle regardless of the message being identical. `invited` is a miss here:
  // the account exists but has never set a password through the invitation link.
  if (!member || member.status !== "active") {
    await burnPasswordVerification(password);
    throw invalidCredentials();
  }

  const valid = await verifyPassword(password, member.passwordHash);
  if (!valid) throw invalidCredentials();

  const session = await createOrganizationSession(db, member.id, ttlDays);
  return { session, member };
}

export async function logout(db: DbClient, token: string): Promise<void> {
  await destroyOrganizationSession(db, token);
}

// Returns null when no link should be sent. The caller answers the same either way — whether an
// address is registered is not something an unauthenticated form may reveal.
export async function requestPasswordReset(db: DbClient, email: string): Promise<{ token: string; organizationMemberId: number } | null> {
  const member = await getOrganizationMemberByEmail(db, email);
  if (!member || member.status !== "active") return null;

  const token = newSessionToken();
  await db.insert(organizationMemberPasswordResetTokens).values({
    organizationMemberId: member.id,
    token,
    expiresAt: minutesFromNow(RESET_TOKEN_TTL_MINUTES),
  });

  return { token, organizationMemberId: member.id };
}

export class InvalidTokenError extends Error {}

// ADM-26 renders who the invitation is for before asking for a password, so a link forwarded to
// the wrong person is visibly wrong. Returns null for anything not currently redeemable.
export async function getPendingInvitation(db: DbClient, token: string) {
  const [row] = await db
    .select({
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      organizationName: organizations.name,
    })
    .from(invitations)
    .innerJoin(organizations, eq(invitations.organizationId, organizations.id))
    .where(and(eq(invitations.token, token), eq(invitations.status, "pending")))
    .limit(1);

  if (!row || row.expiresAt <= new Date().toISOString()) return null;
  return { email: row.email, role: row.role, organizationName: row.organizationName };
}

export async function resetPassword(db: DbClient, token: string, password: string, ttlDays: number) {
  const [row] = await db
    .select()
    .from(organizationMemberPasswordResetTokens)
    .where(and(eq(organizationMemberPasswordResetTokens.token, token), isNull(organizationMemberPasswordResetTokens.usedAt)))
    .limit(1);

  if (!row || row.expiresAt <= new Date().toISOString()) throw new InvalidTokenError();

  const [member] = await db.select().from(organizationMembers).where(eq(organizationMembers.id, row.organizationMemberId)).limit(1);
  if (!member || member.status !== "active") throw new InvalidTokenError();

  const now = new Date().toISOString();
  await db.batch([
    db
      .update(organizationMembers)
      .set({ passwordHash: await hashPassword(password), updatedAt: now })
      .where(eq(organizationMembers.id, member.id)),
    db.update(organizationMemberPasswordResetTokens).set({ usedAt: now }).where(eq(organizationMemberPasswordResetTokens.id, row.id)),
    activityLogInsert(db, {
      logName: "organization_member",
      description: "OrganizationMember password reset",
      subjectType: "OrganizationMember",
      subjectId: member.id,
      event: "organization_member.password_reset",
      actor: { type: "organization_member", id: member.id },
      organizationId: member.organizationId,
    }),
  ]);

  // After the batch, not inside it: resetting is what invalidates the old sessions, so they must
  // not be gone if the reset itself rolled back.
  await destroyAllOrganizationSessions(db, member.id);

  const session = await createOrganizationSession(db, member.id, ttlDays);
  return { session, member };
}

// The invitee has no account yet — the token is the whole identity claim (ADM-26). Creating the
// member and closing the invitation is one transition, so they share a transaction (DEV-09 §2-3).
export async function acceptInvitation(db: DbClient, token: string, name: string, password: string, ttlDays: number) {
  const [invitation] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.token, token), eq(invitations.status, "pending")))
    .limit(1);

  if (!invitation || invitation.expiresAt <= new Date().toISOString()) throw new InvalidTokenError();

  const now = new Date().toISOString();
  const [inserted] = await db.batch([
    db
      .insert(organizationMembers)
      .values({
        organizationId: invitation.organizationId,
        role: invitation.role,
        name,
        email: invitation.email,
        passwordHash: await hashPassword(password),
        status: "active",
        joinedAt: now,
        updatedAt: now,
      })
      .returning({ id: organizationMembers.id }),
    db.update(invitations).set({ status: "accepted", acceptedAt: now, updatedAt: now }).where(eq(invitations.id, invitation.id)),
  ]);

  const organizationMemberId = inserted[0]!.id;

  // Outside the batch above because the row has no id until that insert runs, and causer_id must
  // name the person who accepted (GOV-01 D-033) rather than be left null.
  await db.batch([
    activityLogInsert(db, {
      logName: "organization_member",
      description: `Invitation accepted (${invitation.role})`,
      subjectType: "OrganizationMember",
      subjectId: organizationMemberId,
      event: "organization_member.active",
      actor: { type: "organization_member", id: organizationMemberId },
      organizationId: invitation.organizationId,
      properties: { invitationPublicId: invitation.publicId, role: invitation.role },
    }),
  ]);

  const session = await createOrganizationSession(db, organizationMemberId, ttlDays);
  return { session, organizationMemberId };
}

// F-03-06. The other way into ADM-26: an approved shelter with nobody inside it yet. Kept apart
// from the invitation path above — separate table, separate lookup, separate function — so no
// single forgotten filter can make one token do the other's job (GOV-01 D-038, D-020).
export async function getPendingActivation(db: DbClient, token: string) {
  const [row] = await db
    .select({ email: organizationActivationTokens.email, expiresAt: organizationActivationTokens.expiresAt, organizationName: organizations.name })
    .from(organizationActivationTokens)
    .innerJoin(organizations, eq(organizationActivationTokens.organizationId, organizations.id))
    .where(and(eq(organizationActivationTokens.token, token), isNull(organizationActivationTokens.usedAt)))
    .limit(1);

  if (!row || row.expiresAt <= new Date().toISOString()) return null;
  return { email: row.email, organizationName: row.organizationName };
}

export async function activateOrganization(db: DbClient, token: string, name: string, password: string, ttlDays: number) {
  const [activation] = await db
    .select()
    .from(organizationActivationTokens)
    .where(and(eq(organizationActivationTokens.token, token), isNull(organizationActivationTokens.usedAt)))
    .limit(1);

  if (!activation || activation.expiresAt <= new Date().toISOString()) throw new InvalidTokenError();

  // The shelter has to be approved *now*, not merely when the link was sent: a suspension between
  // the two must not be walked around by opening an old mail.
  const [organization] = await db.select().from(organizations).where(eq(organizations.id, activation.organizationId)).limit(1);
  if (organization?.status !== "approved") throw new InvalidTokenError();

  // Someone got there first — a second org_admin created from the same approval is not what this
  // link is for. The token is spent either way.
  const existing = await getOrganizationMemberByEmail(db, activation.email);
  if (existing) throw new InvalidTokenError();

  const now = new Date().toISOString();
  const [inserted] = await db.batch([
    db
      .insert(organizationMembers)
      .values({
        organizationId: activation.organizationId,
        // Always org_admin: this is the account that will invite everyone else (F-04-03).
        role: "org_admin",
        name,
        email: activation.email,
        passwordHash: await hashPassword(password),
        status: "active",
        joinedAt: now,
        updatedAt: now,
      })
      .returning({ id: organizationMembers.id }),
    db.update(organizationActivationTokens).set({ usedAt: now }).where(eq(organizationActivationTokens.id, activation.id)),
  ]);

  const organizationMemberId = inserted[0]!.id;

  await db.batch([
    activityLogInsert(db, {
      logName: "organization_member",
      description: "Organization activated (org_admin created)",
      subjectType: "OrganizationMember",
      subjectId: organizationMemberId,
      event: "organization_member.active",
      actor: { type: "organization_member", id: organizationMemberId },
      organizationId: activation.organizationId,
      properties: { source: "activation_token", email: activation.email },
    }),
  ]);

  const session = await createOrganizationSession(db, organizationMemberId, ttlDays);
  return { session, organizationMemberId };
}
