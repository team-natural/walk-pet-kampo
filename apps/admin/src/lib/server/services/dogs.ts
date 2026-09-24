// SYS-09 / SYS-10 (F-15-05). Read-only on this side: the dog belongs to a shelter, and every
// write goes through apps/public's Service so one transition function owns `adoption_status`
// (DEV-09 §3-1). The operator's write path is the RPC that arrives with P14 (GOV-02 TBD-58).
import { dogs, organizations } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { NotFoundError } from "@app/server-kit/http";
import { desc, eq, lt } from "drizzle-orm";
import type { DogDetail, DogSummary } from "../../view-models/dog";

type DogRow = typeof dogs.$inferSelect;

function toSummary(row: DogRow, organizationName: string): DogSummary {
  return { id: row.publicId, organizationName, slug: row.slug, name: row.name, breed: row.breed, size: row.size, adoptionStatus: row.adoptionStatus, walkEligible: row.walkEligible, isPublished: row.isPublished };
}

const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;

export async function listDogs(db: DbClient, options: { beforeId?: number | null; perPage?: number } = {}) {
  const perPage = Math.min(Math.max(options.perPage ?? DEFAULT_PER_PAGE, 1), MAX_PER_PAGE);
  const rows = await db
    .select({ dog: dogs, organizationName: organizations.name })
    .from(dogs)
    .innerJoin(organizations, eq(dogs.organizationId, organizations.id))
    .where(options.beforeId ? lt(dogs.id, options.beforeId) : undefined)
    .orderBy(desc(dogs.id))
    .limit(perPage + 1);

  const hasMore = rows.length > perPage;
  const page = rows.slice(0, perPage);
  return { items: page.map((row) => toSummary(row.dog, row.organizationName)), perPage, nextId: hasMore ? page[page.length - 1]!.dog.id : null };
}

export async function getDogByPublicId(db: DbClient, publicId: string): Promise<DogDetail> {
  const [row] = await db.select({ dog: dogs, organizationName: organizations.name }).from(dogs).innerJoin(organizations, eq(dogs.organizationId, organizations.id)).where(eq(dogs.publicId, publicId)).limit(1);

  if (!row) throw new NotFoundError("保護犬が見つかりません。");

  return {
    ...toSummary(row.dog, row.organizationName),
    gender: row.dog.gender,
    weight: row.dog.weight,
    estimatedAge: row.dog.estimatedAge,
    temperament: row.dog.temperament,
    humanSociability: row.dog.humanSociability,
    dogSociability: row.dog.dogSociability,
    walkNotes: row.dog.walkNotes,
    requiredExperience: row.dog.requiredExperience,
    beginnerAllowed: row.dog.beginnerAllowed,
    childAllowed: row.dog.childAllowed,
    multiDogAllowed: row.dog.multiDogAllowed,
    introduction: row.dog.introduction,
    photoKey: row.dog.photoKey,
    // The operator console is the one place this column is rendered outside the owning shelter
    // (view-models/dog.ts) — it carries the health and bite history SYS-10 exists to check.
    internalNotes: row.dog.internalNotes,
    updatedAt: row.dog.updatedAt,
  };
}
