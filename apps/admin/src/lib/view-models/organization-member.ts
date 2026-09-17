import type { organizationMembers } from "@app/schema";

type Row = typeof organizationMembers.$inferSelect;

// organization_members has no public_id (DEV-07 §5-5): a staff row is never addressed by URL.
// SYS-08 lists them under their organization's public id, so the row itself needs no key.
export type OrganizationMemberView = Pick<Row, "role" | "name" | "email" | "status" | "joinedAt" | "leftAt">;
