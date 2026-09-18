// Placeholder data for the skeleton screens, so a page binds to its real view model before the
// Service that will supply it exists (PRD-04 §3). Every fixture is typed by the view model, so a
// field the table does not have fails to compile here rather than in the template.
//
// These are temporary. `tests/unit/screens.test.ts` counts the pages still importing this file —
// that count is the remaining work, and reaching zero is what "the screens are implemented" means.
import type { AdoptionInquiryDetail, AdoptionInquirySummary } from "$lib/view-models/adoption-inquiry";
import type { OrganizationDashboardView } from "$lib/view-models/dashboard";
import type { DogDetail, DogSummary } from "$lib/view-models/dog";
import type { IncidentDetail, IncidentSummary } from "$lib/view-models/incident";
import type { NotificationSettingView, NotificationView } from "$lib/view-models/notification";
import type { OrganizationMemberView } from "$lib/view-models/organization-member";
import type { OrganizationDetail, OrganizationSummary } from "$lib/view-models/organization";
import type { PayoutDetail, PayoutSummary } from "$lib/view-models/payout";
import type { PaymentSummary, ReservationDetail, ReservationSummary } from "$lib/view-models/reservation";
import type { WalkRecordDetail, WalkRecordSummary } from "$lib/view-models/walk-record";
import type { WalkSlotDetail, WalkSlotSummary } from "$lib/view-models/walk-slot";
import type { WalkerAccount, WalkerProfileView } from "$lib/view-models/walker";

const NOW = "2026-09-17T09:00:00.000Z";

export const mockOrganizationSummary: OrganizationSummary = {
  id: "01HZZORGANIZATION0000000001",
  name: "きた保護犬ネットワーク",
  slug: "kita-rescue-network",
  status: "approved",
  activityArea: "東京都北区・板橋区",
  logoKey: "organizations/01HZZORGANIZATION0000000001/logo.png",
  protectedDogCount: 24,
};

export const mockOrganizationDetail: OrganizationDetail = {
  ...mockOrganizationSummary,
  nameKana: "キタホゴケンネットワーク",
  orgType: "npo",
  representativeName: "北川 一郎",
  addressVisibility: "city_only",
  address: "東京都北区赤羽1-1-1",
  latitude: 35.7776,
  longitude: 139.7207,
  website: "https://example.test/kita-rescue",
  snsLinks: null,
  activityStartedOn: "2015-04-01",
  introduction: "北区を中心に保護犬の一時預かりと譲渡活動を行っています。",
  adoptionTrackRecord: "年間 約 60 頭",
};

export const mockOrganizations: OrganizationSummary[] = [
  mockOrganizationSummary,
  {
    id: "01HZZORGANIZATION0000000002",
    name: "ねりまワンだふるハウス",
    slug: "nerima-wonderful-house",
    status: "approved",
    activityArea: "東京都練馬区・杉並区",
    logoKey: null,
    protectedDogCount: 11,
  },
  {
    id: "01HZZORGANIZATION0000000003",
    name: "多摩リバーサイド・ドッグレスキュー",
    slug: "tama-riverside-rescue",
    status: "approved",
    activityArea: "神奈川県川崎市・横浜市",
    logoKey: null,
    protectedDogCount: 32,
  },
];

export const mockDogSummary: DogSummary = {
  id: "01HZZDOG00000000000000001",
  slug: "momo",
  name: "モモ",
  breed: "柴犬ミックス",
  size: "medium",
  gender: "female",
  estimatedAge: "推定 3 歳",
  adoptionStatus: "listed",
  photoKey: "dogs/01HZZDOG00000000000000001/main.jpg",
  walkEligible: 1,
};

export const mockDogDetail: DogDetail = {
  ...mockDogSummary,
  weight: 9.4,
  temperament: "人懐こく穏やか",
  humanSociability: "高い",
  dogSociability: "普通",
  walkNotes: "引きは強くありません。自転車に驚くことがあります。",
  requiredExperience: "none",
  beginnerAllowed: 1,
  childAllowed: 0,
  multiDogAllowed: 1,
  introduction: "保護時は警戒心が強かったものの、今では散歩が大好きです。",
};

export const mockDogs: DogSummary[] = [mockDogSummary];

