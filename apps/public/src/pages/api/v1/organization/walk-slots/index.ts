// ADM-09's form target (F-06-01). Created as a draft — publishing is the separate transition on
// ADM-10 (F-06-02).
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { AppError, toErrorResponse } from "@app/server-kit/http";
import { requireOrganizationSession } from "$lib/server/auth/organization-session";
import { lastValues } from "$lib/server/form";
import { createWalkSlot } from "$lib/server/services/walk-slots";
import { walkSlotSchema } from "$lib/server/validation/walk-slots";

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function POST({ request, cookies }: APIContext): Promise<Response> {
  try {
    const db = createDb(env.DB);
    const session = await requireOrganizationSession(cookies, db);

    const form = await request.formData();
    const parsed = walkSlotSchema.safeParse(lastValues(form));
    if (!parsed.success) return redirect("/organization/walks/add?status=failed");

    // getAll, not lastValues: the dogs are the one field where every checked box counts.
    const dogPublicIds = form.getAll("dogIds").map(String);
    const { publicId } = await createWalkSlot(db, session, parsed.data, dogPublicIds);

    return redirect(`/organization/walks/${publicId}?status=created`);
  } catch (error) {
    if (error instanceof AppError) return redirect("/organization/walks/add?status=failed");
    return toErrorResponse(error);
  }
}
