import { expect, test } from "@playwright/test";
import { E2E_ACTIVATION } from "./global-setup";

// F-03-06 on ADM-26. The shelter has been approved and has nobody in it — this link is the only
// way its first org_admin comes into existence.
const PASSWORD = "e2e-activation-password";

test.describe("activating an approved shelter (ADM-26)", () => {
  test("the approval link creates the first administrator and signs them in", async ({ page }) => {
    await page.goto(`/organization/invitations/${E2E_ACTIVATION.token}`);

    // Named before a password is typed, so a link forwarded to the wrong person is visibly not
    // theirs.
    await expect(page.getByText(E2E_ACTIVATION.organization)).toBeVisible();
    await expect(page.getByText(E2E_ACTIVATION.email)).toBeVisible();
    await expect(page.getByText("団体管理者")).toBeVisible();

    await page.getByLabel("お名前").fill("代表 太郎");
    await page.getByLabel("パスワード").fill(PASSWORD);
    await page.getByRole("button", { name: "設定して開始する" }).click();

    await page.waitForURL("**/organization?status=joined");
    await expect(page.getByText(E2E_ACTIVATION.organization)).toBeVisible();

    // org_admin from the start: this account has to be able to invite the rest of the staff.
    await page.goto("/organization/members");
    await expect(page.getByRole("cell", { name: E2E_ACTIVATION.email })).toBeVisible();
  });

  test("the same link cannot be used to make a second administrator", async ({ page }) => {
    await page.goto(`/organization/invitations/${E2E_ACTIVATION.token}`);

    await expect(page.getByText("このリンクは使用済みか、有効期限が切れています。")).toBeVisible();
    await expect(page.getByRole("button", { name: "設定して開始する" })).toHaveCount(0);
  });

  test("the new administrator can sign in with the password they chose", async ({ page }) => {
    await page.goto("/organization/login");
    await page.getByLabel("メールアドレス").fill(E2E_ACTIVATION.email);
    await page.getByLabel("パスワード").fill(PASSWORD);
    await page.getByRole("button", { name: "ログイン", exact: true }).click();

    await page.waitForURL("**/organization");
    await expect(page.getByText(E2E_ACTIVATION.organization)).toBeVisible();
  });
});
