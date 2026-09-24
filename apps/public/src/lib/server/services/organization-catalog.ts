// The public face of `organizations` (F-07-01): SCR-01's strip, SCR-02's list and SCR-03. Kept
// apart from organizations.ts (applying) and organization-profile.ts (the shelter editing itself)
// because this is the one of the three that must never return a row nobody approved.
import { dogs, organizations, walkSlots } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { NotFoundError } from "@app/server-kit/http";
import { and, asc, desc, eq, inArray, like, or } from "drizzle-orm";
import type { DogSummary } from "../../view-models/dog";
import type { OrganizationDetail, OrganizationSummary } from "../../view-models/organization";
import type { WalkSlotSummary } from "../../view-models/walk-slot";
import { countTakenSeats, PUBLIC_WALK_SLOT_STATES } from "./walk-slots";

type OrganizationRow = typeof organizations.$inferSelect;

function toSummary(row: OrganizationRow): OrganizationSummary {
  return { id: row.publicId, name: row.name, slug: row.slug, status: row.status, activityArea: row.activityArea, logoKey: row.logoKey, protectedDogCount: row.protectedDogCount };
}

// DEV-07 §5-4 gives the shelter three levels and the column means nothing until something honours
// it. Anything finer than the level chosen is dropped here, in the Service, so no template can
// leak it by rendering the raw row.
//
// The parse is deliberately blunt: Japanese addresses start with the prefecture and then the
// municipality, and a shelter whose address does not match that shape simply shows nothing.
const ADDRESS_PARTS = /^(.+?[都道府県])((?:.+?郡)?.+?[市区町村])?/;

export function publicAddress(address: string | null, visibility: OrganizationRow["addressVisibility"]): string | null {
  // `reservation_confirmed_only` is exactly that — a participant sees it from their reservation
  // (P11), never from a public page.
  if (!address || visibility === "reservation_confirmed_only") return null;

  const parts = ADDRESS_PARTS.exec(address);
  if (!parts) return null;

  const [, prefecture, city] = parts;
  return visibility === "city_only" && city ? `${prefecture}${city}` : prefecture!;
}

export interface OrganizationFilters {
  /** Free text matched against the shelter's name and its stated activity area (SCR-02). */
  area?: string | null;
}

export async function listPublicOrganizations(db: DbClient, filters: OrganizationFilters = {}, limit = 60): Promise<OrganizationSummary[]> {
  const conditions = [eq(organizations.status, "approved")];

  if (filters.area) {
    const pattern = `%${filters.area}%`;
    conditions.push(or(like(organizations.activityArea, pattern), like(organizations.name, pattern))!);
  }

  const rows = await db
    .select()
    .from(organizations)
    .where(and(...conditions))
    .orderBy(asc(organizations.id))
    .limit(limit);

  return rows.map(toSummary);
}

export interface PublicOrganizationPage {
  organization: OrganizationDetail & { publicAddress: string | null };
  dogs: DogSummary[];
  walkSlots: WalkSlotSummary[];
}

// SCR-03. One page, three queries — the dogs and the walks are both scoped to this shelter and
// both filtered the same way the standalone screens filter them (SCR-04, SCR-06).
export async function getPublicOrganizationBySlug(db: DbClient, slug: string): Promise<PublicOrganizationPage> {
  const [row] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.slug, slug), eq(organizations.status, "approved")))
    .limit(1);

  if (!row) throw new NotFoundError("保護団体が見つかりません。");

  const dogRows = await db
    .select()
    .from(dogs)
    .where(and(eq(dogs.organizationId, row.id), eq(dogs.isPublished, 1)))
    .orderBy(desc(dogs.id))
    .limit(24);

  const slotRows = await db
    .select()
    .from(walkSlots)
    .where(and(eq(walkSlots.organizationId, row.id), inArray(walkSlots.status, PUBLIC_WALK_SLOT_STATES)))
    .orderBy(asc(walkSlots.startAt))
    .limit(12);

  return {
    organization: {
      ...toSummary(row),
      publicAddress: publicAddress(row.address, row.addressVisibility),
      nameKana: row.nameKana,
      orgType: row.orgType,
      representativeName: row.representativeName,
      addressVisibility: row.addressVisibility,
      // The exact address stays out of the view model entirely: a page cannot render what it was
      // never handed.
      address: null,
      latitude: row.latitude,
      longitude: row.longitude,
      website: row.website,
      snsLinks: row.snsLinks,
      activityStartedOn: row.activityStartedOn,
      introduction: row.introduction,
      adoptionTrackRecord: row.adoptionTrackRecord,
    },
    dogs: dogRows.map((dog) => ({ id: dog.publicId, slug: dog.slug, name: dog.name, breed: dog.breed, size: dog.size, gender: dog.gender, estimatedAge: dog.estimatedAge, adoptionStatus: dog.adoptionStatus, photoKey: dog.photoKey, walkEligible: dog.walkEligible })),
    walkSlots: await Promise.all(
      slotRows.map(async (slot) => ({
        id: slot.publicId,
        title: slot.title,
        startAt: slot.startAt,
        durationMinutes: slot.durationMinutes,
        areaPrefecture: slot.areaPrefecture,
        areaCity: slot.areaCity,
        capacity: slot.capacity,
        remainingCapacity: Math.max(slot.capacity - (await countTakenSeats(db, slot.id)), 0),
        feePerPerson: slot.feePerPerson,
        status: slot.status,
        beginnerAllowed: slot.beginnerAllowed,
      })),
    ),
  };
}
