---
doc-id: DEV-10
title: 統合・外部 API 仕様
phase: 3
status: draft-ai
owner: Tech Lead
last-updated: 2026-09-15
related-docs:
  - DEV-01: 技術スタック決定書・アーキテクチャ原則（確定スタック §1、機能別標準ライブラリ §2、GOV-01 D-006〜D-010）
  - DEV-02: セキュリティ（Secrets 配置、Webhook 署名検証、入力検証）
  - DEV-04: API 仕様
  - DEV-05: バックエンド実装
  - DEV-07: データベース物理設計（テーブル・カラム定義の正本）
  - DEV-08: デプロイ定義（環境変数一覧との整合）
  - DEV-09: 状態遷移仕様（Payment / Payout の状態と Webhook の対応）
  - PRD-05: AI 機能仕様（不採用）
---

# 10-integrations-spec.md — 統合・外部 API 仕様

## このセクションの目的

外部サービス（決済 / メール / ストレージ / ジオコーディング / OAuth 等）との統合パターン、Webhook、冪等性確保、認証方式、エラーハンドリングを集約する。使用するサービス・ライブラリの選定は DEV-01（§1 確定スタック・§2 機能別標準ライブラリ）で一意化済みであり、本書では選定・代替比較は行わない。**本プロジェクトは LLM を採用しない**（PRD-05 参照）が、二者間マーケットプレイス（お散歩参加者 Walker × 保護団体 Organization、運営 Platform の 3 者構造 — GOV-01 D-006）としてマーケットプレイス決済（Stripe + Stripe Connect）とジオコーディング（Google Maps Platform）を確定スタックに追加している（DEV-01 §2、GOV-01 D-008・D-009）。

## 0-H. ハイブリッド編集ガイド（要点）

- 推奨モード: Hybrid（AI 初稿 + Tech Lead レビュー）
- 人間確認必須: Webhook の署名検証・冪等性（決済・Stripe Connect 双方）、Stripe Connect のオンボーディング方式（Standard OAuth か Express + Account Links か、GOV-02 TBD-39）、キャンセル・返金条件（GOV-02 TBD-10〜12、DEV-09 §2-7-4/§2-8）、ジオコーディング失敗時の縮退動作、通知（メール）のスコープが PRD-03 FG-13 の範囲に収まっているか

---

## 1. 統合の標準パターン

### 1-1. 統合方式の分類

| 方式 | 用途 | 実装パターン |
| --- | --- | --- |
| 同期 API 呼び出し | 即座にレスポンスが必要（ジオコーディング等）| `fetch()`、タイムアウト 5〜10 秒 |
| 非同期 API 呼び出し | レスポンス待ち不要（メール送信、監査ログ）| `ctx.waitUntil()` による後処理（Queues 不採用 — DEV-01 §1。DEV-05 §4） |
| Webhook 受信 | 外部サービスからの通知（Stripe）| 署名検証 + 冪等性 |
| バッチ連携 | 定期同期（月次 Payout 集計、データ保管期限バッチ）| Cloudflare Cron Triggers（`Confirmed` — DEV-01 §2） |

### 1-2. 共通実装ルール

| ルール | 内容 |
| --- | --- |
| HTTP Client | Workers 標準の `fetch()` を使用（追加の HTTP クライアントライブラリは導入しない） |
| タイムアウト | 同期：5〜10 秒、非同期：30 秒 |
| リトライ | 指数バックオフ（10s / 30s / 60s）、3 回まで |
| エラーハンドリング | 4xx は記録のみ、5xx はリトライ、ネットワークエラーはリトライ |
| ログ | request_id を必ず付与、レスポンスは最初の 500 文字のみ |
| 監視 | 失敗を構造化ログに出力。エラー監視ツール導入後（DEV-01 §2: `@sentry/cloudflare`）は同ツールにも送信し成功率を確認 |

### 1-3. シークレット管理

| 区分 | 管理場所 |
| --- | --- |
| API キー | `.dev.vars`（local、gitignore 対象）/ Cloudflare Workers シークレット（本番。`wrangler secret put`。DEV-01 §1・DEV-08 参照） |
| Webhook 署名キー | 同上 |
| OAuth Client Secret | 同上 |

コードからは `import { env } from "cloudflare:workers"` 経由で `env.XXX` としてアクセスする（`Cloudflare.Env` として各アプリの `worker-configuration.d.ts` で型付け。`Astro.locals.runtime.env` は v6 で削除済みの旧 API（採用する v7 にも無い） — CLAUDE.md 参照）。設定を一箇所に集約するファイルは存在しない。

**本プロジェクト固有の配置ルール（`Decided` — GOV-01 D-007・D-010、DEV-05 §7-2、DEV-09 §2-9-3）**: Stripe の秘密鍵は `apps/public` と `apps/admin` の**両方**の Workers Secrets に配置する（同一の値を両アプリへ設定する）。Walker の都度課金（Payment Intent/Checkout、Webhook 受信）は `apps/public` が呼び出し、団体還元の月次集計・Stripe Connect Transfer 実行は Cron Triggers（`apps/admin` の Scheduled Worker、GOV-01 D-010）が呼び出すため、Stripe を呼び出すアプリが 2 つに分かれる（DEV-05 §7-2 の「境界の明確化」の例外パターンと同じ理由で、Worker 間で相手の `src/` を import せず、D1 バインディングと Workers Secrets をそれぞれのアプリで個別に持つ）。Google Maps Platform Geocoding API のキーは、Organization/WalkSlot の住所登録・更新が org_admin/org_staff（`apps/public`）の操作に限られるため、**`apps/public` の Workers Secrets にのみ配置**する（`apps/admin` からは参照しない）。Resend は `apps/public`（マーケットプレイス通知）・`apps/admin`（Inquiry 対応・運営者向けアラート・Payout 失敗アラート）の双方が個別に `RESEND_API_KEY` を持つ。

