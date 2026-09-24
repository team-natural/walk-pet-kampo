// Display labels for AdoptionInquiry.status. DEV-09 §2-11-1 is the source — reword there first.
// Both sides read these: the walker's history (SCR-30/31) and the shelter's list (ADM-20/21).
export const ADOPTION_INQUIRY_STATUS_LABELS: Record<string, string> = {
  received: "受付",
  organization_reviewing: "団体確認中",
  contacted: "連絡済み",
  interview_scheduled: "面談予定",
  transferred_to_organization_process: "団体の手続きへ",
  closed: "相談終了",
  withdrawn: "取下げ",
};

export function adoptionInquiryStatusLabel(status: string): string {
  return ADOPTION_INQUIRY_STATUS_LABELS[status] ?? status;
}
