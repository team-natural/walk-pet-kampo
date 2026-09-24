// Display labels for the incident columns that are enums. DEV-09 §2-10-1 and DEV-07 §5-15 are
// the source — reword there first. The shelter reads these, so the raw values never reach a
// screen on this side.
export const INCIDENT_STATUS_LABELS: Record<string, string> = {
  reported: "報告受付",
  investigating: "調査中",
  in_progress: "対応中",
  resolved: "解決",
  closed: "クローズ",
};

export const INCIDENT_CATEGORY_LABELS: Record<string, string> = {
  bite: "咬傷",
  escape: "脱走",
  injury: "けが",
  dog_condition: "犬の体調",
  walker_condition: "参加者の体調",
  property_damage: "物損",
  interpersonal_trouble: "参加者間トラブル",
  unauthorized_photo: "無断撮影",
  harassment: "ハラスメント",
  other: "その他",
};

// The number is what the operator triages on, so it stays visible alongside the words.
export const INCIDENT_SEVERITY_LABELS: Record<string, string> = {
  P0: "P0（重大・即時対応）",
  P1: "P1（重大）",
  P2: "P2",
  P3: "P3",
};

export function incidentStatusLabel(status: string): string {
  return INCIDENT_STATUS_LABELS[status] ?? status;
}

export function incidentCategoryLabel(category: string): string {
  return INCIDENT_CATEGORY_LABELS[category] ?? category;
}

export function incidentSeverityLabel(severity: string): string {
  return INCIDENT_SEVERITY_LABELS[severity] ?? severity;
}
