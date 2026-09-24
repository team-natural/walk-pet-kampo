// ADM-26's other form target (F-03-06, DEV-04 §5-9). No session guard, for the same reason as
// the invitation route: the token is the identity claim, because the shelter has no account yet.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { ORGANIZATION_SESSION_COOKIE } from "$lib/server/auth/organization-session";
import { InvalidTokenError, activateOrganization } from "$lib/server/services/organization-auth";
import { acceptInvitationSchema } from "$lib/server/validation/organization-auth";

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function POST({ request, cookies }: APIContext): Promise<Response> {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  const back = `/organization/invitations/${encodeURIComponent(token)}`;

  // The same three fields as accepting an invitation, so the same schema: name, password, token.
  const parsed = acceptInvitationSchema.safeParse({ token, name: form.get("name"), password: form.get("password") });
  if (!parsed.success) return redirect(`${back}?error=input`);

  try {
    const { session } = await activateOrganization(createDb(env.DB), parsed.data.token, parsed.data.name, parsed.data.password, Number(env.SESSION_TTL_DAYS));

    cookies.set(ORGANIZATION_SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      expires: new Date(session.expiresAt),
    });

    return redirect("/organization?status=joined");
  } catch (error) {
    if (error instanceof InvalidTokenError) return redirect(`${back}?error=token`);
    throw error;
  }
}
