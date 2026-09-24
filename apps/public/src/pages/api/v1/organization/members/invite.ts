// ADM-04's form target (F-04-03). org_admin only — inviting a colleague grants access to the
// shelter's participants and their emergency contacts.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { ForbiddenError, ValidationError, toErrorResponse } from "@app/server-kit/http";
import { isOrganizationAdmin, requireOrganizationSession } from "$lib/server/auth/organization-session";
import { sendOrganizationInvitationEmail } from "$lib/server/mail/organization-members";
import { inviteMember } from "$lib/server/services/invitations";
import { invitationSchema } from "$lib/server/validation/organizations";

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function POST({ request, cookies, locals }: APIContext): Promise<Response> {
  try {
    const db = createDb(env.DB);
    const session = await requireOrganizationSession(cookies, db);
    if (!isOrganizationAdmin(session)) throw new ForbiddenError();

    const form = await request.formData();
    const parsed = invitationSchema.safeParse({ email: form.get("email"), role: form.get("role") });
    if (!parsed.success) return redirect("/organization/members/add?status=failed");

    const { token } = await inviteMember(db, session, parsed.data.email, parsed.data.role);
    locals.cfContext.waitUntil(sendOrganizationInvitationEmail(parsed.data.email, session.organizationName, parsed.data.role, token));

    return redirect("/organization/members?status=invited");
  } catch (error) {
    // The address is already a member somewhere — worth naming, since the admin typed it and
    // organization_members.email is unique across every shelter.
    if (error instanceof ValidationError) return redirect("/organization/members/add?error=taken");
    return toErrorResponse(error);
  }
}
