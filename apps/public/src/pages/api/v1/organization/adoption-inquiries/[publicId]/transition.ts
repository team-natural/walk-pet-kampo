// ADM-21's status buttons (F-11-02, DEV-09 §2-11). Which moves exist from here is the transition
// table's call; this route only carries the one the staff member pressed.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { AppError, InvalidStateTransitionError, NotFoundError, toErrorResponse } from "@app/server-kit/http";
import { requireOrganizationSession } from "$lib/server/auth/organization-session";
import { transitionInquiryByOrganization } from "$lib/server/services/adoption-inquiries";
import { adoptionInquiryStatusSchema } from "$lib/server/validation/adoption-inquiries";

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function POST({ params, request, cookies }: APIContext): Promise<Response> {
  const publicId = params.publicId!;
  const back = `/organization/adoption-inquiries/${publicId}`;

  try {
    const db = createDb(env.DB);
    const session = await requireOrganizationSession(cookies, db);

    const form = await request.formData();
    const parsed = adoptionInquiryStatusSchema.safeParse({ to: form.get("to") });
    if (!parsed.success) return redirect(`${back}?status=failed`);

    await transitionInquiryByOrganization(db, session, publicId, parsed.data.to);
    return redirect(`${back}?status=saved`);
  } catch (error) {
    if (error instanceof InvalidStateTransitionError) return redirect(`${back}?error=state`);
    if (error instanceof NotFoundError) return redirect("/organization/adoption-inquiries?status=failed");
    if (error instanceof AppError) return redirect(`${back}?status=failed`);
    return toErrorResponse(error);
  }
}
