// ADM-00's form target. A plain form POST, not fetch: the organization console is server-rendered
// Tailwind with no island on this screen, so the outcome arrives as a navigation (DEV-06 §5).
// `organization_session` cookie only — a Walker or AdminUser token must never authenticate here.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { assertNotLockedOut, clearAuthFailures, recordAuthFailure } from "@app/server-kit/auth";
import { RateLimitError, UnauthenticatedError } from "@app/server-kit/http";
import { createDb } from "@app/schema/client";
import { ORGANIZATION_SESSION_COOKIE } from "$lib/server/auth/organization-session";
import { login } from "$lib/server/services/organization-auth";
import { organizationLoginSchema } from "$lib/server/validation/organization-auth";

const LOGIN_PAGE = "/organization/login";

function redirect(location: string): Response {
  // 303: the browser must follow a POST with a GET, or the back button replays the submission.
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function POST({ request, cookies, clientAddress }: APIContext): Promise<Response> {
  const form = await request.formData();
  const parsed = organizationLoginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return redirect(`${LOGIN_PAGE}?error=credentials`);

  const { email, password } = parsed.data;
  const ip = request.headers.get("cf-connecting-ip") ?? clientAddress;

  try {
    const db = createDb(env.DB);
    // "organization", not a shared counter: Walker logs in against the same KV namespace from
    // this app, and one address can exist in both systems (GOV-01 D-021).
    await assertNotLockedOut(env.KV, "organization", ip, email);

    const { session } = await login(db, email, password, Number(env.SESSION_TTL_DAYS));
    await clearAuthFailures(env.KV, "organization", ip, email);

    cookies.set(ORGANIZATION_SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      expires: new Date(session.expiresAt),
    });

    return redirect("/organization");
  } catch (error) {
    if (error instanceof RateLimitError) return redirect(`${LOGIN_PAGE}?error=locked`);
    if (error instanceof UnauthenticatedError) {
      await recordAuthFailure(env.KV, "organization", ip, email, {
        maxAttempts: Number(env.AUTH_LOCKOUT_MAX_ATTEMPTS),
        lockoutMinutes: Number(env.AUTH_LOCKOUT_MINUTES),
      });
      return redirect(`${LOGIN_PAGE}?error=credentials`);
    }
    throw error;
  }
}
