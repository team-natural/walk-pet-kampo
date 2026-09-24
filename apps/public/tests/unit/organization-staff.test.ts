// FG-04's shelter half: who may be a member, who may stop being one, and how a shelter leaves.
// The operator's side of the same table (SYS-06/07/08) is covered in apps/admin.
import { env } from "cloudflare:workers";
import { activityLog, invitations, organizationMembers, organizationSessions, organizations, reservations, walkSlots, walkers } from "@app/schema";
import { createDb } from "@app/schema/client";
import { ulid } from "@app/schema/ulid";
import { hashPassword } from "@app/server-kit/auth";
import { InvalidStateTransitionError, NotFoundError, ValidationError } from "@app/server-kit/http";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { OrganizationSession } from "../../src/lib/server/auth/organization-session";
import { inviteMember, listPendingInvitations } from "../../src/lib/server/services/invitations";
import { changeMemberRole, listMembers, setMemberStatus } from "../../src/lib/server/services/organization-members";
import { getOwnOrganization, updateOrganizationProfile, withdrawOrganization } from "../../src/lib/server/services/organization-profile";

const db = createDb(env.DB);

async function insertOrganization(status: (typeof organizations.$inferSelect)["status"] = "approved") {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(organizations)
    .values({ publicId: ulid(), name: "テスト保護団体", slug: `org-${ulid().toLowerCase()}`, representativeName: "代表", addressVisibility: "prefecture_only", status, address: "東京都北区赤羽1-1-1", latitude: 35.7, longitude: 139.7, updatedAt: now })
    .returning();
  return row!;
}

async function insertMember(organizationId: number, overrides: Partial<typeof organizationMembers.$inferInsert> = {}) {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(organizationMembers)
    .values({
      organizationId,
      role: "org_admin",
      name: "スタッフ",
      email: `member-${ulid().toLowerCase()}@example.test`,
      passwordHash: await hashPassword("correct horse battery staple"),
      status: "active",
      joinedAt: now,
      updatedAt: now,
      ...overrides,
    })
    .returning();
  return row!;
}

// The withdrawal guard reads reservations, and a reservation needs a slot and a walker behind it
// — all three tables have real foreign keys, so there is no shortcut to a single row.
async function insertOpenReservation(organizationId: number) {
  const now = new Date().toISOString();
  const [walker] = await db
    .insert(walkers)
    .values({ publicId: ulid(), name: "参加者", email: `walker-${ulid().toLowerCase()}@example.test`, passwordHash: await hashPassword("correct horse battery staple"), status: "active", updatedAt: now })
    .returning();
  const [slot] = await db
    .insert(walkSlots)
    .values({
      publicId: ulid(),
      organizationId,
      title: "朝のおさんぽ",
      startAt: now,
      acceptanceStartAt: now,
      acceptanceEndAt: now,
      durationMinutes: 60,
      meetingPlace: "赤羽駅",
      areaPrefecture: "東京都",
      capacity: 4,
      requiredExperience: "none",
      status: "open",
      updatedAt: now,
    })
    .returning();

  await db.insert(reservations).values({
    publicId: ulid(),
    organizationId,
    walkSlotId: slot!.id,
    walkerId: walker!.id,
    emergencyContactNameSnapshot: "山田 花子",
    emergencyContactPhoneSnapshot: "090-0000-0000",
    status: "confirmed",
    updatedAt: now,
  });
}

function sessionFor(organization: typeof organizations.$inferSelect, member: typeof organizationMembers.$inferSelect): OrganizationSession {
  return { organizationMemberId: member.id, organizationId: organization.id, organizationPublicId: organization.publicId, organizationName: organization.name, role: member.role, name: member.name };
}

// Child rows first: none of these foreign keys cascade, so the order is the dependency order.
beforeEach(async () => {
  await db.delete(activityLog);
  await db.delete(reservations);
  await db.delete(walkSlots);
  await db.delete(walkers);
  await db.delete(organizationSessions);
  await db.delete(invitations);
  await db.delete(organizationMembers);
  await db.delete(organizations);
});

