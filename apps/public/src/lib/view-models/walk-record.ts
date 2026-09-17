import type { walkRecords } from "@app/schema";
import type { WalkSlotSummary } from "./walk-slot";

type Row = typeof walkRecords.$inferSelect;

// `photoKeys` holds R2 object keys, not URLs. A page renders them through the signed-URL API
// route rather than linking the key directly (GOV-01 D-024).
export type WalkRecordSummary = { id: string; walkSlot: WalkSlotSummary } & Pick<Row, "conducted" | "conductedAt" | "incidentFlag">;

export type WalkRecordDetail = WalkRecordSummary & Pick<Row, "dogsWalked" | "photoKeys" | "staffComment">;