export const mockWalkSlotSummary: WalkSlotSummary = {
  id: "01HZZWALKSLOT000000000001",
  title: "朝の荒川河川敷さんぽ",
  startAt: "2026-10-03T00:00:00.000Z",
  durationMinutes: 60,
  areaPrefecture: "東京都",
  areaCity: "北区",
  capacity: 4,
  remainingCapacity: 2,
  feePerPerson: 500,
  status: "open",
  beginnerAllowed: 1,
};

export const mockWalkSlotDetail: WalkSlotDetail = {
  ...mockWalkSlotSummary,
  organization: mockOrganizationSummary,
  dogs: mockDogs,
  description: "河川敷をゆっくり 1 時間歩きます。スタッフが同行します。",
  meetingPlace: "赤羽岩淵駅 2 番出口",
  latitude: 35.7836,
  longitude: 139.7229,
  acceptanceStartAt: "2026-09-19T00:00:00.000Z",
  acceptanceEndAt: "2026-10-01T00:00:00.000Z",
  staffAccompanied: 1,
  childAllowed: 0,
  minAge: 18,
  requiredExperience: "none",
  clothingNotes: "動きやすい服装・スニーカー",
  precautions: "雨天中止。前日 18 時までに連絡します。",
  weatherPolicy: "荒天時は中止",
  cancellationPolicy: "開催 48 時間前まで無料",
};

// Three entries rather than one: a list of a single card cannot be judged as a list, and the
// screens that render these are being designed before any Service exists.
export const mockWalkSlots: WalkSlotSummary[] = [
  mockWalkSlotSummary,
  {
    id: "01HZZWALKSLOT000000000002",
    title: "夕方の石神井公園さんぽ",
    startAt: "2026-10-04T08:30:00.000Z",
    durationMinutes: 45,
    areaPrefecture: "東京都",
    areaCity: "練馬区",
    capacity: 3,
    remainingCapacity: 1,
    feePerPerson: 500,
    status: "open",
    beginnerAllowed: 0,
  },
  {
    id: "01HZZWALKSLOT000000000003",
    title: "多摩川の土手をゆっくり歩く",
    startAt: "2026-10-11T00:30:00.000Z",
    durationMinutes: 90,
    areaPrefecture: "神奈川県",
    areaCity: "川崎市",
    capacity: 6,
    remainingCapacity: 5,
    feePerPerson: 500,
    status: "open",
    beginnerAllowed: 1,
  },
];

export const mockPaymentSummary: PaymentSummary = {
  id: "01HZZPAYMENT00000000000001",
  amount: 500,
  currency: "JPY",
  status: "paid",
  paidAt: NOW,
  refundedAt: null,
  refundAmount: null,
};

export const mockReservationSummary: ReservationSummary = {
  id: "01HZZRESERVATION0000000001",
  walkSlot: mockWalkSlotSummary,
  participantCount: 1,
  status: "confirmed",
  createdAt: NOW,
};

export const mockReservationDetail: ReservationDetail = {
  ...mockReservationSummary,
  payment: mockPaymentSummary,
  emergencyContactNameSnapshot: "山田 花子",
  emergencyContactPhoneSnapshot: "090-0000-0000",
  expiresAt: null,
  cancelledReason: null,
  cancelledAt: null,
};

export const mockReservations: ReservationSummary[] = [mockReservationSummary];

export const mockWalkerAccount: WalkerAccount = {
  id: "01HZZWALKER0000000000001",
  name: "山田 太郎",
  email: "walker@example.test",
};

export const mockWalkerProfile: WalkerProfileView = {
  id: "01HZZWALKERPROFILE00000001",
  nameKana: "ヤマダ タロウ",
  birthdate: "1992-05-14",
  gender: "male",
  postalCode: "1150045",
  address: "東京都北区赤羽2-2-2",
  phone: "090-1111-2222",
  phoneVerifiedAt: NOW,
  emergencyContactName: "山田 花子",
  emergencyContactPhone: "090-0000-0000",
  dogExperience: 1,
  largeDogWalkExperience: 0,
  preferredArea: "東京都北区",
  guardianName: null,
  guardianPhone: null,
  termsAgreedAt: NOW,
  termsAgreedVersion: "2026-09-01",
  status: "active",
};

