// SYS-01. A KPI tile is a label, a number and an optional link — nothing derived in the template,
// so the same shape serves every tile and the Service owns the arithmetic (PRD-04 §4-2).
export type KpiTile = { label: string; value: number; href: string | null };

export type DashboardView = {
  tiles: KpiTile[];
  pendingApplications: { id: string; name: string; submittedAt: string }[];
  recentIncidents: { id: string; organizationName: string; severity: string; occurredAt: string }[];
};
