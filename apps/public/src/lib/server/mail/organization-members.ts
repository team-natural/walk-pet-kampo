// Mail addressed to organization staff. Split by recipient rather than by feature (DEV-10 §3-3):
// who receives it decides the tone, the sender address and, later, the opt-out rules.
import { sendMail } from "./client";
import { renderHtml, renderText, subject, type MailBody } from "./layout";

// ADM-24 → ADM-25. The link is the credential, so the body says how long it lives and what to do
// if it was not requested — a reset mail nobody asked for is the first sign of a stolen address.
function passwordResetBody(token: string): MailBody {
  return {
    heading: "パスワード再設定のご案内",
    paragraphs: ["団体ページのパスワード再設定を受け付けました。下のリンクから新しいパスワードを設定してください。", "このリンクは発行から 60 分で無効になります。", "お心当たりがない場合は、このメールを破棄してください。パスワードは変更されません。"],
    action: { label: "パスワードを再設定する", path: `/organization/reset-password/${token}` },
  };
}

export async function sendOrganizationPasswordResetEmail(to: string, token: string): Promise<void> {
  const body = passwordResetBody(token);
  await sendMail({ to, subject: subject("パスワード再設定のご案内"), text: renderText(body), html: renderHtml(body) });
}
