import { expect, test, type Page } from "@playwright/test";
import { E2E_ORGANIZATION_MEMBER } from "./global-setup";

// ADM-00 submits a plain form, so there is no hydration to wait for here — the equivalent check
// lives in walker-auth.spec.ts, where the login screen is an island.
async function login(page: Page, email: string, password: string) {
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
}

test.describe("organization login", () => {
  test("correct credentials reach the console with an HttpOnly session cookie", async ({ page, context }) => {
    await page.goto("/organization/login");
    await login(page, E2E_ORGANIZATION_MEMBER.email, E2E_ORGANIZATION_MEMBER.password);

    await page.waitForURL("**/organization");
    await expect(page.getByText(E2E_ORGANIZATION_MEMBER.organization)).toBeVisible();

    const cookie = (await context.cookies()).find((c) => c.name === "organization_session");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
  });

  test("wrong credentials stay on the login screen and reveal nothing", async ({ page }) => {
    await page.goto("/organization/login");
    await login(page, E2E_ORGANIZATION_MEMBER.email, "not-the-password");

    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).not.toContainText(E2E_ORGANIZATION_MEMBER.email);
    expect(new URL(page.url()).pathname).toBe("/organization/login");
  });

  test("a Walker session does not open the organization console", async ({ page, context, baseURL }) => {
    // Both systems live in this Worker and share the origin, so the cookie name and the session
    // table are the whole of the separation (DEV-02 §1-4).
    await context.addCookies([{ name: "walker_session", value: "some-walker-token", url: baseURL! }]);
    await page.goto("/organization");

    expect(new URL(page.url()).pathname).toBe("/organization/login");
  });

  test("the console redirects when unauthenticated, uncacheably", async ({ page, request }) => {
    await page.goto("/organization");
    expect(new URL(page.url()).pathname).toBe("/organization/login");

    const redirect = await request.get("/organization", { maxRedirects: 0 });
    expect(redirect.status()).toBe(302);
    expect(redirect.headers()["cache-control"]).toContain("no-store");
  });

  test("logging out revokes the session, not just the cookie", async ({ page }) => {
    await page.goto("/organization/login");
    await login(page, E2E_ORGANIZATION_MEMBER.email, E2E_ORGANIZATION_MEMBER.password);
    await page.waitForURL("**/organization");

    await page.getByRole("button", { name: "ログアウト" }).click();
    await page.waitForURL("**/organization/login");

    await page.goto("/organization");
    expect(new URL(page.url()).pathname).toBe("/organization/login");
  });
});

// Scope isolation of the lockout counter (GOV-01 D-021) is pinned in
// packages/server-kit/tests/lockout.test.ts, not here: reaching the limit through the browser
// locks this IP for AUTH_LOCKOUT_MINUTES, and every later test in the run shares both the IP
// (127.0.0.1) and the KV namespace — the suite would fail itself for the next 15 minutes.

test.describe("password reset (ADM-24)", () => {
  test("answers the same for a registered and an unknown address", async ({ page }) => {
    const confirmation = /再設定用のリンクをお送りしました/;

    await page.goto("/organization/forgot-password");
    await page.getByLabel("メールアドレス").fill(E2E_ORGANIZATION_MEMBER.email);
    await page.getByRole("button", { name: "再設定メールを送る" }).click();
    await expect(page.getByRole("status")).toHaveText(confirmation);

    await page.goto("/organization/forgot-password");
    await page.getByLabel("メールアドレス").fill("nobody@example.test");
    await page.getByRole("button", { name: "再設定メールを送る" }).click();
    await expect(page.getByRole("status")).toHaveText(confirmation);
  });
});

test.describe("invitation acceptance (ADM-26)", () => {
  test("a dead link says so instead of asking for a password", async ({ page }) => {
    await page.goto("/organization/invitations/not-a-real-token");

    await expect(page.getByText(/使用済みか、有効期限が切れています/)).toBeVisible();
    await expect(page.getByRole("button", { name: "設定して開始する" })).toHaveCount(0);
  });
});
