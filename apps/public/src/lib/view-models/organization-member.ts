import type { organizationMembers } from "@app/schema";

type Row = typeof organizationMembers.$inferSelect;

// organization_members has no public_id (DEV-07 §5-5): a staff row is never addressed by URL.
// Screens key rows by email, which is unique within an organization.
export type OrganizationMemberView = Pick<Row, "role" | "name" | "email" | "status" | "joinedAt" | "leftAt">;
