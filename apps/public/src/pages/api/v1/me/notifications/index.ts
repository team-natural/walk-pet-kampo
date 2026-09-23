// Walker's in-app notifications (F-13-01). JSON and cursor-paginated like every other collection
// (GOV-01 D-032) — SCR-32 renders its first page server-side and this serves anything after it.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { decodeCursor, encodeCursor, jsonCursorCollection, toErrorResponse } from "@app/server-kit/http";
import { requireSession } from "$lib/server/auth/session";
import { listNotifications } from "$lib/server/services/notifications";

export async function GET({ request, cookies }: APIContext): Promise<Response> {
  try {
    const db = createDb(env.DB);
    const session = await requireSession(cookies, db);

    const params = new URL(request.url).searchParams;
    const perPageParam = params.get("per_page");
    const { items, perPage, nextId } = await listNotifications(db, { type: "walker", id: session.walkerId }, { beforeId: decodeCursor(params.get("cursor")), perPage: perPageParam ? Number(perPageParam) : undefined });

    return jsonCursorCollection(items, { perPage, nextCursor: nextId ? encodeCursor(nextId) : null });
  } catch (error) {
    return toErrorResponse(error);
  }
}
