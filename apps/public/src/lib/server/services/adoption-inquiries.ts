// AdoptionInquiry (FG-11). The platform receives the enquiry and tells the shelter; it does not
// mediate what happens next (GOV-02 TBD-32) — the two parties talk outside the service.
import { adoptionInquiries, dogs, organizationMembers, organizations, walkerProfiles, walkers } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { ulid } from "@app/schema/ulid";
import { ConflictError, InvalidStateTransitionError, NotFoundError } from "@app/server-kit/http";
import { assertWithinRateLimit } from "@app/server-kit/rate-limit";
import { and, desc, eq } from "drizzle-orm";
import type { AdoptionInquiryDetail, AdoptionInquirySummary } from "../../view-models/adoption-inquiry";
import type { OrganizationSession } from "../auth/organization-session";
import type { Session } from "../auth/session";
import { activityLogInsert, organizationMemberActor, walkerActor } from "./activity-log";
import { transitionDog } from "./dogs";
import { notificationInsert } from "./notifications";

type InquiryRow = typeof adoptionInquiries.$inferSelect;
export type AdoptionInquiryStatus = InquiryRow["status"];

// DEV-09 §2-11-2 in table form: the basic flow runs forward, and every live state may end in
// `closed` (the shelter) or `withdrawn` (the walker).
const ENDINGS: AdoptionInquiryStatus[] = ["closed", "withdrawn"];

const TRANSITIONS: Record<AdoptionInquiryStatus, AdoptionInquiryStatus[]> = {
  received: ["organization_reviewing", ...ENDINGS],
  organization_reviewing: ["contacted", ...ENDINGS],
  contacted: ["interview_scheduled", ...ENDINGS],
  interview_scheduled: ["transferred_to_organization_process", ...ENDINGS],
  transferred_to_organization_process: [],
  closed: [],
  withdrawn: [],
};

export function allowedInquiryTransitions(status: AdoptionInquiryStatus): AdoptionInquiryStatus[] {
  return TRANSITIONS[status] ?? [];
}

// Only the shelter drives the flow forward; only the walker withdraws. Mixing the two would let
// a shelter "withdraw" on someone's behalf, which is a different statement entirely.
const WALKER_TRANSITIONS: AdoptionInquiryStatus[] = ["withdrawn"];

export interface AdoptionInquiryInput {
  motivation: string;
  livingEnvironment: string;
}

function toSummaryRow(row: InquiryRow, dog: typeof dogs.$inferSelect): AdoptionInquirySummary {
  return {
    id: row.publicId,
    status: row.status,
    createdAt: row.createdAt,
    dog: { id: dog.publicId, slug: dog.slug, name: dog.name, breed: dog.breed, size: dog.size, gender: dog.gender, estimatedAge: dog.estimatedAge, adoptionStatus: dog.adoptionStatus, photoKey: dog.photoKey, walkEligible: dog.walkEligible },
  };
}

// F-11-01. The dog has to be one a visitor could actually enquire about — published, and with a
// shelter that is still approved.
export async function createAdoptionInquiry(db: DbClient, kv: KVNamespace, session: Session, dogSlug: string, input: AdoptionInquiryInput): Promise<{ publicId: string }> {
  // Five a day per walker (DEV-02 §7): each one lands in a shelter's inbox.
  await assertWithinRateLimit(kv, "adoptionInquiry", session.walkerId);

  const [row] = await db
    .select({ dog: dogs, organizationId: organizations.id })
    .from(dogs)
    .innerJoin(organizations, eq(dogs.organizationId, organizations.id))
    .where(and(eq(dogs.slug, dogSlug), eq(dogs.isPublished, 1), eq(organizations.status, "approved")))
    .limit(1);

  if (!row) throw new NotFoundError("保護犬が見つかりません。");

  // A dog already placed is not open to enquiries — the screen says so, and this is what makes
  // it true after the page was loaded.
  if (row.dog.adoptionStatus === "adopted" || row.dog.adoptionStatus === "listing_closed") {
    throw new ConflictError("この子は里親募集を終了しました。");
  }

  const [open] = await db
    .select({ id: adoptionInquiries.id })
    .from(adoptionInquiries)
    .where(and(eq(adoptionInquiries.dogId, row.dog.id), eq(adoptionInquiries.walkerId, session.walkerId), eq(adoptionInquiries.status, "received")))
    .limit(1);
  if (open) throw new ConflictError("この子への相談はすでに受け付けています。");

  // Notifications address a person, not a shelter (DEV-07 §5-17), so everyone who can answer the
  // enquiry gets one — ADM-20/21 are open to org_staff as well as org_admin.
  const staff = await db
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, row.organizationId), eq(organizationMembers.status, "active")));

  const publicId = ulid();
  const now = new Date().toISOString();

  await db.batch([
    db.insert(adoptionInquiries).values({
      publicId,
      dogId: row.dog.id,
      // Denormalised like reservations: the shelter's own list filters on it without a join.
      organizationId: row.organizationId,
      walkerId: session.walkerId,
      motivation: input.motivation,
      livingEnvironment: input.livingEnvironment,
      status: "received",
      updatedAt: now,
    }),
    // F-11-02. In the same batch as the row it announces: a notification about a rolled-back
    // insert would send staff to an enquiry that does not exist (DEV-05 §4-1).
    ...staff.map((member) =>
      notificationInsert(db, {
        recipient: { type: "organization_member", id: member.id },
        type: "adoption_inquiry_received",
        body: `${row.dog.name} への里親相談が届きました。`,
        href: "/organization/adoption-inquiries",
      }),
    ),
    activityLogInsert(db, {
      logName: "adoption_inquiry",
      description: `AdoptionInquiry received (${row.dog.name})`,
      subjectType: "AdoptionInquiry",
      event: "adoption_inquiry.received",
      actor: walkerActor(session.walkerId),
      organizationId: row.organizationId,
      properties: { dogSlug },
    }),
  ]);

  return { publicId };
}

