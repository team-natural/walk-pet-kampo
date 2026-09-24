// WalkSlot (FG-06, F-07-03〜05). The shelter owns the slot; the public site reads the ones that
// are actually open to book. One transition function writes `status`, as everywhere else.
import { dogs, organizations, reservations, walkSlotDogs, walkSlots } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { ulid } from "@app/schema/ulid";
import { InvalidStateTransitionError, NotFoundError, ValidationError } from "@app/server-kit/http";
import { and, asc, desc, eq, gte, inArray, like, lt, or, sql } from "drizzle-orm";
import type { DogSummary } from "../../view-models/dog";
import type { OrganizationSummary } from "../../view-models/organization";
import type { WalkSlotDetail, WalkSlotSummary } from "../../view-models/walk-slot";
import type { OrganizationSession } from "../auth/organization-session";
import { activityLogInsert, organizationMemberActor } from "./activity-log";

type WalkSlotRow = typeof walkSlots.$inferSelect;
export type WalkSlotStatus = WalkSlotRow["status"];

// DEV-09 §2-6-2, transcribed. `cancelled` and `completed` are terminal; `closed → completed` is
// the only way into completed, and it needs a WalkRecord (P15) behind it.
const TRANSITIONS: Record<WalkSlotStatus, WalkSlotStatus[]> = {
  draft: ["scheduled", "open", "unpublished"],
  scheduled: ["open", "cancelled", "unpublished"],
  open: ["full", "closed", "cancelled", "unpublished"],
  full: ["open", "closed", "cancelled", "unpublished"],
  closed: ["cancelled", "completed"],
  cancelled: [],
  completed: [],
  unpublished: ["draft", "scheduled"],
};

export function allowedWalkSlotTransitions(status: WalkSlotStatus): WalkSlotStatus[] {
  return TRANSITIONS[status] ?? [];
}

// A seat is taken by anything that has not been cancelled — plus D-025: an `awaiting_payment` row
// past its deadline is not holding a seat, whether or not the cleanup Cron has run.
const HOLDING_STATES = ["processing", "awaiting_payment", "confirmed", "organization_reviewing", "scheduled", "completed"] as const;

function seatsTaken(walkSlotId: number) {
  return and(eq(reservations.walkSlotId, walkSlotId), inArray(reservations.status, HOLDING_STATES), or(sql`${reservations.status} <> 'awaiting_payment'`, gte(reservations.expiresAt, new Date().toISOString())));
}

export async function countTakenSeats(db: DbClient, walkSlotId: number): Promise<number> {
  const rows = await db.select({ participantCount: reservations.participantCount }).from(reservations).where(seatsTaken(walkSlotId));
  return rows.reduce((total, row) => total + row.participantCount, 0);
}

function toSummary(row: WalkSlotRow, taken: number): WalkSlotSummary {
  return {
    id: row.publicId,
    title: row.title,
    startAt: row.startAt,
    durationMinutes: row.durationMinutes,
    areaPrefecture: row.areaPrefecture,
    areaCity: row.areaCity,
    capacity: row.capacity,
    // Never `capacity - reservedCount`: the stored counter does not know about expired holds
    // (GOV-01 D-025), which is exactly what the screen would get wrong.
    remainingCapacity: Math.max(row.capacity - taken, 0),
    feePerPerson: row.feePerPerson,
    status: row.status,
    beginnerAllowed: row.beginnerAllowed,
  };
}

function toDetail(row: WalkSlotRow, taken: number, organization: OrganizationSummary, slotDogs: DogSummary[]): WalkSlotDetail {
  return {
    ...toSummary(row, taken),
    organization,
    dogs: slotDogs,
    description: row.description,
    meetingPlace: row.meetingPlace,
    latitude: row.latitude,
    longitude: row.longitude,
    acceptanceStartAt: row.acceptanceStartAt,
    acceptanceEndAt: row.acceptanceEndAt,
    staffAccompanied: row.staffAccompanied,
    childAllowed: row.childAllowed,
    minAge: row.minAge,
    requiredExperience: row.requiredExperience,
    clothingNotes: row.clothingNotes,
    precautions: row.precautions,
    weatherPolicy: row.weatherPolicy,
    cancellationPolicy: row.cancellationPolicy,
  };
}

function toOrganizationSummary(row: typeof organizations.$inferSelect): OrganizationSummary {
  return { id: row.publicId, name: row.name, slug: row.slug, status: row.status, activityArea: row.activityArea, protectedDogCount: row.protectedDogCount, logoKey: row.logoKey };
}

function toDogSummary(row: typeof dogs.$inferSelect): DogSummary {
  return { id: row.publicId, slug: row.slug, name: row.name, breed: row.breed, size: row.size, gender: row.gender, estimatedAge: row.estimatedAge, adoptionStatus: row.adoptionStatus, photoKey: row.photoKey, walkEligible: row.walkEligible };
}

