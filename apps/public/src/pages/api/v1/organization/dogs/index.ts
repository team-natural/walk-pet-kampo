// ADM-06's form target (F-05-02). org_staff may register a dog — only the shelter's own records
// are reachable, and the scope comes from the session (DEV-02 §3).
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { AppError, toErrorResponse } from "@app/server-kit/http";
import { requireOrganizationSession } from "$lib/server/auth/organization-session";
import { lastValues } from "$lib/server/form";
import { attachDogPhoto, createDog } from "$lib/server/services/dogs";
import { dogSchema } from "$lib/server/validation/dogs";

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function POST({ request, cookies }: APIContext): Promise<Response> {
  try {
    const db = createDb(env.DB);
    const session = await requireOrganizationSession(cookies, db);

    const form = await request.formData();
    const parsed = dogSchema.safeParse(lastValues(form));
    if (!parsed.success) return redirect("/organization/dogs/add?status=failed");

    const { publicId } = await createDog(db, session, parsed.data);

    const photo = form.get("photo");
    if (photo instanceof File && photo.size > 0) await attachDogPhoto(db, env.BUCKET, session, publicId, photo);

    return redirect(`/organization/dogs/${publicId}?status=created`);
  } catch (error) {
    // A rejected upload (wrong type, too large) is the applicant's mistake, not a 500.
    if (error instanceof AppError) return redirect("/organization/dogs/add?status=failed");
    return toErrorResponse(error);
  }
}