// SCR-30. The walker's own history, newest first.
export async function listOwnInquiries(db: DbClient, walkerId: number): Promise<AdoptionInquirySummary[]> {
  const rows = await db.select({ inquiry: adoptionInquiries, dog: dogs }).from(adoptionInquiries).innerJoin(dogs, eq(adoptionInquiries.dogId, dogs.id)).where(eq(adoptionInquiries.walkerId, walkerId)).orderBy(desc(adoptionInquiries.id));
  return rows.map((row) => toSummaryRow(row.inquiry, row.dog));
}

export async function getOwnInquiry(db: DbClient, walkerId: number, publicId: string): Promise<AdoptionInquiryDetail> {
  const [row] = await db
    .select({ inquiry: adoptionInquiries, dog: dogs, organization: organizations })
    .from(adoptionInquiries)
    .innerJoin(dogs, eq(adoptionInquiries.dogId, dogs.id))
    .innerJoin(organizations, eq(adoptionInquiries.organizationId, organizations.id))
    .where(and(eq(adoptionInquiries.publicId, publicId), eq(adoptionInquiries.walkerId, walkerId)))
    .limit(1);

  if (!row) throw new NotFoundError("里親相談が見つかりません。");

  return {
    ...toSummaryRow(row.inquiry, row.dog),
    organization: { id: row.organization.publicId, name: row.organization.name, slug: row.organization.slug, status: row.organization.status, activityArea: row.organization.activityArea, logoKey: row.organization.logoKey, protectedDogCount: row.organization.protectedDogCount },
    motivation: row.inquiry.motivation,
    livingEnvironment: row.inquiry.livingEnvironment,
    organizationContactedAt: row.inquiry.organizationContactedAt,
    closedAt: row.inquiry.closedAt,
  };
}

// ADM-20. Scoped by organizationId, the tenant boundary every query in the shelter console has.
export async function listOrganizationInquiries(db: DbClient, organizationId: number): Promise<AdoptionInquirySummary[]> {
  const rows = await db.select({ inquiry: adoptionInquiries, dog: dogs }).from(adoptionInquiries).innerJoin(dogs, eq(adoptionInquiries.dogId, dogs.id)).where(eq(adoptionInquiries.organizationId, organizationId)).orderBy(desc(adoptionInquiries.id));
  return rows.map((row) => toSummaryRow(row.inquiry, row.dog));
}

export interface OrganizationInquiryDetail extends AdoptionInquirySummary {
  motivation: string;
  livingEnvironment: string;
  organizationContactedAt: string | null;
  closedAt: string | null;
  /** What the shelter may see of the person: name, email, phone — never the address (TBD-34). */
  walker: { name: string; email: string; phone: string | null };
}

