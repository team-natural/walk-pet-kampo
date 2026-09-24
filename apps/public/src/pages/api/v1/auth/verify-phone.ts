// SCR-23's "send me a code" (F-01-02, DEV-04 §5-11). The number is read from the profile, never
// from the form: a request body that can pick the destination is a way to send SMS anywhere.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { AppError, RateLimitError, ValidationError, toErrorResponse } from "@app/server-kit/http";
import { assertWithinRateLimit } from "@app/server-kit/rate-limit";
import { requireSession } from "$lib/server/auth/session";
import { safeNext } from "$lib/server/next-path";
import { requestPhoneVerification } from "$lib/server/services/phone-verification";

const BACK = "/mypage/verification";

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function POST({ request, cookies }: APIContext): Promise<Response> {
  const form = await request.formData();
  // Carried through every answer: a walker sent here mid-booking must still be handed back to
  // the walk afterwards, however many codes they ask for (DEV-09 §2-7-3).
  const next = safeNext(form.get("next"));
  const back = (query: string) => `${BACK}?${query}${next ? `&next=${encodeURIComponent(next)}` : ""}`;

  try {
    const db = createDb(env.DB);
    const session = await requireSession(cookies, db);

    // Five an hour per walker: each one costs money to send (DEV-02 §7).
    await assertWithinRateLimit(env.KV, "phoneVerification", session.walkerId);
    await requestPhoneVerification(db, session.walkerId);

    return redirect(back("status=code_sent"));
  } catch (error) {
    if (error instanceof RateLimitError) return redirect(back("error=too_many"));
    if (error instanceof ValidationError) return redirect(back("error=no_phone"));
    if (error instanceof AppError) return redirect(back("error=failed"));
    return toErrorResponse(error);
  }
}
