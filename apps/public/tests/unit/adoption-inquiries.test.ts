// FG-11. Two rules carry the most weight here: the shelter never receives the walker's address
// (GOV-02 TBD-34), and starting to review an enquiry takes the dog off the open list
// (DEV-09 §2-11-3).
import { env } from "cloudflare:workers";
import { activityLog, adoptionInquiries, dogs, notifications, organizationMembers, organizations, walkerProfiles, walkers } from "@app/schema";
import { createDb } from "@app/schema/client";
import { ulid } from "@app/schema/ulid";
import { hashPassword } from "@app/server-kit/auth";
import { ConflictError, InvalidStateTransitionError, NotFoundError, RateLimitError } from "@app/server-kit/http";
import { RATE_LIMITS } from "@app/server-kit/rate-limit";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { OrganizationSession } from "../../src/lib/server/auth/organization-session";
import type { Session } from "../../src/lib/server/auth/session";
import { allowedInquiryTransitions, createAdoptionInquiry, getOrganizationInquiry, getOwnInquiry, listOrganizationInquiries, listOwnInquiries, transitionInquiryByOrganization, withdrawInquiry } from "../../src/lib/server/services/adoption-inquiries";

const db = createDb(env.DB);
const INPUT = { motivation: "散歩で会って以来、家族に迎えたいと考えています。", livingEnvironment: "戸建て・庭あり・在宅勤務" };

async function insertOrganization() {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(organizations)
    .values({ publicId: ulid(), name: `団体-${ulid()}`, slug: `org-${ulid().toLowerCase()}`, representativeName: "代表", addressVisibility: "prefecture_only", status: "approved", updatedAt: now })
    .returning();
  return row!;
}

async function insertMember(organization: typeof organizations.$inferSelect): Promise<OrganizationSession> {
  const now = new Date().toISOString();
  const [member] = await db
    .insert(organizationMembers)
    .values({ organizationId: organization.id, role: "org_staff", name: "スタッフ", email: `member-${ulid().toLowerCase()}@example.test`, passwordHash: await hashPassword("correct horse battery staple"), status: "active", joinedAt: now, updatedAt: now })
    .returning();

  return { organizationMemberId: member!.id, organizationId: organization.id, organizationPublicId: organization.publicId, organizationName: organization.name, role: "org_staff", name: member!.name };
}

async function insertDog(organizationId: number, overrides: Partial<typeof dogs.$inferInsert> = {}) {
  const publicId = ulid();
  const now = new Date().toISOString();
  const [row] = await db
    .insert(dogs)
    .values({ publicId, organizationId, slug: `dog-${publicId.toLowerCase()}`, name: "モモ", requiredExperience: "none", adoptionStatus: "listed", isPublished: 1, updatedAt: now, ...overrides })
    .returning();
  return row!;
}

async function insertWalker(): Promise<Session> {
  const now = new Date().toISOString();
  const [walker] = await db
    .insert(walkers)
    .values({ publicId: ulid(), name: "山田 太郎", email: `walker-${ulid().toLowerCase()}@example.test`, passwordHash: await hashPassword("correct horse battery staple"), status: "active", updatedAt: now })
    .returning();

  await db.insert(walkerProfiles).values({ publicId: ulid(), walkerId: walker!.id, phone: "09012345678", address: "東京都北区赤羽1-1-1", status: "active", updatedAt: now });
  return { walkerId: walker!.id, walkerPublicId: walker!.publicId };
}

beforeEach(async () => {
  await db.delete(activityLog);
  await db.delete(notifications);
  await db.delete(adoptionInquiries);
  await db.delete(dogs);
  await db.delete(walkerProfiles);
  await db.delete(walkers);
  await db.delete(organizationMembers);
  await db.delete(organizations);

  const { keys } = await env.KV.list();
  await Promise.all(keys.map((key) => env.KV.delete(key.name)));
});

describe("createAdoptionInquiry (F-11-01)", () => {
  it("records the enquiry and tells every active staff member", async () => {
    const organization = await insertOrganization();
    const staff = await insertMember(organization);
    const dog = await insertDog(organization.id);
    const session = await insertWalker();

    const { publicId } = await createAdoptionInquiry(db, env.KV, session, dog.slug, INPUT);

    const detail = await getOwnInquiry(db, session.walkerId, publicId);
    expect(detail).toMatchObject({ status: "received", motivation: INPUT.motivation });
    expect(detail.organization.name).toBe(organization.name);

    const inbox = await db.select().from(notifications).where(eq(notifications.recipientId, staff.organizationMemberId));
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({ recipientType: "organization_member", type: "adoption_inquiry_received" });
  });

  it("refuses a dog that is not published, or whose search is over", async () => {
    const organization = await insertOrganization();
    const session = await insertWalker();
    const hidden = await insertDog(organization.id, { isPublished: 0 });
    const adopted = await insertDog(organization.id, { adoptionStatus: "adopted" });

    await expect(createAdoptionInquiry(db, env.KV, session, hidden.slug, INPUT)).rejects.toBeInstanceOf(NotFoundError);
    await expect(createAdoptionInquiry(db, env.KV, session, adopted.slug, INPUT)).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses a second enquiry while the first is still unanswered", async () => {
    const organization = await insertOrganization();
    const dog = await insertDog(organization.id);
    const session = await insertWalker();
    await createAdoptionInquiry(db, env.KV, session, dog.slug, INPUT);

    await expect(createAdoptionInquiry(db, env.KV, session, dog.slug, INPUT)).rejects.toBeInstanceOf(ConflictError);
  });

  it("caps how many a walker can send in a day (DEV-02 §7)", async () => {
    const organization = await insertOrganization();
    const session = await insertWalker();
    for (let i = 0; i < RATE_LIMITS.adoptionInquiry.limit; i++) {
      const dog = await insertDog(organization.id);
      await createAdoptionInquiry(db, env.KV, session, dog.slug, INPUT);
    }

    const another = await insertDog(organization.id);
    await expect(createAdoptionInquiry(db, env.KV, session, another.slug, INPUT)).rejects.toBeInstanceOf(RateLimitError);
  });
});

