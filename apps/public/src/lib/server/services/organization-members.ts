// Read paths for the OrganizationMember account system. Separate from walkers.ts on purpose:
// the two systems share this app but never a table, a cookie or a lookup (DEV-02 §1-4).
import { organizationMembers } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { InvalidStateTransitionError, NotFoundError, ValidationError } from "@app/server-kit/http";
import { and, asc, eq } from "drizzle-orm";
import type { OrganizationMemberView } from "../../view-models/organization-member";
import { destroyAllOrganizationSessions, type OrganizationSession } from "../auth/organization-session";
import { activityLogInsert, organizationMemberActor } from "./activity-log";

type OrganizationMemberRow = typeof organizationMembers.$inferSelect;

// Never let `passwordHash` or the internal integer ids leave this layer in a response body.
// `organizationId` is internal too — a screen that needs the shelter shows its name or public id.
export function toPublicOrganizationMember(member: OrganizationMemberRow) {
  return {
    name: member.name,
    email: member.email,
    role: member.role,
    status: member.status,
  };
}

export async function getOrganizationMemberByEmail(db: DbClient, email: string) {
  const [row] = await db.select().from(organizationMembers).where(eq(organizationMembers.email, email)).limit(1);
  return row ?? null;
}

export async function getOrganizationMemberById(db: DbClient, id: number) {
  const [row] = await db.select().from(organizationMembers).where(eq(organizationMembers.id, id)).limit(1);
  return row ?? null;
}

// ADM-03. Scoped by organizationId, which is the tenant boundary for every query in this file
// (DEV-07 §11) — a staff list that can show another shelter's people is the bug this project is
// most likely to ship.
export async function listMembers(db: DbClient, organizationId: number): Promise<OrganizationMemberView[]> {
  const rows = await db.select().from(organizationMembers).where(eq(organizationMembers.organizationId, organizationId)).orderBy(asc(organizationMembers.id));
  return rows.map((row) => ({ name: row.name, email: row.email, role: row.role, status: row.status, joinedAt: row.joinedAt, leftAt: row.leftAt }));
}

// Keyed by email rather than an id: organization_members has no public_id, and DEV-01 §8 keeps
// internal integers out of anything a page renders. Unique, and already on screen.
async function findMemberByEmail(db: DbClient, organizationId: number, email: string) {
  const [row] = await db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.email, email)))
    .limit(1);
  if (!row) throw new NotFoundError("スタッフが見つかりません。");
  return row;
}

// F-04-04. The last org_admin cannot demote or suspend themselves out of existence: a shelter
// with no administrator can no longer invite one, and only the operator could rescue it.
async function assertNotLastAdmin(db: DbClient, organizationId: number, memberId: number): Promise<void> {
  const admins = await db
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.role, "org_admin"), eq(organizationMembers.status, "active")));

  if (admins.length <= 1 && admins.some((admin) => admin.id === memberId)) {
    throw new ValidationError({ member: ["団体管理者が不在になるため、この操作はできません。"] });
  }
}

export async function changeMemberRole(db: DbClient, session: OrganizationSession, email: string, role: OrganizationMemberRow["role"]): Promise<void> {
  const member = await findMemberByEmail(db, session.organizationId, email);
  if (member.role === role) return;
  if (role === "org_staff") await assertNotLastAdmin(db, session.organizationId, member.id);

  const now = new Date().toISOString();
  await db.batch([
    db.update(organizationMembers).set({ role, updatedAt: now }).where(eq(organizationMembers.id, member.id)),
    activityLogInsert(db, {
      logName: "organization_member",
      description: `OrganizationMember role ${member.role} -> ${role}`,
      subjectType: "OrganizationMember",
      subjectId: member.id,
      event: "organization_member.role_changed",
      actor: organizationMemberActor(session),
      organizationId: session.organizationId,
      properties: { from: member.role, to: role },
    }),
  ]);
}

// DEV-09 §2-2-2: active ⇄ suspended only. `invited` is not suspendable — nothing to suspend until
// the invitation is accepted.
export async function setMemberStatus(db: DbClient, session: OrganizationSession, email: string, status: "active" | "suspended"): Promise<void> {
  const member = await findMemberByEmail(db, session.organizationId, email);
  if (member.status === status) return;
  if (member.status === "invited") throw new InvalidStateTransitionError("OrganizationMember", member.status, status);
  if (status === "suspended") await assertNotLastAdmin(db, session.organizationId, member.id);

  const now = new Date().toISOString();
  await db.batch([
    db.update(organizationMembers).set({ status, updatedAt: now }).where(eq(organizationMembers.id, member.id)),
    activityLogInsert(db, {
      logName: "organization_member",
      description: `OrganizationMember ${member.status} -> ${status}`,
      subjectType: "OrganizationMember",
      subjectId: member.id,
      event: `organization_member.${status}`,
      actor: organizationMemberActor(session),
      organizationId: session.organizationId,
      properties: { from: member.status, to: status },
    }),
  ]);

  // DEV-09 §2-2-3: suspending ends the sessions too, or the person keeps working until their
  // cookie expires.
  if (status === "suspended") await destroyAllOrganizationSessions(db, member.id);
}