---

## 2. 決済・団体還元（Stripe + Stripe Connect）

本プロジェクトは Organization 課金の Subscription を持たず、**Walker の都度課金（参加費決済）** と **Organization への月次還元送金** の 2 系統を Stripe で扱う（`Decided` — GOV-01 D-008、旧仕様の判断を継承し `stripe` npm パッケージを直接利用する）。Workers 上で動かすため `apps/public/wrangler.jsonc` に `nodejs_compat` フラグが必要（SDK の Node 依存のため。DEV-01 §2）。決済・Payout に関わるテーブル定義は DEV-07 §5-12・§5-13、状態遷移は DEV-09 §2-8・§2-9 が正本であり、本節はそれらと整合する統合パターンのみを扱う。

### 2-1. 採用機能

| 機能 | 採用 |
| --- | --- |
| Checkout Session / Payment Intent（参加費の都度課金）| ○ |
| Stripe Connect（保護団体への送金。Connected Account への Transfer）| ○（`Decided` — GOV-01 D-008） |
| Subscription（継続課金）| ✗（Organization 課金の概念がないため不採用） |
| Customer Portal | △（Walker のカード情報の再利用に限定利用。`walkers.stripe_customer_id` — DEV-07 §5-1 — に対応する Stripe Customer を都度課金の Checkout Session 作成時に紐付ける） |
| Stripe Tax 自動計算 | ✗（国内向けの単純な税込金額のみ。`payments.amount` は税込円 — DEV-07 §5-12） |

### 2-2. 参加費決済フロー（Payment Intent / Checkout Session）

```
1. Walker が WalkSlot の予約内容を確認し「予約する」を押す
   → apps/public: Reservation を processing で作成（DEV-09 §2-7）
2. Walker が予約内容を確定 → Reservation を processing → awaiting_payment へ遷移
3. apps/public: Stripe Checkout Session を作成（Payment レコードを unpaid → processing で作成、
   participant_count × fee_per_person を amount に設定 — DEV-07 §5-12）
4. Walker を Stripe Checkout にリダイレクト、または埋め込み決済 UI で完了
5. 決済成功 → success_url にリダイレクト（この時点ではまだ Reservation を confirmed にしない）
6. 並行して Stripe → Webhook（§2-4）→ Payment を paid へ、Reservation を awaiting_payment → confirmed へ
   （`payment_intent.succeeded`、冪等性チェック後。DEV-09 §2-7-3・§2-8-3）
7. 決済失敗（`payment_intent.payment_failed`）は Payment を failed へ。Reservation は awaiting_payment のまま
   保持し Walker に再決済を促す通知を送る（自動キャンセルはしない）。放置された awaiting_payment の
   自動失効ポリシーは `[Open]`（GOV-02 TBD-48）
```

### 2-3. 団体還元・送金フロー（Stripe Connect）

Stripe Connect のオンボーディング方式（Standard アカウントの OAuth 連携か、Express アカウント + Account Links か）は `[Open]`（GOV-02 TBD-39、事業責任者確認）。本書は実装の具体性を保つため **Express アカウント + Account Links を暫定採用** `[Assumed]` する。方式確定後、本節と §11（環境変数）を更新する。

```
1. Organization 承認時（apps/admin の transitionOrganization が under_review → approved へ遷移。
   DEV-09 §2-1-5）の時点では Stripe Connect Account を作成しない。
2. 承認後、org_admin が apps/public の「振込設定」画面に初回アクセスした時点で
   organizations.stripe_connect_account_id が NULL であれば Express Connected Account を作成し、
   organizations テーブルへ保存する（apps/public 側で実行、団体は Stripe 上で銀行口座情報を
   直接登録する — プラットフォームは銀行口座番号を保持しない、DEV-07 §1）。
3. 同じ画面から Account Link（オンボーディング URL、生成から数分で失効する短命リンク）を都度発行し、
   Stripe Connect のオンボーディングフローへリダイレクトする。未完了・再訪時は新しい Account Link を
   発行し直す。
4. `account.updated`（Connect スコープ Webhook、§2-4）でオンボーディング完了状況（`charges_enabled` /
   `payouts_enabled`）を同期する（apps/public 側、Organization 自身のオンボーディング状態のため）。
5. 月次バッチ（Cloudflare Cron Triggers、apps/admin の Scheduled Worker — `Decided` GOV-01 D-010、
   DEV-05 §7-2、DEV-09 §2-9）が対象期間の completed Reservation を集計し Payout を uncollected → aggregating で作成
   する。Payout は admin 専用の運営データのため、共有 D1 への集計・更新は apps/admin 側の
   Service（`apps/admin/src/lib/server/services/payouts.ts`）が行う（DEV-05 §7-2 参照）。振込サイクルは
   月次（暫定 — GOV-02 TBD-29）。
6. admin が apps/admin の管理画面（SYS-09）で Payout を確認し aggregating → confirmed → scheduled へ確定する
   （DEV-09 §2-9）。
7. Stripe Connect Transfer で Connected Account へ送金（scheduled → paid）。Transfer 実行は apps/admin 側
   （Cron Triggers または admin の手動実行トリガー）が行う。
8. Transfer 失敗（Connected Account 未設定・停止・`payouts_enabled = false` 等）は Payout を failed とし
   admin へ通知（Resend、§3）。
```

