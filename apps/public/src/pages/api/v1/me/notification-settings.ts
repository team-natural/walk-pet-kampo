// SCR-48's form target (F-13-03). POST, not the PATCH DEV-04 §5-12 lists: this screen is plain
// server-rendered Tailwind with no island, and an HTML form can only GET or POST. Changing the
// method would mean adding JavaScript for no behavioural gain.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { toErrorResponse } from "@app/server-kit/http";
import { optionalTypesFor } from "$lib/notification-types";
import { requireSession } from "$lib/server/auth/session";
import { updateNotificationSettings } from "$lib/server/services/notifications";

export async function POST({ request, cookies }: APIContext): Promise<Response> {
  try {
    const db = createDb(env.DB);
    const session = await requireSession(cookies, db);
    const form = await request.formData();

    // Driven by the catalogue, not by the form: an unchecked box is simply absent from the
    // submission, so a form-driven loop could never turn anything off.
    const values = optionalTypesFor("walker").map((type) => ({
      type,
      emailEnabled: form.has(`${type}.email`),
      inAppEnabled: form.has(`${type}.inApp`),
    }));

    await updateNotificationSettings(db, { type: "walker", id: session.walkerId }, values);

    return new Response(null, { status: 303, headers: { Location: "/mypage/notification-settings?status=saved" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
