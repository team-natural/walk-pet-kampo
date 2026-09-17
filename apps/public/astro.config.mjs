import cloudflare from "@astrojs/cloudflare";
import sitemap from "@astrojs/sitemap";
import svelte from "@astrojs/svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// Member-only, transactional, auth, error and token-bearing routes (DEV-06 §11-1). Everything
// under /organization/ is the shelter console, which is not a search target either.
// `draft` news entries are deliberately absent: getStaticPaths() never generates them, so there
// is nothing for the sitemap to exclude — this list is only for SSR routes that do get served.
const SITEMAP_EXCLUDED = ["/404", "/500", "/auth/", "/mypage/", "/checkout/", "/register", "/verify/", "/organization/"];

export default defineConfig({
  output: "server",
  // Placeholder until the brand domain is registered (GOV-02 TBD-35・TBD-37). It must not be
  // empty: canonical and OGP would fall back to relative URLs, and a shared link would then
  // resolve to no image at all.
  site: process.env.PUBLIC_SITE_URL ?? "https://replace-with-domain.example",
  adapter: cloudflare({
    // Shared with apps/admin, as in production.
    persistState: { path: "../../.wrangler-state" },
    // Distinct per app, or both apps fight over 9229. Explicit ports don't auto-fall back.
    inspectorPort: Number(process.env.APP_INSPECTOR_PORT_PUBLIC ?? 9229),
  }),
  integrations: [
    svelte(),
    sitemap({
      filter: (page) => {
        const { pathname } = new URL(page);
        // SCR-49/50 sit under a public dog URL but require a session, so they are matched by
        // shape rather than prefix.
        if (pathname.includes("/adoption-inquiry")) return false;
        return !SITEMAP_EXCLUDED.some((route) => pathname.startsWith(route));
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      exclude: ["@astrojs/svelte/server.js"],
    },
  },
  server: {
    host: true,
    port: Number(process.env.APP_PORT_DEV_PUBLIC ?? 5173),
  },
});
