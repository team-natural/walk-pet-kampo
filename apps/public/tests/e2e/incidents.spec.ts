import { expect, test, type Page } from "@playwright/test";
import { E2E_ORGANIZATION_MEMBER } from "./global-setup";

// FG-12 from the shelter's side: file a report with an attachment, then work it through to
// resolved. The operator's half of the state machine is SYS-20, which waits for P14 (TBD-58).
const STAMP = Date.now();
const DESCRIPTION = `散歩中に足を引きずる様子が見られたため中断しました。${STAMP}`;
const PREVENTION = `出発前の歩様チェックを手順に追加しました。${STAMP}`;
const OCCURRED_AT = "2027-03-02T09:00";

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

test.describe("incident reports (ADM-17/18/19)", () => {
  test("a report is filed with an attachment and worked through to resolved", async ({ page }) => {
    await signIn(page);

    await page.goto("/organization/incidents/add");
    await page.getByLabel("重大度").selectOption("P2");
    await page.getByLabel("種別").selectOption("dog_condition");
    await page.getByLabel("発生日時").fill(OCCURRED_AT);
    await page.getByLabel("場所").fill("荒川河川敷");
    await page.getByLabel("状況").fill(DESCRIPTION);
    await page.getByLabel("添付").setInputFiles({ name: "injury.png", mimeType: "image/png", buffer: pngBytes() });
    await page.getByRole("button", { name: "報告する" }).click();

    await page.waitForURL(/\/organization\/incidents\/[0-9A-HJKMNP-TV-Z]{26}\?status=created/);
    const incidentUrl = new URL(page.url()).pathname;
    await expect(page.getByText(DESCRIPTION)).toBeVisible();
    await expect(page.getByText("報告受付")).toBeVisible();

    // The attachment is listed. Whether it is a link depends on FILE_SIGNING_KEY, which a local
    // machine may not have — the signed URL itself is pinned in tests/unit/files.test.ts, where
    // the key is always bound.
    await expect(page.getByText(/\.png$/)).toBeVisible();

    // P2 takes the long way round: the investigation step cannot be skipped (DEV-09 §2-10-2).
    await expect(page.getByRole("button", { name: "対応中にする" })).toHaveCount(0);
    await page.getByRole("button", { name: "調査中にする" }).click();
    await page.waitForURL(/status=saved/);
    await page.getByRole("button", { name: "対応中にする" }).click();
    await page.waitForURL(/status=saved/);

    // Resolving without recording what changed is refused (F-12-03).
    await page.getByRole("button", { name: "解決にする" }).click();
    await page.waitForURL(/error=prevention/);
    await expect(page.getByRole("alert")).toContainText("再発防止策");

    await page.goto(incidentUrl);
    await page.getByLabel("再発防止策").fill(PREVENTION);
    await page.getByRole("button", { name: "解決にする" }).click();
    await page.waitForURL(/status=saved/);

    await expect(page.getByText("解決", { exact: true })).toBeVisible();
    // Scoped to the record: the same text is also sitting in the form's textarea.
    await expect(page.getByRole("definition").filter({ hasText: PREVENTION })).toBeVisible();
  });

  test("the list shows it, and another shelter's id does not resolve", async ({ page }) => {
    await signIn(page);

    await page.goto("/organization/incidents");
    await expect(page.getByRole("cell", { name: "犬の体調" })).toBeVisible();

    await page.goto("/organization/incidents/01HZZNOTOURINCIDENT00001");
    await expect(page.getByRole("heading", { name: "ページが見つかりません" })).toBeVisible();
  });
});
