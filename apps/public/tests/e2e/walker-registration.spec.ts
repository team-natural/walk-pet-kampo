import { expect, test } from "@playwright/test";
import { E2E_WALKER } from "./global-setup";

// A fresh address per run, so a re-run does not hit its own leftovers. globalSetup deletes
// anything matching this prefix.
const newEmail = () => `e2e-signup-${Date.now()}@example.test`;

async function register(page: import("@playwright/test").Page, email: string) {
  await page.goto("/register");
  await page.getByLabel("お名前").fill("E2E 参加者");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill("e2e-only-password");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "登録する" }).click();
}

test.describe("walker registration (SCR-08)", () => {
  test("a new address reaches the confirmation screen", async ({ page }) => {
    await register(page, newEmail());

    await page.waitForURL("**/register/complete");
    await expect(page.getByRole("heading", { name: "登録を受け付けました" })).toBeVisible();
  });

  test("an address that already has an account gets the same answer", async ({ page }) => {
    // The form must not be a way to test which addresses are registered — the owner is told by
    // mail instead (DEV-02 §1-2).
    await register(page, E2E_WALKER.email);

    await page.waitForURL("**/register/complete");
    await expect(page.getByRole("heading", { name: "登録を受け付けました" })).toBeVisible();
  });

  test("refuses to submit without agreeing to the terms", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("お名前").fill("E2E 参加者");
    await page.getByLabel("メールアドレス").fill(newEmail());
    await page.getByLabel("パスワード").fill("e2e-only-password");
    await page.getByRole("button", { name: "登録する" }).click();

    // The browser blocks it; the endpoint refuses it too (covered in the unit tests).
    expect(new URL(page.url()).pathname).toBe("/register");
  });
});

test.describe("email verification (SCR-10)", () => {
  test("a dead link explains itself instead of erroring", async ({ page }) => {
    await page.goto("/verify/email/not-a-real-token");

    await expect(page.getByRole("heading", { name: "リンクの有効期限が切れています" })).toBeVisible();
  });
});

test.describe("password reset (SCR-13)", () => {
  test("answers the same for a registered and an unknown address", async ({ page }) => {
    const confirmation = /再設定用のリンクをお送りしました/;

    await page.goto("/auth/forgot-password");
    await page.getByLabel("メールアドレス").fill(E2E_WALKER.email);
    await page.getByRole("button", { name: "再設定メールを送る" }).click();
    await expect(page.getByRole("status")).toHaveText(confirmation);

    await page.goto("/auth/forgot-password");
    await page.getByLabel("メールアドレス").fill("nobody@example.test");
    await page.getByRole("button", { name: "再設定メールを送る" }).click();
    await expect(page.getByRole("status")).toHaveText(confirmation);
  });
});