describe("what the shelter sees (GOV-02 TBD-34)", () => {
  it("hands over the contact details but never the address", async () => {
    const organization = await insertOrganization();
    const staff = await insertMember(organization);
    const dog = await insertDog(organization.id);
    const session = await insertWalker();
    const { publicId } = await createAdoptionInquiry(db, env.KV, session, dog.slug, INPUT);

    const detail = await getOrganizationInquiry(db, organization.id, publicId);

    expect(detail.walker).toMatchObject({ name: "山田 太郎", phone: "09012345678" });
    expect(detail.walker).not.toHaveProperty("address");
    expect(JSON.stringify(detail)).not.toContain("赤羽");
    expect(staff.organizationId).toBe(organization.id);
  });

  it("does not answer for another shelter's enquiry", async () => {
    const mine = await insertOrganization();
    const theirs = await insertOrganization();
    const dog = await insertDog(theirs.id);
    const session = await insertWalker();
    const { publicId } = await createAdoptionInquiry(db, env.KV, session, dog.slug, INPUT);

    await expect(listOrganizationInquiries(db, mine.id)).resolves.toHaveLength(0);
    await expect(getOrganizationInquiry(db, mine.id, publicId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(transitionInquiryByOrganization(db, await insertMember(mine), publicId, "organization_reviewing")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("the conversation (DEV-09 §2-11)", () => {
  async function received() {
    const organization = await insertOrganization();
    const staff = await insertMember(organization);
    const dog = await insertDog(organization.id);
    const session = await insertWalker();
    const { publicId } = await createAdoptionInquiry(db, env.KV, session, dog.slug, INPUT);
    return { organization, staff, dog, session, publicId };
  }

  it("takes the dog off the open list as soon as the shelter starts looking", async () => {
    const { staff, dog, publicId } = await received();

    await transitionInquiryByOrganization(db, staff, publicId, "organization_reviewing");

    const [after] = await db.select().from(dogs).where(eq(dogs.id, dog.id));
    expect(after!.adoptionStatus).toBe("in_consultation");
  });

  it("walks the documented path and stops at the terminal state", async () => {
    const { staff, session, publicId } = await received();

    await transitionInquiryByOrganization(db, staff, publicId, "organization_reviewing");
    await transitionInquiryByOrganization(db, staff, publicId, "contacted");
    await transitionInquiryByOrganization(db, staff, publicId, "interview_scheduled");
    await transitionInquiryByOrganization(db, staff, publicId, "transferred_to_organization_process");

    const detail = await getOwnInquiry(db, session.walkerId, publicId);
    expect(detail.status).toBe("transferred_to_organization_process");
    expect(detail.organizationContactedAt).not.toBeNull();
    expect(allowedInquiryTransitions("transferred_to_organization_process")).toEqual([]);
  });

  it("refuses a move the matrix does not have", async () => {
    const { staff, publicId } = await received();

    // received → contacted skips the shelter actually looking at it.
    await expect(transitionInquiryByOrganization(db, staff, publicId, "contacted")).rejects.toBeInstanceOf(InvalidStateTransitionError);
  });

  it("tells the walker when the shelter moves, and says nothing when they withdraw", async () => {
    const { staff, session, publicId } = await received();

    await transitionInquiryByOrganization(db, staff, publicId, "organization_reviewing");
    const told = await db.select().from(notifications).where(eq(notifications.recipientType, "walker"));
    expect(told).toHaveLength(1);
    expect(told[0]!.type).toBe("adoption_inquiry_update");

    await withdrawInquiry(db, session.walkerId, publicId);
    await expect(db.select().from(notifications).where(eq(notifications.recipientType, "walker"))).resolves.toHaveLength(1);
  });

  it("lets the walker take back their own enquiry, and nobody else's", async () => {
    const { staff, session, publicId } = await received();
    const stranger = await insertWalker();

    await expect(withdrawInquiry(db, stranger.walkerId, publicId)).rejects.toBeInstanceOf(NotFoundError);

    await withdrawInquiry(db, session.walkerId, publicId);
    await expect(getOwnInquiry(db, session.walkerId, publicId)).resolves.toMatchObject({ status: "withdrawn" });

    // Terminal: the shelter cannot carry a withdrawn enquiry on. Withdrawing twice is a no-op
    // rather than an error — a double submit is not worth an error screen.
    expect(allowedInquiryTransitions("withdrawn")).toEqual([]);
    await expect(transitionInquiryByOrganization(db, staff, publicId, "contacted")).rejects.toBeInstanceOf(InvalidStateTransitionError);
    await expect(withdrawInquiry(db, session.walkerId, publicId)).resolves.toBeUndefined();
  });

  it("lists the walker's own history", async () => {
    const { session } = await received();

    const list = await listOwnInquiries(db, session.walkerId);
    expect(list).toHaveLength(1);
    expect(list[0]!.dog.name).toBe("モモ");
  });
});
