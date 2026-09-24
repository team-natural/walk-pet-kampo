// SCR-08's form target (F-02-01). Answers the same whether or not the address already has an
// account — the form must not become a way to test which addresses are registered. The owner of
// an existing address is told by mail instead.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { ValidationError } from "@app/server-kit/http";
import { createDb } from "@app/schema/client";
import { sendWalkerAlreadyRegisteredEmail, sendWalkerVerificationEmail } from "$lib/server/mail/walkers";
import { registerWalker } from "$lib/server/services/walker-registration";
import { registerSchema } from "$lib/server/validation/auth";

const COMPLETE = "/register/complete";

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function POST({ request, locals }: APIContext): Promise<Response> {
  const form = await request.formData();
  const parsed = registerSchema.safeParse({ name: form.get("name"), email: form.get("email"), password: form.get("password"), termsAgreed: form.get("termsAgreed") });

  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return redirect(`/register?error=${field === "termsAgreed" ? "terms" : field === "password" ? "password" : "input"}`);
  }

  const { name, email, password } = parsed.data;

  try {
    const { token } = await registerWalker(createDb(env.DB), { name, email, password });
    locals.cfContext.waitUntil(sendWalkerVerificationEmail(email, name, token));
  } catch (error) {
    // The service refuses a duplicate address; the screen must not learn that it did.
    if (!(error instanceof ValidationError)) throw error;
    locals.cfContext.waitUntil(sendWalkerAlreadyRegisteredEmail(email));
  }

  return redirect(COMPLETE);
}
