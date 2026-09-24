// SCR-49's form target (F-11-01). The enquiry goes to the shelter; the platform does not mediate
// what happens after (GOV-02 TBD-32).
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { AppError, ConflictError, NotFoundError, RateLimitError, toErrorResponse } from "@app/server-kit/http";
import { requireSession } from "$lib/server/auth/session";
import { lastValues } from "$lib/server/form";
import { createAdoptionInquiry } from "$lib/server/services/adoption-inquiries";
import { adoptionInquirySchema } from "$lib/server/validation/adoption-inquiries";

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function POST({ params, request, cookies }: APIContext): Promise<Response> {
  const slug = params.slug!;
  const back = `/dogs/${slug}/adoption-inquiry`;

  try {
    const db = createDb(env.DB);
    const session = await requireSession(cookies, db);

    const form = await request.formData();
    const parsed = adoptionInquirySchema.safeParse(lastValues(form));
    if (!parsed.success) return redirect(`${back}?error=input`);

    await createAdoptionInquiry(db, env.KV, session, slug, parsed.data);
    return redirect(`${back}/complete`);
  } catch (error) {
    // "Already asked" and "no longer looking for a home" are both states the visitor can see for
    // themselves once they are back on the page.
    if (error instanceof ConflictError) return redirect(`${back}?error=unavailable`);
    if (error instanceof RateLimitError) return redirect(`${back}?error=too_many`);
    if (error instanceof NotFoundError) return redirect("/dogs");
    if (error instanceof AppError) return redirect(`${back}?error=failed`);
    return toErrorResponse(error);
  }
}
