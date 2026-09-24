import { expect, test, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { E2E_ADMIN, E2E_APPLICANT } from "./global-setup";

const REVIEW_URL = `/organization-applications/${E2E_APPLICANT.publicId}`;

// Nothing is delivered locally (no mail key), so the link the approval mail would carry is read
// back from the row it was written to — which is also what proves approval issued one.
function activationTokenCount(): number {
  const sql = `SELECT COUNT(*) AS n FROM organization_activation_tokens WHERE organization_id IN (SELECT id FROM organizations WHERE public_id = '${E2E_APPLICANT.publicId}');`;
  const result = spawnSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--persist-to", "../../.wrangler-state", "--json", "--command", sql], { cwd: path.join(import.meta.dirname, "../.."), encoding: "utf8" });
  return JSON.parse(result.stdout.slice(result.stdout.indexOf("[")))[0].results[0].n;
}

async function signIn(page: Page) {
  await page.goto("/");
  const submit = page.getByRole("button", { name: "ログイン" });
  await expect(submit).toBeEnabled({ timeout: 60_000 });
  await page.getByLabel("メールアドレス").fill(E2E_ADMIN.email);
  await page.getByLabel("パスワード").fill(E2E_ADMIN.password);
  await submit.click();
  await page.waitForURL("**/dashboard");
}

async function act(page: Page, trigger: string, confirm: string, reason?: string) {
  const button = page.getByRole("button", { name: trigger });
  // Scoped to the dialog: confirm-action.svelte reuses the trigger's wording on the confirm
  // button, so both are on the page once it opens. It renders an AlertDialog, hence the role.
  const dialog = page.getByRole("alertdialog");

  // The trigger is a plain button with no disabled state, so being enabled says nothing about
  // hydration — a click before it lands is simply dropped. Retry until the dialog answers.
  await expect(async () => {
    await button.click();
    await expect(dialog).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });

  if (reason !== undefined) await dialog.getByRole("textbox").fill(reason);
  await dialog.getByRole("button", { name: confirm, exact: true }).click();
  await page.waitForURL(/status=saved|error=/);
}

// One test, not three: the specs share a single application row, so splitting the walk into
// independent tests would make each one depend on the order the previous left it in.
test.describe("organization review (SYS-04/05)", () => {
  test("the queue links to the application, and the buttons follow the state machine", async ({ page }) => {
    await signIn(page);

    await page.goto("/organization-applications");
    await page.getByRole("link", { name: E2E_APPLICANT.name }).click();
    await page.waitForURL(`**${REVIEW_URL}`);

    // pending_review offers one move — approving without reviewing is what DEV-09 §2-1-2 rules
    // out, and the screen must not offer a button that would 409.
    await expect(page.getByRole("button", { name: "審査を開始する" })).toBeVisible();
    await expect(page.getByRole("button", { name: "承認する" })).toHaveCount(0);

    await act(page, "審査を開始する", "開始する");
    await expect(page.getByRole("button", { name: "承認する" })).toBeVisible();

    await act(page, "差し戻す", "差し戻す", "活動実績の詳細をお知らせください。");

    // The operator's question is now the state of the record, and the only move is back to review.
    await expect(page.getByText("活動実績の詳細をお知らせください。")).toBeVisible();
    await expect(page.getByRole("button", { name: "承認する" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "審査を開始する" })).toBeVisible();

    // Approved, and the same row is now a shelter rather than an application: SYS-06 lists it,
    // SYS-07 offers the operational moves and nothing from the review set.
    await act(page, "審査を開始する", "開始する");
    expect(activationTokenCount()).toBe(0);
    await act(page, "承認する", "承認する");

    // Approval is what creates the shelter's way in (F-03-06): exactly one link, issued once.
    expect(activationTokenCount()).toBe(1);

    await page.goto("/organizations");
    await page.getByRole("link", { name: E2E_APPLICANT.name }).click();
    await page.waitForURL(`**/organizations/${E2E_APPLICANT.publicId}`);

    await expect(page.getByRole("button", { name: "掲載停止" })).toBeVisible();
    await expect(page.getByRole("button", { name: "掲載再開" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "承認する" })).toHaveCount(0);

    await page.getByRole("link", { name: "スタッフを見る" }).click();
    await page.waitForURL(`**/organizations/${E2E_APPLICANT.publicId}/members`);
    await expect(page.getByText("スタッフが登録されていません")).toBeVisible();
  });
});