export async function getOrganizationInquiry(db: DbClient, organizationId: number, publicId: string): Promise<OrganizationInquiryDetail> {
  const [row] = await db
    .select({ inquiry: adoptionInquiries, dog: dogs, walkerName: walkers.name, walkerEmail: walkers.email, walkerPhone: walkerProfiles.phone })
    .from(adoptionInquiries)
    .innerJoin(dogs, eq(adoptionInquiries.dogId, dogs.id))
    .innerJoin(walkers, eq(adoptionInquiries.walkerId, walkers.id))
    .leftJoin(walkerProfiles, eq(walkerProfiles.walkerId, walkers.id))
    .where(and(eq(adoptionInquiries.publicId, publicId), eq(adoptionInquiries.organizationId, organizationId)))
    .limit(1);

  if (!row) throw new NotFoundError("里親相談が見つかりません。");

  return {
    ...toSummaryRow(row.inquiry, row.dog),
    motivation: row.inquiry.motivation,
    livingEnvironment: row.inquiry.livingEnvironment,
    organizationContactedAt: row.inquiry.organizationContactedAt,
    closedAt: row.inquiry.closedAt,
    // The address stays out of the shape entirely, so no template can render it (TBD-34).
    walker: { name: row.walkerName, email: row.walkerEmail, phone: row.walkerPhone ?? null },
  };
}

async function findInquiry(db: DbClient, where: ReturnType<typeof and>): Promise<InquiryRow> {
  const [row] = await db.select().from(adoptionInquiries).where(where).limit(1);
  if (!row) throw new NotFoundError("里親相談が見つかりません。");
  return row;
}

async function applyTransition(db: DbClient, row: InquiryRow, to: AdoptionInquiryStatus, entry: { actor: Parameters<typeof activityLogInsert>[1]["actor"]; description: string }): Promise<void> {
  const from = row.status;
  if (from === to) return;
  if (!allowedInquiryTransitions(from).includes(to)) throw new InvalidStateTransitionError("AdoptionInquiry", from, to);

  const now = new Date().toISOString();
  await db.batch([
    db
      .update(adoptionInquiries)
      .set({
        status: to,
        // Two timestamps the screens read directly, set here so they cannot disagree with the
        // status they describe (DEV-07 §5-16).
        organizationContactedAt: to === "contacted" ? now : row.organizationContactedAt,
        closedAt: ENDINGS.includes(to) || to === "transferred_to_organization_process" ? now : row.closedAt,
        updatedAt: now,
      })
      .where(eq(adoptionInquiries.id, row.id)),
    activityLogInsert(db, {
      logName: "adoption_inquiry",
      description: entry.description,
      subjectType: "AdoptionInquiry",
      subjectId: row.id,
      event: `adoption_inquiry.${to}`,
      actor: entry.actor,
      organizationId: row.organizationId,
      properties: { from, to },
    }),
    // The walker hears about every move the shelter makes; their own withdrawal needs no notice.
    ...(entry.actor.type === "organization_member"
      ? [
          notificationInsert(db, {
            recipient: { type: "walker", id: row.walkerId },
            type: "adoption_inquiry_update",
            body: "里親相談の状況が更新されました。",
            href: `/mypage/adoption-inquiries/${row.publicId}`,
          }),
        ]
      : []),
  ]);
}

// F-11-02. The shelter's side of the flow.
export async function transitionInquiryByOrganization(db: DbClient, session: OrganizationSession, publicId: string, to: AdoptionInquiryStatus): Promise<void> {
  const row = await findInquiry(db, and(eq(adoptionInquiries.publicId, publicId), eq(adoptionInquiries.organizationId, session.organizationId)));
  await applyTransition(db, row, to, { actor: organizationMemberActor(session), description: `AdoptionInquiry ${row.status} -> ${to}` });

  // DEV-09 §2-11-3: starting to review an enquiry takes the dog off the open list, so two
  // shelters' worth of hopeful adopters are not queued behind one conversation. Outside the batch
  // above because transitionDog() owns `adoption_status` and runs its own (DEV-09 §3-1).
  if (to === "organization_reviewing") {
    const [dog] = await db.select().from(dogs).where(eq(dogs.id, row.dogId)).limit(1);
    if (dog?.adoptionStatus === "listed") await transitionDog(db, session, dog.publicId, "in_consultation");
  }
}

// F-11-03. The walker may take their enquiry back at any point before it ends.
export async function withdrawInquiry(db: DbClient, walkerId: number, publicId: string): Promise<void> {
  const row = await findInquiry(db, and(eq(adoptionInquiries.publicId, publicId), eq(adoptionInquiries.walkerId, walkerId)));
  if (!WALKER_TRANSITIONS.includes("withdrawn")) throw new InvalidStateTransitionError("AdoptionInquiry", row.status, "withdrawn");
  await applyTransition(db, row, "withdrawn", { actor: walkerActor(walkerId), description: `AdoptionInquiry ${row.status} -> withdrawn` });
}
