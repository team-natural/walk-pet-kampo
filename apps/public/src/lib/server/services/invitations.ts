// Staff invitations (F-04-03). Acceptance is in organization-auth.ts, where it creates the
// account — this file is only the issuing half.
import { invitations, organizationMembers } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { ulid } from "@app/schema/ulid";
import { newSessionToken } from "@app/server-kit/auth";
import { ValidationError } from "@app/server-kit/http";
import { and, desc, eq } from "drizzle-orm";
import type { OrganizationSession } from "../auth/organization-session";
import { activityLogInsert, organizationMemberActor } from "./activity-log";

// DEV-09 §2-3-1. The expiry batch that flips a stale row to `expired` is P20's Cron; until then
// an unaccepted invitation simply stops working on its own, which the acceptance check enforces.
const INVITATION_TTL_DAYS = 7;

export interface PendingInvitation {
  email: string;
  role: "org_admin" | "org_staff";
  expiresAt: string;
}

export async function listPendingInvitations(db: DbClient, organizationId: number): Promise<PendingInvitation[]> {
  const rows = await db
    .select({ email: invitations.email, role: invitations.role, expiresAt: invitations.expiresAt })
    .from(invitations)
    .where(and(eq(invitations.organizationId, organizationId), eq(invitations.status, "pending")))
    .orderBy(desc(invitations.id));

  // Expiry is a timestamp, not a status, until the batch runs — so the screen filters here rather
  // than showing links that no longer work.
  const now = new Date().toISOString();
  return rows.filter((row) => row.expiresAt > now);
}

export async function inviteMember(db: DbClient, session: OrganizationSession, email: string, role: "org_admin" | "org_staff"): Promise<{ token: string }> {
  // organization_members.email is unique across every shelter, so an address already in use
  // cannot be invited anywhere — the check belongs here rather than at the unique index, which
  // would surface as a 500.
  const [existing] = await db.select({ id: organizationMembers.id }).from(organizationMembers).where(eq(organizationMembers.email, email)).limit(1);
  if (existing) throw new ValidationError({ email: ["このメールアドレスはすでに登録されています。"] });

  const [pending] = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(and(eq(invitations.organizationId, session.organizationId), eq(invitations.email, email), eq(invitations.status, "pending")))
    .limit(1);

  const token = newSessionToken();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Superseded first, not in the batch below: re-inviting must not leave two live tokens for one
  // address, and killing the old one before minting the new one fails in the safe direction.
  if (pending) await db.update(invitations).set({ status: "expired", updatedAt: now }).where(eq(invitations.id, pending.id));

  await db.batch([
    db.insert(invitations).values({ publicId: ulid(), organizationId: session.organizationId, email, role, token, inviterId: session.organizationMemberId, status: "pending", expiresAt, updatedAt: now }),
    activityLogInsert(db, {
      logName: "organization_member",
      description: `Invitation sent (${role})`,
      subjectType: "Invitation",
      event: "invitation.pending",
      actor: organizationMemberActor(session),
      organizationId: session.organizationId,
      properties: { email, role },
    }),
  ]);

  return { token };
}
