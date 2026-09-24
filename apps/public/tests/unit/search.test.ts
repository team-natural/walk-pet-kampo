// FG-07's search half. The distance query is the part worth pinning: it runs as SQL inside D1
// (GOV-01 D-009), so a missing math function or a bad bind would only show up here.
import { env } from "cloudflare:workers";
import { dogs, organizations, walkSlots } from "@app/schema";
import { createDb } from "@app/schema/client";
import { ulid } from "@app/schema/ulid";
import { NotFoundError } from "@app/server-kit/http";
import { beforeEach, describe, expect, it } from "vitest";
import { listPublishedDogs } from "../../src/lib/server/services/dogs";
import { getPublicOrganizationBySlug, listPublicOrganizations, publicAddress } from "../../src/lib/server/services/organization-catalog";
import { searchWalkSlots } from "../../src/lib/server/services/walk-slots";

const db = createDb(env.DB);

// Two points about 9 km apart, both in north Tokyo.
const AKABANE = { latitude: 35.7836, longitude: 139.7229 };
const ITABASHI = { latitude: 35.7075, longitude: 139.709 };

async function insertOrganization(name: string, overrides: Partial<typeof organizations.$inferInsert> = {}) {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(organizations)
    .values({ publicId: ulid(), name, slug: `org-${ulid().toLowerCase()}`, representativeName: "代表", addressVisibility: "prefecture_only", status: "approved", updatedAt: now, ...overrides })
    .returning();
  return row!;
}

async function insertWalkSlot(organizationId: number, title: string, overrides: Partial<typeof walkSlots.$inferInsert> = {}) {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(walkSlots)
    .values({ publicId: ulid(), organizationId, title, startAt: "2026-10-03T00:00:00.000Z", acceptanceStartAt: now, acceptanceEndAt: "2026-10-01T00:00:00.000Z", durationMinutes: 60, meetingPlace: "赤羽岩淵駅", areaPrefecture: "東京都", areaCity: "北区", capacity: 4, requiredExperience: "none", status: "open", updatedAt: now, ...overrides })
    .returning();
  return row!;
}

async function insertDog(organizationId: number, name: string, overrides: Partial<typeof dogs.$inferInsert> = {}) {
  const publicId = ulid();
  const now = new Date().toISOString();
  const [row] = await db
    .insert(dogs)
    .values({ publicId, organizationId, slug: `dog-${publicId.toLowerCase()}`, name, requiredExperience: "none", adoptionStatus: "listed", isPublished: 1, updatedAt: now, ...overrides })
    .returning();
  return row!;
}

beforeEach(async () => {
  await db.delete(walkSlots);
  await db.delete(dogs);
  await db.delete(organizations);
});

describe("distance search (F-07-04, GOV-01 D-009)", () => {
  it("measures from the given point, orders by it, and honours the radius", async () => {
    const organization = await insertOrganization("きた保護犬ネットワーク");
    await insertWalkSlot(organization.id, "近いさんぽ", { ...AKABANE });
    await insertWalkSlot(organization.id, "遠いさんぽ", { ...ITABASHI });

    const all = await searchWalkSlots(db, { ...AKABANE, radiusKm: 50 });
    expect(all.map((slot) => slot.title)).toEqual(["近いさんぽ", "遠いさんぽ"]);
    // Standing on the meeting place: acos() must not tip over 1 and return NaN.
    expect(all[0]!.distanceKm).toBeCloseTo(0, 5);
    expect(all[1]!.distanceKm).toBeGreaterThan(8);

    const near = await searchWalkSlots(db, { ...AKABANE, radiusKm: 3 });
    expect(near.map((slot) => slot.title)).toEqual(["近いさんぽ"]);
  });

  it("skips slots that have no coordinates yet", async () => {
    const organization = await insertOrganization("きた保護犬ネットワーク");
    await insertWalkSlot(organization.id, "座標なし");

    await expect(searchWalkSlots(db, { ...AKABANE, radiusKm: 50 })).resolves.toHaveLength(0);
    // Without a point the same slot is found — the coordinates only gate the distance search.
    await expect(searchWalkSlots(db, {})).resolves.toHaveLength(1);
  });

  it("reports no distance when the search carried no point", async () => {
    const organization = await insertOrganization("きた保護犬ネットワーク");
    await insertWalkSlot(organization.id, "ふつうの検索", { ...AKABANE });

    const [slot] = await searchWalkSlots(db, {});
    expect(slot!.distanceKm).toBeNull();
  });
});

