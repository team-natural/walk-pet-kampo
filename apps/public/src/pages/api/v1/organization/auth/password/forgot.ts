// ADM-24's form target. Answers the same whether or not the address is registered — an
// unauthenticated form must not reveal who has an account.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { requestPasswordReset } from "$lib/server/services/organization-auth";
import { forgotPasswordSchema } from "$lib/server/validation/organization-auth";

const SENT = "/organization/forgot-password?status=sent";

export async function POST({ request }: APIContext): Promise<Response> {
  const form = await request.formData();
  const parsed = forgotPasswordSchema.safeParse({ email: form.get("email") });
  if (!parsed.success) return new Response(null, { status: 303, headers: { Location: SENT } });

  const issued = await requestPasswordReset(createDb(env.DB), parsed.data.email);

  // TODO(P2): send the link with Resend (DEV-10 §3). The token row is written here, but until the
  // mail phase lands nothing delivers it — in dev, read the URL from the log below.
  if (issued && import.meta.env.DEV) {
    console.log(JSON.stringify({ event: "organization.password_reset.link", url: `/organization/reset-password/${issued.token}` }));
  }

  return new Response(null, { status: 303, headers: { Location: SENT } });
}
