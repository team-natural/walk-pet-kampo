// Display labels for the state machines, copied from DEV-09 — that document is the source, so
// reword there first and follow here.
//
// Keyed per entity, never merged into one table: the same key means different things across
// machines. `scheduled` reads differently under WalkSlot, Reservation and Payout.
export type StatusTone = "neutral" | "info" | "positive" | "warning" | "danger";

export type StatusMeta = { label: string; tone: StatusTone };

type StatusMap = Record<string, StatusMeta>;

const ORGANIZATION: StatusMap = {
  pending_review: { label: "申請受付", tone: "info" },
  under_review: { label: "審査中", tone: "warning" },
  needs_more_info: { label: "追加確認依頼中", tone: "warning" },
  approved: { label: "承認済", tone: "positive" },
  rejected: { label: "否認", tone: "danger" },
  suspended: { label: "掲載停止", tone: "danger" },
  deactivated: { label: "活動停止", tone: "neutral" },
  withdrawn: { label: "退会", tone: "neutral" },
};

const ORGANIZATION_MEMBER: StatusMap = {
  invited: { label: "招待中", tone: "info" },
  active: { label: "所属中", tone: "positive" },
  suspended: { label: "利用停止", tone: "danger" },
};

const WALKER_PROFILE: StatusMap = {
  provisional: { label: "仮登録", tone: "neutral" },
  pending_verification: { label: "確認待ち", tone: "warning" },
  active: { label: "利用可能", tone: "positive" },
  restricted: { label: "利用制限", tone: "warning" },
  suspended: { label: "利用停止", tone: "danger" },
  withdrawn: { label: "退会", tone: "neutral" },
};

const DOG: StatusMap = {
  not_listed: { label: "里親募集前", tone: "neutral" },
  listed: { label: "里親募集中", tone: "positive" },
  in_consultation: { label: "相談中", tone: "info" },
  in_trial: { label: "トライアル中", tone: "info" },
  adopted: { label: "譲渡決定", tone: "positive" },
  listing_closed: { label: "募集終了", tone: "neutral" },
};

const WALK_SLOT: StatusMap = {
  draft: { label: "下書き", tone: "neutral" },
  scheduled: { label: "公開予定", tone: "info" },
  open: { label: "募集中", tone: "positive" },
  full: { label: "定員到達", tone: "warning" },
  closed: { label: "受付終了", tone: "neutral" },
  cancelled: { label: "開催中止", tone: "danger" },
  completed: { label: "実施完了", tone: "neutral" },
  unpublished: { label: "非公開", tone: "neutral" },
};

const RESERVATION: StatusMap = {
  processing: { label: "予約手続き中", tone: "info" },
  awaiting_payment: { label: "決済待ち", tone: "warning" },
  confirmed: { label: "予約確定", tone: "positive" },
  organization_reviewing: { label: "団体確認中", tone: "info" },
  scheduled: { label: "実施予定", tone: "info" },
  completed: { label: "実施完了", tone: "neutral" },
  cancelled_by_walker: { label: "参加者キャンセル", tone: "danger" },
  cancelled_by_organization: { label: "団体キャンセル", tone: "danger" },
  cancelled_by_platform: { label: "運営キャンセル", tone: "danger" },
  no_show: { label: "無断キャンセル", tone: "danger" },
  cancelled_weather: { label: "天候による中止", tone: "warning" },
  cancelled_dog_condition: { label: "犬の体調による中止", tone: "warning" },
};

const PAYMENT: StatusMap = {
  unpaid: { label: "未決済", tone: "warning" },
  processing: { label: "決済処理中", tone: "info" },
  paid: { label: "決済済み", tone: "positive" },
  failed: { label: "決済失敗", tone: "danger" },
  refund_processing: { label: "返金処理中", tone: "info" },
  refunded: { label: "返金済み", tone: "neutral" },
  partially_refunded: { label: "一部返金", tone: "neutral" },
};

