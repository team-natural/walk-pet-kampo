// AdminUser sessions. Walkers (apps/public) get their own table, cookie and module — the shared
// rules live in @app/server-kit/auth, the storage never is.
import type { AstroCookies } from "astro";
import { isActiveSession, newSessionToken, sessionExpiresAt } from "@app/server-kit/auth";
import { UnauthenticatedError } from "@app/server-kit/http";
import { adminSessions, adminUsers } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { eq } from "drizzle-orm";

export const ADMIN_SESSION_COOKIE = "admin_session";

export interface Session {
  adminUserId: number;
  adminUserPublicId: string;
}

export async function getSession(cookies: AstroCookies, db: DbClient): Promise<Session | null> {
  const token = cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;

  const [row] = await db
    .select({
      adminUserId: adminUsers.id,
      adminUserPublicId: adminUsers.publicId,
      status: adminUsers.status,
      expiresAt: adminSessions.expiresAt,
    })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminSessions.adminUserId, adminUsers.id))
    .where(eq(adminSessions.sessionToken, token))
    .limit(1);

  if (!row || !isActiveSession(row)) return null;
  return { adminUserId: row.adminUserId, adminUserPublicId: row.adminUserPublicId };
}

// There is no requireRole counterpart: AdminUser has one role, so being logged in is the whole
// of Platform authorization (GOV-01 D-011, DEV-02 §2-3). Organization-side checks live in
// apps/public and are a different system entirely.
export async function requireSession(cookies: AstroCookies, db: DbClient): Promise<Session> {
  const session = await getSession(cookies, db);
  if (!session) throw new UnauthenticatedError();
  return session;
}

export async function createSession(db: DbClient, adminUserId: number, ttlDays: number): Promise<{ token: string; expiresAt: string }> {
  const expiresAt = sessionExpiresAt(ttlDays);
  const token = newSessionToken();
  await db.insert(adminSessions).values({ adminUserId, sessionToken: token, expiresAt });
  return { token, expiresAt };
}

export async function destroySession(db: DbClient, token: string): Promise<void> {
  await db.delete(adminSessions).where(eq(adminSessions.sessionToken, token));
}
