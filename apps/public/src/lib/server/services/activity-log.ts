// Audit log writer for apps/public. A deliberate copy of apps/admin's, not a shared module: the
// two apps must not import each other (DEV-01 §5), and the column vocabulary is what has to stay
// identical, not the code (DEV-05 §9-1).
import { activityLog } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import type { OrganizationSession } from "../auth/organization-session";

// DEV-09 §3-1's Actor, stored verbatim in causer_type (GOV-01 D-033).
export type CauserType = "walker" | "organization_member" | "platform" | "system";

export interface Actor {
  type: CauserType;
  // Null only for `system`: a Cron or Webhook change has no human behind it.
  id: number | null;
}

export function walkerActor(walkerId: number): Actor {
  return { type: "walker", id: walkerId };
}

export function organizationMemberActor(session: OrganizationSession): Actor {
  return { type: "organization_member", id: session.organizationMemberId };
}

export const SYSTEM_ACTOR: Actor = { type: "system", id: null };

export interface ActivityLogEntry {
  logName?: string;
  description: string;
  subjectType?: string;
  subjectId?: number;
  event?: string;
  actor: Actor;
  /** The tenant the change belongs to. Organization-scoped work must pass it (DEV-05 §9-1). */
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
