// Review results (F-03-03, DEV-09 §2-1-4). Sent from this app because the review transition is
// an operator's and lives here (DEV-09 §2-1-5).
import { sendMail } from "./client";
import { renderHtml, renderText, subject, type MailBody } from "./layout";

export type ReviewOutcome = "approved" | "rejected" | "needs_more_info";

// The reason is the message for two of the three outcomes: sending an application back with no
// explanation gives the applicant nothing to act on, which is why the Service refuses to record
// one without it.
function reviewBody(name: string, outcome: ReviewOutcome, reason: string | null, token?: string): MailBody {
  if (outcome === "approved") {
    // This link is the only way the first org_admin exists (F-03-06): there is nobody inside the
    // shelter yet to invite them.
    return {
      heading: "登録申請が承認されました",
      paragraphs: [`${name} 様`, "保護団体の登録申請が承認されました。下のリンクからパスワードを設定すると、団体ページにログインできるようになります。", "リンクは 7 日間有効です。期限が切れた場合はお問い合わせフォームよりご連絡ください。"],
      action: { label: "アカウントを有効化する", path: `/organization/invitations/${token}` },
    };
  }

  if (outcome === "needs_more_info") {
    return {
      heading: "登録申請について確認させてください",
      paragraphs: [`${name} 様`, "登録申請の審査にあたり、以下の点について確認させてください。", reason ?? "", "下のリンクから内容をご確認のうえ、再提出をお願いします。リンクは 14 日間有効です。"],
      action: { label: "申請状況を確認する", path: `/organization/apply/${token}` },
    };
  }

  return {
    heading: "登録申請の審査結果のお知らせ",
    paragraphs: [`${name} 様`, "誠に申し訳ありませんが、今回は登録を見送らせていただくこととなりました。", reason ?? "", "ご不明な点は、お問い合わせフォームよりご連絡ください。"],
  };
}

// `token` is the resubmission token for `needs_more_info` and the activation token for
// `approved` — two different tables (DEV-07 §5-25, §5-28), one parameter, because the caller
// issues whichever the outcome calls for.
export async function sendOrganizationReviewResultEmail(to: string, name: string, outcome: ReviewOutcome, reason: string | null, token?: string): Promise<void> {
  const body = reviewBody(name, outcome, reason, token);
  await sendMail({ to, subject: subject(body.heading), text: renderText(body), html: renderHtml(body) });
}
