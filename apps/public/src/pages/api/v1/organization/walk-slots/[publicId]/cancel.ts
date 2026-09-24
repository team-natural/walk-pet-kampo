// ADM-10's cancellation (DEV-09 §2-6-4). Its own path rather than a value on /status: cancelling
// is terminal and, once reservations exist (P11), the one move with a cascade behind it.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { AppError, InvalidStateTransitionError, toErrorResponse } from "@app/server-kit/http";
import { requireOrganizationSession } from "$lib/server/auth/organization-session";
import { transitionWalkSlot } from "$lib/server/services/walk-slots";
import { walkSlotCancelSchema } from "$lib/server/validation/walk-slots";

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function POST({ params, request, cookies }: APIContext): Promise<Response> {
  const publicId = params.publicId!;
  const back = `/organization/walks/${publicId}`;

  try {
    const db = createDb(env.DB);
    const session = await requireOrganizationSession(cookies, db);

    const form = await request.formData();
    const { reason } = walkSlotCancelSchema.parse({ reason: form.get("reason") });

    await transitionWalkSlot(db, session, publicId, "cancelled", reason);
    return redirect(`${back}?status=cancelled`);
  } catch (error) {
    if (error instanceof InvalidStateTransitionError) return redirect(`${back}?error=state`);
    if (error instanceof AppError) return redirect(`${back}?status=failed`);
    return toErrorResponse(error);
  }
}
