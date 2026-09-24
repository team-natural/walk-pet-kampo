import { expect, test, type Page } from "@playwright/test";
import { E2E_BOOKING_WALKER, E2E_ORGANIZATION_MEMBER } from "./global-setup";

// FG-11 end to end: the shelter publishes a dog, a walker asks about adopting it, and the shelter
// moves the conversation along. The transfer itself happens off the platform (GOV-02 TBD-32).
const STAMP = Date.now();
const DOG_NAME = `E2E 里親候補 ${STAMP}`;
const MOTIVATION = `おさんぽで会って以来、家族に迎えたいと考えています。${STAMP}`;

async function signInAsShelter(page: Page) {
  await page.goto("/organization/login");
  await page.getByLabel("メールアドレス").fill(E2E_ORGANIZATION_MEMBER.email);
  await page.getByLabel("パスワード").fill(E2E_ORGANIZATION_MEMBER.password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.waitForURL("**/organization");
}

async function signInAsWalker(page: Page) {
  await page.goto("/auth/login");
  await page.getByLabel("メールアドレス").fill(E2E_BOOKING_WALKER.email);
  await page.getByLabel("パスワード").fill(E2E_BOOKING_WALKER.password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.waitForURL("**/mypage");
}

test.describe("adoption enquiries (SCR-49/50, SCR-30/31, ADM-20/21)", () => {
  test("a walker asks about a dog and the shelter takes the conversation on", async ({ page, context }) => {
    await signInAsShelter(page);
    await page.goto("/organization/dogs/add");
    await page.getByLabel("名前").fill(DOG_NAME);
    await page.getByRole("button", { name: "登録する" }).click();
    await page.waitForURL(/\?status=created/);

    // Published and listed, which is what makes it open to enquiries.
    await page.getByRole("button", { name: "里親募集中にする" }).click();
    await page.waitForURL(/status=saved/);
    await page.getByLabel("公開する").check();
    await page.getByRole("button", { name: "保存する" }).click();
    await page.waitForURL(/status=saved/);

    await context.clearCookies();
    await signInAsWalker(page);

    await page.goto("/dogs");
    await page.getByRole("link", { name: DOG_NAME }).click();
    await page.getByRole("link", { name: "里親について相談する" }).click();

    await page.getByLabel("希望理由").fill(MOTIVATION);
    await page.getByLabel("飼育環境").fill("戸建て・庭あり・在宅勤務");
    await page.getByRole("button", { name: "送信する" }).click();

    await page.waitForURL(/\/adoption-inquiry\/complete/);
    await expect(page.getByText("相談を送信しました")).toBeVisible();

    // The walker's own history shows it, still at the first state.
    await page.goto("/mypage/adoption-inquiries");
    await page.getByRole("link", { name: DOG_NAME }).click();
    await expect(page.getByText("受付")).toBeVisible();
    await expect(page.getByText(MOTIVATION)).toBeVisible();

    // The shelter sees the contact details — and not the walker's address (GOV-02 TBD-34).
    await context.clearCookies();
    await signInAsShelter(page);
    await page.goto("/organization/adoption-inquiries");
    await page.getByRole("link", { name: DOG_NAME }).click();

    await expect(page.getByText(E2E_BOOKING_WALKER.email)).toBeVisible();
    await expect(page.getByText(MOTIVATION)).toBeVisible();
    await expect(page.getByText("赤羽1-1-1")).toHaveCount(0);

    // Only the next step is on offer (DEV-09 §2-11-2).
    await expect(page.getByRole("button", { name: "連絡済みにする" })).toHaveCount(0);
    await page.getByRole("button", { name: "団体確認中にする" }).click();
    await page.waitForURL(/status=saved/);
    await expect(page.getByRole("button", { name: "連絡済みにする" })).toBeVisible();

    // Reviewing the enquiry takes the dog off the open list (DEV-09 §2-11-3).
    await page.goto("/organization/dogs");
    const row = page.getByRole("row").filter({ hasText: DOG_NAME });
    await expect(row).toContainText("相談中");
  });

  test("the walker can take the enquiry back", async ({ page }) => {
    await signInAsWalker(page);

    await page.goto("/mypage/adoption-inquiries");
    await page.getByRole("link", { name: DOG_NAME }).click();

    await page.getByRole("button", { name: "この相談を取り下げる" }).click();
    await page.waitForURL(/status=withdrawn/);

    await expect(page.getByText("取下げ")).toBeVisible();
    await expect(page.getByRole("button", { name: "この相談を取り下げる" })).toHaveCount(0);
  });
});
