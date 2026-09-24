// SCR-13's form target (F-01-04). Same answer for a registered and an unknown address.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { sendWalkerPasswordResetEmail } from "$lib/server/mail/walkers";
import { requestPasswordReset } from "$lib/server/services/walker-registration";
import { forgotPasswordSchema } from "$lib/server/validation/auth";

const SENT = "/auth/forgot-password?status=sent";

export async function POST({ request, locals }: APIContext): Promise<Response> {
  const form = await request.formData();
  const parsed = forgotPasswordSchema.safeParse({ email: form.get("email") });
  if (!parsed.success) return new Response(null, { status: 303, headers: { Location: SENT } });

  const issued = await requestPasswordReset(createDb(env.DB), parsed.data.email);

  // After the response: waiting on Resend would leak, through the response time, whether the
  // address is registered.
  if (issued) locals.cfContext.waitUntil(sendWalkerPasswordResetEmail(parsed.data.email, issued.token));

  return new Response(null, { status: 303, headers: { Location: SENT } });
}