### 2-4. Webhook ハンドリング

Stripe の Webhook は 3 系統のエンドポイントに分ける（DEV-08 §8 の `STRIPE_WEBHOOK_SECRET` / `STRIPE_CONNECT_WEBHOOK_SECRET` と対応。Stripe ダッシュボードで「アカウントのイベント」用と「連携アカウントのイベント（Connect）」用を別エンドポイントとして登録する）。エンドポイントの配置は、そのイベントが更新するデータの所有アプリに従う（Payment/Reservation は `apps/public`、Payout は `apps/admin` — `Decided` GOV-01 D-007・D-010）。

| エンドポイント | 対象イベント | 署名検証キー | 配置 |
| --- | --- | --- | --- |
| `POST /api/v1/payments/webhook` | `payment_intent.*`、`charge.refunded` | `STRIPE_WEBHOOK_SECRET` | `apps/public` |
| `POST /api/v1/payments/webhook/connect` | `account.updated`（Connected Account 側） | `STRIPE_CONNECT_WEBHOOK_SECRET` | `apps/public`（Organization 自身のオンボーディング状態） |
| `POST /api/v1/payments/webhook/transfers` | `transfer.created`、`transfer.reversed` | `STRIPE_WEBHOOK_SECRET`（同一の Webhook エンドポイントシークレットを両アプリで共有） | `apps/admin`（Payout の状態更新のため） |

冪等性は `stripe_event_logs` テーブル（DEV-07 §5-20）で確保する。テーブル自体は D1 上の同一スキーマだが、`apps/public`・`apps/admin` それぞれが自分の書き込む行に対して冪等性チェックを行う（`stripe_event_id` はイベント種別によらず一意）。

```typescript
// apps/public/src/pages/api/v1/payments/webhook.ts
import type { APIContext } from "astro";
import { env } from "cloudflare:workers"; // Astro.locals.runtime.env は v6 で削除済みの旧 API（採用する v7 にも無い — DEV-05 §1）
import Stripe from "stripe";
import { markPaymentPaid, markPaymentFailed, recordPaymentRefund } from "../../../../lib/server/services/payments";

export async function POST({ request }: APIContext): Promise<Response> {
  const stripe = new Stripe(env.STRIPE_SECRET);

  // 1. 署名検証
  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, request.headers.get("stripe-signature") ?? "", env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return new Response("Invalid signature", { status: 401 });
  }

  // 2. 冪等性チェック（stripe_event_logs テーブル、DEV-07 §5-20）
  const existing = await env.DB.prepare("SELECT 1 FROM stripe_event_logs WHERE stripe_event_id = ?").bind(event.id).first();
  if (existing) {
    return new Response("Already processed", { status: 200 });
  }

  // 3. ログ記録
  await env.DB.prepare("INSERT INTO stripe_event_logs (stripe_event_id, event_type, payload, created_at) VALUES (?, ?, ?, ?)").bind(event.id, event.type, JSON.stringify(event.data), new Date().toISOString()).run();

  // 4. 処理（Payment Intent / Refund のイベントのみ。Payout/Transfer 系は apps/admin の
  //    /api/v1/payments/webhook/transfers が処理する — §2-4 の配置表参照。Subscription 系は本プロジェクト対象外）
  switch (event.type) {
    case "payment_intent.succeeded":
      await markPaymentPaid(env, event.data.object); // Payment を paid へ、Reservation を confirmed へ（DEV-09 §2-7・§2-8）
      break;
    case "payment_intent.payment_failed":
      await markPaymentFailed(env, event.data.object); // Payment を failed へ、Walker へ再決済を促す通知
      break;
    case "charge.refunded":
      await recordPaymentRefund(env, event.data.object); // Payment を refunded / partially_refunded へ
      break;
    default:
      break;
  }

  // 5. 処理完了マーク
  await env.DB.prepare("UPDATE stripe_event_logs SET processed_at = ? WHERE stripe_event_id = ?").bind(new Date().toISOString(), event.id).run();

  return new Response("OK", { status: 200 });
}
```

```typescript
// apps/admin/src/pages/api/v1/payments/webhook/transfers.ts
// Payout は apps/admin の運営データのため、Transfer 系イベントのみここで処理する（§2-4）。
// 署名検証・冪等性チェック（stripe_event_logs）の構造は apps/public 側と同じパターンを使う。
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import Stripe from "stripe";
import { markPayoutTransferCreated, markPayoutTransferFailed } from "../../../../lib/server/services/payouts";

export async function POST({ request }: APIContext): Promise<Response> {
  const stripe = new Stripe(env.STRIPE_SECRET);
  const body = await request.text();
  const event = await stripe.webhooks.constructEventAsync(body, request.headers.get("stripe-signature") ?? "", env.STRIPE_WEBHOOK_SECRET);

  // 冪等性チェック・ログ記録は apps/public 側と同じ stripe_event_logs パターン（省略）

  switch (event.type) {
    case "transfer.created":
      await markPayoutTransferCreated(env, event.data.object); // Payout を paid へ
      break;
    case "transfer.reversed":
      await markPayoutTransferFailed(env, event.data.object); // Payout を failed へ、admin に通知
      break;
    default:
      break;
  }

  return new Response("OK", { status: 200 });
}
```

