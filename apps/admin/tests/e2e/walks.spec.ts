import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN, E2E_APPLICANT, E2E_WALK_SLOT } from "./global-setup";

async function signIn(page: Page) {
  await page.goto("/");
  const submit = page.getByRole("button", { name: "ログイン" });
  await expect(submit).toBeEnabled({ timeout: 60_000 });
  await page.getByLabel("メールアドレス").fill(E2E_ADMIN.email);
  await page.getByLabel("パスワード").fill(E2E_ADMIN.password);
  await submit.click();
  await page.waitForURL("**/dashboard");
}

test.describe("walks across shelters (SYS-11/12)", () => {
  test("the list names the shelter, and the detail shows the booking state", async ({ page }) => {
    await signIn(page);

    await page.goto("/walks");
    const link = page.getByRole("link", { name: E2E_WALK_SLOT.title, exact: true });
    await expect(link).toBeVisible();
    await expect(page.getByRole("row").filter({ has: link })).toContainText(E2E_APPLICANT.name);

    await link.click();
    await page.waitForURL(`**/walks/${E2E_WALK_SLOT.publicId}`);

    await expect(page.getByText("2 / 4 名")).toBeVisible();
    await expect(page.getByText("赤羽岩淵駅 2 番出口")).toBeVisible();

    // Read-only until the write path lands (GOV-02 TBD-58), same as SYS-10.
    await expect(page.getByRole("button", { name: "編集" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "開催を中止する" })).toHaveCount(0);
  });
});
