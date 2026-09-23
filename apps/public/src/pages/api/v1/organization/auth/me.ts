// JSON, unlike its siblings in this directory: nothing navigates to it — it exists for a client
// that needs to know whether its session is still good (DEV-04 §5).
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { jsonItem, toErrorResponse } from "@app/server-kit/http";
import { requireOrganizationSession } from "$lib/server/auth/organization-session";

export async function GET({ cookies }: APIContext): Promise<Response> {
  try {
    const session = await requireOrganizationSession(cookies, createDb(env.DB));
    return jsonItem({ name: session.name, role: session.role, organization: { id: session.organizationPublicId, name: session.organizationName } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
