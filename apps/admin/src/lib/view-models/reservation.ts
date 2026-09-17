import type { payments, reservations } from "@app/schema";

type Row = typeof reservations.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;

export type ReservationSummary = { id: string; organizationName: string; walkerName: string; walkSlotTitle: string } & Pick<Row, "participantCount" | "status" | "createdAt">;

export type ReservationDetail = ReservationSummary & { payment: PaymentSummary | null } & Pick<Row, "emergencyContactNameSnapshot" | "emergencyContactPhoneSnapshot" | "expiresAt" | "cancelledReason" | "cancelledAt" | "updatedAt">;

// `stripePaymentIntentId` is shown so an operator can find the charge in the Stripe dashboard
// during a refund (SYS-16). It is deliberately absent from apps/public's PaymentSummary.
export type PaymentSummary = { id: string } & Pick<PaymentRow, "amount" | "organizationShareAmount" | "platformFeeAmount" | "currency" | "status" | "stripePaymentIntentId" | "paidAt" | "refundedAt" | "refundAmount" | "failureReason">;
