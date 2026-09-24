// ADM-10's publish / unpublish control (F-06-02). One endpoint for every non-cancel move, because
// DEV-09 §2-6-2 — not the caller — decides which are reachable from the current state.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { AppError, InvalidStateTransitionError, toErrorResponse } from "@app/server-kit/http";
import { requireOrganizationSession } from "$lib/server/auth/organization-session";
import { transitionWalkSlot } from "$lib/server/services/walk-slots";
import { walkSlotStatusSchema } from "$lib/server/validation/walk-slots";

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
    const parsed = walkSlotStatusSchema.safeParse({ to: form.get("to") });
    if (!parsed.success) return redirect(`${back}?status=failed`);

    await transitionWalkSlot(db, session, publicId, parsed.data.to);
    return redirect(`${back}?status=saved`);
  } catch (error) {
    if (error instanceof InvalidStateTransitionError) return redirect(`${back}?error=state`);
    if (error instanceof AppError) return redirect(`${back}?status=failed`);
    return toErrorResponse(error);
  }
}
