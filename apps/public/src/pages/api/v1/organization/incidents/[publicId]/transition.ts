// ADM-19's status controls (F-12-03, DEV-09 §2-10-2). The shelter works its own report through;
// the operator's half of the same state machine arrives with P14 (GOV-02 TBD-58).
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { AppError, InvalidStateTransitionError, NotFoundError, ValidationError, toErrorResponse } from "@app/server-kit/http";
import { requireOrganizationSession } from "$lib/server/auth/organization-session";
import { lastValues } from "$lib/server/form";
import { transitionIncident } from "$lib/server/services/incidents";
import { incidentStatusSchema } from "$lib/server/validation/incidents";

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function POST({ params, request, cookies }: APIContext): Promise<Response> {
  const publicId = params.publicId!;
  const back = `/organization/incidents/${publicId}`;

  try {
    const db = createDb(env.DB);
    const session = await requireOrganizationSession(cookies, db);

    const form = await request.formData();
    const parsed = incidentStatusSchema.safeParse(lastValues(form));
    if (!parsed.success) return redirect(`${back}?status=failed`);

    await transitionIncident(db, session, publicId, parsed.data.to, parsed.data.preventionMeasures);
    return redirect(`${back}?status=saved`);
  } catch (error) {
    // Resolving without saying what changed is the one refusal a staff member must read.
    if (error instanceof ValidationError) return redirect(`${back}?error=prevention`);
    if (error instanceof InvalidStateTransitionError) return redirect(`${back}?error=state`);
    if (error instanceof NotFoundError) return redirect("/organization/incidents?status=failed");
    if (error instanceof AppError) return redirect(`${back}?status=failed`);
    return toErrorResponse(error);
  }
}