> 上記コードは Webhook 処理の**考え方**を示す簡略例。`env.DB.prepare()` の直書きは DEV-05 §2 の規約（Drizzle クエリビルダ経由・Service 層への集約）を簡略化したもので、実装時は `apps/public/src/lib/server/services/payments.ts` / `payouts.ts` の関数（DEV-09 §3-2 の `transitionReservation` と同じ実装パターン）に置き換える。`apps/public/src/pages/api/v1/payments/webhook/connect.ts`（Connect スコープ Webhook）も同様の署名検証 + 冪等性チェックの構造で、`account.updated` から `organizations.stripe_connect_account_id` に紐づく Connected Account の `charges_enabled`/`payouts_enabled` を同期する処理のみを持つ。

### 2-5. 監視すべきイベント

| イベント | 処理 |
| --- | --- |
| `payment_intent.succeeded` | Payment を `paid` へ、Reservation を `confirmed` へ（DEV-09 §2-7-3・§2-8-3） |
| `payment_intent.payment_failed` | Payment を `failed` へ、Walker へ再決済を促す通知（Resend） |
| `charge.refunded` | Payment を `refunded` / `partially_refunded` へ（返金は Reservation キャンセル時の `judgeRefund()` が起点。GOV-02 TBD-10〜12 未確定） |
| `account.updated`（Connect）| `organizations.stripe_connect_account_id` に紐づくオンボーディング状態（`charges_enabled`/`payouts_enabled`）を同期 |
| `transfer.created` | Payout を `scheduled → paid` へ（DEV-09 §2-9-3） |
| `transfer.reversed` | Payout を `failed` へ、admin へアラート（Resend、`ctx.waitUntil()`） |

### 2-6. 必須環境変数

`STRIPE_*` / `GOOGLE_MAPS_API_KEY` のキー一覧は §11（環境変数まとめ・正本）を参照。DEV-08 §8 はアプリ基本変数のみを持つ。

---

## 3. メール（Resend）

メールは **Resend（`resend` npm パッケージ）で確定**（DEV-01 §1。オプションではなく確定スタック）。プロジェクト開始時に導入する。通知の標準スコープは PRD-03 FG-13（アプリ内通知一覧・メール通知・通知種別ごとの ON/OFF 設定）であり、メール送信は Resend、アプリ内通知は `notifications` テーブル（DEV-07 §5-19）へのポーリング取得の 2 経路で実現する（チャット・WebSocket 配信の基盤は持たない — `Decided` GOV-01 D-005・D-010）。

### 3-1. 設定

```bash
# apps/public（マーケットプレイス通知）・apps/admin（Inquiry 対応・運営者向けアラート）双方に導入
pnpm --filter public add resend
pnpm --filter admin add resend

# .dev.vars（local）/ Cloudflare Workers シークレット（本番）— アプリごとに個別設定
RESEND_API_KEY=re_xxxxxxxxxx
MAIL_FROM_ADDRESS=noreply@example.com
MAIL_FROM_NAME="${APP_NAME}"
```

```typescript
// apps/public/src/lib/server/mail/client.ts（apps/admin 側にも同じパターンで用意する）
import { Resend } from "resend";

export function createResendClient(env: Env): Resend {
  return new Resend(env.RESEND_API_KEY);
}
```

> `resend` SDK は fetch ベースで Workers 対応。メール送信ドライバの切替機構や設定を集約するファイルは存在しない — 上記のように Service 層で直接インスタンス化する。

### 3-2. ドメイン認証（必須）

| 項目 | 設定先 |
| --- | --- |
| SPF | DNS TXT レコード |
| DKIM | Resend 提供の DNS レコード |
| DMARC | DNS TXT レコード（`v=DMARC1; p=quarantine; rua=mailto:dmarc@...;`） |

Resend Dashboard で検証ステータスを確認、すべて緑になってから本番運用（運用開始条件は GOV-02 TBD-38）。

### 3-3. 送信の標準パターン

宛先による送信経路の使い分けは DEV-05 §4-1 相当のルール（ユーザーアカウント未作成の宛先も同じ送信関数を使う）を踏襲する。メール通知の対象は PRD-03 FG-13（F-13-02）に加え、各機能グループが定義する個別イベント（F-03-03 申請受付完了、F-08-02 予約完了、F-12-02 重大事故の即時共有 等）。実装は送信先の性質（Walker / OrganizationMember / 運営）ごとにモジュールを分ける：

```typescript
// apps/public/src/lib/server/mail/reservations.ts — 予約完了通知（F-08-02、参加者・団体双方）
import { createResendClient } from "./client";

export async function sendReservationConfirmedEmail(env: Env, reservation: Reservation): Promise<void> {
  const resend = createResendClient(env);

  await resend.emails.send({
    from: env.MAIL_FROM_ADDRESS,
    to: reservation.walkerEmail,
    subject: `【${env.APP_NAME}】お散歩の予約が確定しました`,
    html: renderReservationConfirmedEmail({ reservation }),
  });
  // 団体宛（organization_members）は notification_settings（DEV-07 §5-18）の email_enabled を見て別途送信
}
```

