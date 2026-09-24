// Dog (FG-05, F-07-02). Both audiences read this table: the shelter console sees every column,
// the public site sees a narrowed view model that cannot carry `internalNotes` (PRD-04 §4-3).
import { adoptionInquiries, dogs, incidents, organizations, walkSlotDogs } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { ulid } from "@app/schema/ulid";
import { InvalidStateTransitionError, NotFoundError, ValidationError } from "@app/server-kit/http";
import { and, desc, eq, like, or } from "drizzle-orm";
import type { DogDetail, DogSummary, OwnDogDetail } from "../../view-models/dog";
import type { OrganizationSession } from "../auth/organization-session";
import { activityLogInsert, organizationMemberActor } from "./activity-log";
import { deleteUpload, putUpload } from "./uploads";

type DogRow = typeof dogs.$inferSelect;
export type AdoptionStatus = DogRow["adoptionStatus"];

// DEV-09 §2-5-2, transcribed. `adopted` and `listing_closed` are terminal, and `not_listed` is
// only ever left for `listed` — a dog nobody is looking for cannot go straight to adopted.
const TRANSITIONS: Record<AdoptionStatus, AdoptionStatus[]> = {
  not_listed: ["listed"],
  listed: ["in_consultation", "listing_closed"],
  in_consultation: ["listed", "in_trial", "listing_closed"],
  in_trial: ["listed", "adopted", "listing_closed"],
  adopted: [],
  listing_closed: [],
};

export function allowedAdoptionTransitions(status: AdoptionStatus): AdoptionStatus[] {
  return TRANSITIONS[status] ?? [];
}

function toSummary(row: DogRow): DogSummary {
  return { id: row.publicId, slug: row.slug, name: row.name, breed: row.breed, size: row.size, gender: row.gender, estimatedAge: row.estimatedAge, adoptionStatus: row.adoptionStatus, photoKey: row.photoKey, walkEligible: row.walkEligible };
}

function toDetail(row: DogRow): DogDetail {
  return {
    ...toSummary(row),
    weight: row.weight,
    temperament: row.temperament,
    humanSociability: row.humanSociability,
    dogSociability: row.dogSociability,
    walkNotes: row.walkNotes,
    requiredExperience: row.requiredExperience,
    beginnerAllowed: row.beginnerAllowed,
    childAllowed: row.childAllowed,
    multiDogAllowed: row.multiDogAllowed,
    introduction: row.introduction,
  };
}

// The shelter's own view, which is the only one that may carry the staff-only columns.
function toOwnDetail(row: DogRow): OwnDogDetail {
  return { ...toDetail(row), internalNotes: row.internalNotes, isPublished: row.isPublished };
}

// ADM-05. Scoped by organizationId like every query in the shelter console (DEV-02 §3).
export async function listOwnDogs(db: DbClient, organizationId: number): Promise<DogSummary[]> {
  const rows = await db.select().from(dogs).where(eq(dogs.organizationId, organizationId)).orderBy(desc(dogs.id));
  return rows.map(toSummary);
}

async function findOwnDogRow(db: DbClient, organizationId: number, publicId: string): Promise<DogRow> {
  const [row] = await db
    .select()
    .from(dogs)
    .where(and(eq(dogs.organizationId, organizationId), eq(dogs.publicId, publicId)))
    .limit(1);
  if (!row) throw new NotFoundError("保護犬が見つかりません。");
  return row;
}

// ADM-07. The tenant predicate is part of the lookup, not a check after it: another shelter's
// public id must read as "not found", never as a row the caller may then act on.
export async function getOwnDog(db: DbClient, organizationId: number, publicId: string): Promise<OwnDogDetail> {
  return toOwnDetail(await findOwnDogRow(db, organizationId, publicId));
}

export interface DogInput {
  name: string;
  breed: string | null;
  size: DogRow["size"];
  gender: string | null;
  estimatedAge: string | null;
  weight: number | null;
  temperament: string | null;
  humanSociability: string | null;
  dogSociability: string | null;
  walkNotes: string | null;
  requiredExperience: DogRow["requiredExperience"];
  beginnerAllowed: number;
  childAllowed: number;
  multiDogAllowed: number;
  walkEligible: number;
  introduction: string | null;
  internalNotes: string | null;
}

// F-05-02. A new dog starts unlisted and unpublished: the shelter fills the profile in, then
// publishes deliberately. `adoptionStatus` is never taken from the form — transitionDog() owns it.
export async function createDog(db: DbClient, session: OrganizationSession, input: DogInput): Promise<{ publicId: string; dogId: number }> {
  const publicId = ulid();
  const now = new Date().toISOString();

  const [row] = await db
    .insert(dogs)
    .values({ ...input, publicId, organizationId: session.organizationId, slug: `dog-${publicId.toLowerCase()}`, adoptionStatus: "not_listed", isPublished: 0, updatedAt: now })
    .returning();

  // Logged after the insert rather than beside it: the entry names the row, and the row has no
  // id until it exists.
  await db.batch([
    activityLogInsert(db, {
      logName: "dog",
      description: `Dog created (${input.name})`,
      subjectType: "Dog",
      subjectId: row!.id,
      event: "dog.created",
      actor: organizationMemberActor(session),
      organizationId: session.organizationId,
    }),
  ]);

  return { publicId, dogId: row!.id };
}

export async function updateDog(db: DbClient, session: OrganizationSession, publicId: string, input: DogInput & { isPublished: number }): Promise<OwnDogDetail> {
  const row = await findOwnDogRow(db, session.organizationId, publicId);

  const [updated] = await db
    .update(dogs)
    .set({ ...input, updatedAt: new Date().toISOString() })
    .where(eq(dogs.id, row.id))
    .returning();

  return toOwnDetail(updated!);
}

