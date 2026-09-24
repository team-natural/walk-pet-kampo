// Incident (FG-12). Reported by the shelter's staff, worked through by them, and — for the two
// top severities — put in front of the operator the moment it lands (F-12-02).
import { dogs, incidents, organizationMembers, organizations, walkers } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { ulid } from "@app/schema/ulid";
import { InvalidStateTransitionError, NotFoundError, ValidationError } from "@app/server-kit/http";
import { assertWithinRateLimit } from "@app/server-kit/rate-limit";
import { and, desc, eq } from "drizzle-orm";
import type { IncidentDetail, IncidentSummary } from "../../view-models/incident";
import type { OrganizationSession } from "../auth/organization-session";
import { activityLogInsert, organizationMemberActor } from "./activity-log";
import { notificationInsert } from "./notifications";
import { putUpload } from "./uploads";

type IncidentRow = typeof incidents.$inferSelect;
export type IncidentStatus = IncidentRow["status"];
export type IncidentSeverity = IncidentRow["severity"];

// DEV-09 §2-10-2: a straight line, plus one shortcut. Everything ends at `closed`.
const TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  reported: ["investigating"],
  investigating: ["in_progress"],
  in_progress: ["resolved"],
  resolved: ["closed"],
  closed: [],
};

// The shortcut exists because a bite or an escape does not wait for an investigation step to be
// ticked off — the shelter is already dealing with it.
const URGENT: IncidentSeverity[] = ["P0", "P1"];

export function allowedIncidentTransitions(status: IncidentStatus, severity: IncidentSeverity): IncidentStatus[] {
  const base = TRANSITIONS[status] ?? [];
  return status === "reported" && URGENT.includes(severity) ? [...base, "in_progress"] : base;
}

export function isUrgent(severity: IncidentSeverity): boolean {
  return URGENT.includes(severity);
}

export interface IncidentInput {
  severity: IncidentSeverity;
  category: IncidentRow["category"];
  occurredAt: string;
  location: string | null;
  description: string;
}

// `reported_by` is polymorphic (DEV-07 §5-15), so the name is resolved here rather than joined in
// a page: three tables can answer, and only this layer knows which one to ask.
async function reporterName(db: DbClient, row: IncidentRow): Promise<string> {
  if (row.reportedByType === "organization_member") {
    const [member] = await db.select({ name: organizationMembers.name }).from(organizationMembers).where(eq(organizationMembers.id, row.reportedById)).limit(1);
    return member?.name ?? "（退出したスタッフ）";
  }
  if (row.reportedByType === "walker") {
    const [walker] = await db.select({ name: walkers.name }).from(walkers).where(eq(walkers.id, row.reportedById)).limit(1);
    return walker?.name ?? "（退会した参加者）";
  }
  // AdminUser lives in the other app's half of the schema; the operator is named generically
  // rather than joined across the boundary.
  return "運営";
}

function toSummary(row: IncidentRow, reportedByName: string): IncidentSummary {
  return { id: row.publicId, reportedByName, severity: row.severity, category: row.category, occurredAt: row.occurredAt, status: row.status };
}

function toDetail(row: IncidentRow, reportedByName: string): IncidentDetail {
  return { ...toSummary(row, reportedByName), description: row.description, location: row.location, preventionMeasures: row.preventionMeasures, attachmentKeys: row.attachmentKeys, resolvedAt: row.resolvedAt };
}

export interface CreatedIncident {
  publicId: string;
  severity: IncidentSeverity;
  category: IncidentRow["category"];
  occurredAt: string;
  description: string;
  organizationName: string;
}

// F-12-01. Attachments are private (DEV-10 §4-3): they can show an injury, so they are never
// served by key — only through the signed route.
export async function createIncident(db: DbClient, kv: KVNamespace, bucket: R2Bucket, session: OrganizationSession, input: IncidentInput, attachments: File[] = []): Promise<CreatedIncident> {
  await assertWithinRateLimit(kv, "incidentReport", session.organizationMemberId);

  if (!input.description.trim()) throw new ValidationError({ description: ["状況を入力してください。"] });

  const publicId = ulid();
  const now = new Date().toISOString();

  const [inserted] = await db
    .insert(incidents)
    .values({
      publicId,
      organizationId: session.organizationId,
      severity: input.severity,
      category: input.category,
      description: input.description,
      occurredAt: input.occurredAt,
      location: input.location,
      reportedByType: "organization_member",
      reportedById: session.organizationMemberId,
      status: "reported",
      updatedAt: now,
    })
    .returning();

  // Bucket first, then the row that points at it — and only after the insert, because the key
  // includes the incident id (DEV-10 §4-2).
  if (attachments.length > 0) {
    const keys: string[] = [];
    for (const file of attachments) {
      const stored = await putUpload(bucket, "incidentAttachment", { organizationId: session.organizationId, subjectId: inserted!.id }, file);
      keys.push(stored.key);
    }
    await db
      .update(incidents)
      .set({ attachmentKeys: JSON.stringify(keys), updatedAt: now })
      .where(eq(incidents.id, inserted!.id));
  }

  await db.batch([
    activityLogInsert(db, {
      logName: "incident",
      description: `Incident reported (${input.severity} / ${input.category})`,
      subjectType: "Incident",
      subjectId: inserted!.id,
      event: "incident.reported",
      actor: organizationMemberActor(session),
      organizationId: session.organizationId,
      properties: { severity: input.severity, category: input.category },
    }),
  ]);

  return { publicId, severity: input.severity, category: input.category, occurredAt: input.occurredAt, description: input.description, organizationName: session.organizationName };
}

