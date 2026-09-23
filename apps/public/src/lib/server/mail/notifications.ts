// The email half of a notification (F-13-02). The in-app half is a row written by
// services/notifications.ts; both are driven from the same catalogue so a type can never have a
// label on screen and a different one in the inbox.
import { NOTIFICATION_TYPES, type NotificationType } from "../../notification-types";
import { sendMail } from "./client";
import { renderHtml, renderText, subject, type MailBody } from "./layout";

export interface NotificationMail {
  to: string;
  type: NotificationType;
  body: string;
  /** Where the recipient acts on it. Rendered as an absolute URL by the layout. */
  href?: string;
}

export async function sendNotificationEmail(mail: NotificationMail): Promise<void> {
  const definition = NOTIFICATION_TYPES[mail.type];
  const body: MailBody = {
    heading: definition.label,
    paragraphs: [mail.body],
    action: mail.href ? { label: "サイトで確認する", path: mail.href } : undefined,
  };

  await sendMail({ to: mail.to, subject: subject(definition.label), text: renderText(body), html: renderHtml(body) });
}
