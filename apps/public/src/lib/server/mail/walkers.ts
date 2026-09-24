// Mail addressed to participants. Split by recipient, not by feature (DEV-10 §3-3).
import { sendMail } from "./client";
import { renderHtml, renderText, subject, type MailBody } from "./layout";

function verificationBody(name: string, token: string): MailBody {
  return {
    heading: "メールアドレスのご確認",
    paragraphs: [`${name} 様`, "ご登録ありがとうございます。下のリンクを開くと、メールアドレスの確認が完了します。", "このリンクは発行から 24 時間で無効になります。", "お心当たりがない場合は、このメールを破棄してください。"],
    action: { label: "メールアドレスを確認する", path: `/verify/email/${token}` },
  };
}

export async function sendWalkerVerificationEmail(to: string, name: string, token: string): Promise<void> {
  const body = verificationBody(name, token);
  await sendMail({ to, subject: subject("メールアドレスのご確認"), text: renderText(body), html: renderHtml(body) });
}

function passwordResetBody(token: string): MailBody {
  return {
    heading: "パスワード再設定のご案内",
    paragraphs: ["パスワードの再設定を受け付けました。下のリンクから新しいパスワードを設定してください。", "このリンクは発行から 60 分で無効になります。", "お心当たりがない場合は、このメールを破棄してください。パスワードは変更されません。"],
    action: { label: "パスワードを再設定する", path: `/auth/reset-password/${token}` },
  };
}

export async function sendWalkerPasswordResetEmail(to: string, token: string): Promise<void> {
  const body = passwordResetBody(token);
  await sendMail({ to, subject: subject("パスワード再設定のご案内"), text: renderText(body), html: renderHtml(body) });
}

// Sent to an address that already has an account when someone tries to register with it again.
// The registration form answers the same either way, so this mail is what tells the real owner
// something happened — and stops the form from being an account-existence oracle.
function alreadyRegisteredBody(): MailBody {
  return {
    heading: "すでにご登録のあるメールアドレスです",
    paragraphs: ["このメールアドレスでの新規登録が試みられましたが、すでにアカウントが存在するため、新しいアカウントは作成されていません。", "ご自身で操作された場合は、下のリンクからログインしてください。パスワードが分からない場合は、ログイン画面から再設定できます。", "お心当たりがない場合は、このメールを破棄してください。アカウントに変更はありません。"],
    action: { label: "ログインする", path: "/auth/login" },
  };
}

export async function sendWalkerAlreadyRegisteredEmail(to: string): Promise<void> {
  const body = alreadyRegisteredBody();
  await sendMail({ to, subject: subject("すでにご登録のあるメールアドレスです"), text: renderText(body), html: renderHtml(body) });
}
