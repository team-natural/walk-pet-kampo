import { defineConfig } from "@playwright/test";

const baseURL = `http://localhost:${process.env.APP_PORT_DEV_PUBLIC ?? "5173"}`;

export default defineConfig({
  testDir: "tests/e2e",
  // A setup project is Playwright's recommendation, but it only pays off once the setup needs
  // a browser — this one shells out to wrangler.
  globalSetup: "./tests/e2e/global-setup.ts",
  // A stray test.only would otherwise let CI pass on a subset.
  forbidOnly: !!process.env.CI,
  // One worker for the same reason as apps/admin: the second spec file is what turns the shared
  // dev server and local D1 into a race, so this has to be set before that file exists.
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  use: { baseURL, trace: "on-first-retry" },
  webServer: {
    command: "pnpm dev",
    // Astro 7 detaches `astro dev` for AI coding agents; Playwright then reports
    // "webServer exited early".
    env: { ASTRO_DEV_BACKGROUND: "0" },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
