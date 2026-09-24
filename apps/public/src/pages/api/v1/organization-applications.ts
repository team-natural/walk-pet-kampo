// SCR-15's form target (F-03-01). Unauthenticated by definition: a shelter applying has no
// account, and gets one only after approval (F-03-06).
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { ValidationError } from "@app/server-kit/http";
import { sendApplicationReceivedEmail } from "$lib/server/mail/organizations";
import { createApplication } from "$lib/server/services/organizations";
import { applicationSchema } from "$lib/server/validation/organizations";

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function POST({ request, locals }: APIContext): Promise<Response> {
  const form = await request.formData();
  const parsed = applicationSchema.safeParse({
    name: form.get("name"),
    representativeName: form.get("representativeName"),
    email: form.get("email"),
    activityArea: form.get("activityArea"),
    introduction: form.get("introduction"),
  });

  if (!parsed.success) return redirect("/organization/apply?error=input");

  try {
    await createApplication(createDb(env.DB), parsed.data);
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    return redirect("/organization/apply?error=duplicate");
  }

  // F-03-03. After the response: the applicant should not wait on Resend to see the confirmation.
  locals.cfContext.waitUntil(sendApplicationReceivedEmail(parsed.data.email, parsed.data.name));

  return redirect("/organization/apply/complete");
}