async function dogsOfSlot(db: DbClient, walkSlotId: number): Promise<DogSummary[]> {
  const rows = await db.select({ dog: dogs }).from(walkSlotDogs).innerJoin(dogs, eq(walkSlotDogs.dogId, dogs.id)).where(eq(walkSlotDogs.walkSlotId, walkSlotId)).orderBy(asc(dogs.id));
  return rows.map((row) => toDogSummary(row.dog));
}

// ADM-08. Soonest first: the shelter's next walk is the one it is about to run.
export async function listOwnWalkSlots(db: DbClient, organizationId: number): Promise<WalkSlotSummary[]> {
  const rows = await db.select().from(walkSlots).where(eq(walkSlots.organizationId, organizationId)).orderBy(desc(walkSlots.startAt));
  return Promise.all(rows.map(async (row) => toSummary(row, await countTakenSeats(db, row.id))));
}

async function findOwnSlotRow(db: DbClient, organizationId: number, publicId: string): Promise<WalkSlotRow> {
  const [row] = await db
    .select()
    .from(walkSlots)
    .where(and(eq(walkSlots.organizationId, organizationId), eq(walkSlots.publicId, publicId)))
    .limit(1);
  if (!row) throw new NotFoundError("おさんぽ募集が見つかりません。");
  return row;
}

export async function getOwnWalkSlot(db: DbClient, organizationId: number, publicId: string): Promise<WalkSlotDetail> {
  const row = await findOwnSlotRow(db, organizationId, publicId);
  const [organization] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  return toDetail(row, await countTakenSeats(db, row.id), toOrganizationSummary(organization!), await dogsOfSlot(db, row.id));
}

export interface WalkSlotInput {
  title: string;
  description: string | null;
  startAt: string;
  acceptanceStartAt: string;
  acceptanceEndAt: string;
  durationMinutes: number;
  meetingPlace: string;
  areaPrefecture: string;
  areaCity: string | null;
  capacity: number;
  staffAccompanied: number;
  beginnerAllowed: number;
  childAllowed: number;
  minAge: number | null;
  requiredExperience: WalkSlotRow["requiredExperience"];
  clothingNotes: string | null;
  precautions: string | null;
  weatherPolicy: string | null;
  cancellationPolicy: string | null;
}

// F-06-01. The candidate dogs are addressed by public id, resolved here against this shelter and
// `walk_eligible` — a form can be edited, and neither check belongs in the route.
async function resolveDogIds(db: DbClient, organizationId: number, dogPublicIds: string[]): Promise<number[]> {
  if (dogPublicIds.length === 0) return [];

  const rows = await db
    .select({ id: dogs.id })
    .from(dogs)
    .where(and(eq(dogs.organizationId, organizationId), inArray(dogs.publicId, dogPublicIds), eq(dogs.walkEligible, 1)));

  if (rows.length !== dogPublicIds.length) throw new ValidationError({ dogIds: ["選べない保護犬が含まれています。"] });
  return rows.map((row) => row.id);
}

function assertSchedule(input: WalkSlotInput): void {
  if (input.acceptanceEndAt <= input.acceptanceStartAt) throw new ValidationError({ acceptanceEndAt: ["受付終了は受付開始より後にしてください。"] });
  if (input.startAt < input.acceptanceStartAt) throw new ValidationError({ startAt: ["開催日時は受付開始より後にしてください。"] });
}

// Created as a draft, never straight to `open`: publishing is its own transition (F-06-02), and
// DEV-09 §2-6-2 has no edge into `open` that skips it.
export async function createWalkSlot(db: DbClient, session: OrganizationSession, input: WalkSlotInput, dogPublicIds: string[]): Promise<{ publicId: string }> {
  assertSchedule(input);
  const dogIds = await resolveDogIds(db, session.organizationId, dogPublicIds);

  const publicId = ulid();
  const now = new Date().toISOString();
  const [row] = await db
    .insert(walkSlots)
    .values({ ...input, publicId, organizationId: session.organizationId, status: "draft", updatedAt: now })
    .returning();

  // One insert with many rows, not many inserts: db.batch() wants a non-empty tuple and a slot
  // may have no dogs picked yet.
  if (dogIds.length > 0) await db.insert(walkSlotDogs).values(dogIds.map((dogId) => ({ walkSlotId: row!.id, dogId })));

  await db.batch([
    activityLogInsert(db, {
      logName: "walk_slot",
      description: `WalkSlot created (${input.title})`,
      subjectType: "WalkSlot",
      subjectId: row!.id,
      event: "walk_slot.created",
      actor: organizationMemberActor(session),
      organizationId: session.organizationId,
    }),
  ]);

  return { publicId };
}

