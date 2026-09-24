// SCR-22's form target (F-02-02, F-02-03). POST because the screen is a plain form
// (DEV-04 §5-16).
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { toErrorResponse } from "@app/server-kit/http";
import { requireSession } from "$lib/server/auth/session";
import { updateWalkerProfile } from "$lib/server/services/walker-profile";
import { profileSchema } from "$lib/server/validation/walker-profile";

export async function POST({ request, cookies }: APIContext): Promise<Response> {
  try {
    const db = createDb(env.DB);
    const session = await requireSession(cookies, db);
    const form = await request.formData();

    const parsed = profileSchema.safeParse({
      nameKana: form.get("nameKana"),
      birthdate: form.get("birthdate"),
      postalCode: form.get("postalCode"),
      address: form.get("address"),
      phone: form.get("phone"),
      preferredArea: form.get("preferredArea"),
      emergencyContactName: form.get("emergencyContactName"),
      emergencyContactPhone: form.get("emergencyContactPhone"),
    });

    if (!parsed.success) return new Response(null, { status: 303, headers: { Location: "/mypage/profile?error=input" } });

    // walkerId from the session, never from the form: this endpoint has no notion of editing
    // someone else's profile, so there is nothing to authorize beyond being signed in.
    await updateWalkerProfile(db, session.walkerId, parsed.data);

    return new Response(null, { status: 303, headers: { Location: "/mypage/profile?status=saved" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
