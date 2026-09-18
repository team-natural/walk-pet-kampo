import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN } from "./global-setup";

// These screens still render mock data, so any id resolves — the subject here is the form, not
// the record behind it.
const DOG_URL = "/dogs/01HZZDOG00000000000000001";

async function signIn(page: Page) {
  await page.goto("/");
  const submit = page.getByRole("button", { name: "ログイン" });
  await expect(submit).toBeEnabled();
  await page.getByLabel("メールアドレス").fill(E2E_ADMIN.email);
  await page.getByLabel("パスワード").fill(E2E_ADMIN.password);
  await submit.click();
  await page.waitForURL("**/dashboard");
}

async function openEditSheet(page: Page, url: string) {
  await page.goto(url);
  // edit-sheet.svelte keeps the trigger disabled until onMount, so this is the hydration signal.
  const trigger = page.getByRole("button", { name: "編集" });
  await expect(trigger).toBeEnabled();
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

function serializeForm(page: Page) {
  return page.evaluate(() => {
    const form = document.querySelector("[role=dialog] form") as HTMLFormElement;
    return [...new FormData(form).entries()].map(([key, value]) => `${key}=${String(value)}`);
  });
}

test.describe("SYS-10 edit form", () => {
  test("submits every field the platform may patch", async ({ page }) => {
    await signIn(page);
    await openEditSheet(page, DOG_URL);

    const entries = await serializeForm(page);

    // Select and Checkbox are bits-ui widgets, not native controls: they only reach FormData
    // through the hidden inputs `name` makes them render. Drop the prop and the form silently
    // posts nothing for that field.
    expect(entries).toContain("adoptionStatus=listed");
    expect(entries).toContain("requiredExperience=none");
    expect(entries).toContain("internalNotes=投薬中（2026-10 まで）。運営内のみ共有。");
  });

  test("an unchecked box still submits a value", async ({ page }) => {
    await signIn(page);
    await openEditSheet(page, DOG_URL);

    const entries = await serializeForm(page);

    // The whole point of the "0" companion in boolean-field.svelte. `childAllowed` is 0 in the
    // fixture, so without it the route could not tell "unchecked" from "field omitted".
    expect(entries.filter((entry) => entry.startsWith("childAllowed="))).toEqual(["childAllowed=0"]);
    // A checked box sends both, newest last — the route reads the last value for the name.
    expect(entries.filter((entry) => entry.startsWith("isPublished="))).toEqual(["isPublished=0", "isPublished=1"]);
  });

  test("keeps the capacity floor at the number already booked", async ({ page }) => {
    await signIn(page);
    await openEditSheet(page, "/walks/01HZZWALKSLOT000000000001");

    // Lowering capacity below the reservations would orphan them, so the browser refuses before
    // anything is sent.
    const capacity = page.getByLabel("定員");
    await expect(capacity).toHaveAttribute("min", "2");
    await capacity.fill("1");
    await expect(capacity).toHaveJSProperty("validity.rangeUnderflow", true);
  });
});
