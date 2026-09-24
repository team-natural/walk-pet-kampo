// SCR-23's code entry (F-01-02, DEV-04 §5-11). Every failure answers the same way: which of
// "wrong code", "expired" and "too many attempts" it was is not something the caller may learn.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { AppError, toErrorResponse } from "@app/server-kit/http";
import { requireSession } from "$lib/server/auth/session";
import { safeNext } from "$lib/server/next-path";
import { PhoneVerificationError, confirmPhoneVerification } from "$lib/server/services/phone-verification";
import { phoneCodeSchema } from "$lib/server/validation/reservations";

const BACK = "/mypage/verification";

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function POST({ request, cookies }: APIContext): Promise<Response> {
  const form = await request.formData();
  // Sent here from a reservation attempt? Every answer keeps the way back, including the failures
  // — a walker who mistypes once must not lose the walk they were booking (DEV-09 §2-7-3).
  const next = safeNext(form.get("next"));
  const failure = (query: string) => `${BACK}?${query}${next ? `&next=${encodeURIComponent(next)}` : ""}`;

  try {
    const db = createDb(env.DB);
    const session = await requireSession(cookies, db);

    const parsed = phoneCodeSchema.safeParse({ code: form.get("code") });
    if (!parsed.success) return redirect(failure("error=code"));

    await confirmPhoneVerification(db, session.walkerId, parsed.data.code);

    return redirect(next ?? `${BACK}?status=verified`);
  } catch (error) {
    if (error instanceof PhoneVerificationError) return redirect(failure("error=code"));
    if (error instanceof AppError) return redirect(failure("error=failed"));
    return toErrorResponse(error);
  }
}