describe("walk filters (F-07-03)", () => {
  it("narrows by the beginner condition", async () => {
    const organization = await insertOrganization("きた保護犬ネットワーク");
    await insertWalkSlot(organization.id, "初心者歓迎", { beginnerAllowed: 1 });
    await insertWalkSlot(organization.id, "経験者向け", { beginnerAllowed: 0 });

    const beginner = await searchWalkSlots(db, { beginnerOnly: true });
    expect(beginner.map((slot) => slot.title)).toEqual(["初心者歓迎"]);
  });

  it("narrows by the shelter", async () => {
    const north = await insertOrganization("きた保護犬ネットワーク");
    const south = await insertOrganization("みなみ保護犬の会");
    await insertWalkSlot(north.id, "きたのさんぽ");
    await insertWalkSlot(south.id, "みなみのさんぽ");

    const mine = await searchWalkSlots(db, { organizationSlug: north.slug });
    expect(mine.map((slot) => slot.title)).toEqual(["きたのさんぽ"]);
  });
});

describe("the shelter catalogue (F-07-01)", () => {
  it("lists approved shelters only, and matches name or activity area", async () => {
    await insertOrganization("きた保護犬ネットワーク", { activityArea: "東京都北区" });
    await insertOrganization("みなみ保護犬の会", { activityArea: "大阪府" });
    await insertOrganization("審査中の団体", { status: "pending_review", activityArea: "東京都北区" });

    await expect(listPublicOrganizations(db)).resolves.toHaveLength(2);
    await expect(listPublicOrganizations(db, { area: "北区" })).resolves.toHaveLength(1);
    await expect(listPublicOrganizations(db, { area: "みなみ" })).resolves.toHaveLength(1);
  });

  it("assembles the shelter page from its published dogs and open walks", async () => {
    const organization = await insertOrganization("きた保護犬ネットワーク");
    await insertDog(organization.id, "ハナ");
    await insertDog(organization.id, "非公開の子", { isPublished: 0 });
    await insertWalkSlot(organization.id, "募集中");
    await insertWalkSlot(organization.id, "下書き", { status: "draft" });

    const page = await getPublicOrganizationBySlug(db, organization.slug);

    expect(page.dogs.map((dog) => dog.name)).toEqual(["ハナ"]);
    expect(page.walkSlots.map((slot) => slot.title)).toEqual(["募集中"]);
    expect(page.walkSlots[0]!.remainingCapacity).toBe(4);
  });

  it("answers 404 for a shelter nobody approved", async () => {
    const pending = await insertOrganization("審査中の団体", { status: "pending_review" });

    await expect(getPublicOrganizationBySlug(db, pending.slug)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("the public address (DEV-07 §5-4)", () => {
  it("shows only as much of the address as the shelter allowed", () => {
    const address = "東京都北区赤羽1-1-1 サンプルビル 2F";

    expect(publicAddress(address, "prefecture_only")).toBe("東京都");
    expect(publicAddress(address, "city_only")).toBe("東京都北区");
    expect(publicAddress(address, "reservation_confirmed_only")).toBeNull();
    expect(publicAddress(null, "city_only")).toBeNull();
  });

  it("keeps the county in a rural address at the city level", () => {
    expect(publicAddress("北海道河東郡音更町大通1-1", "city_only")).toBe("北海道河東郡音更町");
    expect(publicAddress("北海道河東郡音更町大通1-1", "prefecture_only")).toBe("北海道");
  });

  it("never leaks the street address through the shelter page", async () => {
    const organization = await insertOrganization("きた保護犬ネットワーク", { address: "東京都北区赤羽1-1-1", addressVisibility: "city_only" });

    const page = await getPublicOrganizationBySlug(db, organization.slug);

    expect(page.organization.publicAddress).toBe("東京都北区");
    expect(page.organization.address).toBeNull();
  });
});

describe("dog search (F-07-02)", () => {
  it("matches the name, the breed or the shelter, and can keep to walkable dogs", async () => {
    const organization = await insertOrganization("きた保護犬ネットワーク");
    await insertDog(organization.id, "ハナ", { breed: "柴犬ミックス" });
    await insertDog(organization.id, "モモ", { breed: "トイプードル", walkEligible: 0 });

    await expect(listPublishedDogs(db, { keyword: "柴犬" })).resolves.toHaveLength(1);
    await expect(listPublishedDogs(db, { keyword: "きた保護犬" })).resolves.toHaveLength(2);
    await expect(listPublishedDogs(db, { keyword: "モモ" })).resolves.toHaveLength(1);
    await expect(listPublishedDogs(db, { walkEligibleOnly: true })).resolves.toHaveLength(1);
  });
});
