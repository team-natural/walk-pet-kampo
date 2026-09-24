// Mail addressed to a shelter's application contact — someone who has no account yet, so every
// link here carries its own token (DEV-10 §3-3).
import { sendMail } from "./client";
import { renderHtml, renderText, subject, type MailBody } from "./layout";

// F-03-03. Sent from apps/public when the application is created.
export async function sendApplicationReceivedEmail(to: string, name: string): Promise<void> {
  const body: MailBody = {
    heading: "登録申請を受け付けました",
    paragraphs: [`${name} 様`, "保護団体の登録申請を受け付けました。運営による審査のうえ、結果をこのメールアドレスにご連絡します。", "追加の確認が必要な場合は、再提出用のリンクをお送りします。"],
  };
  await sendMail({ to, subject: subject("登録申請を受け付けました"), text: renderText(body), html: renderHtml(body) });
}
