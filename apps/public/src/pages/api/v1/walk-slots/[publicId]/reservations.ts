// SCR-17's form target (F-07-06). Creates the hold in `processing` and sends the walker to the
// confirmation screen; paying is the next step (P12).
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { AppError, ConflictError, RateLimitError, ValidationError, toErrorResponse } from "@app/server-kit/http";
import { requireSession } from "$lib/server/auth/session";
import { lastValues } from "$lib/server/form";
import { ReservationNotAllowedError, createReservation } from "$lib/server/services/reservations";
import { reservationSchema } from "$lib/server/validation/reservations";

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function POST({ params, request, cookies }: APIContext): Promise<Response> {
  const publicId = params.publicId!;
  const back = `/walks/${publicId}/reserve`;

  try {
    const db = createDb(env.DB);
    const session = await requireSession(cookies, db);

    const form = await request.formData();
    const parsed = reservationSchema.safeParse(lastValues(form));
    if (!parsed.success) return redirect(`${back}?error=input`);

    const reservation = await createReservation(db, env.KV, session, publicId, parsed.data);
    return redirect(`/checkout?reservation=${reservation.publicId}`);
  } catch (error) {
    // The two blocks are a detour, not a refusal: SCR-23 verifies the number and hands the walker
    // back here (DEV-09 §2-7-3).
    if (error instanceof ReservationNotAllowedError) {
      return redirect(error.reason === "phone_unverified" ? `/mypage/verification?next=${encodeURIComponent(back)}` : "/mypage/profile?error=incomplete");
    }
    if (error instanceof RateLimitError) return redirect(`${back}?error=too_many`);
    // A seat taken while the form was open, or a walk that closed — the walker has to see the
    // current state, not a 500.
    if (error instanceof ConflictError) return redirect(`${back}?error=unavailable`);
    if (error instanceof ValidationError) return redirect(`${back}?error=input`);
    if (error instanceof AppError) return redirect(`${back}?error=failed`);
    return toErrorResponse(error);
  }
}
