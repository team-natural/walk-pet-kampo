import { existsSync } from "node:fs";
import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Bindings are declared inline rather than through `wrangler.configPath`: wrangler.jsonc's
// `main` is the Astro adapter entrypoint, which these tests never build. Keep them in sync.
const migrationsPath = path.join(import.meta.dirname, "../../packages/schema/migrations");

export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: "2026-08-01",
        compatibilityFlags: ["nodejs_compat"],
        d1Databases: ["DB"],
        kvNamespaces: ["KV"],
        bindings: {
          TEST_MIGRATIONS: existsSync(migrationsPath) ? await readD1Migrations(migrationsPath) : [],
          SESSION_TTL_DAYS: "30",
          AUTH_LOCKOUT_MAX_ATTEMPTS: "5",
          AUTH_LOCKOUT_MINUTES: "15",
          MAIL_FROM_ADDRESS: "noreply@example.test",
          MAIL_FROM_NAME: "テスト送信元",
          APP_NAME: "テストサービス",
          APP_URL: "https://example.test",
          // No RESEND_API_KEY on purpose: sendMail() then logs instead of calling Resend, which
          // is what DEV-10 §10 asks of tests — never hit the real API.
        },
      },
    }),
  ],
  test: {
    include: ["tests/unit/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
  },
}));
