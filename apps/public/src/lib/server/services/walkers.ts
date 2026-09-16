// Read paths needed by login/me. Self-service registration, email verification and password
// reset are deliberately out of scope — they need a mail provider, which no project should be
// forced into by the template.
import { walkers } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { eq } from "drizzle-orm";

type WalkerRow = typeof walkers.$inferSelect;

// Never let `passwordHash` (or the internal integer `id`) leave this layer in a response body.
export function toPublicWalker(walker: WalkerRow) {
  return {
    id: walker.publicId,
    name: walker.name,
    email: walker.email,
    status: walker.status,
  };
}

export async function getWalkerByEmail(db: DbClient, email: string) {
  const [row] = await db.select().from(walkers).where(eq(walkers.email, email)).limit(1);
  return row ?? null;
}

export async function getWalkerByPublicId(db: DbClient, publicId: string) {
  const [row] = await db.select().from(walkers).where(eq(walkers.publicId, publicId)).limit(1);
  return row ?? null;
}

export async function touchLastLogin(db: DbClient, walkerId: number): Promise<void> {
  await db.update(walkers).set({ lastLoginAt: new Date().toISOString() }).where(eq(walkers.id, walkerId));
}