const PAYOUT: StatusMap = {
  uncollected: { label: "未集計", tone: "neutral" },
  aggregating: { label: "集計中", tone: "info" },
  confirmed: { label: "確定", tone: "positive" },
  scheduled: { label: "振込予定", tone: "info" },
  paid: { label: "振込済み", tone: "positive" },
  on_hold: { label: "保留", tone: "warning" },
  failed: { label: "組戻し・エラー", tone: "danger" },
};

const INCIDENT: StatusMap = {
  reported: { label: "報告受付", tone: "danger" },
  investigating: { label: "調査中", tone: "warning" },
  in_progress: { label: "対応中", tone: "warning" },
  resolved: { label: "解決", tone: "positive" },
  closed: { label: "クローズ", tone: "neutral" },
};

const ADOPTION_INQUIRY: StatusMap = {
  received: { label: "受付", tone: "info" },
  organization_reviewing: { label: "団体確認中", tone: "info" },
  contacted: { label: "連絡済み", tone: "info" },
  interview_scheduled: { label: "面談予定", tone: "info" },
  transferred_to_organization_process: { label: "団体手続きへ移行", tone: "positive" },
  closed: { label: "相談終了", tone: "neutral" },
  withdrawn: { label: "取下げ", tone: "neutral" },
};

const INQUIRY: StatusMap = {
  new: { label: "未対応", tone: "warning" },
  in_progress: { label: "対応中", tone: "info" },
  resolved: { label: "対応完了", tone: "positive" },
};

export const STATUS_MAPS = {
  organization: ORGANIZATION,
  organizationMember: ORGANIZATION_MEMBER,
  walkerProfile: WALKER_PROFILE,
  dog: DOG,
  walkSlot: WALK_SLOT,
  reservation: RESERVATION,
  payment: PAYMENT,
  payout: PAYOUT,
  incident: INCIDENT,
  adoptionInquiry: ADOPTION_INQUIRY,
  inquiry: INQUIRY,
} satisfies Record<string, StatusMap>;

export type StatusDomain = keyof typeof STATUS_MAPS;

// Falls back to the raw value rather than throwing: a state added in the schema before it reaches
// this table must still render, or the whole screen 500s over one unmapped row.
export function statusMeta(domain: StatusDomain, value: string): StatusMeta {
  return STATUS_MAPS[domain][value] ?? { label: value, tone: "neutral" };
}

// Enum-ish columns that are not state machines. `orgType` and `gender` are free text in the
// schema, so unknown values pass through untranslated instead of rendering as blank.
const PLAIN_LABELS = {
  dogSize: { small: "小型", medium: "中型", large: "大型" },
  dogGender: { male: "オス", female: "メス" },
  requiredExperience: { none: "不問", some: "多少必要", experienced: "経験者向け" },
  memberRole: { org_admin: "団体管理者", org_staff: "スタッフ" },
  orgType: { npo: "NPO法人", general_incorporated: "一般社団法人", voluntary: "任意団体", individual: "個人" },
  addressVisibility: { prefecture_only: "都道府県まで", city_only: "市区町村まで", reservation_confirmed_only: "予約確定者のみ" },
  incidentCategory: {
    bite: "咬傷",
    escape: "脱走",
    injury: "けが",
    dog_condition: "犬の体調",
    walker_condition: "参加者の体調",
    property_damage: "物損",
    interpersonal_trouble: "対人トラブル",
    unauthorized_photo: "無断撮影",
    harassment: "ハラスメント",
    other: "その他",
  },
} satisfies Record<string, Record<string, string>>;

export type LabelDomain = keyof typeof PLAIN_LABELS;

export function label(domain: LabelDomain, value: string | null): string {
  if (value === null) return "—";
  return (PLAIN_LABELS[domain] as Record<string, string>)[value] ?? value;
}

// SQLite has no boolean, so these arrive as 0/1 integers (DEV-07).
export function yesNo(value: number | null, yes = "あり", no = "なし"): string {
  if (value === null) return "—";
  return value ? yes : no;
}