export async function updateWalkSlot(db: DbClient, session: OrganizationSession, publicId: string, input: WalkSlotInput, dogPublicIds: string[]): Promise<void> {
  const row = await findOwnSlotRow(db, session.organizationId, publicId);
  assertSchedule(input);

  // F-06-04: the capacity may move, but not below the seats already held — that would leave a
  // participant booked into a walk with no room for them.
  const taken = await countTakenSeats(db, row.id);
  if (input.capacity < taken) throw new ValidationError({ capacity: [`すでに ${taken} 名の予約があるため、定員をそれ未満にはできません。`] });

  const dogIds = await resolveDogIds(db, session.organizationId, dogPublicIds);
  const now = new Date().toISOString();

  await db
    .update(walkSlots)
    .set({ ...input, updatedAt: now })
    .where(eq(walkSlots.id, row.id));

  // Replaced wholesale: the form posts the full set, so a diff would only be a slower way to
  // reach the same three rows.
  await db.delete(walkSlotDogs).where(eq(walkSlotDogs.walkSlotId, row.id));
  if (dogIds.length > 0) await db.insert(walkSlotDogs).values(dogIds.map((dogId) => ({ walkSlotId: row.id, dogId })));
}

// The only writer of `walk_slots.status`.
export async function transitionWalkSlot(db: DbClient, session: OrganizationSession, publicId: string, to: WalkSlotStatus, reason?: string): Promise<void> {
  const row = await findOwnSlotRow(db, session.organizationId, publicId);
  const from = row.status;
  if (from === to) return;
  if (!allowedWalkSlotTransitions(from).includes(to)) throw new InvalidStateTransitionError("WalkSlot", from, to);

  const now = new Date().toISOString();
  await db.batch([
    db.update(walkSlots).set({ status: to, updatedAt: now }).where(eq(walkSlots.id, row.id)),
    activityLogInsert(db, {
      logName: "walk_slot",
      description: `WalkSlot ${from} -> ${to}`,
      subjectType: "WalkSlot",
      subjectId: row.id,
      event: `walk_slot.${to}`,
      actor: organizationMemberActor(session),
      organizationId: session.organizationId,
      properties: { from, to, reason: reason ?? null },
    }),
  ]);

  // TODO(P13): cancelling must carry the booked reservations to cancelled_* and start the refunds
  // (DEV-09 §2-6-4). Reservations arrive in P11 and refunds in P13 — until then there is nothing
  // to cascade to, and this is the one place that has to change when there is.
}

// SCR-06 / SCR-07. What a visitor may see: an approved shelter's slot that is published and has
// not already happened. `draft`, `scheduled` and `unpublished` are the shelter's own business.
const PUBLIC_STATES = ["open", "full", "closed"] as const;

export interface WalkSearchFilters {
  /** Free text matched against prefecture and city (SCR-06's one search box). */
  area?: string | null;
  /** A single JST calendar day, as the `date` input sends it. */
  date?: string | null;
}

export async function searchWalkSlots(db: DbClient, filters: WalkSearchFilters = {}, limit = 60): Promise<WalkSlotSummary[]> {
  const conditions = [inArray(walkSlots.status, PUBLIC_STATES), eq(organizations.status, "approved")];

  if (filters.area) {
    const pattern = `%${filters.area}%`;
    conditions.push(or(like(walkSlots.areaPrefecture, pattern), like(walkSlots.areaCity, pattern))!);
  }

  if (filters.date) {
    // The stored value is UTC, so a JST day runs from 15:00 the day before (DEV-06 §1-2).
    const from = new Date(`${filters.date}T00:00+09:00`).toISOString();
    const to = new Date(`${filters.date}T24:00+09:00`).toISOString();
    conditions.push(gte(walkSlots.startAt, from), lt(walkSlots.startAt, to));
  }

  const rows = await db
    .select({ slot: walkSlots })
    .from(walkSlots)
    .innerJoin(organizations, eq(walkSlots.organizationId, organizations.id))
    .where(and(...conditions))
    .orderBy(asc(walkSlots.startAt))
    .limit(limit);

  return Promise.all(rows.map(async (row) => toSummary(row.slot, await countTakenSeats(db, row.slot.id))));
}

export async function getPublicWalkSlot(db: DbClient, publicId: string): Promise<WalkSlotDetail> {
  const [row] = await db
    .select({ slot: walkSlots, organization: organizations })
    .from(walkSlots)
    .innerJoin(organizations, eq(walkSlots.organizationId, organizations.id))
    .where(and(eq(walkSlots.publicId, publicId), inArray(walkSlots.status, PUBLIC_STATES), eq(organizations.status, "approved")))
    .limit(1);

  if (!row) throw new NotFoundError("おさんぽ募集が見つかりません。");

  return toDetail(row.slot, await countTakenSeats(db, row.slot.id), toOrganizationSummary(row.organization), await dogsOfSlot(db, row.slot.id));
}
