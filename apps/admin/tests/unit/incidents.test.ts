// SYS-19 / SYS-20 read paths (F-15-10). The operator's list spans every shelter and resolves the
// polymorphic reporter (DEV-07 §5-15) — the two things a page must never do for itself.
import { env } from "cloudflare:workers";
import { dogs, incidents, organizationMembers, organizations, walkers } from "@app/schema";
import { createDb } from "@app/schema/client";
import { ulid } from "@app/schema/ulid";
import { NotFoundError } from "@app/server-kit/http";
import { beforeEach, describe, expect, it } from "vitest";
import { getIncidentByPublicId, listIncidents } from "../../src/lib/server/services/incidents";

const db = createDb(env.DB);

async function insertOrganization(name: string) {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(organizations)
    .values({ publicId: ulid(), name, slug: `org-${ulid().toLowerCase()}`, representativeName: "代表", addressVisibility: "prefecture_only", status: "approved", updatedAt: now })
    .returning();
  return row!;
}

async function insertMember(organizationId: number, name: string) {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(organizationMembers)
    .values({ organizationId, role: "org_staff", name, email: `member-${ulid().toLowerCase()}@example.test`, passwordHash: "x", status: "active", joinedAt: now, updatedAt: now })
    .returning();
  return row!;
}

async function insertIncident(organizationId: number, reportedById: number, overrides: Partial<typeof incidents.$inferInsert> = {}) {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(incidents)
    .values({ publicId: ulid(), organizationId, severity: "P2", category: "dog_condition", description: "足を引きずる様子がありました。", occurredAt: now, reportedByType: "organization_member", reportedById, status: "reported", updatedAt: now, ...overrides })
    .returning();
  return row!;
}

beforeEach(async () => {
  await db.delete(incidents);
  await db.delete(dogs);
  await db.delete(walkers);
  await db.delete(organizationMembers);
  await db.delete(organizations);
});

describe("listIncidents (SYS-19)", () => {
  it("spans every shelter, newest first, and names the reporter", async () => {
    const north = await insertOrganization("きた保護犬ネットワーク");
    const south = await insertOrganization("みなみ保護犬の会");
    const northStaff = await insertMember(north.id, "北川 一郎");
    const southStaff = await insertMember(south.id, "南田 二郎");
    await insertIncident(north.id, northStaff.id);
    await insertIncident(south.id, southStaff.id, { severity: "P0", category: "bite" });

    const { items } = await listIncidents(db);

    expect(items.map((item) => [item.organizationName, item.reportedByName, item.severity])).toEqual([
      ["みなみ保護犬の会", "南田 二郎", "P0"],
      ["きた保護犬ネットワーク", "北川 一郎", "P2"],
    ]);
  });

  it("can narrow to the ones still needing someone", async () => {
    const organization = await insertOrganization("きた保護犬ネットワーク");
    const staff = await insertMember(organization.id, "北川 一郎");
    await insertIncident(organization.id, staff.id);
    await insertIncident(organization.id, staff.id, { status: "closed" });

    const open = await listIncidents(db, { openOnly: true });
    expect(open.items).toHaveLength(1);
    expect(open.items[0]!.status).toBe("reported");

    await expect(listIncidents(db)).resolves.toMatchObject({ items: expect.objectContaining({ length: 2 }) });
  });
});

describe("getIncidentByPublicId (SYS-20)", () => {
  it("carries the people involved when the report names them", async () => {
    const organization = await insertOrganization("きた保護犬ネットワーク");
    const staff = await insertMember(organization.id, "北川 一郎");
    const now = new Date().toISOString();
    const [dog] = await db
      .insert(dogs)
      .values({ publicId: ulid(), organizationId: organization.id, slug: `dog-${ulid().toLowerCase()}`, name: "モモ", requiredExperience: "none", adoptionStatus: "listed", updatedAt: now })
      .returning();
    const [walker] = await db
      .insert(walkers)
      .values({ publicId: ulid(), name: "山田 太郎", email: `walker-${ulid().toLowerCase()}@example.test`, passwordHash: "x", status: "active", updatedAt: now })
      .returning();

    const incident = await insertIncident(organization.id, staff.id, { dogId: dog!.id, walkerId: walker!.id });

    await expect(getIncidentByPublicId(db, incident.publicId)).resolves.toMatchObject({ organizationName: "きた保護犬ネットワーク", reportedByName: "北川 一郎", dogName: "モモ", walkerName: "山田 太郎" });
  });

  it("leaves them null when it names neither", async () => {
    const organization = await insertOrganization("きた保護犬ネットワーク");
    const staff = await insertMember(organization.id, "北川 一郎");
    const incident = await insertIncident(organization.id, staff.id);

    await expect(getIncidentByPublicId(db, incident.publicId)).resolves.toMatchObject({ dogName: null, walkerName: null });
  });

  it("answers not found for an unknown public id", async () => {
    await expect(getIncidentByPublicId(db, ulid())).rejects.toBeInstanceOf(NotFoundError);
  });
});
