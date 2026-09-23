// The notification catalogue. DEV-07 §5-18 leaves `notification_type` open — it names three
// examples and stops — so the closed set lives here, in one place both the settings screens and
// every sender read, rather than as a string literal typed twice and misspelt once.
//
// A phase that introduces a new event adds its type here. `optional: false` is the part that is
// not a preference: SCR-48 promises that transactional mail always arrives, so those types skip
// the settings lookup entirely.

export type NotificationAudience = "walker" | "organization_member";

export interface NotificationTypeDefinition {
  label: string;
  description: string;
  audience: NotificationAudience;
  /** false = transactional. Always delivered, never listed on the settings screen. */
  optional: boolean;
}

export const NOTIFICATION_TYPES = {
  // Walker (SCR-48)
  reservation_confirmed: { label: "予約の確定", description: "決済が完了し、おさんぽの予約が確定したとき。", audience: "walker", optional: false },
  reservation_cancelled: { label: "予約の中止・キャンセル", description: "団体の都合や天候で中止になったとき。", audience: "walker", optional: false },
  walk_reminder: { label: "おさんぽ前のリマインド", description: "開催日が近づいたときの持ち物のご案内。", audience: "walker", optional: true },
  walk_record_published: { label: "おさんぽ記録の公開", description: "参加したおさんぽの記録が公開されたとき。", audience: "walker", optional: true },
  adoption_inquiry_update: { label: "里親相談の進捗", description: "相談した保護団体から連絡があったとき。", audience: "walker", optional: true },

  // OrganizationMember (ADM-27)
  organization_review_result: { label: "審査結果", description: "運営による団体登録の審査結果。", audience: "organization_member", optional: false },
  reservation_created: { label: "新しい予約", description: "おさんぽ募集に予約が入ったとき。", audience: "organization_member", optional: true },
  adoption_inquiry_received: { label: "里親相談の受付", description: "保護犬への里親相談が届いたとき。", audience: "organization_member", optional: true },
  incident_update: { label: "事故・トラブルの対応", description: "報告した事故・トラブルの対応状況が変わったとき。", audience: "organization_member", optional: true },
  payout_confirmed: { label: "還元額の確定", description: "月次の還元額が確定し、振込予定が決まったとき。", audience: "organization_member", optional: true },
} as const satisfies Record<string, NotificationTypeDefinition>;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;

export function isNotificationType(value: string): value is NotificationType {
  return value in NOTIFICATION_TYPES;
}

// The settings screens render this, so the order here is the order on screen.
export function optionalTypesFor(audience: NotificationAudience): NotificationType[] {
  return (Object.keys(NOTIFICATION_TYPES) as NotificationType[]).filter((type) => NOTIFICATION_TYPES[type].audience === audience && NOTIFICATION_TYPES[type].optional);
}

export function notificationLabel(type: string): string {
  return isNotificationType(type) ? NOTIFICATION_TYPES[type].label : type;
}
