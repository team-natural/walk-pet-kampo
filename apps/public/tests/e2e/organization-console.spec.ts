import { expect, test, type Page } from "@playwright/test";
import { E2E_ORGANIZATION_MEMBER } from "./global-setup";

// FG-04's org_admin screens. One file, so the seeded shelter is edited in a known order —
// Playwright parallelises across files, and these all write to the same shelter row.
async function signIn(page: Page) {
  await page.goto("/organization/login");
  await page.getByLabel("メールアドレス").fill(E2E_ORGANIZATION_MEMBER.email);
  await page.getByLabel("パスワード").fill(E2E_ORGANIZATION_MEMBER.password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.waitForURL("**/organization");
}

test.describe("organization profile (ADM-02)", () => {
  test("an edit survives the round trip", async ({ page }) => {
    await signIn(page);
    await page.goto("/organization/profile");

    const area = page.getByLabel("活動エリア");
    await area.fill("東京都北区・板橋区");
    await page.getByRole("button", { name: "保存する" }).click();
    await page.waitForURL(/status=saved/);

    await page.goto("/organization/profile");
    await expect(page.getByLabel("活動エリア")).toHaveValue("東京都北区・板橋区");
  });
});

test.describe("staff (ADM-03, ADM-04)", () => {
  const invitee = `e2e-invite-${Date.now()}@example.test`;

  test("inviting shows the invitation, and the same address cannot be invited twice", async ({ page }) => {
    await signIn(page);
    await page.goto("/organization/members/add");

    await page.getByLabel("メールアドレス").fill(invitee);
    await page.getByLabel("権限").selectOption("org_staff");
    await page.getByRole("button", { name: "招待メールを送る" }).click();

    await page.waitForURL(/\/organization\/members\?status=invited/);
    await expect(page.getByRole("status")).toContainText("招待メールを送りました");
    await expect(page.getByRole("cell", { name: invitee })).toBeVisible();

    // A second invitation to the same address supersedes the first rather than adding a row.
    await page.goto("/organization/members/add");
    await page.getByLabel("メールアドレス").fill(invitee);
    await page.getByRole("button", { name: "招待メールを送る" }).click();
    await page.waitForURL(/\/organization\/members\?status=invited/);
    await expect(page.getByRole("cell", { name: invitee })).toHaveCount(1);

    // The seeded member's own address is already taken, and that is a different answer.
    await page.goto("/organization/members/add");
    await page.getByLabel("メールアドレス").fill(E2E_ORGANIZATION_MEMBER.email);
    await page.getByRole("button", { name: "招待メールを送る" }).click();
    await page.waitForURL(/error=taken/);
    await expect(page.getByRole("alert")).toContainText("すでに登録されています");
  });

  test("the last administrator cannot demote themselves", async ({ page }) => {
    await signIn(page);
    await page.goto("/organization/members");

    const row = page.getByRole("row").filter({ hasText: E2E_ORGANIZATION_MEMBER.email });
    await row.getByRole("combobox").selectOption("org_staff");
    await row.getByRole("button", { name: "変更" }).click();

    await page.waitForURL(/error=last_admin/);
    await expect(page.getByRole("alert")).toContainText("団体管理者が不在になるため");
    // Still an administrator, which is what the screen must show after refusing.
    await expect(page.getByRole("row").filter({ hasText: E2E_ORGANIZATION_MEMBER.email }).getByRole("combobox")).toHaveValue("org_admin");
  });
});

test.describe("withdrawal (ADM-23)", () => {
  // The confirmation only, never the submit: withdrawing the seeded shelter would take every
  // other spec in this run down with it. The transition itself is covered in Vitest.
  test("asks before it does anything", async ({ page }) => {
    await signIn(page);
    await page.goto("/organization/withdrawal");

    const trigger = page.getByRole("button", { name: "掲載終了を申請する" });
    await expect(trigger).toBeEnabled({ timeout: 60_000 });
    await trigger.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "申請する" })).toBeVisible();

    await dialog.getByRole("button", { name: "やめる" }).click();
    await expect(dialog).toBeHidden();
  });
});
