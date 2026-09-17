import type { payouts } from "@app/schema";

type Row = typeof payouts.$inferSelect;

// Amounts are integer yen, not decimals — formatting happens in the template, never by dividing.
export type PayoutSummary = { id: string; organizationName: string } & Pick<Row, "periodStart" | "periodEnd" | "payoutAmount" | "status" | "scheduledAt" | "paidAt">;

export type PayoutDetail = PayoutSummary & Pick<Row, "totalReservations" | "totalParticipants" | "grossAmount" | "adjustmentAmount" | "stripeTransferId" | "notes" | "updatedAt">;