export async function listOwnIncidents(db: DbClient, organizationId: number): Promise<IncidentSummary[]> {
  const rows = await db.select().from(incidents).where(eq(incidents.organizationId, organizationId)).orderBy(desc(incidents.id));
  return Promise.all(rows.map(async (row) => toSummary(row, await reporterName(db, row))));
}

async function findOwnIncident(db: DbClient, organizationId: number, publicId: string): Promise<IncidentRow> {
  const [row] = await db
    .select()
    .from(incidents)
    .where(and(eq(incidents.organizationId, organizationId), eq(incidents.publicId, publicId)))
    .limit(1);
  if (!row) throw new NotFoundError("報告が見つかりません。");
  return row;
}

export async function getOwnIncident(db: DbClient, organizationId: number, publicId: string): Promise<IncidentDetail> {
  const row = await findOwnIncident(db, organizationId, publicId);
  return toDetail(row, await reporterName(db, row));
}

// F-12-03. The only writer of `incidents.status` on this side. DEV-09 §2-10-2 names both the
// shelter's staff and the operator as triggers; the operator's half reaches this through the RPC
// that arrives with P14 (GOV-02 TBD-58).
export async function transitionIncident(db: DbClient, session: OrganizationSession, publicId: string, to: IncidentStatus, preventionMeasures?: string | null): Promise<void> {
  const row = await findOwnIncident(db, session.organizationId, publicId);
  const from = row.status;
  if (from === to) return;
  if (!allowedIncidentTransitions(from, row.severity).includes(to)) throw new InvalidStateTransitionError("Incident", from, to);

  // Closing the loop without saying what was changed is how the same thing happens twice
  // (F-12-03).
  const measures = preventionMeasures?.trim() || row.preventionMeasures;
  if (to === "resolved" && !measures) throw new ValidationError({ preventionMeasures: ["再発防止策を入力してください。"] });

  const now = new Date().toISOString();
  await db.batch([
    db
      .update(incidents)
      .set({ status: to, preventionMeasures: measures, resolvedAt: to === "resolved" ? now : row.resolvedAt, updatedAt: now })
      .where(eq(incidents.id, row.id)),
    activityLogInsert(db, {
      logName: "incident",
      description: `Incident ${from} -> ${to}`,
      subjectType: "Incident",
      subjectId: row.id,
      event: `incident.${to}`,
      actor: organizationMemberActor(session),
      organizationId: session.organizationId,
      properties: { from, to },
    }),
    // The person who reported it hears about the move — unless they are the one making it.
    ...(row.reportedByType === "organization_member" && row.reportedById !== session.organizationMemberId
      ? [
          notificationInsert(db, {
            recipient: { type: "organization_member", id: row.reportedById },
            type: "incident_update",
            body: "報告した事故・トラブルの対応状況が更新されました。",
            href: `/organization/incidents/${row.publicId}`,
          }),
        ]
      : []),
  ]);
}

// SYS-19/20 read these too, but from apps/admin's own Service — the shelter's list stays scoped
// to one organization, which is what this file is for.
export async function countOpenIncidents(db: DbClient, organizationId: number): Promise<number> {
  const rows = await db
    .select({ id: incidents.id })
    .from(incidents)
    .where(and(eq(incidents.organizationId, organizationId), eq(incidents.status, "reported")));
  return rows.length;
}

export async function organizationNameFor(db: DbClient, organizationId: number): Promise<string> {
  const [row] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  return row?.name ?? "";
}

// Exposed for the shelter's own screens: which dog a report is about, when it names one.
export async function dogNameFor(db: DbClient, dogId: number | null): Promise<string | null> {
  if (dogId === null) return null;
  const [row] = await db.select({ name: dogs.name }).from(dogs).where(eq(dogs.id, dogId)).limit(1);
  return row?.name ?? null;
}