```typescript
// apps/admin/src/lib/server/mail/organizations.ts — 団体審査結果通知（F-03-03、Organization の transitionOrganization から呼ぶ）
import { createResendClient } from "./client";

export async function sendOrganizationReviewResultEmail(env: Env, organization: Organization, result: "approved" | "rejected" | "needs_more_info"): Promise<void> {
  const resend = createResendClient(env);

  await resend.emails.send({
    from: env.MAIL_FROM_ADDRESS,
    to: organization.contactEmail,
    subject: `【${env.APP_NAME}】団体登録の審査結果のお知らせ`,
    html: renderOrganizationReviewResultEmail({ organization, result }),
  });
}
```

運営（`apps/admin` の AdminUser。admin）向けアラートも同じ `resend` SDK 経由の送信関数を使う：

```typescript
// Incident（P0/P1）の運営への即時共有（F-12-02）、Payout の Transfer 失敗（§2-5）等
await sendAdminAlertEmail(env, {
  to: env.MAIL_ADMIN_ALERTS,
  subject: "重大インシデントの報告",
  html: renderIncidentReportedAlert(incident),
});
```

### 3-4. ルール

- 宛先による送信経路の使い分けは DEV-05 §4-1 相当（エンドユーザー宛を個別の一時実装で済ませない）
- 送信は `ctx.waitUntil()` で後処理化してレスポンスをブロックしない（DEV-01 §4。Queues は不採用）。大量一括送信（お知らせ配信等）は Cron バッチに寄せる
- テンプレートを介さない、都度組み立てた生の HTML/テキストの直接送信は禁止（テンプレート関数を経由する）
- 通知種別ごとの ON/OFF（F-13-03、`notification_settings` — DEV-07 §5-18）は送信直前に確認し、`email_enabled = 0` の場合は送信をスキップする
- テンプレート形式は **Open**（GOV-02 TBD-50。暫定: プレーン文字列 + 共通レイアウト関数 [Assumed]。候補: React Email 等）
- Subject は `【サービス名】` で始める統一スタイル
- 配信エラーは Resend Webhook で受信

---

## 4. ファイルストレージ（Cloudflare R2）

ファイルストレージは **Cloudflare R2** で確定（DEV-01 §1。バインディング名は必ず `BUCKET`、CLAUDE.md 参照）。D1/R2 は 1 サービスにつき 1 回だけ作成し、`apps/public`/`apps/admin` 両方の `wrangler.jsonc` で同じ `bucket_name` を使う（CLAUDE.md「D1/R2/KV バインディングルール」）。ストレージ切替の抽象化レイヤーは設けない — 常に `env.BUCKET`（R2 バインディング）を直接操作する。

### 4-1. 設定（R2 バインディング）

```jsonc
// wrangler.jsonc（apps/public・apps/admin 双方）
{
  "r2_buckets": [{ "binding": "BUCKET", "bucket_name": "<project>-bucket" }],
}
```

```typescript
// Service 内での操作例
await env.BUCKET.put(key, fileBody, { httpMetadata: { contentType } });
const object = await env.BUCKET.get(key);
await env.BUCKET.delete(key);
```

ローカル開発では Wrangler がバケットをエミュレートするため、AWS 認証情報の設定は不要。

### 4-2. バケット構造

コーポレート CMS 標準（`apps/admin` が書き込み）とマーケットプレイス業務データ（`apps/public` が書き込み）の 2 系統を同一バケット内でプレフィックス分離する（DEV-07 §2-1・§2-2 の ERD ブロック分割と対応）。

```
/organizations/{organization_id}/
  ├─ logo/                              # 団体ロゴ（organizations.logo_key — DEV-07 §5-4）
  ├─ dogs/{dog_id}/                     # 保護犬の写真（dogs.photo_key — DEV-07 §5-8）
  ├─ walk-records/{walk_slot_id}/       # お散歩実施記録の写真（walk_records.photo_keys、JSON 配列 — DEV-07 §5-14）
  ├─ incidents/{incident_id}/           # 事故・トラブル報告の添付（incidents.attachment_keys、JSON 配列、非公開 — DEV-07 §5-15）
  └─ applications/                      # 団体登録審査の提出書類・本人確認書類（非公開）。追跡用の DB カラムは
                                         # 未確定（必須提出書類自体が [Open] — GOV-02 TBD-25。確定後 DEV-07 に追記）
/site/
  ├─ logo/                              # サイトロゴ・OGP 既定画像（コーポレート CMS 標準）
  └─ news/{news_id}/                    # お知らせの添付・アイキャッチ画像（DEV-07 §5-21）
/media/{media_id}/                      # apps/admin の汎用アップロード（media テーブル — DEV-07 §4-2）
```

### 4-3. アクセス制御

| ファイル種別 | アクセス方式 |
| --- | --- |
| パブリック（保護犬・団体ロゴ・お散歩記録写真・サイトロゴ・お知らせ添付）| 公開 URL |
| プライベート（団体登録の提出書類・本人確認書類、Incident 添付）| 署名付き URL（15 分有効）、運営スタッフ（admin）または該当団体の org_staff 以上に限定 |

> 署名付き URL は R2 の S3 互換 API 経由で発行する presigned URL、または Astro API Route 側で有効期限付きトークンを検証して都度 `env.BUCKET.get()` を返す方式のいずれかを使う。採用方式は **Open**（GOV-02 TBD-49。DEV-05 §11 のデータ出力ファイルと同じ方式に揃える）。

### 4-4. アップロードフロー

```
オプション A: Astro API Route 経由（標準）
  Client → POST /api/v1/uploads → Astro API Route → env.BUCKET.put()

オプション B: Presigned URL（大容量ファイル。お散歩記録の複数写真等）
  Client → POST /api/v1/uploads/presign → Astro API Route
  Astro API Route → Presigned URL を返す（R2 の S3 互換 API 経由で署名）
  Client → PUT で直接 R2 へ
```

