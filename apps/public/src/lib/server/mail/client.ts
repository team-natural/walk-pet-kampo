// Resend is the mail provider (DEV-01 §1, DEV-10 §3). The SDK is fetch-based, so it runs in
// workerd without nodejs_compat doing any lifting.
import { env } from "cloudflare:workers";
import { Resend } from "resend";

export interface MailMessage {
  to: string;
  subject: string;
  /** Plain text first: every template renders text, and the HTML is a wrapper around it. */
  text: string;
  html: string;
}

// Missing key = local machine or a preview with no mail set up. Log what would have gone out
// instead of throwing: a dev whose password reset silently 500s learns nothing, and the caller
// is usually inside ctx.waitUntil() where the throw would be invisible anyway.
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

  // Reported, not thrown: the send runs after the response in ctx.waitUntil(), so there is no
  // request left to fail. Delivery failures proper arrive on the Resend webhook (DEV-10 §3-4).
  if (error) console.error(JSON.stringify({ event: "mail.failed", to: message.to, subject: message.subject, error: error.message }));
}
