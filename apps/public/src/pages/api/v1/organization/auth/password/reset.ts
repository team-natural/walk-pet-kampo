// ADM-25's form target. A valid token proves control of the mailbox, so the new password is
// accepted and a session issued in one step — the screen tells the user exactly that.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { ORGANIZATION_SESSION_COOKIE } from "$lib/server/auth/organization-session";
import { InvalidTokenError, resetPassword } from "$lib/server/services/organization-auth";
import { resetPasswordSchema } from "$lib/server/validation/organization-auth";

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function POST({ request, cookies }: APIContext): Promise<Response> {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  const parsed = resetPasswordSchema.safeParse({ token, password: form.get("password") });
  if (!parsed.success) return redirect(`/organization/reset-password/${encodeURIComponent(token)}?error=password`);

  try {
    const { session } = await resetPassword(createDb(env.DB), parsed.data.token, parsed.data.password, Number(env.SESSION_TTL_DAYS));

    cookies.set(ORGANIZATION_SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      expires: new Date(session.expiresAt),
    });

    return redirect("/organization");
  } catch (error) {
    // Expired, already used, or never existed — the screen says the link is no longer valid
    // rather than which of the three it was.
    if (error instanceof InvalidTokenError) return redirect("/organization/forgot-password?error=token");
    throw error;
  }
}
