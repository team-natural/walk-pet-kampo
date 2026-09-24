// ADM-07's delete (F-05-04). Its own path rather than a method on the edit route: a plain HTML
// form cannot send DELETE (DEV-04 §5-16), and the edit form must not be able to remove a row by
// carrying one extra field.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { AppError, NotFoundError, ValidationError, toErrorResponse } from "@app/server-kit/http";
import { requireOrganizationSession } from "$lib/server/auth/organization-session";
import { deleteDog } from "$lib/server/services/dogs";

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function POST({ params, cookies }: APIContext): Promise<Response> {
  const publicId = params.publicId!;
  const back = `/organization/dogs/${publicId}`;

  try {
    const db = createDb(env.DB);
    const session = await requireOrganizationSession(cookies, db);

    await deleteDog(db, env.BUCKET, session, publicId);
    return redirect("/organization/dogs?status=deleted");
  } catch (error) {
    // A dog with a history cannot be deleted — the screen offers unpublishing instead.
    if (error instanceof ValidationError) return redirect(`${back}?error=referenced`);
    if (error instanceof NotFoundError) return redirect("/organization/dogs?status=failed");
    if (error instanceof AppError) return redirect(`${back}?status=failed`);
    return toErrorResponse(error);
  }
}
