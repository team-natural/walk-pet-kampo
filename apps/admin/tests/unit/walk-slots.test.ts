// SYS-11 / SYS-12 read paths (F-15-06). Cross-shelter by design, and ordered by when the walk
// happens rather than when the row was written — this console is about what is coming up.
import { env } from "cloudflare:workers";
import { organizations, walkSlots } from "@app/schema";
import { createDb } from "@app/schema/client";
import { ulid } from "@app/schema/ulid";
import { NotFoundError } from "@app/server-kit/http";
import { beforeEach, describe, expect, it } from "vitest";
import { getWalkSlotByPublicId, listWalkSlots } from "../../src/lib/server/services/walk-slots";

const db = createDb(env.DB);

async function insertOrganization(name: string) {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(organizations)
    .values({ publicId: ulid(), name, slug: `org-${ulid().toLowerCase()}`, representativeName: "代表", addressVisibility: "prefecture_only", status: "approved", updatedAt: now })
    .returning();
  return row!;
}

async function insertWalkSlot(organizationId: number, title: string, startAt: string, overrides: Partial<typeof walkSlots.$inferInsert> = {}) {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(walkSlots)
    .values({ publicId: ulid(), organizationId, title, startAt, acceptanceStartAt: now, acceptanceEndAt: startAt, durationMinutes: 60, meetingPlace: "赤羽駅", areaPrefecture: "東京都", areaCity: "北区", capacity: 4, requiredExperience: "none", status: "open", updatedAt: now, ...overrides })
    .returning();
  return row!;
}

beforeEach(async () => {
  await db.delete(walkSlots);
  await db.delete(organizations);
});

describe("listWalkSlots (SYS-11)", () => {
  it("spans every shelter, soonest first, and names the one running each walk", async () => {
    const north = await insertOrganization("きた保護犬ネットワーク");
    const south = await insertOrganization("みなみ保護犬の会");
    await insertWalkSlot(north.id, "来月のさんぽ", "2026-11-03T00:00:00.000Z");
    await insertWalkSlot(south.id, "今月のさんぽ", "2026-10-03T00:00:00.000Z");

    const { items } = await listWalkSlots(db);

    expect(items.map((slot) => [slot.title, slot.organizationName])).toEqual([
      ["今月のさんぽ", "みなみ保護犬の会"],
      ["来月のさんぽ", "きた保護犬ネットワーク"],
    ]);
  });

  it("includes drafts — the public list is the one that filters", async () => {
    const organization = await insertOrganization("きた保護犬ネットワーク");
    await insertWalkSlot(organization.id, "下書き", "2026-10-03T00:00:00.000Z", { status: "draft" });

    const { items } = await listWalkSlots(db);
    expect(items).toHaveLength(1);
    expect(items[0]!.status).toBe("draft");
  });
});

describe("getWalkSlotByPublicId (SYS-12)", () => {
  it("carries the operational columns the detail screen renders", async () => {
    const organization = await insertOrganization("きた保護犬ネットワーク");
    const slot = await insertWalkSlot(organization.id, "朝のさんぽ", "2026-10-03T00:00:00.000Z", { reservedCount: 2, minAge: 18 });

    await expect(getWalkSlotByPublicId(db, slot.publicId)).resolves.toMatchObject({ title: "朝のさんぽ", organizationName: "きた保護犬ネットワーク", reservedCount: 2, minAge: 18, meetingPlace: "赤羽駅" });
  });

  it("answers not found for an unknown public id", async () => {
    await expect(getWalkSlotByPublicId(db, ulid())).rejects.toBeInstanceOf(NotFoundError);
  });
});
