// ADM-27's form target (F-13-03). The Walker equivalent is /api/v1/me/notification-settings and
// stays a separate route: same table, different account system, different session (DEV-02 §1-4).
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { toErrorResponse } from "@app/server-kit/http";
import { optionalTypesFor } from "$lib/notification-types";
import { requireOrganizationSession } from "$lib/server/auth/organization-session";
import { updateNotificationSettings } from "$lib/server/services/notifications";

export async function POST({ request, cookies }: APIContext): Promise<Response> {
  try {
    const db = createDb(env.DB);
    const session = await requireOrganizationSession(cookies, db);
    const form = await request.formData();

    // Preferences belong to the member, not the shelter: two staff accounts on one organization
    // each keep their own (DEV-07 §5-18 keys on subject_id).
    const values = optionalTypesFor("organization_member").map((type) => ({
      type,
      emailEnabled: form.has(`${type}.email`),
      inAppEnabled: form.has(`${type}.inApp`),
    }));

    await updateNotificationSettings(db, { type: "organization_member", id: session.organizationMemberId }, values);

    return new Response(null, { status: 303, headers: { Location: "/organization/notification-settings?status=saved" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
