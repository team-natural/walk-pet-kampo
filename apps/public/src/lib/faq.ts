// FAQ is developer-maintained, so it lives in code rather than D1 (GOV-01 D-016). There is no
// admin screen for it by design. If the operator ever needs to publish an entry without a deploy,
// that is GOV-02 TBD-41 and the answer is a `faqs` table, not a looser structure here.
export interface FaqEntry {
  category: string;
  question: string;
  answer: string;
}

export const FAQ: FaqEntry[] = [
  {
    category: "お散歩について",
    question: "犬を飼った経験がなくても参加できますか？",
    answer: "はい。お散歩枠ごとに必要な経験が示されており、「初めての方歓迎」の枠は経験を問いません。当日は保護団体のスタッフが同行します。",
  },
  {
    category: "お散歩について",
    question: "雨天の場合はどうなりますか？",
    answer: "荒天が見込まれる場合は保護団体の判断で中止となり、参加費は全額返金されます。中止のご連絡はメールでお送りします。",
  },
  {
    category: "料金・お支払い",
    question: "参加費は何に使われますか？",
    answer: "参加費のうち大部分が保護団体への還元となり、残りがサービスの運営費にあてられます。内訳は各お散歩枠のページに記載しています。",
  },
  {
    category: "キャンセル",
    question: "予約をキャンセルできますか？",
    answer: "お散歩枠ごとのキャンセル規定に従います。規定の期限より前であれば無料でキャンセルできます。",
  },
  {
    category: "里親について",
    question: "お散歩で会った犬を家族に迎えたいときは？",
    answer: "保護犬の詳細ページから里親相談を送信できます。以降のやり取りは保護団体から直接ご連絡します。",
  },
];
