// ADM-01, the organization's own dashboard. Scoped to one organization: every number here is
// already filtered by the signed-in member's organization_id (DEV-02 §3), so no screen adds a
// tenant filter of its own.
// `value` takes a string as well as a number so a money tile can carry its unit. Formatting an
// amount in the template instead would put the yen sign in one place and the digits in another.
export type KpiTile = { label: string; value: string | number; href: string | null };

export type OrganizationDashboardView = {
  tiles: KpiTile[];
  upcomingWalks: { id: string; title: string; startAt: string; reservedCount: number; capacity: number }[];
  recentReservations: { id: string; walkerName: string; walkSlotTitle: string; status: string; createdAt: string }[];
};
