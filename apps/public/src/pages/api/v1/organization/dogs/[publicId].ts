// ADM-07's form target (F-05-02, F-05-04). Publishing rides on the same form: it is one column,
// and splitting it into its own endpoint would mean two round trips to fix one screen's state.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { AppError, NotFoundError, toErrorResponse } from "@app/server-kit/http";
import { requireOrganizationSession } from "$lib/server/auth/organization-session";
import { lastValues } from "$lib/server/form";
import { attachDogPhoto, updateDog } from "$lib/server/services/dogs";
import { dogPublishSchema, dogSchema } from "$lib/server/validation/dogs";

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function POST({ params, request, cookies }: APIContext): Promise<Response> {
  const publicId = params.publicId!;
  const back = `/organization/dogs/${publicId}`;

  try {
    const db = createDb(env.DB);
    const session = await requireOrganizationSession(cookies, db);

    const form = await request.formData();
    const values = lastValues(form);
    const parsed = dogSchema.safeParse(values);
    const publish = dogPublishSchema.safeParse(values);
    if (!parsed.success || !publish.success) return redirect(`${back}?status=failed`);

    await updateDog(db, session, publicId, { ...parsed.data, isPublished: publish.data.isPublished });

    const photo = form.get("photo");
    if (photo instanceof File && photo.size > 0) await attachDogPhoto(db, env.BUCKET, session, publicId, photo);

    return redirect(`${back}?status=saved`);
  } catch (error) {
    if (error instanceof NotFoundError) return redirect("/organization/dogs?status=failed");
    if (error instanceof AppError) return redirect(`${back}?status=failed`);
    return toErrorResponse(error);
  }
}
