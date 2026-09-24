// ADM-03's row actions (F-04-04): role change and suspend/reactivate. One endpoint because the
// screen posts one form per row, and both actions key on the same member.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { AppError, ForbiddenError, ValidationError, toErrorResponse } from "@app/server-kit/http";
import { isOrganizationAdmin, requireOrganizationSession } from "$lib/server/auth/organization-session";
import { changeMemberRole, setMemberStatus } from "$lib/server/services/organization-members";
import { memberRoleSchema, memberStatusSchema } from "$lib/server/validation/organizations";

const MEMBERS = "/organization/members";

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function POST({ request, cookies }: APIContext): Promise<Response> {
  try {
    const db = createDb(env.DB);
    const session = await requireOrganizationSession(cookies, db);
    if (!isOrganizationAdmin(session)) throw new ForbiddenError();

    const form = await request.formData();
    const email = String(form.get("email") ?? "");

    if (form.has("role")) {
      const parsed = memberRoleSchema.safeParse({ email, role: form.get("role") });
      if (!parsed.success) return redirect(`${MEMBERS}?status=failed`);
      // The member is looked up within this shelter — an address from another one simply is not
      // found, which is the tenant boundary doing its job (DEV-02 §3).
      await changeMemberRole(db, session, parsed.data.email, parsed.data.role);
    } else {
      const parsed = memberStatusSchema.safeParse({ email, status: form.get("status") });
      if (!parsed.success) return redirect(`${MEMBERS}?status=failed`);
      await setMemberStatus(db, session, parsed.data.email, parsed.data.status);
    }

    return redirect(`${MEMBERS}?status=saved`);
  } catch (error) {
    // Refusing to remove the last administrator is a rule the admin needs to read, not a 500.
    if (error instanceof ValidationError) return redirect(`${MEMBERS}?error=last_admin`);
    if (error instanceof AppError) return redirect(`${MEMBERS}?status=failed`);
    return toErrorResponse(error);
  }
}
