// ADM-18's form target (F-12-01). A P0 or P1 report is put in front of the operator immediately
// (F-12-02) — after the response, so filing the report never waits on a mail provider.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { AppError, RateLimitError, toErrorResponse } from "@app/server-kit/http";
import { requireOrganizationSession } from "$lib/server/auth/organization-session";
import { lastValues } from "$lib/server/form";
import { sendIncidentAlertEmail } from "$lib/server/mail/incidents";
import { createIncident, isUrgent } from "$lib/server/services/incidents";
import { incidentSchema } from "$lib/server/validation/incidents";

const BACK = "/organization/incidents/add";

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function POST({ request, cookies, locals }: APIContext): Promise<Response> {
  try {
    const db = createDb(env.DB);
    const session = await requireOrganizationSession(cookies, db);

    const form = await request.formData();
    const parsed = incidentSchema.safeParse(lastValues(form));
    if (!parsed.success) return redirect(`${BACK}?error=input`);

    const attachments = form.getAll("attachments").filter((file): file is File => file instanceof File && file.size > 0);
    const incident = await createIncident(db, env.KV, env.BUCKET, session, parsed.data, attachments);

    if (isUrgent(incident.severity)) locals.cfContext.waitUntil(sendIncidentAlertEmail(incident));

    return redirect(`/organization/incidents/${incident.publicId}?status=created`);
  } catch (error) {
    if (error instanceof RateLimitError) return redirect(`${BACK}?error=too_many`);
    // A rejected attachment (wrong type, too large) lands here too — the staff member has to be
    // able to file the report without the file.
    if (error instanceof AppError) return redirect(`${BACK}?error=input`);
    return toErrorResponse(error);
  }
}
