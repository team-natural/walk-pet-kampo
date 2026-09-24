// Organization review (F-15-03). The table belongs to apps/public, but the review transitions are
// an operator's, so they live here and reach the shared D1 directly — not through the RPC, which
// exists for entities whose transition function lives on the other side (DEV-09 §2-1-5).
import { adminUsers, organizationActivationTokens, organizationApplicationTokens, organizationMembers, organizations } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import type { OrganizationDetail, OrganizationSummary } from "../../view-models/organization";
import type { OrganizationMemberView } from "../../view-models/organization-member";
import { newSessionToken } from "@app/server-kit/auth";
import { InvalidStateTransitionError, NotFoundError, ValidationError } from "@app/server-kit/http";
import { and, asc, desc, eq, inArray, lt } from "drizzle-orm";
import type { Session } from "../auth/session";
import { activityLogInsert, platformActor } from "./activity-log";

export type OrganizationStatus = (typeof organizations.$inferSelect)["status"];

// DEV-09 §2-1-2, transcribed. The matrix is the specification; this table is the only place the
// code decides what may follow what.
const TRANSITIONS: Record<OrganizationStatus, OrganizationStatus[]> = {
  pending_review: ["under_review"],
  under_review: ["needs_more_info", "approved", "rejected"],
  needs_more_info: ["under_review"],
  approved: ["suspended", "deactivated", "withdrawn"],
  rejected: [],
  suspended: ["approved", "deactivated", "withdrawn"],
  deactivated: ["approved", "withdrawn"],
  withdrawn: [],
};

// A reason the applicant will read (DEV-09 §2-1-4). Approving needs none; sending someone away
// without one, or asking for more without saying what, is what these two guard against.
const REASON_REQUIRED: OrganizationStatus[] = ["needs_more_info", "rejected"];

export function allowedTransitions(status: OrganizationStatus): OrganizationStatus[] {
  return TRANSITIONS[status] ?? [];
}

type OrganizationRow = typeof organizations.$inferSelect;

// The internal integer id and `reviewedBy` never leave this layer — the screen shows the
// reviewer's name, resolved by the join in getOrganizationByPublicId.
function toSummary(row: OrganizationRow): OrganizationSummary {
  return { id: row.publicId, name: row.name, slug: row.slug, status: row.status, activityArea: row.activityArea, createdAt: row.createdAt };
}

function toDetail(row: OrganizationRow, reviewedByName: string | null): OrganizationDetail {
  return {
    ...toSummary(row),
    nameKana: row.nameKana,
    orgType: row.orgType,
    hasCorporateStatus: row.hasCorporateStatus,
    representativeName: row.representativeName,
    contactName: row.contactName,
    postalCode: row.postalCode,
    address: row.address,
    addressVisibility: row.addressVisibility,
    phone: row.phone,
    email: row.email,
    website: row.website,
    activityStartedOn: row.activityStartedOn,
    introduction: row.introduction,
    protectedDogCount: row.protectedDogCount,
    adoptionTrackRecord: row.adoptionTrackRecord,
    stripeConnectAccountId: row.stripeConnectAccountId,
    reviewedAt: row.reviewedAt,
    rejectionReason: row.rejectionReason,
    updatedAt: row.updatedAt,
    reviewedByName,
  };
}

const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;

// The review queue (SYS-04): oldest first, because an application that has waited longest is the
// one to look at next — the opposite of every other list in this console.
const UNDER_REVIEW: OrganizationStatus[] = ["pending_review", "under_review", "needs_more_info"];

export async function listApplications(db: DbClient, options: { beforeId?: number | null; perPage?: number } = {}) {
  const perPage = Math.min(Math.max(options.perPage ?? DEFAULT_PER_PAGE, 1), MAX_PER_PAGE);
  const rows = await db
    .select()
    .from(organizations)
    .where(options.beforeId ? lt(organizations.id, options.beforeId) : undefined)
    .orderBy(asc(organizations.id))
    .limit(perPage + 1);

  const applications = rows.filter((row) => UNDER_REVIEW.includes(row.status));
  const hasMore = applications.length > perPage;
  const page = applications.slice(0, perPage);
  return { items: page.map(toSummary), perPage, nextId: hasMore ? page[page.length - 1]!.id : null };
}

// SYS-06 is the other half of the same table: everything that has finished review, newest first.
// A rejected application never becomes a shelter, so it stays in the queue's history and out of
// this list.
const OPERATIONAL: OrganizationStatus[] = ["approved", "suspended", "deactivated", "withdrawn"];

export async function listOrganizations(db: DbClient, options: { beforeId?: number | null; perPage?: number } = {}) {
  const perPage = Math.min(Math.max(options.perPage ?? DEFAULT_PER_PAGE, 1), MAX_PER_PAGE);
  const rows = await db
    .select()
    .from(organizations)
    .where(options.beforeId ? and(inArray(organizations.status, OPERATIONAL), lt(organizations.id, options.beforeId)) : inArray(organizations.status, OPERATIONAL))
    .orderBy(desc(organizations.id))
    .limit(perPage + 1);

  const hasMore = rows.length > perPage;
  const page = rows.slice(0, perPage);
  return { items: page.map(toSummary), perPage, nextId: hasMore ? page[page.length - 1]!.id : null };
}

