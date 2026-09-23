// OrganizationMember sessions. A third account system alongside Walker and AdminUser, with its
// own table and cookie — none of the three share storage or a code path (DEV-02 §1-4).
import type { AstroCookies } from "astro";
import { isActiveSession, newSessionToken, sessionExpiresAt } from "@app/server-kit/auth";
import { UnauthenticatedError } from "@app/server-kit/http";
import { organizationMembers, organizationSessions, organizations } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { eq } from "drizzle-orm";

export const ORGANIZATION_SESSION_COOKIE = "organization_session";

export interface OrganizationSession {
  organizationMemberId: number;
  organizationId: number;
  organizationPublicId: string;
  /** The shelter's name. The lookup already joins organizations, so carrying it costs nothing
   *  and saves OrganizationLayout a second query on every screen. */
  organizationName: string;
  role: "org_admin" | "org_staff";
  name: string;
}

export async function getOrganizationSession(cookies: AstroCookies, db: DbClient): Promise<OrganizationSession | null> {
  const token = cookies.get(ORGANIZATION_SESSION_COOKIE)?.value;
  if (!token) return null;

  const [row] = await db
    .select({
      organizationMemberId: organizationMembers.id,
      organizationId: organizations.id,
      organizationPublicId: organizations.publicId,
      organizationName: organizations.name,
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
  return { organizationMemberId: row.organizationMemberId, organizationId: row.organizationId, organizationPublicId: row.organizationPublicId, organizationName: row.organizationName, role: row.role, name: row.name };
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

export async function createOrganizationSession(db: DbClient, organizationMemberId: number, ttlDays: number): Promise<{ token: string; expiresAt: string }> {
  const expiresAt = sessionExpiresAt(ttlDays);
  const token = newSessionToken();
  await db.insert(organizationSessions).values({ organizationMemberId, sessionToken: token, expiresAt });
  return { token, expiresAt };
}

export async function destroyOrganizationSession(db: DbClient, token: string): Promise<void> {
  await db.delete(organizationSessions).where(eq(organizationSessions.sessionToken, token));
}

// Used after a password reset: the point of resetting is that someone else may hold the old
// credential, so every session opened with it has to go, not just the current browser's.
export async function destroyAllOrganizationSessions(db: DbClient, organizationMemberId: number): Promise<void> {
  await db.delete(organizationSessions).where(eq(organizationSessions.organizationMemberId, organizationMemberId));
}
