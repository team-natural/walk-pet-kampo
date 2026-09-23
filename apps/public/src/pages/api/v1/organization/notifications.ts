// ADM-22's data source (F-13-01), cursor-paginated like every other collection (GOV-01 D-032).
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { decodeCursor, encodeCursor, jsonCursorCollection, toErrorResponse } from "@app/server-kit/http";
import { requireOrganizationSession } from "$lib/server/auth/organization-session";
import { listNotifications } from "$lib/server/services/notifications";

export async function GET({ request, cookies }: APIContext): Promise<Response> {
  try {
    const db = createDb(env.DB);
    const session = await requireOrganizationSession(cookies, db);

    const params = new URL(request.url).searchParams;
    const perPageParam = params.get("per_page");
    const { items, perPage, nextId } = await listNotifications(db, { type: "organization_member", id: session.organizationMemberId }, { beforeId: decodeCursor(params.get("cursor")), perPage: perPageParam ? Number(perPageParam) : undefined });

    return jsonCursorCollection(items, { perPage, nextCursor: nextId ? encodeCursor(nextId) : null });
  } catch (error) {
    return toErrorResponse(error);
  }
}
