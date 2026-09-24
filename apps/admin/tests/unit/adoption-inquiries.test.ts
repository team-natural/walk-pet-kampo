// SYS-21 / SYS-22 read paths (F-15-11). The operator watches every shelter's enquiries at once
// and changes none of them — the transfer is each shelter's own process (PRD-01 §1-0).
import { env } from "cloudflare:workers";
import { adoptionInquiries, dogs, organizations, walkerProfiles, walkers } from "@app/schema";
import { createDb } from "@app/schema/client";
import { ulid } from "@app/schema/ulid";
import { NotFoundError } from "@app/server-kit/http";
import { beforeEach, describe, expect, it } from "vitest";
import { getAdoptionInquiryByPublicId, listAdoptionInquiries } from "../../src/lib/server/services/adoption-inquiries";

const db = createDb(env.DB);

async function insertOrganization(name: string) {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(organizations)
    .values({ publicId: ulid(), name, slug: `org-${ulid().toLowerCase()}`, representativeName: "代表", addressVisibility: "prefecture_only", status: "approved", updatedAt: now })
    .returning();
  return row!;
}

async function insertInquiry(organizationId: number, dogName: string, walkerName: string) {
  const now = new Date().toISOString();
  const publicId = ulid();
  const [dog] = await db
    .insert(dogs)
    .values({ publicId: ulid(), organizationId, slug: `dog-${ulid().toLowerCase()}`, name: dogName, requiredExperience: "none", adoptionStatus: "listed", isPublished: 1, updatedAt: now })
    .returning();
  const [walker] = await db
    .insert(walkers)
    .values({ publicId: ulid(), name: walkerName, email: `walker-${ulid().toLowerCase()}@example.test`, passwordHash: "x", status: "active", updatedAt: now })
    .returning();

  const [row] = await db.insert(adoptionInquiries).values({ publicId, dogId: dog!.id, organizationId, walkerId: walker!.id, motivation: "家族に迎えたいです。", livingEnvironment: "戸建て・庭あり", status: "received", updatedAt: now }).returning();
  return row!;
}

beforeEach(async () => {
  await db.delete(adoptionInquiries);
  await db.delete(dogs);
  await db.delete(walkerProfiles);
  await db.delete(walkers);
  await db.delete(organizations);
});

describe("listAdoptionInquiries (SYS-21)", () => {
  it("spans every shelter, newest first, with the three names the list renders", async () => {
    const north = await insertOrganization("きた保護犬ネットワーク");
    const south = await insertOrganization("みなみ保護犬の会");
    await insertInquiry(north.id, "ハナ", "山田 太郎");
    await insertInquiry(south.id, "モモ", "鈴木 花子");

    const { items } = await listAdoptionInquiries(db);

    expect(items.map((item) => [item.dogName, item.walkerName, item.organizationName])).toEqual([
      ["モモ", "鈴木 花子", "みなみ保護犬の会"],
      ["ハナ", "山田 太郎", "きた保護犬ネットワーク"],
    ]);
  });
});

describe("getAdoptionInquiryByPublicId (SYS-22)", () => {
  it("carries the enquiry text the operator reads when a complaint arrives", async () => {
    const organization = await insertOrganization("きた保護犬ネットワーク");
    const inquiry = await insertInquiry(organization.id, "ハナ", "山田 太郎");

    await expect(getAdoptionInquiryByPublicId(db, inquiry.publicId)).resolves.toMatchObject({ dogName: "ハナ", walkerName: "山田 太郎", motivation: "家族に迎えたいです。", status: "received" });
  });

  it("answers not found for an unknown public id", async () => {
    await expect(getAdoptionInquiryByPublicId(db, ulid())).rejects.toBeInstanceOf(NotFoundError);
  });
});
