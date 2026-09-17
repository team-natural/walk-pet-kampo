import { defineMiddleware } from "astro:middleware";

// Security headers, plus one assertion that the Cloudflare Access gate in front of this Worker
// actually ran. Application auth is still not checked here — each route validates its own
// AdminUser session, since there's no framework middleware stack to hang authorization off.
// CSP belongs in astro.config.mjs, not here.
export const onRequest = defineMiddleware(async (context, next) => {
  // Access protects this Worker by name and sets `ctx.access` on every request it lets through
  // (GOV-01 D-031, DEV-02 §1-1). Its absence means the Access application was detached or never
  // attached — at which point a console that can issue refunds and trigger payouts would be
  // password-only on the open internet. Fail closed rather than serve.
  //
  // Locally there is no Access in front of `astro dev`, so the check is limited to built output.
  // `wrangler.jsonc`'s `access.dev` block exists to exercise the authenticated path by hand.
  if (!import.meta.env.DEV && !context.locals.cfContext?.access) {
    return new Response("Forbidden", { status: 403 });
  }

  const response = await next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
});
