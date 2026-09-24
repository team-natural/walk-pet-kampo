// ADM-07's adoption-status control (F-05-03). Separate from the edit form because it is a state
// transition, not a field: DEV-09 §2-5-2 decides which moves exist, and the form must not be able
// to set `adoption_status` directly.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { AppError, InvalidStateTransitionError, toErrorResponse } from "@app/server-kit/http";
import { requireOrganizationSession } from "$lib/server/auth/organization-session";
import { transitionDog } from "$lib/server/services/dogs";
import { adoptionStatusSchema } from "$lib/server/validation/dogs";

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function POST({ params, request, cookies }: APIContext): Promise<Response> {
  const publicId = params.publicId!;
  const back = `/organization/dogs/${publicId}`;

  try {
    const db = createDb(env.DB);
    const session = await requireOrganizationSession(cookies, db);

    const form = await request.formData();
    const parsed = adoptionStatusSchema.safeParse({ to: form.get("to") });
    if (!parsed.success) return redirect(`${back}?status=failed`);

    await transitionDog(db, session, publicId, parsed.data.to);
    return redirect(`${back}?status=saved`);
  } catch (error) {
    // A move the matrix forbids means the screen was stale — say so rather than 500.
    if (error instanceof InvalidStateTransitionError) return redirect(`${back}?error=state`);
    if (error instanceof AppError) return redirect(`${back}?status=failed`);
    return toErrorResponse(error);
  }
}
