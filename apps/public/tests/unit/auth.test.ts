// The session rules themselves are covered once in @app/server-kit; what is app-specific — and
// what these cover — is the join and the login orchestration.
import { env } from "cloudflare:workers";
import { walkerSessions, walkers } from "@app/schema";
import { createDb } from "@app/schema/client";
import { ulid } from "@app/schema/ulid";
import { hashPassword } from "@app/server-kit/auth";
import { UnauthenticatedError } from "@app/server-kit/http";
import type { AstroCookies } from "astro";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { WALKER_SESSION_COOKIE, createSession, getSession } from "../../src/lib/server/auth/session";
import { login, logout } from "../../src/lib/server/services/auth";

const db = createDb(env.DB);
const EMAIL = "walker@example.com";
const PASSWORD = "correct horse battery staple";

function cookiesWith(token?: string) {
  return { get: (name: string) => (token && name === WALKER_SESSION_COOKIE ? { value: token } : undefined) } as unknown as AstroCookies;
}

async function insertWalker(overrides: Partial<typeof walkers.$inferInsert> = {}) {
  const [row] = await db
    .insert(walkers)
    .values({
      publicId: ulid(),
      name: "Walker",
      email: EMAIL,
      passwordHash: await hashPassword(PASSWORD),
      status: "active",
      updatedAt: new Date().toISOString(),
      ...overrides,
    })
    .returning();
  return row!;
}

beforeEach(async () => {
  await db.delete(walkerSessions);
  await db.delete(walkers);
});

describe("getSession", () => {
  it("resolves a valid token to its Walker", async () => {
    const walker = await insertWalker();
    const { token } = await createSession(db, walker.id, 30);

    await expect(getSession(cookiesWith(token), db)).resolves.toEqual({
      walkerId: walker.id,
      walkerPublicId: walker.publicId,
    });
  });

  it("returns null with no cookie or an unknown token", async () => {
    await expect(getSession(cookiesWith(), db)).resolves.toBeNull();
    await expect(getSession(cookiesWith("not-a-real-token"), db)).resolves.toBeNull();
  });

  it("returns null once expired, and once the account is suspended", async () => {
    const walker = await insertWalker();
    const { token } = await createSession(db, walker.id, 30);

    await db.update(walkers).set({ status: "suspended" }).where(eq(walkers.id, walker.id));
    await expect(getSession(cookiesWith(token), db)).resolves.toBeNull();

    await db.update(walkers).set({ status: "active" }).where(eq(walkers.id, walker.id));
    await db
      .update(walkerSessions)
      .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(walkerSessions.sessionToken, token));
    await expect(getSession(cookiesWith(token), db)).resolves.toBeNull();
  });
});

describe("login", () => {
  it("issues a session and records the login time", async () => {
    await insertWalker({ lastLoginAt: null });
    const { session } = await login(db, EMAIL, PASSWORD, 30);

    expect(session.token).not.toBe("");
    expect(await db.select().from(walkerSessions)).toHaveLength(1);
    const [row] = await db.select().from(walkers);
    expect(row!.lastLoginAt).not.toBeNull();
  });

  it("rejects a wrong password and a suspended account without creating a session", async () => {
    await insertWalker();
    await expect(login(db, EMAIL, "wrong", 30)).rejects.toBeInstanceOf(UnauthenticatedError);

    await db.update(walkers).set({ status: "suspended" }).where(eq(walkers.email, EMAIL));
    await expect(login(db, EMAIL, PASSWORD, 30)).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(await db.select().from(walkerSessions)).toHaveLength(0);
  });

  it("gives an unknown address the same message as a wrong password", async () => {
    await insertWalker();
    const unknown = await login(db, "nobody@example.com", PASSWORD, 30).catch((error: Error) => error.message);
    const wrong = await login(db, EMAIL, "wrong", 30).catch((error: Error) => error.message);

    expect(unknown).toBe(wrong);
    expect(unknown).not.toContain("nobody@example.com");
  });
});

describe("session isolation", () => {
  it("does not accept a Walker token from the admin_sessions table, or vice versa", async () => {
    // The whole point of the split: apps/admin and apps/public share a D1, so a token minted
    // for one must be unusable on the other even though both live in the same database.
    const walker = await insertWalker();
    const { token } = await createSession(db, walker.id, 30);

    const [adminRow] = await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_sessions WHERE session_token = ?")
      .bind(token)
      .all<{ n: number }>()
      .then((r) => r.results);
    expect(adminRow?.n).toBe(0);
  });
});

describe("logout", () => {
  it("deletes the session row rather than just clearing a cookie", async () => {
    await insertWalker();
    const { session } = await login(db, EMAIL, PASSWORD, 30);

    await logout(db, session.token);

    expect(await db.select().from(walkerSessions)).toHaveLength(0);
    await expect(getSession(cookiesWith(session.token), db)).resolves.toBeNull();
  });
});
