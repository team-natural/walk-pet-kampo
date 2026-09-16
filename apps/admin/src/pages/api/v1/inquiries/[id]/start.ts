// One route per action rather than a PATCH on `status`: the legal moves are then visible in the
// URL space.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { jsonItem, toErrorResponse } from "@app/server-kit/http";
import { requireSession } from "$lib/server/auth/session";
import { transitionInquiry } from "$lib/server/services/inquiries";

export async function POST({ params, cookies }: APIContext): Promise<Response> {
  try {
    const db = createDb(env.DB);
    const session = await requireSession(cookies, db);

    return jsonItem(await transitionInquiry(db, params.id!, "in_progress", session));
  } catch (error) {
    return toErrorResponse(error);
  }
}
