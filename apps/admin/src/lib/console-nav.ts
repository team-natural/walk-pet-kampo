// The console's sidebar, as data. One entry per list screen in PRD-04 §3-3 — detail screens are
// reached from their list, so they are deliberately absent.
//
// No Svelte imports on purpose: console-shell.svelte maps `icon` to a Lucide component, which
// keeps this file loadable from a unit test.
export type ConsoleNavIcon = "dashboard" | "application" | "organization" | "dog" | "walk" | "walker" | "reservation" | "payment" | "payout" | "incident" | "adoption" | "inquiry" | "auditLog";

export type ConsoleNavItem = { label: string; href: string; icon: ConsoleNavIcon };
export type ConsoleNavGroup = { label: string | null; items: ConsoleNavItem[] };

export const CONSOLE_NAV: ConsoleNavGroup[] = [
  {
    label: null,
    items: [{ label: "ダッシュボード", href: "/dashboard", icon: "dashboard" }],
  },
  {
    label: "審査・団体",
    items: [
      { label: "登録申請", href: "/organization-applications", icon: "application" },
      { label: "保護団体", href: "/organizations", icon: "organization" },
    ],
  },
  {
    label: "掲載・利用者",
    items: [
      { label: "保護犬", href: "/dogs", icon: "dog" },
      { label: "お散歩募集", href: "/walks", icon: "walk" },
      { label: "お散歩参加者", href: "/walkers", icon: "walker" },
    ],
  },
  {
    label: "取引",
    items: [
      { label: "予約", href: "/reservations", icon: "reservation" },
      { label: "決済・返金", href: "/payments", icon: "payment" },
      { label: "還元・振込", href: "/payouts", icon: "payout" },
    ],
  },
  {
    label: "対応",
    items: [
      { label: "事故・トラブル", href: "/incidents", icon: "incident" },
      { label: "里親相談", href: "/adoption-inquiries", icon: "adoption" },
      { label: "お問い合わせ", href: "/inquiries", icon: "inquiry" },
    ],
  },
  {
    label: "記録",
    items: [{ label: "管理操作履歴", href: "/audit-logs", icon: "auditLog" }],
  },
];

// Matches on segment boundaries, not on the raw string: a bare startsWith would light up
// /organizations while the operator is on /organization-applications.
export function isCurrentRoute(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
