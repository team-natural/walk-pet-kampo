import { expect, test, type Page } from "@playwright/test";
import { E2E_ORGANIZATION_MEMBER } from "./global-setup";

// FG-07. The seeded shelter is approved, so it is what a visitor sees on SCR-01/02/03.
const ADDRESS = "東京都北区赤羽1-1-1 サンプルビル 2F";

async function signIn(page: Page) {
  await page.goto("/organization/login");
  await page.getByLabel("メールアドレス").fill(E2E_ORGANIZATION_MEMBER.email);
  await page.getByLabel("パスワード").fill(E2E_ORGANIZATION_MEMBER.password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.waitForURL("**/organization");
}

test.describe("the shelter catalogue (SCR-01/02/03)", () => {
  test("the top page and the list both lead to the shelter's own page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: E2E_ORGANIZATION_MEMBER.organization })).toBeVisible();

    await page.goto("/organizations");
    await page.getByRole("searchbox").fill(E2E_ORGANIZATION_MEMBER.organization);
    await page.getByRole("button", { name: "さがす", exact: true }).click();
    await page.waitForURL(/\?area=/);

    await page.getByRole("link", { name: E2E_ORGANIZATION_MEMBER.organization }).click();
    await expect(page.getByRole("heading", { name: E2E_ORGANIZATION_MEMBER.organization })).toBeVisible();
  });

  test("a search that matches nothing says so instead of listing everyone", async ({ page }) => {
    await page.goto("/organizations?area=" + encodeURIComponent("存在しない団体名"));

    await expect(page.getByText("掲載中の保護団体はまだありません。")).toBeVisible();
  });

  test("the shelter page shows the address only as far as the shelter allowed", async ({ page }) => {
    await signIn(page);
    await page.goto("/organization/profile");
    await page.getByLabel("所在地").fill(ADDRESS);
    await page.getByLabel("住所の公開範囲").selectOption("city_only");
    await page.getByRole("button", { name: "保存する" }).click();
    await page.waitForURL(/status=saved/);

    const href = await page.getByRole("link", { name: "公開ページを見る" }).getAttribute("href");
    await page.goto(new URL(href!, page.url()).pathname);

    await expect(page.getByText("東京都北区", { exact: true })).toBeVisible();
    // The street and the building are the part `city_only` is meant to keep back.
    await expect(page.getByText("赤羽1-1-1")).toHaveCount(0);
    await expect(page.getByText("サンプルビル")).toHaveCount(0);
  });
});

test.describe("walk filters (SCR-06)", () => {
  // Granted at context creation: asking for it after the page is open leaves the first call to
  // getCurrentPosition() answering with a permission error.
  test.use({ permissions: ["geolocation"], geolocation: { latitude: 35.7836, longitude: 139.7229 } });

  test("the beginner filter survives the round trip in the URL", async ({ page }) => {
    await page.goto("/walks");
    await page.getByRole("checkbox", { name: "はじめての方でも参加できる枠だけ" }).check();
    await page.getByRole("button", { name: "さがす", exact: true }).click();

    await page.waitForURL(/beginner=1/);
    await expect(page.getByRole("checkbox", { name: "はじめての方でも参加できる枠だけ" })).toBeChecked();
  });

  test("the current-location search puts the point in the URL", async ({ page }) => {
    await page.goto("/walks");
    await page.getByRole("combobox").selectOption("3");

    const trigger = page.getByRole("button", { name: "現在地からさがす" });
    // The island fills two hidden inputs and submits, so a click before hydration is dropped.
    await expect(async () => {
      await trigger.click();
      await page.waitForURL(/lat=35\.78/, { timeout: 2_000 });
    }).toPass({ timeout: 60_000 });

    expect(new URL(page.url()).searchParams.get("radius")).toBe("3");
    await expect(page.getByRole("link", { name: "現在地の条件を外す" })).toBeVisible();
  });
});

test.describe("dog search (SCR-04)", () => {
  test("keeps the keyword in the box after searching", async ({ page }) => {
    await page.goto("/dogs");
    await page.getByRole("searchbox").fill("柴犬");
    await page.getByRole("button", { name: "さがす", exact: true }).click();

    await page.waitForURL(/q=/);
    await expect(page.getByRole("searchbox")).toHaveValue("柴犬");
  });
});
