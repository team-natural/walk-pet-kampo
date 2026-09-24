// Display labels for WalkSlot.status. DEV-09 §2-6-1 is the source — reword there first.
export const WALK_SLOT_STATUS_LABELS: Record<string, string> = {
  draft: "下書き",
  scheduled: "公開予定",
  open: "募集中",
  full: "満員",
  closed: "受付終了",
  cancelled: "開催中止",
  completed: "実施済み",
  unpublished: "非公開",
};

export function walkSlotStatusLabel(status: string): string {
  return WALK_SLOT_STATUS_LABELS[status] ?? status;
}
