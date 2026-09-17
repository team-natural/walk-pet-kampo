// OrganizationMember sessions. A third account system alongside Walker and AdminUser, with its
// own table and cookie — none of the three share storage or a code path (DEV-02 §1-4).
//
// Read only. Issuing a session (login) is blocked on GOV-01 D-021: the lockout counter still
// keys on the email alone, so a Walker and an OrganizationMember with the same address would
// lock each other out.
import type { AstroCookies } from "astro";
import { isActiveSession } from "@app/server-kit/auth";
import { UnauthenticatedError } from "@app/server-kit/http";
import { organizationMembers, organizationSessions, organizations } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { eq } from "drizzle-orm";

export const ORGANIZATION_SESSION_COOKIE = "organization_session";

export interface OrganizationSession {
  organizationMemberId: number;
  organizationId: number;
  organizationPublicId: string;
  role: "org_admin" | "org_staff";
  name: string;
}

// Lets the ADM screens render while login does not exist yet, so design work is not blocked on
// it. `import.meta.env.DEV` is false in every deployed build, so this cannot reach production —
// there, no cookie means no session and the page redirects.
const DEV_SESSION: OrganizationSession = {
  organizationMemberId: 1,
  organizationId: 1,
  organizationPublicId: "01HZZORGANIZATION0000000001",
  role: "org_admin",
  name: "北川 一郎",
};

export async function getOrganizationSession(cookies: AstroCookies, db: DbClient): Promise<OrganizationSession | null> {
  const token = cookies.get(ORGANIZATION_SESSION_COOKIE)?.value;
  if (!token) return import.meta.env.DEV ? DEV_SESSION : null;

  const [row] = await db
    .select({
      organizationMemberId: organizationMembers.id,
      organizationId: organizations.id,
      organizationPublicId: organizations.publicId,
      role: organizationMembers.role,
      name: organizationMembers.name,
      status: organizationMembers.status,
      expiresAt: organizationSessions.expiresAt,
    })
    .from(organizationSessions)
    .innerJoin(organizationMembers, eq(organizationSessions.organizationMemberId, organizationMembers.id))
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(eq(organizationSessions.sessionToken, token))
    .limit(1);

  if (!row || !isActiveSession(row)) return null;
  return { organizationMemberId: row.organizationMemberId, organizationId: row.organizationId, organizationPublicId: row.organizationPublicId, role: row.role, name: row.name };
}

export async function requireOrganizationSession(cookies: AstroCookies, db: DbClient): Promise<OrganizationSession> {
  const session = await getOrganizationSession(cookies, db);
  if (!session) throw new UnauthenticatedError();
  return session;
}

// org_admin-only screens (ADM-02, 03, 04, 15, 16, 23). org_staff reaching one is a redirect, not
// a 403: a page redirects where an API route would answer with a status (DEV-01 §5).
export function isOrganizationAdmin(session: OrganizationSession): boolean {
  return session.role === "org_admin";
}