async function findOrganizationRow(db: DbClient, publicId: string): Promise<OrganizationRow> {
  const [row] = await db.select().from(organizations).where(eq(organizations.publicId, publicId)).limit(1);
  if (!row) throw new NotFoundError("保護団体が見つかりません。");
  return row;
}

export async function getOrganizationByPublicId(db: DbClient, publicId: string): Promise<OrganizationDetail> {
  const row = await findOrganizationRow(db, publicId);
  if (row.reviewedBy === null) return toDetail(row, null);

  const [reviewer] = await db.select({ name: adminUsers.name }).from(adminUsers).where(eq(adminUsers.id, row.reviewedBy)).limit(1);
  return toDetail(row, reviewer?.name ?? null);
}

// SYS-08. Read-only from this side: staff are invited, suspended and removed by their own
// org_admin (ADM-03), and the operator acts on the shelter as a whole instead.
export async function listOrganizationMembers(db: DbClient, publicId: string): Promise<{ organization: OrganizationSummary; members: OrganizationMemberView[] }> {
  const row = await findOrganizationRow(db, publicId);
  const members = await db.select().from(organizationMembers).where(eq(organizationMembers.organizationId, row.id)).orderBy(asc(organizationMembers.id));

  return {
    organization: toSummary(row),
    members: members.map((member) => ({ name: member.name, email: member.email, role: member.role, status: member.status, joinedAt: member.joinedAt, leftAt: member.leftAt })),
  };
}

export interface TransitionResult {
  organizationId: number;
  email: string | null;
  name: string;
  from: OrganizationStatus;
  to: OrganizationStatus;
}

// The only writer of `organizations.status` on this side. Returns what the caller needs to notify
// the shelter, rather than sending anything itself: mail is a post-response concern (DEV-05 §4).
export async function transitionOrganization(db: DbClient, publicId: string, to: OrganizationStatus, session: Session, reason?: string): Promise<TransitionResult> {
  const row = await findOrganizationRow(db, publicId);
  const from = row.status;

  if (!allowedTransitions(from).includes(to)) throw new InvalidStateTransitionError("Organization", from, to);
  if (REASON_REQUIRED.includes(to) && !reason?.trim()) throw new ValidationError({ reason: ["理由を入力してください。"] });

  const now = new Date().toISOString();
  await db.batch([
    db
      .update(organizations)
      .set({
        status: to,
        // Kept for needs_more_info and rejected, cleared otherwise: a stale reason next to an
        // approved shelter reads as a current objection.
        rejectionReason: REASON_REQUIRED.includes(to) ? (reason?.trim() ?? null) : null,
        reviewedBy: session.adminUserId,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(eq(organizations.id, row.id)),
    activityLogInsert(db, {
      logName: "organization_review",
      description: `Organization ${from} -> ${to}`,
      subjectType: "Organization",
      subjectId: row.id,
      event: `organization.${to}`,
      actor: platformActor(session),
      organizationId: row.id,
      properties: { from, to, reason: reason?.trim() ?? null },
    }),
  ]);

  return { organizationId: row.id, email: row.email, name: row.name, from, to };
}

// DEV-09 §2-1-3: the applicant has days to answer, and a link that dies overnight turns into a
// support request. apps/public issues the same row from its own Service — the two Workers share
// the table, not the code (DEV-01 §5).
const APPLICATION_TOKEN_TTL_DAYS = 14;

// F-03-06. Issued on approval, because that is the moment a shelter exists with nobody inside it
// — the link in the approval mail is the only way its first org_admin can be created
// (GOV-01 D-038, DEV-07 §5-28).
const ACTIVATION_TOKEN_TTL_DAYS = 7;

// Whether anyone is inside the shelter yet. A re-approval (suspended → approved) must not mint a
// new activation link: the staff already have accounts, and that link creates another org_admin.
export async function hasAnyMember(db: DbClient, organizationId: number): Promise<boolean> {
  const [row] = await db.select({ id: organizationMembers.id }).from(organizationMembers).where(eq(organizationMembers.organizationId, organizationId)).limit(1);
  return row !== undefined;
}

export async function issueActivationToken(db: DbClient, organizationId: number, email: string): Promise<string> {
  const token = newSessionToken();
  await db.insert(organizationActivationTokens).values({ organizationId, email, token, expiresAt: new Date(Date.now() + ACTIVATION_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString() });
  return token;
}

export async function issueApplicationToken(db: DbClient, organizationId: number): Promise<string> {
  const token = newSessionToken();
  await db.insert(organizationApplicationTokens).values({ organizationId, token, expiresAt: new Date(Date.now() + APPLICATION_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString() });
  return token;
}

// Counts for SYS-01. Cheap enough to run per request: the queue is small by construction — an
// application only sits here until someone reviews it.
export async function countApplicationsAwaitingReview(db: DbClient): Promise<number> {
  const rows = await db.select({ id: organizations.id }).from(organizations).where(inArray(organizations.status, UNDER_REVIEW));
  return rows.length;
}
