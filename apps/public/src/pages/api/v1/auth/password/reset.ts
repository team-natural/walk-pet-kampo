// SCR-14's form target (F-01-04). Unlike the organization side, this does not sign the walker
// in afterwards: the login screen is one tap away and a freshly reset password is worth typing
// once, which also proves the new one was stored as intended.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { InvalidTokenError, resetPassword } from "$lib/server/services/walker-registration";
import { resetPasswordSchema } from "$lib/server/validation/auth";

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function POST({ request }: APIContext): Promise<Response> {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  const parsed = resetPasswordSchema.safeParse({ token, password: form.get("password") });
  if (!parsed.success) return redirect(`/auth/reset-password/${encodeURIComponent(token)}?error=password`);

  try {
    await resetPassword(createDb(env.DB), parsed.data.token, parsed.data.password);
    return redirect("/auth/login?status=password_reset");
  } catch (error) {
    // Expired, already used, or never existed — the screen says the link is no longer valid
    // rather than which of the three it was.
    if (error instanceof InvalidTokenError) return redirect("/auth/forgot-password?error=token");
    throw error;
  }
}
