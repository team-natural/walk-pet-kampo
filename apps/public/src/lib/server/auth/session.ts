// Walker sessions. Deliberately a separate table, cookie and module from apps/admin's
// AdminUser sessions — the shared rules live in @app/server-kit/auth, the storage never does.
import type { AstroCookies } from "astro";
import { isActiveSession, newSessionToken, sessionExpiresAt } from "@app/server-kit/auth";
import { UnauthenticatedError } from "@app/server-kit/http";
import { walkerSessions, walkers } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { eq } from "drizzle-orm";

export const WALKER_SESSION_COOKIE = "walker_session";

export interface Session {
  walkerId: number;
  walkerPublicId: string;
}

export async function getSession(cookies: AstroCookies, db: DbClient): Promise<Session | null> {
  const token = cookies.get(WALKER_SESSION_COOKIE)?.value;
  if (!token) return null;

  const [row] = await db
    .select({
      walkerId: walkers.id,
      walkerPublicId: walkers.publicId,
      status: walkers.status,
      expiresAt: walkerSessions.expiresAt,
    })
    .from(walkerSessions)
    .innerJoin(walkers, eq(walkerSessions.walkerId, walkers.id))
    .where(eq(walkerSessions.sessionToken, token))
    .limit(1);

  if (!row || !isActiveSession(row)) return null;
  return { walkerId: row.walkerId, walkerPublicId: row.walkerPublicId };
}

export async function requireSession(cookies: AstroCookies, db: DbClient): Promise<Session> {
  const session = await getSession(cookies, db);
  if (!session) throw new UnauthenticatedError();
  return session;
}

export async function createSession(db: DbClient, walkerId: number, ttlDays: number): Promise<{ token: string; expiresAt: string }> {
  const expiresAt = sessionExpiresAt(ttlDays);
  const token = newSessionToken();
  await db.insert(walkerSessions).values({ walkerId, sessionToken: token, expiresAt });
  return { token, expiresAt };
}

export async function destroySession(db: DbClient, token: string): Promise<void> {
  await db.delete(walkerSessions).where(eq(walkerSessions.sessionToken, token));
}

// Used after a password reset: the point of resetting is that someone else may hold the old
// credential, so every session opened with it has to go, not just the current browser's.
export async function destroyAllSessions(db: DbClient, walkerId: number): Promise<void> {
  await db.delete(walkerSessions).where(eq(walkerSessions.walkerId, walkerId));
}