// Bucket first, row second: the key is stored only once the bytes are there, so a dog never
// points at an object that does not exist (DEV-05 §12).
export async function attachDogPhoto(db: DbClient, bucket: R2Bucket, session: OrganizationSession, publicId: string, file: File): Promise<void> {
  const row = await findOwnDogRow(db, session.organizationId, publicId);
  const stored = await putUpload(bucket, "dogPhoto", { organizationId: session.organizationId, subjectId: row.id }, file);
  await db.update(dogs).set({ photoKey: stored.key, updatedAt: new Date().toISOString() }).where(eq(dogs.id, row.id));
}

// F-05-03. The only writer of `adoption_status`, and the log row rides in the same batch as the
// change (DEV-05 §3) so the trail cannot outlive a rolled-back write.
export async function transitionDog(db: DbClient, session: OrganizationSession, publicId: string, to: AdoptionStatus): Promise<void> {
  const row = await findOwnDogRow(db, session.organizationId, publicId);
  const from = row.adoptionStatus;
  if (from === to) return;
  if (!allowedAdoptionTransitions(from).includes(to)) throw new InvalidStateTransitionError("Dog", from, to);

  const now = new Date().toISOString();
  await db.batch([
    db.update(dogs).set({ adoptionStatus: to, updatedAt: now }).where(eq(dogs.id, row.id)),
    activityLogInsert(db, {
      logName: "dog",
      description: `Dog ${from} -> ${to}`,
      subjectType: "Dog",
      subjectId: row.id,
      event: `dog.${to}`,
      actor: organizationMemberActor(session),
      organizationId: session.organizationId,
      properties: { from, to },
    }),
  ]);
}

// F-05-04. Hard delete, because DEV-07 §1 rules out a deleted flag — which is why it only applies
// to a dog nothing points at yet. Anything with a history is unpublished and closed instead, and
// those three foreign keys are what "has a history" means.
export async function deleteDog(db: DbClient, bucket: R2Bucket, session: OrganizationSession, publicId: string): Promise<void> {
  const row = await findOwnDogRow(db, session.organizationId, publicId);

  const [slot] = await db.select({ id: walkSlotDogs.id }).from(walkSlotDogs).where(eq(walkSlotDogs.dogId, row.id)).limit(1);
  const [inquiry] = await db.select({ id: adoptionInquiries.id }).from(adoptionInquiries).where(eq(adoptionInquiries.dogId, row.id)).limit(1);
  const [incident] = await db.select({ id: incidents.id }).from(incidents).where(eq(incidents.dogId, row.id)).limit(1);

  if (slot || inquiry || incident) {
    throw new ValidationError({ dog: ["おさんぽ募集や里親相談の記録があるため削除できません。非公開にしてください。"] });
  }

  await db.batch([
    db.delete(dogs).where(eq(dogs.id, row.id)),
    activityLogInsert(db, {
      logName: "dog",
      description: `Dog deleted (${row.name})`,
      subjectType: "Dog",
      subjectId: row.id,
      event: "dog.deleted",
      actor: organizationMemberActor(session),
      organizationId: session.organizationId,
    }),
  ]);

  // Row first, object second — the reverse of the create path. A deleted row with its bytes still
  // in the bucket costs storage; a live row pointing at deleted bytes breaks the page.
  if (row.photoKey) await deleteUpload(bucket, row.photoKey);
}

// SCR-04 / SCR-05. Published dogs of approved shelters only — a shelter that is suspended or has
// withdrawn keeps its rows, and this join is what keeps them off the public site.
const PUBLIC_DOG_WHERE = and(eq(dogs.isPublished, 1), eq(organizations.status, "approved"));

export interface DogFilters {
  /** F-07-02's one box: the name, the breed, or the shelter behind the dog. */
  keyword?: string | null;
  /** Only the dogs a visitor could actually book a walk with (F-05-03). */
  walkEligibleOnly?: boolean;
}

export async function listPublishedDogs(db: DbClient, filters: DogFilters = {}, limit = 60): Promise<DogSummary[]> {
  const conditions = [PUBLIC_DOG_WHERE];

  if (filters.keyword) {
    const pattern = `%${filters.keyword}%`;
    conditions.push(or(like(dogs.name, pattern), like(dogs.breed, pattern), like(organizations.name, pattern))!);
  }

  if (filters.walkEligibleOnly) conditions.push(eq(dogs.walkEligible, 1));

  const rows = await db
    .select({ dog: dogs })
    .from(dogs)
    .innerJoin(organizations, eq(dogs.organizationId, organizations.id))
    .where(and(...conditions))
    .orderBy(desc(dogs.id))
    .limit(limit);

  return rows.map((row) => toSummary(row.dog));
}

export interface PublicDogDetail extends DogDetail {
  organizationName: string;
  organizationSlug: string;
}

export async function getPublishedDogBySlug(db: DbClient, slug: string): Promise<PublicDogDetail> {
  const [row] = await db
    .select({ dog: dogs, organizationName: organizations.name, organizationSlug: organizations.slug })
    .from(dogs)
    .innerJoin(organizations, eq(dogs.organizationId, organizations.id))
    .where(and(eq(dogs.slug, slug), PUBLIC_DOG_WHERE))
    .limit(1);

  if (!row) throw new NotFoundError("保護犬が見つかりません。");
  return { ...toDetail(row.dog), organizationName: row.organizationName, organizationSlug: row.organizationSlug };
}
