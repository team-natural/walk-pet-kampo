// SYS-19 / SYS-20 (F-15-10). Read-only until P14: `incidents.status` has one writer and it lives
// in apps/public (DEV-09 §3-1), so the operator advancing a report goes through the RPC that
// GOV-02 TBD-58 still has to settle.
import { dogs, incidents, organizationMembers, organizations, walkers } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { NotFoundError } from "@app/server-kit/http";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import type { IncidentDetail, IncidentSummary } from "../../view-models/incident";

type IncidentRow = typeof incidents.$inferSelect;

// The polymorphic reporter (DEV-07 §5-15) is resolved here; a page must not join on the raw pair.
async function reporterName(db: DbClient, row: IncidentRow): Promise<string> {
  if (row.reportedByType === "organization_member") {
    const [member] = await db.select({ name: organizationMembers.name }).from(organizationMembers).where(eq(organizationMembers.id, row.reportedById)).limit(1);
    return member?.name ?? "（退出したスタッフ）";
  }
  if (row.reportedByType === "walker") {
    const [walker] = await db.select({ name: walkers.name }).from(walkers).where(eq(walkers.id, row.reportedById)).limit(1);
    return walker?.name ?? "（退会した参加者）";
  }
  return "運営";
}

function toSummary(row: IncidentRow, organizationName: string, reportedByName: string): IncidentSummary {
  return { id: row.publicId, organizationName, reportedByName, severity: row.severity, category: row.category, occurredAt: row.occurredAt, status: row.status };
}

const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;

// Open reports first, then the rest — an operator opening this screen is looking for what still
// needs them, and severity is the wrong sort when a P3 has been open for a week.
const OPEN_STATES: IncidentRow["status"][] = ["reported", "investigating", "in_progress"];

export async function listIncidents(db: DbClient, options: { beforeId?: number | null; perPage?: number; openOnly?: boolean } = {}) {
  const perPage = Math.min(Math.max(options.perPage ?? DEFAULT_PER_PAGE, 1), MAX_PER_PAGE);
  const rows = await db
    .select({ incident: incidents, organizationName: organizations.name })
    .from(incidents)
    .innerJoin(organizations, eq(incidents.organizationId, organizations.id))
    .where(and(options.beforeId ? lt(incidents.id, options.beforeId) : undefined, options.openOnly ? inArray(incidents.status, OPEN_STATES) : undefined))
    .orderBy(desc(incidents.id))
    .limit(perPage + 1);

  const hasMore = rows.length > perPage;
  const page = rows.slice(0, perPage);
  const items = await Promise.all(page.map(async (row) => toSummary(row.incident, row.organizationName, await reporterName(db, row.incident))));
  return { items, perPage, nextId: hasMore ? page[page.length - 1]!.incident.id : null };
}

export async function getIncidentByPublicId(db: DbClient, publicId: string): Promise<IncidentDetail> {
  const [row] = await db.select({ incident: incidents, organizationName: organizations.name }).from(incidents).innerJoin(organizations, eq(incidents.organizationId, organizations.id)).where(eq(incidents.publicId, publicId)).limit(1);

  if (!row) throw new NotFoundError("報告が見つかりません。");

  // Both are optional on the table: a report can be about a dog, a participant, both or neither.
  const [dog] = row.incident.dogId === null ? [] : await db.select({ name: dogs.name }).from(dogs).where(eq(dogs.id, row.incident.dogId)).limit(1);
  const [walker] = row.incident.walkerId === null ? [] : await db.select({ name: walkers.name }).from(walkers).where(eq(walkers.id, row.incident.walkerId)).limit(1);

  return {
    ...toSummary(row.incident, row.organizationName, await reporterName(db, row.incident)),
    walkerName: walker?.name ?? null,
    dogName: dog?.name ?? null,
    description: row.incident.description,
    location: row.incident.location,
    preventionMeasures: row.incident.preventionMeasures,
    attachmentKeys: row.incident.attachmentKeys,
    resolvedAt: row.incident.resolvedAt,
    updatedAt: row.incident.updatedAt,
  };
}
