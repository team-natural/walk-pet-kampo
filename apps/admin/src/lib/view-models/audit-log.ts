import type { activityLog } from "@app/schema";

type Row = typeof activityLog.$inferSelect;

// `causerType` is one of the three account systems plus batch runs, so the Service resolves the
// pair to a name rather than the screen assuming AdminUser (DEV-09 §3-5).
// `properties` is a JSON string — the Service parses it; a page must not call JSON.parse itself.
export type AuditLogEntry = { id: number; causerName: string; properties: Record<string, unknown> } & Pick<Row, "logName" | "description" | "subjectType" | "subjectId" | "event" | "causerType" | "batchId" | "createdAt">;
