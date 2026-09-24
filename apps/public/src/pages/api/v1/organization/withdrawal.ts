// ADM-23's form target (F-04-05). org_admin only, and terminal: `withdrawn` has no way back
// (DEV-09 §2-1-2), so a shelter that changes its mind applies again as a new record.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { AppError, ForbiddenError, ValidationError, toErrorResponse } from "@app/server-kit/http";
import { ORGANIZATION_SESSION_COOKIE, isOrganizationAdmin, requireOrganizationSession } from "$lib/server/auth/organization-session";
import { withdrawOrganization } from "$lib/server/services/organization-profile";

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function POST({ request, cookies }: APIContext): Promise<Response> {
  try {
    const db = createDb(env.DB);
    const session = await requireOrganizationSession(cookies, db);
    if (!isOrganizationAdmin(session)) throw new ForbiddenError();

    const form = await request.formData();
    const reason = String(form.get("reason") ?? "").trim();
    await withdrawOrganization(db, session, reason || undefined);

    // The shelter is gone from the public site; leaving the cookie would send the staff to a
    // console whose every screen now redirects.
    cookies.delete(ORGANIZATION_SESSION_COOKIE, { path: "/" });
    return redirect("/organization/login?status=withdrawn");
  } catch (error) {
    // Open reservations block it — the shelter has to deal with those first (DEV-09 §2-1-4).
    if (error instanceof ValidationError) return redirect("/organization/withdrawal?error=reservations");
    if (error instanceof AppError) return redirect("/organization/withdrawal?error=state");
    return toErrorResponse(error);
  }
}
