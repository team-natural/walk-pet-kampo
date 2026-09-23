// Deletes the row, not just the cookie: a session token that survives in D1 is still a valid
// credential for anyone who copied it.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { ORGANIZATION_SESSION_COOKIE } from "$lib/server/auth/organization-session";
import { logout } from "$lib/server/services/organization-auth";

export async function POST({ cookies }: APIContext): Promise<Response> {
  const token = cookies.get(ORGANIZATION_SESSION_COOKIE)?.value;
  if (token) await logout(createDb(env.DB), token);

  cookies.delete(ORGANIZATION_SESSION_COOKIE, { path: "/" });
  return new Response(null, { status: 303, headers: { Location: "/organization/login" } });
}
