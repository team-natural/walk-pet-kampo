import { expect, test, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { E2E_BOOKING_WALKER, E2E_ORGANIZATION_MEMBER } from "./global-setup";

// The whole hold, in order: a shelter opens a walk, the walker is stopped by the phone check
// (GOV-01 D-036), verifies, and only then holds a seat.
const STAMP = Date.now();
const WALK_TITLE = `E2E 予約対象のおさんぽ ${STAMP}`;
const ACCEPTANCE_END = "2027-03-01T12:00";
const START_AT = "2027-03-02T09:00";

// The SMS provider is undecided (GOV-02 TBD-61), so nothing is delivered — the code is read back
// from the row it was written to, which is also what proves it was written.
function latestPhoneCode(): string {
  const adminDir = path.join(import.meta.dirname, "../../../admin");
  const email = E2E_BOOKING_WALKER.email;
  const sql = `SELECT code FROM walker_phone_verification_tokens WHERE walker_id IN (SELECT id FROM walkers WHERE email = '${email}') AND used_at IS NULL ORDER BY id DESC LIMIT 1;`;
  const result = spawnSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--persist-to", "../../.wrangler-state", "--json", "--command", sql], { cwd: adminDir, encoding: "utf8" });
  const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("[")));
  return parsed[0].results[0].code;
}

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

test.describe("holding a seat (SCR-17, SCR-23)", () => {
  test("the phone check stands between a walker and their first booking", async ({ page, context }) => {
    await signInAsShelter(page);
    await page.goto("/organization/walks/add");
    await page.getByLabel("タイトル").fill(WALK_TITLE);
    await page.getByLabel("開催日時").fill(START_AT);
    await page.getByLabel("集合場所").fill("赤羽岩淵駅 2 番出口");
    await page.getByLabel("都道府県").fill("東京都");
    await page.getByLabel("定員").fill("2");
    await page.getByLabel("受付終了").fill(ACCEPTANCE_END);
    await page.getByRole("button", { name: "作成する" }).click();
    await page.waitForURL(/\?status=created/);

    await page.getByRole("button", { name: "募集中にする" }).click();
    await page.waitForURL(/status=saved/);

    // A walk slot's public id is what SCR-07 and SCR-17 are addressed by.
    await page.goto("/walks");
    const walkHref = await page.getByRole("link", { name: WALK_TITLE }).getAttribute("href");
    const walkPath = new URL(walkHref!, page.url()).pathname;

    await context.clearCookies();
    await signInAsWalker(page);

    await page.goto(`${walkPath}/reserve`);
    // Unverified: the form is there but cannot be submitted, and the way forward is named.
    await expect(page.getByRole("heading", { name: "予約の前に、電話番号の確認をお願いします" })).toBeVisible();
    await expect(page.getByRole("button", { name: "確認へ進む" })).toBeDisabled();

    await page.getByRole("link", { name: "電話番号を確認する" }).click();
    await page.waitForURL(/\/mypage\/verification\?next=/);

    await page.getByRole("button", { name: "確認コードを送る" }).click();
    await page.waitForURL(/status=code_sent/);
    await expect(page.getByRole("status")).toContainText("確認コードを SMS でお送りしました");

    // A wrong code is refused without saying which part was wrong.
    await page.getByLabel("確認コード").fill("000000");
    await page.getByRole("button", { name: "確認する" }).click();
    await page.waitForURL(/error=code/);

    await page.goto(`/mypage/verification?next=${encodeURIComponent(`${walkPath}/reserve`)}`);
    await page.getByRole("button", { name: "確認コードを送る" }).click();
    await page.waitForURL(/status=code_sent/);
    await page.getByLabel("確認コード").fill(latestPhoneCode());
    await page.getByRole("button", { name: "確認する" }).click();

    // Verified, and handed straight back to the walk that sent them here.
    await page.waitForURL(`**${walkPath}/reserve`);
    await expect(page.getByRole("button", { name: "確認へ進む" })).toBeEnabled();

    await page.getByLabel("緊急連絡先（氏名）").fill("山田 花子");
    await page.getByLabel("緊急連絡先（電話番号）").fill("090-0000-0000");
    await page.getByRole("button", { name: "確認へ進む" }).click();

    await page.waitForURL(/\/checkout\?reservation=[0-9A-HJKMNP-TV-Z]{26}/);

    // The seat is held from `processing` onwards, so the public page shows one fewer.
    await page.goto(walkPath);
    await expect(page.getByText("残り 1 / 2 名")).toBeVisible();
  });

  test("a second booking does not ask for the phone again", async ({ page }) => {
    await signInAsWalker(page);

    await page.goto("/walks");
    await page.getByRole("link", { name: WALK_TITLE }).click();
    await page.getByRole("link", { name: "このおさんぽを予約する" }).click();

    await expect(page.getByRole("heading", { name: "予約の前に、電話番号の確認をお願いします" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "確認へ進む" })).toBeEnabled();
  });
});
