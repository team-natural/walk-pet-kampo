// Marking one notification read. POST rather than the PATCH DEV-04 §5-12 lists: SCR-32 submits a
// plain form and HTML forms cannot send PATCH (see the same note on notification-settings).
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { NotFoundError, toErrorResponse } from "@app/server-kit/http";
import { requireSession } from "$lib/server/auth/session";
import { markNotificationRead } from "$lib/server/services/notifications";

export async function POST({ params, cookies, request }: APIContext): Promise<Response> {
  try {
    const db = createDb(env.DB);
    const session = await requireSession(cookies, db);

    // Scoped to this Walker inside the service — a ULID from someone else's list must not be
    // markable, and must not answer differently from one that does not exist.
    const marked = await markNotificationRead(db, { type: "walker", id: session.walkerId }, params.id!);
    if (!marked) throw new NotFoundError("お知らせが見つかりません。");

    const back = new URL(request.url).searchParams.get("back") ?? "/mypage/notifications";
    return new Response(null, { status: 303, headers: { Location: back } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
