import type { payments, reservations } from "@app/schema";
import type { WalkSlotSummary } from "./walk-slot";

type Row = typeof reservations.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;

// The emergency-contact snapshots are disclosed to the walk's staff only after the reservation is
// confirmed (DEV-02 §8-1). They are absent from the summary on purpose.
export type ReservationSummary = { id: string; walkSlot: WalkSlotSummary } & Pick<Row, "participantCount" | "status" | "createdAt">;

export type ReservationDetail = ReservationSummary & { payment: PaymentSummary | null } & Pick<Row, "emergencyContactNameSnapshot" | "emergencyContactPhoneSnapshot" | "expiresAt" | "cancelledReason" | "cancelledAt">;

export type PaymentSummary = { id: string } & Pick<PaymentRow, "amount" | "currency" | "status" | "paidAt" | "refundedAt" | "refundAmount">;
