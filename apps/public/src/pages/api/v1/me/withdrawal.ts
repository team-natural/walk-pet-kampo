// SCR-33's form target (F-02-06). Terminal and self-service: `withdrawn` has no way back
// (DEV-09 §2-4-2), so the screen carries the warnings and this only records the decision.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { toErrorResponse } from "@app/server-kit/http";
import { WALKER_SESSION_COOKIE, requireSession } from "$lib/server/auth/session";
import { withdrawWalker } from "$lib/server/services/walker-profile";

export async function POST({ cookies }: APIContext): Promise<Response> {
  try {
    const db = createDb(env.DB);
    const session = await requireSession(cookies, db);

    await withdrawWalker(db, session.walkerId);

    // The service already deleted the rows; clearing the cookie stops the browser from sending
    // a token that no longer resolves on every subsequent request.
    cookies.delete(WALKER_SESSION_COOKIE, { path: "/" });

    // The login screen, not the top page: it is the one place that already acknowledges an
    // outcome, and landing there makes clear the session is over.
    return new Response(null, { status: 303, headers: { Location: "/auth/login?status=withdrawn" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
