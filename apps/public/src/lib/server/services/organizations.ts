// The shelter's own side of its record: applying, and resubmitting after a review asks for more
// (F-03-01, F-03-05). The review transitions themselves live in apps/admin's organizations.ts —
// one table, two Service files, on purpose (DEV-09 §2-1-5).
import { organizationApplicationTokens, organizations } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { ulid } from "@app/schema/ulid";
import { newSessionToken } from "@app/server-kit/auth";
import { ValidationError } from "@app/server-kit/http";
import { and, eq, isNull } from "drizzle-orm";
import type { OrganizationApplicationStatus } from "../../view-models/organization";
import { activityLogInsert, SYSTEM_ACTOR } from "./activity-log";

// DEV-09 §2-1-3: the applicant has days to answer a request for more information, and a link
// that dies overnight turns into a support request.
const APPLICATION_TOKEN_TTL_DAYS = 14;

export class InvalidTokenError extends Error {}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export interface ApplicationInput {
  name: string;
  representativeName: string;
  email: string;
  activityArea: string | null;
  introduction: string | null;
}

// A slug the public shelter page will use (SCR-03). Derived from the ULID, not the name: shelter
// names collide, contain characters that do not survive a URL, and change after approval.
function slugFor(): string {
  return `org-${ulid().toLowerCase()}`;
}

export async function createApplication(db: DbClient, input: ApplicationInput): Promise<{ organizationId: number }> {
  const [existing] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.name, input.name)).limit(1);
  if (existing) {
    // Unlike an account signup, this is not an enumeration risk: shelter names are published on
    // SCR-02 once approved, and a duplicate application is a mistake worth naming.
    throw new ValidationError({ name: ["同じ名称の団体がすでに申請済みです。運営にお問い合わせください。"] });
  }

  const now = new Date().toISOString();
  const [inserted] = await db.batch([
    db
      .insert(organizations)
      .values({
        publicId: ulid(),
        name: input.name,
        slug: slugFor(),
        representativeName: input.representativeName,
        email: input.email,
        activityArea: input.activityArea,
        introduction: input.introduction,
        // Until the shelter says otherwise its address is shown to the prefecture only — the
        // safest of the three options for a record nobody has reviewed yet (DEV-07 §5-4).
        addressVisibility: "prefecture_only",
        status: "pending_review",
        updatedAt: now,
      })
      .returning({ id: organizations.id }),
  ]);

  const organizationId = inserted[0]!.id;

  // `system`, not the applicant: there is no account behind this action yet, and inventing one
  // would put a fake causer in the audit trail (GOV-01 D-033).
  await db.batch([
    activityLogInsert(db, {
      logName: "organization_review",
      description: "Organization applied",
      subjectType: "Organization",
      subjectId: organizationId,
      event: "organization.pending_review",
      actor: SYSTEM_ACTOR,
      organizationId,
      properties: { source: "application_form" },
    }),
  ]);

  return { organizationId };
}

// Issued when a review asks for more (needs_more_info). The applicant has no account, so this
// token is the whole identity claim for SCR-51 (DEV-07 §5-25, GOV-01 D-037).
export async function issueApplicationToken(db: DbClient, organizationId: number): Promise<string> {
  const token = newSessionToken();
  await db.insert(organizationApplicationTokens).values({ organizationId, token, expiresAt: daysFromNow(APPLICATION_TOKEN_TTL_DAYS) });
  return token;
}

export async function getApplicationByToken(db: DbClient, token: string): Promise<OrganizationApplicationStatus | null> {
  const [row] = await db
    .select({ publicId: organizations.publicId, name: organizations.name, status: organizations.status, rejectionReason: organizations.rejectionReason, expiresAt: organizationApplicationTokens.expiresAt })
    .from(organizationApplicationTokens)
    .innerJoin(organizations, eq(organizationApplicationTokens.organizationId, organizations.id))
    .where(and(eq(organizationApplicationTokens.token, token), isNull(organizationApplicationTokens.usedAt)))
    .limit(1);

  if (!row || row.expiresAt <= new Date().toISOString()) return null;
  return { id: row.publicId, name: row.name, status: row.status, rejectionReason: row.rejectionReason };
}

// needs_more_info → under_review (DEV-09 §2-1-3). The only Organization transition the shelter
// itself drives during review, which is why it lives here rather than in apps/admin.
export async function resubmitApplication(db: DbClient, token: string, note: string): Promise<void> {
  const [row] = await db
    .select()
    .from(organizationApplicationTokens)
    .where(and(eq(organizationApplicationTokens.token, token), isNull(organizationApplicationTokens.usedAt)))
    .limit(1);

  if (!row || row.expiresAt <= new Date().toISOString()) throw new InvalidTokenError();

  const [organization] = await db.select().from(organizations).where(eq(organizations.id, row.organizationId)).limit(1);
  if (!organization || organization.status !== "needs_more_info") throw new InvalidTokenError();

  const now = new Date().toISOString();
  await db.batch([
    // The operator's question is answered, so it stops being the current state of the record.
    db.update(organizations).set({ status: "under_review", rejectionReason: null, updatedAt: now }).where(eq(organizations.id, organization.id)),
    db.update(organizationApplicationTokens).set({ usedAt: now }).where(eq(organizationApplicationTokens.id, row.id)),
    activityLogInsert(db, {
      logName: "organization_review",
      description: "Organization needs_more_info -> under_review",
      subjectType: "Organization",
      subjectId: organization.id,
      event: "organization.under_review",
      actor: SYSTEM_ACTOR,
      organizationId: organization.id,
      properties: { from: "needs_more_info", to: "under_review", note },
    }),
  ]);
}
