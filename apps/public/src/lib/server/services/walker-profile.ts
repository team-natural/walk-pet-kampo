// The Walker's own record: profile, favourites, withdrawal (FG-02). Registration and the tokens
// around it are in ./walker-registration.ts.
//
// Every function takes a walkerId the caller has already checked against the session — there is
// no overload that infers the owner, because that is the overload someone eventually calls with
// an id from the request (DEV-07 §11).
import { dogs, favorites, organizations, walkerProfiles, walkers } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { NotFoundError } from "@app/server-kit/http";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { DogSummary } from "../../view-models/dog";
import type { OrganizationSummary } from "../../view-models/organization";
import type { WalkerProfileView } from "../../view-models/walker";
import { destroyAllSessions } from "../auth/session";
import { activityLogInsert, walkerActor } from "./activity-log";
import { refreshWalkerProfileStatus } from "./walker-registration";

type ProfileRow = typeof walkerProfiles.$inferSelect;

function toView(row: ProfileRow): WalkerProfileView {
  return {
    id: row.publicId,
    nameKana: row.nameKana,
    birthdate: row.birthdate,
    gender: row.gender,
    postalCode: row.postalCode,
    address: row.address,
    phone: row.phone,
    phoneVerifiedAt: row.phoneVerifiedAt,
    emergencyContactName: row.emergencyContactName,
    emergencyContactPhone: row.emergencyContactPhone,
    dogExperience: row.dogExperience,
    largeDogWalkExperience: row.largeDogWalkExperience,
    preferredArea: row.preferredArea,
    guardianName: row.guardianName,
    guardianPhone: row.guardianPhone,
    termsAgreedAt: row.termsAgreedAt,
    termsAgreedVersion: row.termsAgreedVersion,
    status: row.status,
  };
}

export async function getWalkerProfile(db: DbClient, walkerId: number): Promise<WalkerProfileView> {
  const [row] = await db.select().from(walkerProfiles).where(eq(walkerProfiles.walkerId, walkerId)).limit(1);
  if (!row) throw new NotFoundError("プロフィールが見つかりません。");
  return toView(row);
}

export interface ProfileInput {
  nameKana: string | null;
  birthdate: string | null;
  postalCode: string | null;
  address: string | null;
  phone: string | null;
  preferredArea: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
}

export async function updateWalkerProfile(db: DbClient, walkerId: number, input: ProfileInput): Promise<WalkerProfileView> {
  const [row] = await db.select().from(walkerProfiles).where(eq(walkerProfiles.walkerId, walkerId)).limit(1);
  if (!row) throw new NotFoundError("プロフィールが見つかりません。");

  // Changing the number un-verifies it: the old confirmation was for a different line, and
  // leaving the flag set would hand a verified badge to an unverified number (GOV-01 D-036).
  const phoneChanged = input.phone !== row.phone;

  const [updated] = await db
    .update(walkerProfiles)
    .set({ ...input, phoneVerifiedAt: phoneChanged ? null : row.phoneVerifiedAt, updatedAt: new Date().toISOString() })
    .where(eq(walkerProfiles.id, row.id))
    .returning();

  // The profile being complete is half of what `active` needs (DEV-09 §2-4-3), so the status is
  // re-derived here rather than left for the next login to notice.
  await refreshWalkerProfileStatus(db, walkerId);

  return toView(updated!);
}

// F-02-06. Terminal: `withdrawn` has no way back (DEV-09 §2-4-2), so this is the one place a
// walker can end their own account.
export async function withdrawWalker(db: DbClient, walkerId: number): Promise<void> {
  const [row] = await db.select().from(walkerProfiles).where(eq(walkerProfiles.walkerId, walkerId)).limit(1);
  if (!row) throw new NotFoundError("プロフィールが見つかりません。");
  if (row.status === "withdrawn") return;

  const now = new Date().toISOString();
  await db.batch([
    db.update(walkerProfiles).set({ status: "withdrawn", updatedAt: now }).where(eq(walkerProfiles.id, row.id)),
    // The account row stays: reservations, walk records and payouts reference it, and the
    // retention schedule (OPS-02 §4-3) decides when the personal data goes.
    db.update(walkers).set({ status: "suspended", updatedAt: now }).where(eq(walkers.id, walkerId)),
    activityLogInsert(db, {
      logName: "walker_profile",
      description: `WalkerProfile ${row.status} -> withdrawn`,
      subjectType: "WalkerProfile",
      subjectId: row.id,
      event: "walker_profile.withdrawn",
      actor: walkerActor(walkerId),
      properties: { from: row.status, to: "withdrawn" },
    }),
  ]);

  await destroyAllSessions(db, walkerId);
}

export interface WalkerFavorites {
  dogs: DogSummary[];
  organizations: OrganizationSummary[];
}

// favoritable_type / favoritable_id is polymorphic, so no foreign key can enforce that the row
// points at something that still exists. Resolving by inArray drops the danglers instead of
// rendering a blank card.
export async function listFavorites(db: DbClient, walkerId: number): Promise<WalkerFavorites> {
  const rows = await db.select().from(favorites).where(eq(favorites.walkerId, walkerId)).orderBy(desc(favorites.id));

  const dogIds = rows.filter((row) => row.favoritableType === "Dog").map((row) => row.favoritableId);
  const organizationIds = rows.filter((row) => row.favoritableType === "Organization").map((row) => row.favoritableId);

  const dogRows = dogIds.length > 0 ? await db.select().from(dogs).where(inArray(dogs.id, dogIds)) : [];
  const organizationRows = organizationIds.length > 0 ? await db.select().from(organizations).where(inArray(organizations.id, organizationIds)) : [];

  return {
    dogs: dogRows.map((dog) => ({ id: dog.publicId, slug: dog.slug, name: dog.name, breed: dog.breed, size: dog.size, gender: dog.gender, estimatedAge: dog.estimatedAge, adoptionStatus: dog.adoptionStatus, photoKey: dog.photoKey, walkEligible: dog.walkEligible })),
    organizations: organizationRows.map((organization) => ({ id: organization.publicId, slug: organization.slug, name: organization.name, status: organization.status, activityArea: organization.activityArea, protectedDogCount: organization.protectedDogCount, logoKey: organization.logoKey })),
  };
}

export async function addFavorite(db: DbClient, walkerId: number, type: "Dog" | "Organization", favoritableId: number): Promise<void> {
  // Idempotent: the unique index makes a second tap a no-op rather than an error the screen has
  // to explain.
  await db.insert(favorites).values({ walkerId, favoritableType: type, favoritableId }).onConflictDoNothing();
}

export async function removeFavorite(db: DbClient, walkerId: number, type: "Dog" | "Organization", favoritableId: number): Promise<void> {
  // Scoped by walkerId: without it, any id would unfavourite someone else's row.
  await db.delete(favorites).where(and(eq(favorites.walkerId, walkerId), eq(favorites.favoritableType, type), eq(favorites.favoritableId, favoritableId)));
}