### 4-5. バックアップ

範囲・頻度の正本は OPS-02 §4（初期は登録申請書類等の重要ファイルのみ）。

| 対象 | 内容 |
| --- | --- |
| 検証 | SHA256 比較で週次サンプリング |

---

## 5. LLM プロバイダ（本プロジェクトでは不採用）

**不採用**（`Decided` — GOV-01 D-005、PRD-05 参照）。DEV-01 §2 の Vercel AI SDK・Vector DB（Cloudflare Vectorize）は導入しない。将来採用する場合は PRD-05 を記入し GOV-01 に決定を記録した上で本節を書き直す。

---

## 6. OAuth（ソーシャルログイン）

### 6-1. 採用判断

| プロバイダ | 対象 | 採用 |
| --- | --- | --- |
| Google | Walker（`apps/public`）| Medium 優先度、PMF 検証後（PRD-03 F-01-07。メール認証で代替可能なため MVP 必須ではない） |

OrganizationMember・AdminUser 向けのソーシャルログインは対象外（PRD-03 に記載なし）。

### 6-2. 標準実装

Arctic を使用（採用時に `pnpm --filter public add arctic`。DEV-01 §2）。Google は Arctic の専用プリセットクラスを使う。

```bash
# apps/public の .dev.vars（local）/ Cloudflare Workers シークレット（本番）
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://app.example.com/auth/callback/google
```

```typescript
// apps/public/src/pages/auth/redirect/[provider].astro が呼ぶ API Route、または同等の実装
import { Google, generateCodeVerifier, generateState } from "arctic";
import type { APIContext } from "astro";
import { env } from "cloudflare:workers"; // Astro.locals.runtime.env は v6 で削除済みの旧 API（採用する v7 にも無い — DEV-05 §1）

export async function GET({ cookies, redirect }: APIContext): Promise<Response> {
  const google = new Google(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);

  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url = google.createAuthorizationURL(state, codeVerifier, ["openid", "email", "profile"]);

  cookies.set("oauth_state", state, { httpOnly: true, secure: true, path: "/" });
  cookies.set("oauth_code_verifier", codeVerifier, { httpOnly: true, secure: true, path: "/" });

  return redirect(url.toString());
}
```

```typescript
// apps/public/src/pages/auth/callback/[provider].astro（PRD-04 §4-1 SCR-12）が呼ぶ API Route、または同等の実装
import { env } from "cloudflare:workers"; // Astro.locals.runtime.env は v6 で削除済みの旧 API（採用する v7 にも無い — DEV-05 §1）
import { findOrCreateWalkerFromSocial } from "../../../lib/server/services/walkers";

export async function GET({ url, cookies, redirect }: APIContext): Promise<Response> {
  const google = new Google(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);

  const tokens = await google.validateAuthorizationCode(url.searchParams.get("code")!, cookies.get("oauth_code_verifier")!.value);
  const googleUser = await fetchGoogleUserInfo(tokens.accessToken());
  const walker = await findOrCreateWalkerFromSocial(env, googleUser);

  // セッション確立処理（walker_sessions への発行）は DEV-02 参照
  return redirect("/mypage");
}
```

---

## 7. SAML / OIDC（エンタープライズ SSO）

**本プロジェクトでは対象外**（00_README §2-2）。保護団体・運営いずれも SAML/OIDC による IdP 連携の要件は現時点で存在しない。

---

## 8. その他の頻出統合

### 8-1. 全文検索（本プロジェクトでは MVP 不採用）

保護犬・お散歩枠の検索は構造化フィルタ（エリア・日付・体格・初心者可否等、PRD-03 F-07-03）と §9 の距離検索で十分なため、D1 の FTS5 virtual table（DEV-01 §2）は MVP で導入しない。将来キーワード検索の需要が確認された場合に採用する。

### 8-2. Web Push 通知（本プロジェクトでは不採用）

通知はメール（§3）+ アプリ内通知（`notifications` テーブルのポーリング取得、DEV-07 §5-19）のみ（PRD-03 FG-13、`Decided` GOV-01 D-005・D-010）。FCM HTTP v1 API（DEV-01 §2）は導入しない。

### 8-3. 分析・トラッキング

標準ツールは **Open**（GOV-02 TBD-52）。確定時は DEV-01 §2 に追記した上で、計測タグの管理方法・同意取得（DEV-02 / 法務要件）を本節に記載する。

### 8-4. プロダクト固有連携の追記フォーマット

本項執筆時点で決済（§2）・メール（§3）・ストレージ（§4）・ジオコーディング（§9）以外のプロダクト固有の外部連携は想定されていない。今後追加が必要になった場合は、以下のフォーマット（連携先 / 認証方式 / 呼び出し方式 / Webhook / エラー処理）で本節に追記する。

| 項目 | 記載内容 |
| --- | --- |
| 用途 | 何のための連携か |
| 認証方式 | API キー等（§1-3 に従い Secrets 管理） |
| 呼び出し方式 | 同期 / 非同期 / Webhook / バッチのいずれか（§1-1） |
| Webhook | 受信する場合は署名検証 + 冪等性の方式 |
| エラー処理 | §1-2 の共通ルールからの差分があれば明記 |

---

## 9. ジオコーディング（Google Maps Platform Geocoding API）

