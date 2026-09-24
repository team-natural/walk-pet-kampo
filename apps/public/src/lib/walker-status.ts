// Display labels for WalkerProfile.status (DEV-09 §2-4-1 is the source; reword there first).
// The raw values are fine in an operator console, not on a screen a participant reads.
export const STATUS_LABELS: Record<string, string> = {
  provisional: "仮登録",
  pending_verification: "確認待ち",
  active: "利用可能",
  restricted: "利用制限中",
  suspended: "利用停止中",
  withdrawn: "退会済み",
};

export function walkerStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}
