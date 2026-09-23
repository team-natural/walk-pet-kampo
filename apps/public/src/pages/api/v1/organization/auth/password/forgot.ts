// ADM-24's form target. Answers the same whether or not the address is registered — an
// unauthenticated form must not reveal who has an account.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { sendOrganizationPasswordResetEmail } from "$lib/server/mail/organization-members";
import { requestPasswordReset } from "$lib/server/services/organization-auth";
import { forgotPasswordSchema } from "$lib/server/validation/organization-auth";

const SENT = "/organization/forgot-password?status=sent";

export async function POST({ request, locals }: APIContext): Promise<Response> {
  const form = await request.formData();
  const parsed = forgotPasswordSchema.safeParse({ email: form.get("email") });
  if (!parsed.success) return new Response(null, { status: 303, headers: { Location: SENT } });

  const issued = await requestPasswordReset(createDb(env.DB), parsed.data.email);

  // After the response, not before it: the answer is identical either way, so waiting on Resend
  // would only leak — through the response time — whether the address is registered.
  if (issued) locals.cfContext.waitUntil(sendOrganizationPasswordResetEmail(parsed.data.email, issued.token));

  return new Response(null, { status: 303, headers: { Location: SENT } });
}
