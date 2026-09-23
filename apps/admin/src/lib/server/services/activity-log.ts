// Audit log writer. Called inline from the Service function performing the change, not from a
// cross-cutting logger that would have to re-derive what counts as loggable.
import { activityLog } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import type { Session } from "../auth/session";

// DEV-09 §3-1's Actor, stored verbatim in causer_type — the Service signature and the column speak
// one vocabulary, so nothing has to map between them. apps/public writes the same four values from
// its own copy of this helper.
export type CauserType = "walker" | "organization_member" | "platform" | "system";

export interface Actor {
  type: CauserType;
  // Null only for `system`: a Cron or Webhook change has no human behind it, and inventing a
  // "system" AdminUser row to point at would put a fake operator in the audit trail.
  id: number | null;
}

export function platformActor(session: Session): Actor {
  return { type: "platform", id: session.adminUserId };
}

export const SYSTEM_ACTOR: Actor = { type: "system", id: null };

export interface ActivityLogEntry {
  logName?: string;
  description: string;
  subjectType?: string;
  subjectId?: number;
  event?: string;
  actor: Actor;
  /** The tenant the change belongs to. Omit for platform-wide work that belongs to no organization. */
  organizationId?: number;
  properties?: Record<string, unknown>;
}

// Returned unexecuted so the caller can batch it with the change it describes — D1 runs a batch
// as one transaction, so the log cannot outlive a rolled-back write.
export function activityLogInsert(db: DbClient, entry: ActivityLogEntry) {
  return db.insert(activityLog).values({
    logName: entry.logName ?? null,
    description: entry.description,
    subjectType: entry.subjectType ?? null,
    subjectId: entry.subjectId ?? null,
    event: entry.event ?? null,
    causerType: entry.actor.type,
    causerId: entry.actor.id,
    organizationId: entry.organizationId ?? null,
    properties: entry.properties ? JSON.stringify(entry.properties) : null,
    batchId: null,
  });
}
