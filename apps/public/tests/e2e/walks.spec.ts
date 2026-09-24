import { expect, test, type Page } from "@playwright/test";
import { E2E_ORGANIZATION_MEMBER } from "./global-setup";

// One flow in order: a draft is invisible to visitors, publishing puts it on SCR-06, and
// cancelling takes it off again.
const STAMP = Date.now();
const DOG_NAME = `E2E 同行犬 ${STAMP}`;
const WALK_TITLE = `E2E 朝のおさんぽ ${STAMP}`;
const AREA_CITY = `E2E市${STAMP}`;

// JST, and far enough out that the walk is still in the future when the suite runs again.
const ACCEPTANCE_END = "2027-03-01T12:00";
const START_AT = "2027-03-02T09:00";

async function signIn(page: Page) {
  await page.goto("/organization/login");
  await page.getByLabel("メールアドレス").fill(E2E_ORGANIZATION_MEMBER.email);
  await page.getByLabel("パスワード").fill(E2E_ORGANIZATION_MEMBER.password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.waitForURL("**/organization");
}

test.describe("walk slots (ADM-08/09/10, SCR-06/07)", () => {
  test("a shelter drafts a walk, publishes it, and the public site shows it", async ({ page }) => {
    await signIn(page);

    await page.goto("/organization/dogs/add");
    await page.getByLabel("名前").fill(DOG_NAME);
    await page.getByRole("button", { name: "登録する" }).click();
    await page.waitForURL(/\?status=created/);

    await page.goto("/organization/walks/add");
    await page.getByLabel("タイトル").fill(WALK_TITLE);
    await page.getByLabel("開催日時").fill(START_AT);
    await page.getByLabel("集合場所").fill("赤羽岩淵駅 2 番出口");
    await page.getByLabel("都道府県").fill("東京都");
    await page.getByLabel("市区町村").fill(AREA_CITY);
    await page.getByLabel("受付終了").fill(ACCEPTANCE_END);
    await page.getByRole("checkbox", { name: DOG_NAME }).check();
    await page.getByRole("button", { name: "作成する" }).click();

    await page.waitForURL(/\/organization\/walks\/[0-9A-HJKMNP-TV-Z]{26}\?status=created/);
    const walkUrl = new URL(page.url()).pathname;

    // A draft offers only the moves DEV-09 §2-6-2 has from `draft`.
    await expect(page.getByRole("button", { name: "募集中にする" })).toBeVisible();
    await expect(page.getByRole("button", { name: "中止する" })).toHaveCount(0);

    await page.goto("/walks");
    await expect(page.getByRole("link", { name: WALK_TITLE })).toHaveCount(0);

    await page.goto(walkUrl);
    await page.getByRole("button", { name: "募集中にする" }).click();
    await page.waitForURL(/status=saved/);

    await page.goto(`/walks?area=${encodeURIComponent(AREA_CITY)}`);
    await page.getByRole("link", { name: WALK_TITLE }).click();
    await expect(page.getByRole("heading", { name: WALK_TITLE })).toBeVisible();
    await expect(page.getByText("赤羽岩淵駅 2 番出口")).toBeVisible();
    await expect(page.getByRole("link", { name: DOG_NAME })).toBeVisible();
  });

  test("the capacity cannot go below the seats already booked, and the walk can be called off", async ({ page }) => {
    await signIn(page);

    await page.goto("/organization/walks");
    await page.getByRole("link", { name: WALK_TITLE }).click();
    await page.waitForURL(/\/organization\/walks\/[0-9A-HJKMNP-TV-Z]{26}/);

    // No reservations exist yet (they arrive in P11), so the floor is the browser's min=1.
    const capacity = page.getByLabel("定員");
    await expect(capacity).toHaveAttribute("min", "1");

    const trigger = page.getByRole("button", { name: "中止する", exact: true }).first();
    const dialog = page.getByRole("dialog");
    await expect(async () => {
      await trigger.click();
      await expect(dialog).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 60_000 });

    await page.getByLabel("中止の理由").selectOption("weather");
    await dialog.getByRole("button", { name: "中止する", exact: true }).click();
    await page.waitForURL(/status=cancelled/);

    await expect(page.getByText("開催中止")).toBeVisible();
    // Cancelled is terminal, so nothing is on offer any more — and it leaves the public list.
    await expect(page.getByRole("button", { name: "中止する" })).toHaveCount(0);

    await page.goto("/walks");
    await expect(page.getByRole("link", { name: WALK_TITLE })).toHaveCount(0);
  });
});
