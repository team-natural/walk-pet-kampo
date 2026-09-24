// F-12-02. A P0 or P1 report reaches the operator the moment it is filed — not on the next
// dashboard visit. Sent from this app because the report is written here (DEV-09 §2-10-3).
import { env } from "cloudflare:workers";
import { sendMail } from "./client";
import { renderHtml, renderText, subject, type MailBody } from "./layout";

export interface IncidentAlert {
  publicId: string;
  severity: string;
  category: string;
  organizationName: string;
  occurredAt: string;
  description: string;
}

const CATEGORY_LABELS: Record<string, string> = {
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

function alertBody(alert: IncidentAlert): MailBody {
  return {
    heading: `[${alert.severity}] ${alert.organizationName} から事故・トラブルの報告`,
    paragraphs: [`種別: ${CATEGORY_LABELS[alert.category] ?? alert.category}`, `発生日時: ${alert.occurredAt}`, alert.description],
    // The operator console is a different origin, so this is a bare path rather than a link the
    // layout can absolutise — the recipient is staff who know where the console lives.
    action: { label: "報告を確認する", path: `/incidents/${alert.publicId}` },
  };
}

export async function sendIncidentAlertEmail(alert: IncidentAlert): Promise<void> {
  // The operator's inbox is configuration, not a table: there is no "operator" row to look up
  // (DEV-01 §4 — one operator, no tenancy on that side). The name is DEV-10 §11's.
  if (!env.MAIL_ADMIN_ALERTS) {
    console.log(JSON.stringify({ event: "mail.skipped", reason: "MAIL_ADMIN_ALERTS is not configured", subject: alert.publicId }));
    return;
  }

  const body = alertBody(alert);
  await sendMail({ to: env.MAIL_ADMIN_ALERTS, subject: subject(body.heading), text: renderText(body), html: renderHtml(body) });
}
