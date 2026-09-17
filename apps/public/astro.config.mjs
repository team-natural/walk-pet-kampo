import cloudflare from "@astrojs/cloudflare";
import sitemap from "@astrojs/sitemap";
import svelte from "@astrojs/svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { isPrivateRoute } from "./src/lib/private-routes";

export default defineConfig({
  output: "server",
  // Placeholder until the brand domain is registered (GOV-02 TBD-35・TBD-37). It must not be
  // empty: canonical and OGP would fall back to relative URLs, and a shared link would then
  // resolve to nothing.
  //
  // SITE_URL must come from the build environment (Workers Builds). Astro evaluates this file
  // before it loads anything else, so `.env` and `.dev.vars` are NOT read here — putting the
  // value in either leaves the placeholder in production with no error. No `PUBLIC_` prefix
  // either: that prefix means "exposed to client code" in Astro, and this is read at build time
  // only. `public/robots.txt` carries the same domain and has to be changed with it.
  site: process.env.SITE_URL ?? "https://replace-with-domain.example",
  adapter: cloudflare({
    // Shared with apps/admin, as in production.
    persistState: { path: "../../.wrangler-state" },
    // Distinct per app, or both apps fight over 9229. Explicit ports don't auto-fall back.
    inspectorPort: Number(process.env.APP_INSPECTOR_PORT_PUBLIC ?? 9229),
  }),
  integrations: [
    svelte(),
    sitemap({
      // Only static routes reach this filter: under output: "server" the detail pages
      // (/dogs/[slug] etc.) are not known at build time and never enter the sitemap at all.
      // Listing them needs a D1-backed sitemap endpoint — GOV-02 TBD-59.
      filter: (page) => !isPrivateRoute(new URL(page).pathname),
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
