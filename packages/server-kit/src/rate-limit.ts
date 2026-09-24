// Per-account business limits (DEV-02 §7): reservation holds, payment attempts, adoption
// inquiries. Generic per-IP limiting is the edge's job — this counts what the edge cannot see,
// which is "this Walker, this action, this hour".
//
// Separate from auth/lockout.ts on purpose: that one locks an identity out after failures, this
// one caps successful actions. Sharing a key space would let a burst of failed logins spend a
// walker's reservation budget.
import { RateLimitError } from "./http/errors";

export interface RateLimit {
  /** How many actions are allowed inside the window. */
  limit: number;
  windowSeconds: number;
}

export const HOUR_SECONDS = 60 * 60;
export const DAY_SECONDS = 24 * HOUR_SECONDS;

// Written out so a caller cannot invent a different budget for the same action in two places.
export const RATE_LIMITS = {
  reservationCreate: { limit: 10, windowSeconds: HOUR_SECONDS },
  paymentAttempt: { limit: 5, windowSeconds: HOUR_SECONDS },
  phoneVerification: { limit: 5, windowSeconds: HOUR_SECONDS },
  adoptionInquiry: { limit: 5, windowSeconds: DAY_SECONDS },
  incidentReport: { limit: 20, windowSeconds: DAY_SECONDS },
  memberInvite: { limit: 20, windowSeconds: DAY_SECONDS },
} as const satisfies Record<string, RateLimit>;

export type RateLimitName = keyof typeof RATE_LIMITS;

interface Bucket {
  count: number;
  /** Epoch ms. Carried in the value because KV cannot be asked for a key's remaining TTL. */
  resetAt: number;
}

// KV rejects an expirationTtl under 60 seconds, so the tail of a window is rounded up to it —
// the budget refills a little late rather than a little early.
const MIN_TTL_SECONDS = 60;

// A fixed window rather than a sliding log: KV has no atomic increment, and an exact count is not
// what this is for. Undercounting a concurrent burst is acceptable; letting a script hold every
// seat in a shelter's calendar is not.
export async function assertWithinRateLimit(kv: KVNamespace, name: RateLimitName, subjectId: number | string): Promise<void> {
  const { limit, windowSeconds } = RATE_LIMITS[name];
  const key = `rate:${name}:${subjectId}`;
  const now = Date.now();

  const stored = await kv.get<Bucket>(key, "json");
  // An expired bucket can still be readable for a moment after its TTL — treat it as gone.
  const bucket = stored && stored.resetAt > now ? stored : { count: 0, resetAt: now + windowSeconds * 1000 };

  if (bucket.count >= limit) throw new RateLimitError();

  // The window is not pushed back by later attempts: the TTL always counts down to the reset
  // this bucket started with.
  const ttl = Math.max(Math.ceil((bucket.resetAt - now) / 1000), MIN_TTL_SECONDS);
  await kv.put(key, JSON.stringify({ count: bucket.count + 1, resetAt: bucket.resetAt }), { expirationTtl: ttl });
}
