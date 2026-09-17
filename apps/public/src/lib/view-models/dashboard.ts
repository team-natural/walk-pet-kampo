// ADM-01, the organization's own dashboard. Scoped to one organization: every number here is
// already filtered by the signed-in member's organization_id (DEV-02 §3), so no screen adds a
// tenant filter of its own.
export type KpiTile = { label: string; value: number; href: string | null };

export type OrganizationDashboardView = {
  tiles: KpiTile[];
  upcomingWalks: { id: string; title: string; startAt: string; reservedCount: number; capacity: number }[];
  recentReservations: { id: string; walkerName: string; walkSlotTitle: string; status: string; createdAt: string }[];
};
