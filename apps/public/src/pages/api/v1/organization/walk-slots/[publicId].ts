// ADM-10's edit form (F-06-01, F-06-04). Capacity is the field the shelter changes most often
// and the one with a floor — the Service refuses to drop it below the seats already held.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { AppError, NotFoundError, ValidationError, toErrorResponse } from "@app/server-kit/http";
import { requireOrganizationSession } from "$lib/server/auth/organization-session";
import { lastValues } from "$lib/server/form";
import { updateWalkSlot } from "$lib/server/services/walk-slots";
import { walkSlotSchema } from "$lib/server/validation/walk-slots";

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function POST({ params, request, cookies }: APIContext): Promise<Response> {
  const publicId = params.publicId!;
  const back = `/organization/walks/${publicId}`;

  try {
    const db = createDb(env.DB);
    const session = await requireOrganizationSession(cookies, db);

    const form = await request.formData();
    const parsed = walkSlotSchema.safeParse(lastValues(form));
    if (!parsed.success) return redirect(`${back}?status=failed`);

    await updateWalkSlot(db, session, publicId, parsed.data, form.getAll("dogIds").map(String));
    return redirect(`${back}?status=saved`);
  } catch (error) {
    // The capacity floor and an unselectable dog are both things the staff member must read.
    if (error instanceof ValidationError) return redirect(`${back}?error=input`);
    if (error instanceof NotFoundError) return redirect("/organization/walks?status=failed");
    if (error instanceof AppError) return redirect(`${back}?status=failed`);
    return toErrorResponse(error);
  }
}
