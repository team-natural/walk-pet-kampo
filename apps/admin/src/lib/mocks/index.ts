// Placeholder data for the skeleton screens, so a page binds to its real view model before the
// Service that will supply it exists (PRD-04 §3). Every fixture is typed by the view model, so a
// field the table does not have fails to compile here rather than in the template.
//
// These are temporary. `tests/unit/screens.test.ts` counts the pages still importing this file —
// that count is the remaining work, and reaching zero is what "the screens are implemented" means.
import type { AuditLogEntry } from "$lib/view-models/audit-log";
import type { DashboardView } from "$lib/view-models/dashboard";
import type { DogDetail, DogSummary } from "$lib/view-models/dog";
import type { IncidentDetail, IncidentSummary } from "$lib/view-models/incident";
import type { PayoutDetail, PayoutSummary } from "$lib/view-models/payout";
import type { PaymentSummary, ReservationDetail, ReservationSummary } from "$lib/view-models/reservation";
import type { WalkerDetail, WalkerSummary } from "$lib/view-models/walker";

const NOW = "2026-09-17T09:00:00.000Z";
const ORGANIZATION_NAME = "きた保護犬ネットワーク";

export const mockWalkerSummary: WalkerSummary = {
  id: "01HZZWALKER0000000000001",
  name: "山田 太郎",
  email: "walker@example.test",
  profileStatus: "active",
  createdAt: NOW,
};

export const mockWalkerDetail: WalkerDetail = {
  ...mockWalkerSummary,
  reservationCount: 7,
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
  termsAgreedAt: NOW,
  termsAgreedVersion: "2026-09-01",
};

// A second row so the list screens render as a table rather than a single line — row striping and
// column alignment are invisible with one row.
export const mockWalkers: WalkerSummary[] = [mockWalkerSummary, { id: "01HZZWALKER0000000000002", name: "佐藤 花子", email: "walker2@example.test", profileStatus: "restricted", createdAt: "2026-08-02T01:30:00.000Z" }, { id: "01HZZWALKER0000000000003", name: "鈴木 次郎", email: "walker3@example.test", profileStatus: "suspended", createdAt: "2026-07-21T23:05:00.000Z" }];

export const mockDogSummary: DogSummary = {
  id: "01HZZDOG00000000000000001",
  organizationName: ORGANIZATION_NAME,
  slug: "momo",
  name: "モモ",
  breed: "柴犬ミックス",
  size: "medium",
  adoptionStatus: "listed",
  walkEligible: 1,
  isPublished: 1,
};

export const mockDogDetail: DogDetail = {
  ...mockDogSummary,
  gender: "female",
  weight: 9.4,
  estimatedAge: "推定 3 歳",
  temperament: "人懐こく穏やか",
  humanSociability: "高い",
  dogSociability: "普通",
  walkNotes: "引きは強くありません。自転車に驚くことがあります。",
  requiredExperience: "none",
  beginnerAllowed: 1,
  childAllowed: 0,
  multiDogAllowed: 1,
  introduction: "保護時は警戒心が強かったものの、今では散歩が大好きです。",
  photoKey: "dogs/01HZZDOG00000000000000001/main.jpg",
  internalNotes: "投薬中（2026-10 まで）。運営内のみ共有。",
  updatedAt: NOW,
};

export const mockDogs: DogSummary[] = [mockDogSummary];

export const mockPaymentSummary: PaymentSummary = {
  id: "01HZZPAYMENT00000000000001",
  amount: 500,
  organizationShareAmount: 400,
  platformFeeAmount: 100,
  currency: "JPY",
  status: "paid",
  stripePaymentIntentId: "pi_0000000000000000",
  paidAt: NOW,
  refundedAt: null,
  refundAmount: null,
  failureReason: null,
};

export const mockPayments: PaymentSummary[] = [mockPaymentSummary];

export const mockReservationSummary: ReservationSummary = {
  id: "01HZZRESERVATION0000000001",
  organizationName: ORGANIZATION_NAME,
  walkerName: "山田 太郎",
  walkSlotTitle: "朝の荒川河川敷さんぽ",
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
  updatedAt: NOW,
};

export const mockReservations: ReservationSummary[] = [mockReservationSummary];

export const mockPayoutSummary: PayoutSummary = {
  id: "01HZZPAYOUT00000000000001",
  organizationName: ORGANIZATION_NAME,
  periodStart: "2026-08-01",
  periodEnd: "2026-08-31",
  payoutAmount: 24000,
  status: "confirmed",
  scheduledAt: NOW,
  paidAt: null,
};

export const mockPayoutDetail: PayoutDetail = {
  ...mockPayoutSummary,
  totalReservations: 60,
  totalParticipants: 60,
  grossAmount: 24000,
  adjustmentAmount: 0,
  stripeTransferId: null,
  notes: null,
  updatedAt: NOW,
};

export const mockPayouts: PayoutSummary[] = [mockPayoutSummary];

export const mockIncidentSummary: IncidentSummary = {
  id: "01HZZINCIDENT000000000001",
  organizationName: ORGANIZATION_NAME,
  reportedByName: "北川 一郎",
  severity: "P2",
  category: "dog_condition",
  occurredAt: NOW,
  status: "reported",
};

export const mockIncidentDetail: IncidentDetail = {
  ...mockIncidentSummary,
  walkerName: "山田 太郎",
  dogName: "モモ",
  description: "散歩中に足を引きずる様子が見られたため中断しました。",
  location: "荒川河川敷",
  preventionMeasures: null,
  attachmentKeys: null,
  resolvedAt: null,
  updatedAt: NOW,
};

export const mockIncidents: IncidentSummary[] = [mockIncidentSummary];

export const mockAuditLog: AuditLogEntry[] = [
  {
    id: 1,
    logName: "state_transition",
    description: "Organization #1 status changed: pending_review -> under_review",
    subjectType: "Organization",
    subjectId: 1,
    event: "updated",
    causerType: "AdminUser",
    causerName: "運営 太郎",
    batchId: null,
    properties: { from: "pending_review", to: "under_review" },
    createdAt: NOW,
  },
];

export const mockDashboard: DashboardView = {
  tiles: [
    { label: "審査待ちの申請", value: 3, href: "/organization-applications" },
    { label: "今週の予約", value: 48, href: "/reservations" },
    { label: "未対応の事故報告", value: 1, href: "/incidents" },
    { label: "未対応のお問い合わせ", value: 5, href: "/inquiries" },
  ],
  pendingApplications: [{ id: "01HZZORGANIZATION0000000001", name: ORGANIZATION_NAME, submittedAt: NOW }],
  recentIncidents: [{ id: mockIncidentSummary.id, organizationName: ORGANIZATION_NAME, severity: "P2", occurredAt: NOW }],
};