export const mockWalkRecordSummary: WalkRecordSummary = {
  id: "01HZZWALKRECORD00000000001",
  walkSlot: mockWalkSlotSummary,
  conducted: 1,
  conductedAt: NOW,
  incidentFlag: 0,
};

export const mockWalkRecordDetail: WalkRecordDetail = {
  ...mockWalkRecordSummary,
  dogsWalked: "モモ",
  photoKeys: "walk-records/01HZZWALKRECORD00000000001/1.jpg",
  staffComment: "終始落ち着いて歩けました。",
};

export const mockWalkRecords: WalkRecordSummary[] = [mockWalkRecordSummary];

export const mockAdoptionInquirySummary: AdoptionInquirySummary = {
  id: "01HZZADOPTIONINQUIRY000001",
  dog: mockDogSummary,
  status: "received",
  createdAt: NOW,
};

export const mockAdoptionInquiryDetail: AdoptionInquiryDetail = {
  ...mockAdoptionInquirySummary,
  organization: mockOrganizationSummary,
  motivation: "散歩で会って以来、家族に迎えたいと考えています。",
  livingEnvironment: "戸建て・庭あり・在宅勤務",
  organizationContactedAt: null,
  closedAt: null,
};

export const mockAdoptionInquiries: AdoptionInquirySummary[] = [mockAdoptionInquirySummary];

export const mockIncidentSummary: IncidentSummary = {
  id: "01HZZINCIDENT000000000001",
  reportedByName: "北川 一郎",
  severity: "P2",
  category: "dog_condition",
  occurredAt: NOW,
  status: "reported",
};

export const mockIncidentDetail: IncidentDetail = {
  ...mockIncidentSummary,
  description: "散歩中に足を引きずる様子が見られたため中断しました。",
  location: "荒川河川敷",
  preventionMeasures: null,
  attachmentKeys: null,
  resolvedAt: null,
};

export const mockIncidents: IncidentSummary[] = [mockIncidentSummary];

export const mockPayoutSummary: PayoutSummary = {
  id: "01HZZPAYOUT00000000000001",
  periodStart: "2026-08-01",
  periodEnd: "2026-08-31",
  payoutAmount: 24000,
  status: "paid",
  paidAt: NOW,
};

export const mockPayoutDetail: PayoutDetail = {
  ...mockPayoutSummary,
  totalReservations: 60,
  totalParticipants: 60,
  grossAmount: 24000,
  adjustmentAmount: 0,
  scheduledAt: NOW,
  notes: null,
};

export const mockPayouts: PayoutSummary[] = [mockPayoutSummary];

export const mockNotifications: NotificationView[] = [
  {
    id: "01HZZNOTIFICATION00000001",
    body: "お散歩の 3 日前になりました。持ち物をご確認ください。",
    type: "walk_reminder",
    readAt: null,
    createdAt: NOW,
  },
];

export const mockNotificationSettings: NotificationSettingView[] = [
  { type: "walk_reminder", emailEnabled: true, inAppEnabled: true },
  { type: "adoption_inquiry_update", emailEnabled: true, inAppEnabled: true },
];

export const mockOrganizationMembers: OrganizationMemberView[] = [
  {
    role: "org_admin",
    name: "北川 一郎",
    email: "admin@kita-rescue.example.test",
    status: "active",
    joinedAt: NOW,
    leftAt: null,
  },
];

export const mockOrganizationDashboard: OrganizationDashboardView = {
  tiles: [
    { label: "公開中のお散歩枠", value: 6, href: "/organization/walks" },
    { label: "今週の予約", value: 12, href: "/organization/reservations" },
    { label: "未対応の里親相談", value: 2, href: "/organization/adoption-inquiries" },
    { label: "今月の還元見込", value: 24000, href: "/organization/payouts" },
  ],
  upcomingWalks: [{ id: mockWalkSlotSummary.id, title: mockWalkSlotSummary.title, startAt: mockWalkSlotSummary.startAt, reservedCount: 2, capacity: 4 }],
  recentReservations: [{ id: mockReservationSummary.id, walkerName: "山田 太郎", walkSlotTitle: mockWalkSlotSummary.title, status: "confirmed", createdAt: NOW }],
};
