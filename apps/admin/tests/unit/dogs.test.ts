// SYS-09 / SYS-10 read paths (F-15-05). The operator's list is cross-shelter by design, which is
// the opposite of every query in apps/public's dogs.ts — so what it must carry is the shelter's
// name next to each row, and the staff-only note on the detail.
import { env } from "cloudflare:workers";
import { dogs, organizations } from "@app/schema";
import { createDb } from "@app/schema/client";
import { ulid } from "@app/schema/ulid";
import { NotFoundError } from "@app/server-kit/http";
import { beforeEach, describe, expect, it } from "vitest";
import { getDogByPublicId, listDogs } from "../../src/lib/server/services/dogs";

const db = createDb(env.DB);

async function insertOrganization(name: string) {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(organizations)
    .values({ publicId: ulid(), name, slug: `org-${ulid().toLowerCase()}`, representativeName: "代表", addressVisibility: "prefecture_only", status: "approved", updatedAt: now })
    .returning();
  return row!;
}

async function insertDog(organizationId: number, name: string, overrides: Partial<typeof dogs.$inferInsert> = {}) {
  const publicId = ulid();
  const now = new Date().toISOString();
  const [row] = await db
    .insert(dogs)
    .values({ publicId, organizationId, slug: `dog-${publicId.toLowerCase()}`, name, requiredExperience: "none", adoptionStatus: "listed", internalNotes: "投薬中。", updatedAt: now, ...overrides })
    .returning();
  return row!;
}

beforeEach(async () => {
  await db.delete(dogs);
  await db.delete(organizations);
});

describe("listDogs (SYS-09)", () => {
  it("spans every shelter, newest first, and names the one each dog belongs to", async () => {
    const north = await insertOrganization("きた保護犬ネットワーク");
    const south = await insertOrganization("みなみ保護犬の会");
    await insertDog(north.id, "ハナ");
    await insertDog(south.id, "モモ");

    const { items } = await listDogs(db);

    expect(items.map((dog) => [dog.name, dog.organizationName])).toEqual([
      ["モモ", "みなみ保護犬の会"],
      ["ハナ", "きた保護犬ネットワーク"],
    ]);
  });

  it("includes unpublished dogs — the public list is the one that filters", async () => {
    const organization = await insertOrganization("きた保護犬ネットワーク");
    await insertDog(organization.id, "非公開の子", { isPublished: 0 });

    const { items } = await listDogs(db);
    expect(items).toHaveLength(1);
    expect(items[0]!.isPublished).toBe(0);
  });
});

describe("getDogByPublicId (SYS-10)", () => {
  it("carries the staff-only note, which is why this screen exists", async () => {
    const organization = await insertOrganization("きた保護犬ネットワーク");
    const dog = await insertDog(organization.id, "ハナ");

    await expect(getDogByPublicId(db, dog.publicId)).resolves.toMatchObject({ name: "ハナ", organizationName: "きた保護犬ネットワーク", internalNotes: "投薬中。" });
  });

  it("answers not found for an unknown public id", async () => {
    await expect(getDogByPublicId(db, ulid())).rejects.toBeInstanceOf(NotFoundError);
  });
});
