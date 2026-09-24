// Organization review (F-15-03). The subject is the state machine in DEV-09 §2-1-2: which moves
// are legal from where, and what the operator must supply to make one.
import { env } from "cloudflare:workers";
import { activityLog, adminUsers, organizationApplicationTokens, organizations } from "@app/schema";
import { createDb } from "@app/schema/client";
import { ulid } from "@app/schema/ulid";
import { InvalidStateTransitionError, ValidationError } from "@app/server-kit/http";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Session } from "../../src/lib/server/auth/session";
import { allowedTransitions, countApplicationsAwaitingReview, getOrganizationByPublicId, issueApplicationToken, listApplications, transitionOrganization, type OrganizationStatus } from "../../src/lib/server/services/organizations";

const db = createDb(env.DB);
let session: Session;

async function insertOrganization(status: OrganizationStatus, name = "テスト保護団体") {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(organizations)
    .values({ publicId: ulid(), name, slug: `org-${ulid().toLowerCase()}`, representativeName: "代表", email: "shelter@example.test", addressVisibility: "prefecture_only", status, updatedAt: now })
    .returning();
  return row!;
}

beforeEach(async () => {
  await db.delete(activityLog);
  await db.delete(organizationApplicationTokens);
  await db.delete(organizations);
  await db.delete(adminUsers);

  const now = new Date().toISOString();
  const [admin] = await db.insert(adminUsers).values({ publicId: ulid(), name: "運営 担当", email: "admin@example.test", passwordHash: "x", status: "active", updatedAt: now }).returning();
  session = { adminUserId: admin!.id, adminUserPublicId: admin!.publicId, name: admin!.name, email: admin!.email };
});

describe("the review queue (SYS-04)", () => {
  it("lists only applications still awaiting a decision, oldest first", async () => {
    await insertOrganization("pending_review", "申請中の団体");
    await insertOrganization("under_review", "審査中の団体");
    await insertOrganization("approved", "承認済みの団体");
    await insertOrganization("rejected", "否認された団体");

    const { items } = await listApplications(db);

    expect(items.map((item) => item.name)).toEqual(["申請中の団体", "審査中の団体"]);
  });

  it("counts the same set for the dashboard", async () => {
    await insertOrganization("pending_review", "A");
    await insertOrganization("needs_more_info", "B");
    await insertOrganization("approved", "C");

    await expect(countApplicationsAwaitingReview(db)).resolves.toBe(2);
  });
});

describe("transitionOrganization (DEV-09 §2-1-2)", () => {
  it("walks the documented path", async () => {
    const organization = await insertOrganization("pending_review");

    await transitionOrganization(db, organization.publicId, "under_review", session);
    await transitionOrganization(db, organization.publicId, "needs_more_info", session, "活動実績の詳細をお知らせください。");
    await transitionOrganization(db, organization.publicId, "under_review", session);
    await transitionOrganization(db, organization.publicId, "approved", session);

    expect(await getOrganizationByPublicId(db, organization.publicId)).toMatchObject({ status: "approved" });
  });

  it("refuses a move the matrix does not allow", async () => {
    const organization = await insertOrganization("pending_review");

    // pending_review may only become under_review — approving without reviewing is the mistake
    // the matrix exists to stop.
    await expect(transitionOrganization(db, organization.publicId, "approved", session)).rejects.toBeInstanceOf(InvalidStateTransitionError);
  });

  it("treats rejected and withdrawn as terminal", async () => {
    const rejected = await insertOrganization("rejected", "否認済み");
    const withdrawn = await insertOrganization("withdrawn", "退会済み");

    expect(allowedTransitions("rejected")).toEqual([]);
    expect(allowedTransitions("withdrawn")).toEqual([]);
    await expect(transitionOrganization(db, rejected.publicId, "under_review", session)).rejects.toBeInstanceOf(InvalidStateTransitionError);
    await expect(transitionOrganization(db, withdrawn.publicId, "approved", session)).rejects.toBeInstanceOf(InvalidStateTransitionError);
  });

  it("demands a reason for the two outcomes the applicant has to act on", async () => {
    const organization = await insertOrganization("under_review");

    await expect(transitionOrganization(db, organization.publicId, "needs_more_info", session)).rejects.toBeInstanceOf(ValidationError);
    await expect(transitionOrganization(db, organization.publicId, "rejected", session, "   ")).rejects.toBeInstanceOf(ValidationError);
    await expect(transitionOrganization(db, organization.publicId, "approved", session)).resolves.toMatchObject({ to: "approved" });
  });

  it("clears the reason once it no longer applies", async () => {
    // A rejection note still shown beside an approved shelter reads as a current objection.
    const organization = await insertOrganization("under_review");
    await transitionOrganization(db, organization.publicId, "needs_more_info", session, "確認事項です。");
    await transitionOrganization(db, organization.publicId, "under_review", session);
    await transitionOrganization(db, organization.publicId, "approved", session);

    expect((await getOrganizationByPublicId(db, organization.publicId)).rejectionReason).toBeNull();
  });

  it("records the reviewer and the change in the audit log", async () => {
    const organization = await insertOrganization("pending_review");

    await transitionOrganization(db, organization.publicId, "under_review", session);

    const detail = await getOrganizationByPublicId(db, organization.publicId);
    expect(detail.reviewedByName).toBe("運営 担当");
    expect(detail.reviewedAt).not.toBeNull();

    const [entry] = await db.select().from(activityLog).where(eq(activityLog.event, "organization.under_review"));
    expect(entry).toMatchObject({ causerType: "platform", causerId: session.adminUserId, organizationId: organization.id });
  });

  it("returns what the caller needs to notify the shelter, and sends nothing itself", async () => {
    const organization = await insertOrganization("under_review");

    const result = await transitionOrganization(db, organization.publicId, "approved", session);

    expect(result).toMatchObject({ email: "shelter@example.test", name: organization.name, from: "under_review", to: "approved" });
  });
});

describe("resubmission tokens", () => {
  it("issues one row per request, so a re-sent link does not revive an older one", async () => {
    const organization = await insertOrganization("needs_more_info");

    const first = await issueApplicationToken(db, organization.id);
    const second = await issueApplicationToken(db, organization.id);

    expect(first).not.toBe(second);
    expect(await db.select().from(organizationApplicationTokens)).toHaveLength(2);
  });
});
