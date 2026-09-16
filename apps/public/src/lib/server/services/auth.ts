// Login business logic. Session verification lives in ../auth/session.ts;
// this file is specifically about turning credentials into a session.
import { burnPasswordVerification, verifyPassword } from "@app/server-kit/auth";
import { UnauthenticatedError } from "@app/server-kit/http";
import type { DbClient } from "@app/schema/client";
import { createSession, destroySession } from "../auth/session";
import { getWalkerByEmail, touchLastLogin } from "./walkers";

export async function login(db: DbClient, email: string, password: string, ttlDays: number) {
  const walker = await getWalkerByEmail(db, email);

  // Same error for "no such account" and "wrong password" — do not let a client distinguish
  // account existence from credential correctness.
  const invalidCredentials = () => new UnauthenticatedError("メールアドレスまたはパスワードが正しくありません。");

  // Burn one derivation on the miss paths too, or they answer far faster than a real account —
  // an enumeration oracle regardless of the message being identical.
  if (!walker || walker.status !== "active") {
    await burnPasswordVerification(password);
    throw invalidCredentials();
  }

  const valid = await verifyPassword(password, walker.passwordHash);
  if (!valid) throw invalidCredentials();

  const session = await createSession(db, walker.id, ttlDays);
  await touchLastLogin(db, walker.id);

  return { session, walker };
}

export async function logout(db: DbClient, token: string): Promise<void> {
  await destroySession(db, token);
}