保護団体・お散歩枠の住所からエリア検索・現在地からの距離検索（PRD-03 F-07-04）を実現するための連携（`Decided` — GOV-01 D-009、旧仕様の判断を継承）。専用の SDK は導入せず、`fetch()` で直接呼び出す（DEV-01 §2）。呼び出し元は `organizations`/`walk_slots` の書き込みを担う `apps/public`（`Decided` GOV-01 D-007）。

| 項目 | 仕様 |
| --- | --- |
| 認証 | API キー（`GOOGLE_MAPS_API_KEY`。`apps/public` の Workers Secrets、§1-3 に従い管理。Google Cloud Console 側で Geocoding API のみへの API 制限 + リファラ/IP 制限を併用する — DEV-02 §5） |
| 呼び出しタイミング | Organization の住所登録・更新時（`organizations.address`）、WalkSlot の集合場所登録・更新時（`walk_slots.meeting_place`）。いずれも同期呼び出し（§1-1、5〜10 秒タイムアウト） |
| 処理内容 | 住所文字列 → 緯度経度への変換結果を `organizations.latitude`/`longitude`（DEV-07 §5-4）または `walk_slots.latitude`/`longitude`（DEV-07 §5-9）に保存する |
| 距離検索の実装 | Drizzle のクエリビルダで表現しづらいため、`env.DB.prepare(sql).bind(...)` の直書き（プレースホルダ必須、DEV-07 §11）による Haversine 公式で緯度経度間の距離を計算する。文字列連結による SQL 組み立ては行わない（DEV-01 §3 の Raw SQL 禁止と矛盾しない例外） |
| インデックス方針 | `walk_slots` は `area_prefecture, start_at` の複合インデックス（DEV-07 §5-9）で緯度経度の範囲を先に絞り込んでから Haversine 計算する（DEV-07 §8） |
| エラー処理 | ジオコーディング失敗時は緯度経度を NULL のまま保存し、距離検索の対象外とする（エリア名検索 `area_prefecture`/`area_city` は引き続き可能）。§1-2 の共通リトライルールに従う |
| 入力検証 | レスポンスは信頼できる外部入力として扱い、緯度経度の範囲チェック・住所文字列のエスケープを行ってから D1 へ保存する（DEV-02 §4） |
| レート制限 | Google 側のクォータに従う。月間想定呼び出し数は PRD-02 §5-1 の想定規模から見積もる。API キー取得・課金設定は運用タスク（GOV-02 TBD-40） |

```typescript
// apps/public/src/lib/server/geo/geocode.ts
export async function geocodeAddress(env: Env, address: string): Promise<{ latitude: number; longitude: number } | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", env.GOOGLE_MAPS_API_KEY);

  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) return null;

  const body = (await response.json()) as { status: string; results: { geometry: { location: { lat: number; lng: number } } }[] };
  if (body.status !== "OK" || body.results.length === 0) return null;

  const { lat, lng } = body.results[0].geometry.location;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null; // 範囲チェック（DEV-02 §4）

  return { latitude: lat, longitude: lng };
}
```

```typescript
// apps/public/src/lib/server/services/walk-slots.ts（距離検索。バインド変数使用、DEV-07 §11 の例外）
export async function findWalkSlotsWithinDistance(env: Env, lat: number, lng: number, radiusKm: number): Promise<WalkSlot[]> {
  const { results } = await env.DB.prepare(
    `SELECT *,
       (6371 * acos(cos(radians(?)) * cos(radians(latitude)) * cos(radians(longitude) - radians(?)) + sin(radians(?)) * sin(radians(latitude)))) AS distance_km
     FROM walk_slots
     WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND status = 'open'
     HAVING distance_km <= ?
     ORDER BY distance_km ASC`,
  )
    .bind(lat, lng, lat, radiusKm)
    .all();

  return results as WalkSlot[];
}
```

---

## 10. エラーハンドリング・観測・テスト戦略

### 10-1. ログ標準

フレームワーク提供のログコンテキスト機構はないため、構造化した JSON を `console.log` に出力する（DEV-01 §4「可観測性優先」）：

```typescript
const logContext = { requestId, service: "stripe", action: "create_checkout_session", reservationId: reservation.publicId };

console.log(JSON.stringify({ level: "info", message: "Stripe checkout session created", ...logContext, stripeSessionId: session.id }));
```

### 10-2. エラー監視ツールへの送信

エラー監視は Cloudflare Workers 標準のログ/メトリクスで開始し、必要になった時点で `@sentry/cloudflare` を導入する（DEV-01 §2。Node 版 Sentry SDK ではない）。導入後の送信基準：

| シナリオ | 送信するか |
| --- | --- |
| 4xx エラー（クライアントエラー）| 記録のみ、エラー監視ツールには送らない |
| 5xx エラー（サーバーエラー）| エラー監視ツールへ送信 |
| タイムアウト（ジオコーディング等）| エラー監視ツールへ送信 |
| Webhook 署名検証失敗（Stripe）| エラー監視ツールへ送信（潜在的攻撃の可能性） |
| Stripe Connect Transfer 失敗 | エラー監視ツールへ送信 + admin へメールアラート（§3） |

### 10-3. 連携先死活監視

| 項目 | 監視方法 |
| --- | --- |
| Stripe / Stripe Connect | Stripe Dashboard で API 成功率・Connect オンボーディング状況 |
| Resend | Resend Dashboard で配信成功率 |
| Google Maps Platform Geocoding API | Google Cloud Console でクォータ・エラー率 |
| R2 / D1 / 基盤 | Cloudflare Status Page を購読（DEV-01 §1） |