describe("listMembers (ADM-03)", () => {
  it("shows this shelter's people and no one else's", async () => {
    const mine = await insertOrganization();
    const theirs = await insertOrganization();
    await insertMember(mine.id, { name: "自団体" });
    await insertMember(theirs.id, { name: "他団体" });

    const members = await listMembers(db, mine.id);

    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ name: "自団体", role: "org_admin", status: "active" });
  });
});

describe("inviteMember (F-04-03)", () => {
  it("issues a pending invitation and logs it against the shelter", async () => {
    const organization = await insertOrganization();
    const admin = await insertMember(organization.id);

    const { token } = await inviteMember(db, sessionFor(organization, admin), "new@example.test", "org_staff");

    const [row] = await db.select().from(invitations).where(eq(invitations.token, token));
    expect(row).toMatchObject({ email: "new@example.test", role: "org_staff", status: "pending", organizationId: organization.id, inviterId: admin.id });

    const [entry] = await db.select().from(activityLog).where(eq(activityLog.event, "invitation.pending"));
    expect(entry).toMatchObject({ causerType: "organization_member", causerId: admin.id, organizationId: organization.id });
  });

  it("refuses an address that already belongs to a member anywhere", async () => {
    const organization = await insertOrganization();
    const admin = await insertMember(organization.id);
    const elsewhere = await insertOrganization();
    await insertMember(elsewhere.id, { email: "taken@example.test" });

    await expect(inviteMember(db, sessionFor(organization, admin), "taken@example.test", "org_staff")).rejects.toBeInstanceOf(ValidationError);
    expect(await db.select().from(invitations)).toHaveLength(0);
  });

  it("supersedes a previous invitation instead of leaving two live tokens", async () => {
    const organization = await insertOrganization();
    const admin = await insertMember(organization.id);
    const session = sessionFor(organization, admin);

    const first = await inviteMember(db, session, "new@example.test", "org_staff");
    const second = await inviteMember(db, session, "new@example.test", "org_admin");

    const [stale] = await db.select().from(invitations).where(eq(invitations.token, first.token));
    expect(stale!.status).toBe("expired");

    const pending = await listPendingInvitations(db, organization.id);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ email: "new@example.test", role: "org_admin" });
    expect(second.token).not.toBe(first.token);
  });

  it("hides an invitation whose deadline has passed, before the expiry batch runs", async () => {
    const organization = await insertOrganization();
    const admin = await insertMember(organization.id);
    const { token } = await inviteMember(db, sessionFor(organization, admin), "new@example.test", "org_staff");

    await db
      .update(invitations)
      .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(invitations.token, token));

    await expect(listPendingInvitations(db, organization.id)).resolves.toHaveLength(0);
  });
});

