// Money and the cancellation rules, in one place (GOV-01 D-016, DEV-06 §1-1). SCR-18, SCR-25 and
// SCR-43 must all state the same figures, and a number typed into a template is how they stop
// matching.
//
// A walk slot carries its own `fee_per_person` (DEV-07 §5-9), so a screen showing a specific
// slot reads that column — these are the defaults and the values shown where no slot is in
// context. They are `[Assumed]` pending GOV-02 TBD-01/02/03 (who absorbs the payment fee, tax
// treatment, whether the shelter share is fixed).
export const PARTICIPATION_FEE = 500;
export const ORGANIZATION_SHARE = 400;
export const PLATFORM_FEE = PARTICIPATION_FEE - ORGANIZATION_SHARE;

// `[Assumed]` pending GOV-02 TBD-10/11/12. The contract wording lives in OPS-01 §4-3; this is
// the machine-readable half that the screens render and the refund calculation will read.
export const CANCELLATION = {
  /** Hours before the walk starts up to which cancelling is free. */
  freeCancellationHours: 48,
  /** Refund rate once inside that window, as a fraction of the fee paid. */
  lateCancellationRefundRate: 0,
  /** Refund rate for a no-show. */
  noShowRefundRate: 0,
} as const;

export function formatYen(amount: number): string {
  return `${amount.toLocaleString("ja-JP")} 円`;
}
