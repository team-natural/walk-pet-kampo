// SYS-11 / SYS-12 (F-15-06). Read-only on this side, for the same reason as dogs.ts: the walk
// belongs to a shelter and `walk_slots.status` has exactly one writer, in apps/public
// (DEV-09 §3-1). The operator's write path is the RPC that arrives with P14 (GOV-02 TBD-58).
import { organizations, walkSlots } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { NotFoundError } from "@app/server-kit/http";
import { asc, eq, gt } from "drizzle-orm";
import type { WalkSlotDetail, WalkSlotSummary } from "../../view-models/walk-slot";

type WalkSlotRow = typeof walkSlots.$inferSelect;

function toSummary(row: WalkSlotRow, organizationName: string): WalkSlotSummary {
  return { id: row.publicId, organizationName, title: row.title, startAt: row.startAt, areaPrefecture: row.areaPrefecture, areaCity: row.areaCity, capacity: row.capacity, reservedCount: row.reservedCount, feePerPerson: row.feePerPerson, status: row.status };
}

const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;

// Soonest first, not newest first: this console exists to see what is about to happen. The cursor
// is therefore the start time's id, moving forward (GOV-01 D-032).
export async function listWalkSlots(db: DbClient, options: { afterId?: number | null; perPage?: number } = {}) {
  const perPage = Math.min(Math.max(options.perPage ?? DEFAULT_PER_PAGE, 1), MAX_PER_PAGE);
  const rows = await db
    .select({ slot: walkSlots, organizationName: organizations.name })
    .from(walkSlots)
    .innerJoin(organizations, eq(walkSlots.organizationId, organizations.id))
    .where(options.afterId ? gt(walkSlots.id, options.afterId) : undefined)
    .orderBy(asc(walkSlots.startAt))
    .limit(perPage + 1);

  const hasMore = rows.length > perPage;
  const page = rows.slice(0, perPage);
  return { items: page.map((row) => toSummary(row.slot, row.organizationName)), perPage, nextId: hasMore ? page[page.length - 1]!.slot.id : null };
}

export async function getWalkSlotByPublicId(db: DbClient, publicId: string): Promise<WalkSlotDetail> {
  const [row] = await db.select({ slot: walkSlots, organizationName: organizations.name }).from(walkSlots).innerJoin(organizations, eq(walkSlots.organizationId, organizations.id)).where(eq(walkSlots.publicId, publicId)).limit(1);

  if (!row) throw new NotFoundError("おさんぽ募集が見つかりません。");

  return {
    ...toSummary(row.slot, row.organizationName),
    description: row.slot.description,
    acceptanceStartAt: row.slot.acceptanceStartAt,
    acceptanceEndAt: row.slot.acceptanceEndAt,
    durationMinutes: row.slot.durationMinutes,
    meetingPlace: row.slot.meetingPlace,
    latitude: row.slot.latitude,
    longitude: row.slot.longitude,
    staffAccompanied: row.slot.staffAccompanied,
    beginnerAllowed: row.slot.beginnerAllowed,
    childAllowed: row.slot.childAllowed,
    minAge: row.slot.minAge,
    requiredExperience: row.slot.requiredExperience,
    clothingNotes: row.slot.clothingNotes,
    precautions: row.slot.precautions,
    weatherPolicy: row.slot.weatherPolicy,
    cancellationPolicy: row.slot.cancellationPolicy,
    updatedAt: row.slot.updatedAt,
  };
}
