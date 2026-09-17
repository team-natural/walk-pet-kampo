import type { incidents } from "@app/schema";

type Row = typeof incidents.$inferSelect;

// `reportedByType` / `reportedById` are polymorphic (DEV-07 §5-15). The Service resolves them to
// a display name; a page must not join on the raw pair itself.
export type IncidentSummary = { id: string; reportedByName: string } & Pick<Row, "severity" | "category" | "occurredAt" | "status">;

export type IncidentDetail = IncidentSummary & Pick<Row, "description" | "location" | "preventionMeasures" | "attachmentKeys" | "resolvedAt">;
