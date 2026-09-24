// Favourites (F-02-04). One endpoint for both directions because the callers are forms: the
// dog and shelter pages (P7/P8) post `action=add`, SCR-29 posts `action=remove`. DEV-04 §5-12
// lists POST/DELETE, and DELETE is not something an HTML form can send (§5-16).
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { ValidationError, toErrorResponse } from "@app/server-kit/http";
import { requireSession } from "$lib/server/auth/session";
import { addFavorite, removeFavorite } from "$lib/server/services/walker-profile";
import { favoriteSchema } from "$lib/server/validation/walker-profile";

export async function POST({ request, cookies }: APIContext): Promise<Response> {
  try {
    const db = createDb(env.DB);
    const session = await requireSession(cookies, db);
    const form = await request.formData();

    const parsed = favoriteSchema.safeParse({ type: form.get("type"), id: form.get("id") });
    if (!parsed.success) throw new ValidationError({ id: ["対象が不正です。"] });

    // Scoped to this walker inside the service — the id in the form names what to favourite,
    // never whose favourite it is.
    if (form.get("action") === "remove") await removeFavorite(db, session.walkerId, parsed.data.type, parsed.data.id);
    else await addFavorite(db, session.walkerId, parsed.data.type, parsed.data.id);

    const back = String(form.get("back") ?? "/mypage/favorites");
    // Only same-origin paths: `back` comes from the form, and an absolute URL here would make
    // this endpoint an open redirect.
    const location = back.startsWith("/") && !back.startsWith("//") ? back : "/mypage/favorites";

    return new Response(null, { status: 303, headers: { Location: location } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
