// F-01-02 / SCR-23. Required before the first reservation, not at signup (GOV-01 D-036), so this
// is the gate `reservations.ts` checks rather than something registration owns.
import { walkerProfiles, walkerPhoneVerificationTokens } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { ValidationError } from "@app/server-kit/http";
import { and, desc, eq, isNull } from "drizzle-orm";
import { sendSms } from "../sms/client";

// Ten minutes: an SMS is read where it lands, and a code that outlives the moment is just a
// longer window for someone else to try it (DEV-07 §5-27).
const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

export class PhoneVerificationError extends Error {}

// Six digits, uniformly distributed. `Math.random()` is not used anywhere a value has to be
// unguessable, including here.
function newCode(): string {
  const [value] = crypto.getRandomValues(new Uint32Array(1));
  return String(value! % 1_000_000).padStart(6, "0");
}

// Digits only, and the country code normalised away: the profile stores what the walker typed,
// which varies between "090-1234-5678" and "+819012345678" for the same phone.
export function normalisePhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  return digits.startsWith("81") && digits.length > 10 ? `0${digits.slice(2)}` : digits;
}

export async function requestPhoneVerification(db: DbClient, walkerId: number): Promise<void> {
  const [profile] = await db.select().from(walkerProfiles).where(eq(walkerProfiles.walkerId, walkerId)).limit(1);
  if (!profile?.phone) throw new ValidationError({ phone: ["先にプロフィールで電話番号を登録してください。"] });

  const code = newCode();
  const now = new Date();

  // Any code already outstanding is spent first: two live codes for one number means the older
  // SMS keeps working after the walker asked for a new one.
  await db
    .update(walkerPhoneVerificationTokens)
    .set({ usedAt: now.toISOString() })
    .where(and(eq(walkerPhoneVerificationTokens.walkerId, walkerId), isNull(walkerPhoneVerificationTokens.usedAt)));

  await db.insert(walkerPhoneVerificationTokens).values({
    walkerId,
    phone: profile.phone,
    code,
    expiresAt: new Date(now.getTime() + CODE_TTL_MINUTES * 60 * 1000).toISOString(),
  });

  await sendSms({ to: profile.phone, text: `【保護犬おさんぽマッチング】確認コード: ${code}（${CODE_TTL_MINUTES} 分間有効）` });
}

export async function confirmPhoneVerification(db: DbClient, walkerId: number, code: string): Promise<void> {
  const [profile] = await db.select().from(walkerProfiles).where(eq(walkerProfiles.walkerId, walkerId)).limit(1);
  if (!profile) throw new PhoneVerificationError();

  const [token] = await db
    .select()
    .from(walkerPhoneVerificationTokens)
    .where(and(eq(walkerPhoneVerificationTokens.walkerId, walkerId), isNull(walkerPhoneVerificationTokens.usedAt)))
    .orderBy(desc(walkerPhoneVerificationTokens.id))
    .limit(1);

  const now = new Date().toISOString();
  if (!token || token.expiresAt <= now || token.attemptCount >= MAX_ATTEMPTS) throw new PhoneVerificationError();

  // The number must still be the one the code went to: changing the profile between the two
  // steps would otherwise verify a number nobody sent anything to.
  if (normalisePhone(token.phone) !== normalisePhone(profile.phone ?? "")) throw new PhoneVerificationError();

  if (token.code !== code.trim()) {
    // Counted before the answer is given, so a wrong guess costs an attempt whatever happens next.
    await db
      .update(walkerPhoneVerificationTokens)
      .set({ attemptCount: token.attemptCount + 1 })
      .where(eq(walkerPhoneVerificationTokens.id, token.id));
    throw new PhoneVerificationError();
  }

  await db.batch([db.update(walkerPhoneVerificationTokens).set({ usedAt: now }).where(eq(walkerPhoneVerificationTokens.id, token.id)), db.update(walkerProfiles).set({ phoneVerifiedAt: now, updatedAt: now }).where(eq(walkerProfiles.id, profile.id))]);
}
