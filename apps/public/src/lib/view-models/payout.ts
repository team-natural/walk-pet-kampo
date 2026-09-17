import type { payouts } from "@app/schema";

type Row = typeof payouts.$inferSelect;

// Amounts are integer yen, not decimals — formatting happens in the template, never by dividing.
export type PayoutSummary = { id: string } & Pick<Row, "periodStart" | "periodEnd" | "payoutAmount" | "status" | "paidAt">;

export type PayoutDetail = PayoutSummary & Pick<Row, "totalReservations" | "totalParticipants" | "grossAmount" | "adjustmentAmount" | "scheduledAt" | "notes">;
