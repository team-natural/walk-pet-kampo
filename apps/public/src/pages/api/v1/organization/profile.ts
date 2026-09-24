// ADM-02's form target (F-04-01, F-04-02). org_admin only: editing what the public shelter page
// shows is not a task for every staff account (DEV-02 §3-1).
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { ForbiddenError, toErrorResponse } from "@app/server-kit/http";
import { isOrganizationAdmin, requireOrganizationSession } from "$lib/server/auth/organization-session";
import { updateOrganizationProfile } from "$lib/server/services/organization-profile";
import { organizationProfileSchema } from "$lib/server/validation/organizations";

export async function POST({ request, cookies }: APIContext): Promise<Response> {
  try {
    const db = createDb(env.DB);
    const session = await requireOrganizationSession(cookies, db);
    if (!isOrganizationAdmin(session)) throw new ForbiddenError();

    const form = await request.formData();
    const parsed = organizationProfileSchema.safeParse({
      name: form.get("name"),
      representativeName: form.get("representativeName"),
      activityArea: form.get("activityArea"),
      addressVisibility: form.get("addressVisibility"),
      address: form.get("address"),
      introduction: form.get("introduction"),
    });

    if (!parsed.success) return new Response(null, { status: 303, headers: { Location: "/organization/profile?status=failed" } });

    // organizationId from the session, never from the form: this endpoint has no notion of
    // editing another shelter (DEV-02 §3).
    await updateOrganizationProfile(db, session, parsed.data);

    return new Response(null, { status: 303, headers: { Location: "/organization/profile?status=saved" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
