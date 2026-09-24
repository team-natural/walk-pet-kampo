import { expect, test, type Page } from "@playwright/test";
import { E2E_ORGANIZATION_MEMBER } from "./global-setup";

// One flow, in order: a dog does not exist until ADM-06 creates it, and the public screens have
// nothing to show until ADM-07 publishes it.
// Both suites share one D1, so the name says which one created it — apps/admin seeds its own.
const DOG_NAME = `E2E 登録犬 ${Date.now()}`;

// The upload checks magic bytes, not the extension (@app/server-kit/files), so the first eight
// have to be a real PNG signature — the rest can be anything.
function pngBytes(): Buffer {
  const body = Buffer.alloc(64);
  body.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return body;
}

async function signIn(page: Page) {
  await page.goto("/organization/login");
  await page.getByLabel("メールアドレス").fill(E2E_ORGANIZATION_MEMBER.email);
  await page.getByLabel("パスワード").fill(E2E_ORGANIZATION_MEMBER.password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.waitForURL("**/organization");
}

test.describe("dogs (ADM-05/06/07, SCR-04/05)", () => {
  test("a shelter registers a dog, lists it for adoption, and publishes it", async ({ page }) => {
    await signIn(page);

    await page.goto("/organization/dogs/add");
    await page.getByLabel("名前").fill(DOG_NAME);
    await page.getByLabel("犬種").fill("柴犬ミックス");
    await page.getByLabel("紹介文").fill("よろしくおねがいします。");
    await page.getByLabel("団体内メモ").fill("投薬中（E2E）。");
    await page.getByLabel("写真").setInputFiles({ name: "dog.png", mimeType: "image/png", buffer: pngBytes() });
    await page.getByRole("button", { name: "登録する" }).click();

    await page.waitForURL(/\/organization\/dogs\/[0-9A-HJKMNP-TV-Z]{26}\?status=created/);
    const dogUrl = new URL(page.url()).pathname;

    // A new dog is unlisted and unpublished, so only the first move of DEV-09 §2-5-2 is offered.
    await expect(page.getByRole("button", { name: "里親募集中にする" })).toBeVisible();
    await expect(page.getByRole("button", { name: "譲渡決定にする" })).toHaveCount(0);

    await page.getByRole("button", { name: "里親募集中にする" }).click();
    await page.waitForURL(/status=saved/);
    await expect(page.getByRole("button", { name: "相談中にする" })).toBeVisible();

    // Still not on the public site: publishing is the separate, deliberate step.
    await page.goto("/dogs");
    await expect(page.getByRole("heading", { name: DOG_NAME })).toHaveCount(0);

    await page.goto(dogUrl);
    await page.getByLabel("公開する").check();
    await page.getByRole("button", { name: "保存する" }).click();
    await page.waitForURL(/status=saved/);

    await page.goto("/dogs");
    await page.getByRole("link", { name: DOG_NAME }).click();
    await expect(page.getByRole("heading", { name: DOG_NAME })).toBeVisible();
    await expect(page.getByText("よろしくおねがいします。")).toBeVisible();

    // internalNotes is the shelter's (PRD-04 §4-3) — it must not reach the public page.
    await expect(page.getByText("投薬中（E2E）。")).toHaveCount(0);

    // The photo went to R2 on registration and is served back by the public route (DEV-10 §4-3).
    const src = await page.locator("main img").first().getAttribute("src");
    expect(src).toMatch(/^\/images\/organizations\/\d+\/dogs\/\d+\//);
    const image = await page.request.get(src!);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/png");
  });

  test("a dog registered by mistake can be deleted again", async ({ page }) => {
    await signIn(page);

    await page.goto("/organization/dogs/add");
    await page.getByLabel("名前").fill(`${DOG_NAME} 取消`);
    await page.getByRole("button", { name: "登録する" }).click();
    await page.waitForURL(/\?status=created/);

    const trigger = page.getByRole("button", { name: "削除する", exact: true }).first();
    const dialog = page.getByRole("dialog");
    await expect(async () => {
      await trigger.click();
      await expect(dialog).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 60_000 });

    await dialog.getByRole("button", { name: "削除する", exact: true }).click();
    await page.waitForURL(/\/organization\/dogs\?status=deleted/);
    await expect(page.getByRole("cell", { name: `${DOG_NAME} 取消` })).toHaveCount(0);
  });

  test("the shelter's own list shows it, and another shelter's id does not resolve", async ({ page }) => {
    await signIn(page);

    await page.goto("/organization/dogs");
    await expect(page.getByRole("cell", { name: DOG_NAME })).toBeVisible();

    // A well-formed id that belongs to nobody in this shelter answers the same as a missing one.
    await page.goto("/organization/dogs/01HZZNOTOURDOG0000000001");
    await expect(page.getByRole("heading", { name: "ページが見つかりません" })).toBeVisible();
  });
});
