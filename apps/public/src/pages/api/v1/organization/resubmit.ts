// SCR-51's form target (F-03-05). The token is the identity claim — the applicant still has no
// account at this point (DEV-07 §5-25, GOV-01 D-037).
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { InvalidTokenError, resubmitApplication } from "$lib/server/services/organizations";
import { resubmissionSchema } from "$lib/server/validation/organizations";

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function POST({ request }: APIContext): Promise<Response> {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  const parsed = resubmissionSchema.safeParse({ token, note: form.get("note") });
  if (!parsed.success) return redirect(`/organization/apply/${encodeURIComponent(token)}?error=input`);

  try {
    await resubmitApplication(createDb(env.DB), parsed.data.token, parsed.data.note);
  } catch (error) {
    // Expired, already used, or the application has moved on since the link was sent.
    if (!(error instanceof InvalidTokenError)) throw error;
    return redirect(`/organization/apply/${encodeURIComponent(token)}?error=token`);
  }

  return redirect("/organization/apply/complete?status=resubmitted");
}
