// The shelter editing its own record (F-04-01, F-04-02, F-04-05). Review transitions belong to
// the operator and live in apps/admin (DEV-09 §2-1-5); this file only holds what org_admin drives.
import { organizations, reservations } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { InvalidStateTransitionError, NotFoundError, ValidationError } from "@app/server-kit/http";
import { and, eq, inArray } from "drizzle-orm";
import type { OrganizationDetail } from "../../view-models/organization";
import type { OrganizationSession } from "../auth/organization-session";
import { activityLogInsert, organizationMemberActor } from "./activity-log";

type OrganizationRow = typeof organizations.$inferSelect;

function toDetail(row: OrganizationRow): OrganizationDetail {
  return {
    id: row.publicId,
    name: row.name,
    slug: row.slug,
    status: row.status,
    activityArea: row.activityArea,
    logoKey: row.logoKey,
    protectedDogCount: row.protectedDogCount,
    nameKana: row.nameKana,
    orgType: row.orgType,
    representativeName: row.representativeName,
    addressVisibility: row.addressVisibility,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    website: row.website,
    snsLinks: row.snsLinks,
    activityStartedOn: row.activityStartedOn,
    introduction: row.introduction,
    adoptionTrackRecord: row.adoptionTrackRecord,
  };
}

export async function getOwnOrganization(db: DbClient, organizationId: number): Promise<OrganizationDetail> {
  const [row] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!row) throw new NotFoundError("団体が見つかりません。");
  return toDetail(row);
}

export interface OrganizationProfileInput {
  name: string;
  representativeName: string;
  activityArea: string | null;
  addressVisibility: OrganizationRow["addressVisibility"];
  address: string | null;
  introduction: string | null;
}

export async function updateOrganizationProfile(db: DbClient, session: OrganizationSession, input: OrganizationProfileInput): Promise<OrganizationDetail> {
  const [row] = await db.select().from(organizations).where(eq(organizations.id, session.organizationId)).limit(1);
  if (!row) throw new NotFoundError("団体が見つかりません。");

  // TODO(P10): geocode the address here once GOV-02 TBD-40 lands (DEV-10 §9). Until then the
  // coordinates stay null, and area search — the only thing that reads them — is P10's work.
  // Changing the address clears them rather than leaving a pin on the previous location.
  const addressChanged = input.address !== row.address;

  const [updated] = await db
    .update(organizations)
    .set({
      ...input,
      latitude: addressChanged ? null : row.latitude,
      longitude: addressChanged ? null : row.longitude,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(organizations.id, row.id))
    .returning();

  return toDetail(updated!);
}

// Anything that would strand a participant or an unpaid transfer (DEV-09 §2-1-4). Reservations
// are P11's table and empty today, so this reads as a no-op — but it is the check that has to
// exist before the first booking does, not after.
const OPEN_RESERVATION_STATES = ["processing", "awaiting_payment", "confirmed", "organization_reviewing", "scheduled"] as const;

// The reason is kept in the log entry only: DEV-07 §5-2 has no column for it, and the operator
// reads it from SYS-27 when a shelter asks to come back.
export async function withdrawOrganization(db: DbClient, session: OrganizationSession, reason?: string): Promise<void> {
  const [row] = await db.select().from(organizations).where(eq(organizations.id, session.organizationId)).limit(1);
  if (!row) throw new NotFoundError("団体が見つかりません。");

  // DEV-09 §2-1-2: only these three may withdraw. A shelter still under review withdraws by
  // asking the operator, not by pressing a button that would skip the review.
  if (!["approved", "suspended", "deactivated"].includes(row.status)) {
    throw new InvalidStateTransitionError("Organization", row.status, "withdrawn");
  }

  const open = await db
    .select({ id: reservations.id })
    .from(reservations)
    .where(and(eq(reservations.organizationId, row.id), inArray(reservations.status, OPEN_RESERVATION_STATES)))
    .limit(1);

  if (open.length > 0) {
    throw new ValidationError({ withdrawal: ["未実施の予約が残っています。先に予約の対応を完了してください。"] });
  }

  const now = new Date().toISOString();
  await db.batch([
    db.update(organizations).set({ status: "withdrawn", updatedAt: now }).where(eq(organizations.id, row.id)),
    activityLogInsert(db, {
      logName: "organization_review",
      description: `Organization ${row.status} -> withdrawn`,
      subjectType: "Organization",
      subjectId: row.id,
      event: "organization.withdrawn",
      actor: organizationMemberActor(session),
      organizationId: row.id,
      properties: { from: row.status, to: "withdrawn", reason: reason ?? null },
    }),
  ]);
}
