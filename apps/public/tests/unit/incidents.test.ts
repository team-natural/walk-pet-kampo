// FG-12. What matters here: a report cannot be closed without saying what was changed (F-12-03),
// the severity decides whether the investigation step can be skipped (DEV-09 §2-10-2), and the
// attachments land in the private half of the bucket (DEV-10 §4-3).
import { env } from "cloudflare:workers";
import { activityLog, incidents, notifications, organizationMembers, organizations } from "@app/schema";
import { createDb } from "@app/schema/client";
import { ulid } from "@app/schema/ulid";
import { hashPassword } from "@app/server-kit/auth";
import { InvalidStateTransitionError, NotFoundError, RateLimitError, ValidationError } from "@app/server-kit/http";
import { RATE_LIMITS } from "@app/server-kit/rate-limit";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { OrganizationSession } from "../../src/lib/server/auth/organization-session";
import { parseAttachmentKeys } from "../../src/lib/server/files";
import { allowedIncidentTransitions, createIncident, getOwnIncident, isUrgent, listOwnIncidents, transitionIncident, type IncidentInput } from "../../src/lib/server/services/incidents";

const db = createDb(env.DB);

const INPUT: IncidentInput = {
  severity: "P2",
  category: "dog_condition",
  occurredAt: "2026-10-03T00:00:00.000Z",
  location: "荒川河川敷",
  description: "散歩中に足を引きずる様子が見られたため中断しました。",
};

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngFile(): File {
  const body = new Uint8Array(64);
  body.set(PNG_HEADER);
  return new File([body], "injury.png", { type: "image/png" });
}

async function insertOrganization() {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(organizations)
    .values({ publicId: ulid(), name: `団体-${ulid()}`, slug: `org-${ulid().toLowerCase()}`, representativeName: "代表", addressVisibility: "prefecture_only", status: "approved", updatedAt: now })
    .returning();
  return row!;
}

async function insertMember(organization: typeof organizations.$inferSelect, name = "スタッフ"): Promise<OrganizationSession> {
  const now = new Date().toISOString();
  const [member] = await db
    .insert(organizationMembers)
    .values({ organizationId: organization.id, role: "org_staff", name, email: `member-${ulid().toLowerCase()}@example.test`, passwordHash: await hashPassword("correct horse battery staple"), status: "active", joinedAt: now, updatedAt: now })
    .returning();

  return { organizationMemberId: member!.id, organizationId: organization.id, organizationPublicId: organization.publicId, organizationName: organization.name, role: "org_staff", name: member!.name };
}

beforeEach(async () => {
  await db.delete(activityLog);
  await db.delete(notifications);
  await db.delete(incidents);
  await db.delete(organizationMembers);
  await db.delete(organizations);

  const { keys } = await env.KV.list();
  await Promise.all(keys.map((key) => env.KV.delete(key.name)));
});

describe("createIncident (F-12-01)", () => {
  it("records who reported it and what happened", async () => {
    const organization = await insertOrganization();
    const session = await insertMember(organization, "北川 一郎");

    const created = await createIncident(db, env.KV, env.BUCKET, session, INPUT);

    const detail = await getOwnIncident(db, organization.id, created.publicId);
    expect(detail).toMatchObject({ status: "reported", severity: "P2", category: "dog_condition", reportedByName: "北川 一郎", location: "荒川河川敷" });

    const [entry] = await db.select().from(activityLog).where(eq(activityLog.event, "incident.reported"));
    expect(entry).toMatchObject({ causerType: "organization_member", causerId: session.organizationMemberId, organizationId: organization.id });
  });

  it("files attachments in the private half of the bucket", async () => {
    const organization = await insertOrganization();
    const session = await insertMember(organization);

    const created = await createIncident(db, env.KV, env.BUCKET, session, INPUT, [pngFile()]);

    const detail = await getOwnIncident(db, organization.id, created.publicId);
    const keys = parseAttachmentKeys(detail.attachmentKeys);
    expect(keys).toHaveLength(1);
    // organizations/{id}/incidents/{incidentId}/... — never served by key (GOV-01 D-024).
    expect(keys[0]).toMatch(new RegExp(`^organizations/${organization.id}/incidents/\\d+/`));
    await expect(env.BUCKET.get(keys[0]!)).resolves.not.toBeNull();
  });

  it("caps how many reports one staff member can file in a day", async () => {
    const organization = await insertOrganization();
    const session = await insertMember(organization);

    for (let i = 0; i < RATE_LIMITS.incidentReport.limit; i++) {
      await createIncident(db, env.KV, env.BUCKET, session, INPUT);
    }

    await expect(createIncident(db, env.KV, env.BUCKET, session, INPUT)).rejects.toBeInstanceOf(RateLimitError);
  });

  it("marks P0 and P1 as the ones the operator hears about at once (F-12-02)", () => {
    expect(isUrgent("P0")).toBe(true);
    expect(isUrgent("P1")).toBe(true);
    expect(isUrgent("P2")).toBe(false);
  });
});