決済・ジオコーディングはリクエスト同期の外部呼び出しであり専用のヘルスチェックエンドポイントは持たない（DEV-08 §9）。死活は上記 §10-1 の構造化ログとエラー監視で把握する。

### 10-4. テスト戦略

テストツールは Vitest + Playwright（DEV-01 §1）。以下のモック方針を維持する。

| 対象 | 方法 |
| --- | --- |
| Stripe（決済）| `stripe-cli` で Webhook をローカル受信、Mock も使う |
| Stripe Connect | Transfer・Connected Account のオンボーディングは Stripe テストモードの Express Connected Account で検証（DEV-03 §3-2） |
| Resend | テスト時は送信関数をモックし、実際の Resend API を呼ばない |
| R2 | テスト時は R2 バインディングのローカルエミュレーション（Wrangler/Miniflare） |
| ジオコーディング | `fetch` をモックし固定レスポンスを返す。実 API を呼ばない |
| Webhook | ローカルで `ngrok` 等でトンネル。署名不正時に処理を拒否することを Vitest で検証（DEV-03 §3-2） |

---

## 11. 環境変数まとめ（正本）

採用機能の環境変数キー一覧は**本節を正本**とする。DEV-08 §8 はデプロイ時の一覧として本節の変数名と一致させる。

```bash
# Stripe（決済・Connect — `Decided` GOV-01 D-008。apps/public・apps/admin の両方の Workers Secrets に同一値を設定する — §1-3）
STRIPE_KEY=
STRIPE_SECRET=
STRIPE_WEBHOOK_SECRET=
# Stripe Connect のオンボーディング方式（Standard OAuth か Express + Account Links か）は [Open]（GOV-02 TBD-39）。
# 本書は Express + Account Links を暫定採用 [Assumed]（§2-3）。Standard の OAuth 連携を採用する場合のみ
# STRIPE_CONNECT_CLIENT_ID を使用する
STRIPE_CONNECT_CLIENT_ID=
# Connect スコープ Webhook（account.updated 等、接続アカウント側イベント専用エンドポイント。§2-4）
STRIPE_CONNECT_WEBHOOK_SECRET=

# Resend（Mail — apps/public・apps/admin それぞれ個別設定）
RESEND_API_KEY=
MAIL_FROM_ADDRESS=
MAIL_FROM_NAME=
# 運営（admin）向けアラートの宛先（Incident P0/P1、Payout Transfer 失敗等 — apps/admin）
MAIL_ADMIN_ALERTS=

# ファイルストレージ（Cloudflare R2、DEV-01 §1）
# 通常の読み書きは env.BUCKET バインディング経由のため環境変数は不要（wrangler.jsonc の r2_buckets で設定）
# Presigned URL 発行が必要な場合のみ、R2 API トークン（S3 互換）を追加
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_ACCOUNT_ID=

# ジオコーディング（Google Maps Platform — `Decided` GOV-01 D-009。apps/public の Workers Secrets）
GOOGLE_MAPS_API_KEY=

# OAuth（Walker のソーシャルログイン、PRD-03 F-01-07。PMF 検証後に採用検討 — apps/public）
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=

# エラー監視（Sentry — 採用時。DEV-01 §2）
SENTRY_DSN=
SENTRY_TRACES_SAMPLE_RATE=0.2

# 以下は本プロジェクトでは不採用（PRD-05 / GOV-01 D-005 参照。将来採用する場合のみ設定）
# ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY（LLM）
# CLOUDFLARE_VECTORIZE_INDEX（Vector DB）
```

---

## 12. 記入時チェックポイント

- 各統合の採否が明確か（採用ライブラリが DEV-01 §1 / §2 と一致しているか）
- Stripe（参加費決済）と Stripe Connect（団体還元送金）が明確に区別され、Subscription・Customer Portal 相当のコードが残っていないか（Organization 課金の概念がないため — GOV-01 D-008）
- Stripe Webhook の冪等性（`stripe_event_logs`、DEV-07 §5-20）が決済・Connect 双方のイベントで実装されているか
- Stripe Connect のオンボーディング・Transfer 失敗時のハンドリングが定義されているか。オンボーディング方式（Standard/Express）が `[Open]`（GOV-02 TBD-39）のまま実装に固定されていないか
- Stripe の秘密鍵が `apps/public`・`apps/admin` の両方に配置され、Google Maps Platform の API キーは `apps/public` にのみ配置されているか（§1-3）
- メールのドメイン認証（SPF/DKIM/DMARC）が設定されているか
- 通知（メール）のスコープが PRD-03 FG-13 と各機能グループの個別イベント（F-03-03/F-08-02/F-12-02 等）に収まっているか。アプリ内通知（`notifications` テーブル）とメールの役割分担が崩れていないか
- ジオコーディングの呼び出しタイミング・距離検索の実装方針（Raw SQL 禁止との整合、DEV-07 §11）が明確か。失敗時に緯度経度を NULL のまま保存する縮退動作が実装されているか
- オブジェクトストレージのバケット構造・アクセス制御（§4）が DEV-07 のカラム定義（`*_key` / `*_keys`）と一致しているか。バックアップ方針が OPS-02（運用ハンドブック）と整合しているか
- すべての API キーが Secrets で管理されているか
- LLM の不採用が DEV-01 / PRD-05 / GOV-01 D-005 と一貫しているか
