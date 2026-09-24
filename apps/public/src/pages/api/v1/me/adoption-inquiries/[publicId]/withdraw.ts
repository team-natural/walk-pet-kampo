// SCR-31's withdrawal (F-11-03). Only the person who sent the enquiry may take it back — the
// shelter's equivalent is `closed`, which says something different.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { AppError, InvalidStateTransitionError, NotFoundError, toErrorResponse } from "@app/server-kit/http";
import { requireSession } from "$lib/server/auth/session";
import { withdrawInquiry } from "$lib/server/services/adoption-inquiries";

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function POST({ params, cookies }: APIContext): Promise<Response> {
  const publicId = params.publicId!;
  const back = `/mypage/adoption-inquiries/${publicId}`;

  try {
    const db = createDb(env.DB);
    const session = await requireSession(cookies, db);

    await withdrawInquiry(db, session.walkerId, publicId);
    return redirect(`${back}?status=withdrawn`);
  } catch (error) {
    if (error instanceof InvalidStateTransitionError) return redirect(`${back}?error=state`);
    if (error instanceof NotFoundError) return redirect("/mypage/adoption-inquiries");
    if (error instanceof AppError) return redirect(`${back}?error=failed`);
    return toErrorResponse(error);
  }
}
