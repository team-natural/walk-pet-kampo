// DEV-02 §7's account-level budgets. What matters here is that the window is a fixed bucket:
// a caller who keeps trying must not push their own reset further away.
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { RateLimitError } from "../src/http/errors";
import { RATE_LIMITS, assertWithinRateLimit } from "../src/rate-limit";

const WALKER_ID = 42;

beforeEach(async () => {
  const { keys } = await env.KV.list();
  await Promise.all(keys.map((key) => env.KV.delete(key.name)));
});

describe("assertWithinRateLimit", () => {
  it("allows exactly the documented number of actions, then refuses", async () => {
    const { limit } = RATE_LIMITS.reservationCreate;

    for (let i = 0; i < limit; i++) {
      await expect(assertWithinRateLimit(env.KV, "reservationCreate", WALKER_ID)).resolves.toBeUndefined();
    }

    await expect(assertWithinRateLimit(env.KV, "reservationCreate", WALKER_ID)).rejects.toBeInstanceOf(RateLimitError);
  });

  it("counts each subject separately", async () => {
    const { limit } = RATE_LIMITS.phoneVerification;
    for (let i = 0; i < limit; i++) await assertWithinRateLimit(env.KV, "phoneVerification", WALKER_ID);

    await expect(assertWithinRateLimit(env.KV, "phoneVerification", WALKER_ID + 1)).resolves.toBeUndefined();
  });

  it("counts each action separately, so one budget cannot spend another", async () => {
    const { limit } = RATE_LIMITS.phoneVerification;
    for (let i = 0; i < limit; i++) await assertWithinRateLimit(env.KV, "phoneVerification", WALKER_ID);

    await expect(assertWithinRateLimit(env.KV, "reservationCreate", WALKER_ID)).resolves.toBeUndefined();
  });

  it("keeps the reset time of the first action in the window", async () => {
    await assertWithinRateLimit(env.KV, "reservationCreate", WALKER_ID);
    const first = await env.KV.get<{ resetAt: number }>(`rate:reservationCreate:${WALKER_ID}`, "json");

    await assertWithinRateLimit(env.KV, "reservationCreate", WALKER_ID);
    const second = await env.KV.get<{ count: number; resetAt: number }>(`rate:reservationCreate:${WALKER_ID}`, "json");

    expect(second!.count).toBe(2);
    expect(second!.resetAt).toBe(first!.resetAt);
  });
});
