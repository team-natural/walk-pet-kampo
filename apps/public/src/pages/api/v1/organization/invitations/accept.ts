// ADM-26's form target. No session guard on purpose: the invitation token is the identity claim,
// because the person accepting has no account until this runs (DEV-04 §5).
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { ORGANIZATION_SESSION_COOKIE } from "$lib/server/auth/organization-session";
import { InvalidTokenError, acceptInvitation } from "$lib/server/services/organization-auth";
import { acceptInvitationSchema } from "$lib/server/validation/organization-auth";

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function POST({ request, cookies }: APIContext): Promise<Response> {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  const parsed = acceptInvitationSchema.safeParse({ token, name: form.get("name"), password: form.get("password") });
  if (!parsed.success) return redirect(`/organization/invitations/${encodeURIComponent(token)}?error=input`);

  try {
    const { session } = await acceptInvitation(createDb(env.DB), parsed.data.token, parsed.data.name, parsed.data.password, Number(env.SESSION_TTL_DAYS));

    cookies.set(ORGANIZATION_SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      expires: new Date(session.expiresAt),
    });

    return redirect("/organization?status=joined");
  } catch (error) {
    if (error instanceof InvalidTokenError) return redirect(`/organization/invitations/${encodeURIComponent(token)}?error=token`);
    throw error;
  }
}
