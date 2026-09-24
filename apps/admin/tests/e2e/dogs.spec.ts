import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN, E2E_APPLICANT, E2E_DOG } from "./global-setup";

async function signIn(page: Page) {
  await page.goto("/");
  const submit = page.getByRole("button", { name: "ログイン" });
  await expect(submit).toBeEnabled({ timeout: 60_000 });
  await page.getByLabel("メールアドレス").fill(E2E_ADMIN.email);
  await page.getByLabel("パスワード").fill(E2E_ADMIN.password);
  await submit.click();
  await page.waitForURL("**/dashboard");
}

test.describe("dogs across shelters (SYS-09/10)", () => {
  test("the list names the shelter, and the detail carries the staff-only note", async ({ page }) => {
    await signIn(page);

    await page.goto("/dogs");
    // Exact: apps/public's suite writes its own dogs into the same local D1, and a substring
    // match would pick up whichever of them a previous run left behind.
    const link = page.getByRole("link", { name: E2E_DOG.name, exact: true });
    await expect(link).toBeVisible();
    await expect(page.getByRole("row").filter({ has: link })).toContainText(E2E_APPLICANT.name);

    await link.click();
    await page.waitForURL(`**/dogs/${E2E_DOG.publicId}`);

    // The one column the shelter console keeps from participants and the operator console shows.
    await expect(page.getByText("投薬中（E2E）。")).toBeVisible();

    // Read-only until the write path lands (GOV-02 TBD-58): no button may post to a route that
    // does not exist.
    await expect(page.getByRole("button", { name: "編集" })).toHaveCount(0);
  });
});
