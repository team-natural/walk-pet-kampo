// Resend, per app (DEV-10 §3-1): the two Workers hold their own key and their own from-address,
// and neither imports the other. The twin of this file is apps/public/src/lib/server/mail/.
import { env } from "cloudflare:workers";
import { Resend } from "resend";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

// Missing key = local machine or a preview with no mail set up. Log what would have gone out
// instead of throwing: the caller is inside ctx.waitUntil(), where a throw is invisible.
function skipSend(message: MailMessage, reason: string): void {
  console.log(JSON.stringify({ event: "mail.skipped", reason, to: message.to, subject: message.subject }));
}

export async function sendMail(message: MailMessage): Promise<void> {
  if (!env.RESEND_API_KEY) return skipSend(message, "RESEND_API_KEY is not configured");

  const resend = new Resend(env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: `${env.MAIL_FROM_NAME} <${env.MAIL_FROM_ADDRESS}>`,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });

  if (error) console.error(JSON.stringify({ event: "mail.failed", to: message.to, subject: message.subject, error: error.message }));
}
