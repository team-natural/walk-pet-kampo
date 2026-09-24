import { expect, test } from "@playwright/test";

// A fresh name per run: the Service refuses a duplicate, which is the point of one of the tests
// below. globalSetup sweeps anything matching this prefix.
const newName = () => `E2E 申請団体 ${Date.now()}`;

async function apply(page: import("@playwright/test").Page, name: string) {
  await page.goto("/organization/apply");
  await page.getByLabel("団体名").fill(name);
  await page.getByLabel("代表者名").fill("代表 太郎");
  await page.getByLabel("連絡先メールアドレス").fill("e2e-shelter@example.test");
  await page.getByRole("button", { name: "申請する" }).click();
}

test.describe("organization application (SCR-15)", () => {
  test("reaches the confirmation screen", async ({ page }) => {
    await apply(page, newName());

    await page.waitForURL("**/organization/apply/complete");
    await expect(page.getByRole("heading", { name: "申請を受け付けました" })).toBeVisible();
  });

  test("says so when the name is already applied for", async ({ page }) => {
    // Unlike an account signup, a duplicate here is worth naming: shelter names are published
    // once approved, so there is nothing to reveal.
    const name = newName();
    await apply(page, name);
    await page.waitForURL("**/organization/apply/complete");

    await apply(page, name);

    await expect(page.getByRole("alert")).toContainText("すでに申請済み");
  });

  test("does not ask for documents yet", async ({ page }) => {
    // F-03-02 waits on GOV-02 TBD-25; a file input that discards what it takes would be worse
    // than not asking.
    await page.goto("/organization/apply");

    await expect(page.locator('input[type="file"]')).toHaveCount(0);
  });
});

test.describe("resubmission (SCR-51)", () => {
  test("a dead link explains itself instead of showing an empty form", async ({ page }) => {
    await page.goto("/organization/apply/not-a-real-token");

    await expect(page.getByText(/使用済みか、有効期限が切れています/)).toBeVisible();
    await expect(page.getByRole("button", { name: "再提出する" })).toHaveCount(0);
  });
});
