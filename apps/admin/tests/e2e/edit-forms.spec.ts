import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN, E2E_WALK_SLOT } from "./global-setup";

// Skipped from P9 until P14. No admin screen mounts an edit sheet while the write path is
// undecided (GOV-02 TBD-58), so there is nothing to open — but what these three pin is the
// behaviour of boolean-field / select-field, which is exactly what a reader would otherwise have
// to rediscover when the sheets come back. Un-skip with them.
const WALK_SLOT_URL = `/walks/${E2E_WALK_SLOT.publicId}`;

async function signIn(page: Page) {
  await page.goto("/");
  const submit = page.getByRole("button", { name: "ログイン" });
  // Longer than the default: this is the first island the dev server compiles in a run, and on a
  // loaded machine that cold build takes more than the 5s an assertion waits by default. The
  // check itself is still the hydration signal — it must not be dropped, only given room.
  await expect(submit).toBeEnabled({ timeout: 60_000 });
  await page.getByLabel("メールアドレス").fill(E2E_ADMIN.email);
  await page.getByLabel("パスワード").fill(E2E_ADMIN.password);
  await submit.click();
  await page.waitForURL("**/dashboard");
}

async function openEditSheet(page: Page, url: string) {
  await page.goto(url);
  // edit-sheet.svelte keeps the trigger disabled until onMount, so this is the hydration signal
  // (same cold-build allowance as signIn above).
  const trigger = page.getByRole("button", { name: "編集" });
  await expect(trigger).toBeEnabled({ timeout: 60_000 });
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

function serializeForm(page: Page) {
  return page.evaluate(() => {
    const form = document.querySelector("[role=dialog] form") as HTMLFormElement;
    return [...new FormData(form).entries()].map(([key, value]) => `${key}=${String(value)}`);
  });
}

test.describe.skip("SYS-12 edit form (restored with the write path — GOV-02 TBD-58)", () => {
  test("submits every field the platform may patch", async ({ page }) => {
    await signIn(page);
    await openEditSheet(page, WALK_SLOT_URL);

    const entries = await serializeForm(page);

    // Select and Checkbox are bits-ui widgets, not native controls: they only reach FormData
    // through the hidden inputs `name` makes them render. Drop the prop and the form silently
    // posts nothing for that field.
    expect(entries).toContain("status=open");
    expect(entries).toContain("requiredExperience=none");
    expect(entries).toContain("precautions=雨天中止。前日 18 時までに連絡します。");
  });

  test("an unchecked box still submits a value", async ({ page }) => {
    await signIn(page);
    await openEditSheet(page, WALK_SLOT_URL);

    const entries = await serializeForm(page);

    // The whole point of the "0" companion in boolean-field.svelte. `childAllowed` is 0 in the
    // fixture, so without it the route could not tell "unchecked" from "field omitted".
    expect(entries.filter((entry) => entry.startsWith("childAllowed="))).toEqual(["childAllowed=0"]);
    // A checked box sends both, newest last — the route reads the last value for the name.
    expect(entries.filter((entry) => entry.startsWith("staffAccompanied="))).toEqual(["staffAccompanied=0", "staffAccompanied=1"]);
  });

  test("keeps the capacity floor at the number already booked", async ({ page }) => {
    await signIn(page);
    await openEditSheet(page, WALK_SLOT_URL);

    // Lowering capacity below the reservations would orphan them, so the browser refuses before
    // anything is sent.
    const capacity = page.getByLabel("定員");
    await expect(capacity).toHaveAttribute("min", "2");
    await capacity.fill("1");
    await expect(capacity).toHaveJSProperty("validity.rangeUnderflow", true);
  });
});
