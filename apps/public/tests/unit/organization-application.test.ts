// The applicant's half of FG-03: applying, and answering a request for more information. The
// review transitions themselves are covered in apps/admin's organizations.test.ts — one table,
// two Service files (DEV-09 §2-1-5), and each app tests its own.
import { env } from "cloudflare:workers";
import { activityLog, organizationApplicationTokens, organizations } from "@app/schema";
import { createDb } from "@app/schema/client";
import { newSessionToken } from "@app/server-kit/auth";
import { ValidationError } from "@app/server-kit/http";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { InvalidTokenError, createApplication, getApplicationByToken, issueApplicationToken, resubmitApplication } from "../../src/lib/server/services/organizations";

const db = createDb(env.DB);
const INPUT = { name: "テスト保護団体", representativeName: "代表 太郎", email: "shelter@example.test", activityArea: "東京都北区", introduction: "保護犬の譲渡活動をしています。" };

beforeEach(async () => {
  await db.delete(activityLog);
  await db.delete(organizationApplicationTokens);
  await db.delete(organizations);
});

describe("createApplication (F-03-01)", () => {
  it("creates the shelter in pending_review with a slug of its own", async () => {
    const { organizationId } = await createApplication(db, INPUT);

    const [row] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
    expect(row).toMatchObject({ name: INPUT.name, email: INPUT.email, status: "pending_review", addressVisibility: "prefecture_only" });
    // Derived, not taken from the name: names collide and contain characters a URL loses.
    expect(row!.slug).toMatch(/^org-[0-9a-hjkmnp-tv-z]{26}$/);
  });

  it("refuses a second application under the same name", async () => {
    await createApplication(db, INPUT);

    await expect(createApplication(db, INPUT)).rejects.toBeInstanceOf(ValidationError);
    expect(await db.select().from(organizations)).toHaveLength(1);
  });

  it("logs it as system, because the applicant has no account yet", async () => {
    const { organizationId } = await createApplication(db, INPUT);

    const [entry] = await db.select().from(activityLog);
    // GOV-01 D-033: causer_id is null only for system, and this is the case it exists for.
    expect(entry).toMatchObject({ causerType: "system", causerId: null, organizationId, event: "organization.pending_review" });
  });
});

describe("the resubmission link (SCR-51, F-03-05)", () => {
  async function needsMoreInfo() {
    const { organizationId } = await createApplication(db, INPUT);
    await db.update(organizations).set({ status: "needs_more_info", rejectionReason: "活動実績の詳細をお知らせください。" }).where(eq(organizations.id, organizationId));
    const token = await issueApplicationToken(db, organizationId);
    return { organizationId, token };
  }

  it("resolves to what the screen shows, including the operator's question", async () => {
    const { token } = await needsMoreInfo();

    await expect(getApplicationByToken(db, token)).resolves.toMatchObject({ name: INPUT.name, status: "needs_more_info", rejectionReason: "活動実績の詳細をお知らせください。" });
  });

  it("resolves to nothing for an unknown, spent or expired token", async () => {
    const { organizationId, token } = await needsMoreInfo();

    await expect(getApplicationByToken(db, newSessionToken())).resolves.toBeNull();

    await resubmitApplication(db, token, "追加の説明です。");
    await expect(getApplicationByToken(db, token)).resolves.toBeNull();

    const expired = await issueApplicationToken(db, organizationId);
    await db
      .update(organizationApplicationTokens)
      .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(organizationApplicationTokens.token, expired));
    await expect(getApplicationByToken(db, expired)).resolves.toBeNull();
  });

  it("returns the application to review and clears the question", async () => {
    const { organizationId, token } = await needsMoreInfo();

    await resubmitApplication(db, token, "追加の説明です。");

    const [row] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
    expect(row).toMatchObject({ status: "under_review", rejectionReason: null });
  });

  it("cannot be replayed, and cannot be used once the application moved on", async () => {
    const { organizationId, token } = await needsMoreInfo();
    await resubmitApplication(db, token, "追加の説明です。");
    await expect(resubmitApplication(db, token, "もう一度")).rejects.toBeInstanceOf(InvalidTokenError);

    // A token issued while needs_more_info, used after the operator already approved.
    const stale = await issueApplicationToken(db, organizationId);
    await db.update(organizations).set({ status: "approved" }).where(eq(organizations.id, organizationId));
    await expect(resubmitApplication(db, stale, "遅れた再提出")).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("keeps the applicant's note in the audit trail", async () => {
    const { token } = await needsMoreInfo();

    await resubmitApplication(db, token, "追加の説明です。");

    const [entry] = await db.select().from(activityLog).where(eq(activityLog.event, "organization.under_review"));
    expect(JSON.parse(entry!.properties!)).toMatchObject({ from: "needs_more_info", to: "under_review", note: "追加の説明です。" });
  });
});