describe("transitionIncident (DEV-09 §2-10-2)", () => {
  it("walks the line and stops at closed", async () => {
    const organization = await insertOrganization();
    const session = await insertMember(organization);
    const { publicId } = await createIncident(db, env.KV, env.BUCKET, session, INPUT);

    await transitionIncident(db, session, publicId, "investigating");
    await transitionIncident(db, session, publicId, "in_progress");
    await transitionIncident(db, session, publicId, "resolved", "リードの点検手順を追加しました。");
    await transitionIncident(db, session, publicId, "closed");

    const detail = await getOwnIncident(db, organization.id, publicId);
    expect(detail.status).toBe("closed");
    expect(detail.resolvedAt).not.toBeNull();
    expect(allowedIncidentTransitions("closed", "P2")).toEqual([]);
  });

  it("lets a serious report skip the investigation step, and a minor one not", async () => {
    const organization = await insertOrganization();
    const session = await insertMember(organization);
    const urgent = await createIncident(db, env.KV, env.BUCKET, session, { ...INPUT, severity: "P0", category: "bite" });
    const routine = await createIncident(db, env.KV, env.BUCKET, session, INPUT);

    await transitionIncident(db, session, urgent.publicId, "in_progress");
    await expect(getOwnIncident(db, organization.id, urgent.publicId)).resolves.toMatchObject({ status: "in_progress" });

    await expect(transitionIncident(db, session, routine.publicId, "in_progress")).rejects.toBeInstanceOf(InvalidStateTransitionError);
  });

  it("refuses to call a report resolved with nothing recorded (F-12-03)", async () => {
    const organization = await insertOrganization();
    const session = await insertMember(organization);
    const { publicId } = await createIncident(db, env.KV, env.BUCKET, session, INPUT);
    await transitionIncident(db, session, publicId, "investigating");
    await transitionIncident(db, session, publicId, "in_progress");

    await expect(transitionIncident(db, session, publicId, "resolved")).rejects.toBeInstanceOf(ValidationError);
    await expect(getOwnIncident(db, organization.id, publicId)).resolves.toMatchObject({ status: "in_progress" });
  });

  it("tells the reporter when a colleague moves it, and not when they move it themselves", async () => {
    const organization = await insertOrganization();
    const reporter = await insertMember(organization, "報告した人");
    const colleague = await insertMember(organization, "別のスタッフ");
    const { publicId } = await createIncident(db, env.KV, env.BUCKET, reporter, INPUT);

    await transitionIncident(db, reporter, publicId, "investigating");
    await expect(db.select().from(notifications)).resolves.toHaveLength(0);

    await transitionIncident(db, colleague, publicId, "in_progress");
    const inbox = await db.select().from(notifications);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({ recipientId: reporter.organizationMemberId, type: "incident_update" });
  });

  it("hides another shelter's report", async () => {
    const mine = await insertOrganization();
    const theirs = await insertOrganization();
    const mySession = await insertMember(mine);
    const { publicId } = await createIncident(db, env.KV, env.BUCKET, await insertMember(theirs), INPUT);

    await expect(listOwnIncidents(db, mine.id)).resolves.toHaveLength(0);
    await expect(getOwnIncident(db, mine.id, publicId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(transitionIncident(db, mySession, publicId, "investigating")).rejects.toBeInstanceOf(NotFoundError);
  });
});
