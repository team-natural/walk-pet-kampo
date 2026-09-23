// Read paths for the OrganizationMember account system. Separate from walkers.ts on purpose:
// the two systems share this app but never a table, a cookie or a lookup (DEV-02 §1-4).
import { organizationMembers } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { eq } from "drizzle-orm";

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
