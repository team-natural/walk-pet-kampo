import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { NotFoundError, jsonItem, toErrorResponse } from "@app/server-kit/http";
import { requireSession } from "$lib/server/auth/session";
import { getWalkerByPublicId, toPublicWalker } from "$lib/server/services/walkers";
import { createDb } from "@app/schema/client";

export async function GET({ cookies }: APIContext): Promise<Response> {
  try {
    const db = createDb(env.DB);
    const session = await requireSession(cookies, db);

    const walker = await getWalkerByPublicId(db, session.walkerPublicId);
    if (!walker) throw new NotFoundError();

    return jsonItem(toPublicWalker(walker));
  } catch (error) {
    return toErrorResponse(error);
  }
}