describe("changeMemberRole / setMemberStatus (F-04-04)", () => {
  it("keeps at least one administrator, whichever way the last one is removed", async () => {
    const organization = await insertOrganization();
    const admin = await insertMember(organization.id, { email: "only-admin@example.test" });
    await insertMember(organization.id, { role: "org_staff", email: "staff@example.test" });
    const session = sessionFor(organization, admin);

    await expect(changeMemberRole(db, session, "only-admin@example.test", "org_staff")).rejects.toBeInstanceOf(ValidationError);
    await expect(setMemberStatus(db, session, "only-admin@example.test", "suspended")).rejects.toBeInstanceOf(ValidationError);

    const [row] = await db.select().from(organizationMembers).where(eq(organizationMembers.id, admin.id));
    expect(row).toMatchObject({ role: "org_admin", status: "active" });
  });

  it("demotes an administrator once a second one exists", async () => {
    const organization = await insertOrganization();
    const admin = await insertMember(organization.id, { email: "first@example.test" });
    const other = await insertMember(organization.id, { email: "second@example.test" });

    await changeMemberRole(db, sessionFor(organization, admin), "second@example.test", "org_staff");

    const [row] = await db.select().from(organizationMembers).where(eq(organizationMembers.id, other.id));
    expect(row!.role).toBe("org_staff");
  });

  it("ends the sessions of whoever it suspends", async () => {
    const organization = await insertOrganization();
    const admin = await insertMember(organization.id, { email: "admin@example.test" });
    const staff = await insertMember(organization.id, { role: "org_staff", email: "staff@example.test" });
    await db.insert(organizationSessions).values({ organizationMemberId: staff.id, sessionToken: ulid(), expiresAt: new Date(Date.now() + 86_400_000).toISOString() });

    await setMemberStatus(db, sessionFor(organization, admin), "staff@example.test", "suspended");

    expect(await db.select().from(organizationSessions)).toHaveLength(0);
  });

  it("refuses to suspend someone who has not accepted yet, and refuses another shelter's member", async () => {
    const organization = await insertOrganization();
    const admin = await insertMember(organization.id, { email: "admin@example.test" });
    await insertMember(organization.id, { role: "org_staff", email: "invited@example.test", status: "invited" });
    const elsewhere = await insertOrganization();
    await insertMember(elsewhere.id, { email: "outsider@example.test" });
    const session = sessionFor(organization, admin);

    await expect(setMemberStatus(db, session, "invited@example.test", "suspended")).rejects.toBeInstanceOf(InvalidStateTransitionError);
    await expect(changeMemberRole(db, session, "outsider@example.test", "org_staff")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("updateOrganizationProfile (ADM-02)", () => {
  it("drops the coordinates when the address changes, and keeps them when it does not", async () => {
    const organization = await insertOrganization();
    const admin = await insertMember(organization.id);
    const session = sessionFor(organization, admin);
    const input = { name: organization.name, representativeName: "代表", activityArea: "東京都北区", addressVisibility: "city_only" as const, address: organization.address, introduction: "紹介文" };

    await updateOrganizationProfile(db, session, input);
    const [kept] = await db.select().from(organizations).where(eq(organizations.id, organization.id));
    expect(kept).toMatchObject({ latitude: 35.7, longitude: 139.7, addressVisibility: "city_only" });

    await updateOrganizationProfile(db, session, { ...input, address: "東京都板橋区板橋1-1-1" });
    const [moved] = await db.select().from(organizations).where(eq(organizations.id, organization.id));
    expect(moved).toMatchObject({ address: "東京都板橋区板橋1-1-1", latitude: null, longitude: null });
  });

  it("reads back what ADM-02 renders", async () => {
    const organization = await insertOrganization();

    await expect(getOwnOrganization(db, organization.id)).resolves.toMatchObject({ id: organization.publicId, name: organization.name, slug: organization.slug });
  });
});

describe("withdrawOrganization (F-04-05)", () => {
  it("moves an approved shelter to withdrawn and records the reason in the log", async () => {
    const organization = await insertOrganization();
    const admin = await insertMember(organization.id);

    await withdrawOrganization(db, sessionFor(organization, admin), "活動を終了するため");

    const [row] = await db.select().from(organizations).where(eq(organizations.id, organization.id));
    expect(row!.status).toBe("withdrawn");

    const [entry] = await db.select().from(activityLog).where(eq(activityLog.event, "organization.withdrawn"));
    expect(JSON.parse(entry!.properties!)).toMatchObject({ from: "approved", to: "withdrawn", reason: "活動を終了するため" });
  });

  it("refuses while an application is still under review", async () => {
    const organization = await insertOrganization("under_review");
    const admin = await insertMember(organization.id);

    await expect(withdrawOrganization(db, sessionFor(organization, admin))).rejects.toBeInstanceOf(InvalidStateTransitionError);
  });

  it("refuses while a reservation is still open", async () => {
    const organization = await insertOrganization();
    const admin = await insertMember(organization.id);
    await insertOpenReservation(organization.id);

    await expect(withdrawOrganization(db, sessionFor(organization, admin))).rejects.toBeInstanceOf(ValidationError);

    const [row] = await db.select().from(organizations).where(eq(organizations.id, organization.id));
    expect(row!.status).toBe("approved");
  });
});
