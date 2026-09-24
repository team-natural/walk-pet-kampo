import { expect, test, type Page } from "@playwright/test";
import { E2E_WALKER } from "./global-setup";

async function signIn(page: Page) {
  await page.goto("/auth/login");
  const submit = page.getByRole("button", { name: "ログイン", exact: true });
  await expect(submit).toBeEnabled({ timeout: 60_000 });
  await page.getByLabel("メールアドレス").fill(E2E_WALKER.email);
  await page.getByLabel("パスワード").fill(E2E_WALKER.password);
  await submit.click();
  await page.waitForURL("**/mypage");
}

test.describe("walker profile (SCR-22)", () => {
  test("saves and reads back, and the saved values survive a reload", async ({ page }) => {
    await signIn(page);
    await page.goto("/mypage/profile");

    // Scoped to the fieldset: the same phone-number label appears twice, once for the walker and
    // once for the emergency contact, which is the point of the section split.
    const basics = page.getByRole("group", { name: "基本情報" });
    const emergency = page.getByRole("group", { name: "緊急連絡先" });

    await basics.getByLabel("電話番号").fill("090-5555-6666");
    await emergency.getByLabel("氏名").fill("緊急 連絡先");
    await emergency.getByLabel("電話番号").fill("090-7777-8888");
    await page.getByRole("button", { name: "保存する" }).click();

    await page.waitForURL(/status=saved/);
    await expect(page.getByRole("status")).toContainText("保存しました");

    await page.goto("/mypage/profile");
    await expect(basics.getByLabel("電話番号")).toHaveValue("090-5555-6666");
    await expect(emergency.getByLabel("電話番号")).toHaveValue("090-7777-8888");
  });

  test("names the fields still missing before booking is possible", async ({ page }) => {
    // The seeded walker has no profile details, so this is the state a new account lands in.
    await signIn(page);
    await page.goto("/mypage/profile");

    await expect(page.getByText(/項目の入力が必要です/)).toBeVisible();
  });
});

test.describe("verification status (SCR-23)", () => {
  test("reports each check separately, and says when the phone one happens", async ({ page }) => {
    // `active` is not "contact details verified" (GOV-01 D-036), and the screen has to say so
    // or an unverified number reads as an oversight.
    await signIn(page);
    await page.goto("/mypage/verification");

    await expect(page.getByRole("term").filter({ hasText: "メールアドレスの確認" })).toBeVisible();
    await expect(page.getByText(/初回の予約時に確認します/)).toBeVisible();
  });
});

test.describe("favourites (SCR-29)", () => {
  test("shows the empty state before anything is favourited", async ({ page }) => {
    await signIn(page);
    await page.goto("/mypage/favorites");

    await expect(page.getByText(/まだお気に入りはありません/)).toBeVisible();
  });
});
