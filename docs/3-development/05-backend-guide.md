---
doc-id: DEV-05
title: バックエンド実装ガイド
phase: 3
status: draft-ai
owner: Tech Lead
last-updated: 2026-09-15
related-docs:
  - DEV-01: 技術スタック決定書・アーキテクチャ原則
  - DEV-02: セキュリティポリシー（3 系統認証・認可チェック関数の正本）
  - DEV-04: API 仕様
  - DEV-07: DB 物理設計
  - DEV-09: 状態遷移仕様（Service 層の状態遷移関数パターンの正本）
  - DEV-10: 統合・外部 API 仕様（Stripe / Stripe Connect / Geocoding）
  - PRD-01: ドメインモデル
  - OPS-01: 契約ポリシー（付録のデータエクスポート要件）
  - OPS-02: 運用ハンドブック（データ保管期限の削除バッチ運用）
  - CLAUDE.md: コード例・実装パターンの正本
---

# 05-backend-guide.md — バックエンド実装ガイド

## このセクションの目的

バックエンド実装のディレクトリ構成、レイヤー責務、トランザクション方針、非同期処理設計方針、
認可チェック、決済・還元連携、ログ・観測方針、命名規約の「原則」を定義する。

本プロジェクトは二者間マーケットプレイス（お散歩参加者 Walker × 保護団体 Organization、運営
Platform の 3 者構造 — `Decided` GOV-01 D-006）であり、`apps/admin`（プラットフォーム運営者専
用）だけでなく `apps/public` も Walker・OrganizationMember 向けの認証済みバックエンド層（Service
/ D1 アクセス/ 認可チェック）を持つ（`Decided` — GOV-01 D-007）。これはテンプレート標準の
「`apps/public` は D1 アクセスを持たない」という前提からの逸脱であり、本書はこの前提で書き直し
ている。実装パターン自体（Astro Page/API Route → Service → D1、状態遷移の単一関数集約、
`ctx.waitUntil()` + Cron Triggers による非同期化）はテンプレート標準を踏襲する。

- 技術スタックの選定は本書には書かない（DEV-01 が唯一の正本）。
- **コード例・実装パターンの正本: `CLAUDE.md`**（DEV-01 §9 参照）。
  本書は「何を守るか」を定義し、「どう書くか」は同ファイルに委ねる。
- 認証・認可の判断基準そのもの（3 系統の分離原則、ロール、Organization/Walker 境界）の正本は
  DEV-02。本書はそれを Service/D1 アクセス層の実装原則としてどう強制するかを扱う。
- 状態遷移関数の実装パターン・対象エンティティの正本は DEV-09。本書はその配置（どの `apps/*`
  の `lib/server/services/` に置くか）と、トランザクション・非同期化・監査ログとの結線を扱う。

## 0-H. ハイブリッド編集ガイド（要点）

- 推奨モード: Human-first または Hybrid
- 人間確認必須: 責務分離の妥当性、N+1 対策、ログ方針、Organization/Walker 境界の認可チェックの
  網羅性、Payout（団体還元・振込）の実行権限と Cron Triggers の設置箇所

---

## 1. ディレクトリ構成（標準）

このモノレポでは `apps/public`（Walker・OrganizationMember 向けの公開サイト兼マイページ/団体管
理画面）と `apps/admin`（プラットフォーム運営 CMS）が独立した Cloudflare Worker であり（DEV-01
§1「リポジトリ構成」参照）、**両方**が Astro Page/API Route → Service → D1 のレイヤー構造を持つ
（`Decided` — GOV-01 D-007）。`apps/admin` 側は **Inquiry を参照実装として**構成が確定済み
（`apps/admin/src/lib/server/services/inquiries.ts` — 一覧・取得・削除・状態遷移が揃っており、
`apps/admin/tests/unit/inquiries.test.ts` が規約をアサーションとして表現している）。`apps/public`
側は本プロジェクト固有の新設レイヤーであり、命名・配置は DEV-02（3 系統認証）・DEV-09（状態遷移）
で個別に確定している箇所をそのまま踏襲する。新規リソースはこの構成・命名に従う。

> **雛形生成器は無い。** `scaffold` スキル（DEV-01 §1）は動く参照実装（`inquiries`）を別テーブル
> に当てはめる手順であって、コードジェネレータではない。

```text
apps/admin/src/
├── pages/
│   ├── api/v1/**/*.ts               # API Route（Platform 専用。団体審査、Payout 確定・Transfer 実行、
│   │                                 #   横断管理〈FG-15〉、Inquiry 対応、News の CMS 系）
│   └── **/*.astro                   # 管理画面ページ（src/layouts/Layout.astro。`/admin` 接頭辞は付けない）
├── lib/
│   ├── components/                  # Svelte island + shadcn-svelte（$lib エイリアス）
│   ├── server/
│   │   ├── services/                #   ドメイン別ファイル。inquiries.ts / activity-log.ts /
│   │   │                            #   admin-users.ts / media.ts / auth.ts（既存）+ news.ts
│   │   │                            #   + organizations.ts（審査系遷移のみ。§2-1-5 参照）
│   │   │                            #   + payouts.ts（月次集計バッチ本体・確定・Stripe Connect Transfer 実行）
│   │   ├── auth/                    #   AdminUser 専用セッション検証（session.ts。DEV-02 §1-1）。
│   │   │                            #   トークン生成・TTL・期限判定は @app/server-kit/auth に委譲する
│   │   └── validation/              #   drizzle-zod で導出した Zod スキーマ
│   └── hooks/                       # shadcn-svelte 用フック
├── middleware.ts                    # セキュリティヘッダーのみ（認証はここでは行わない）
└── env.d.ts                         # Cloudflare bindings 型（Cloudflare.Env として DB / BUCKET / KV）

packages/schema/                     # 共有パッケージ @app/schema（apps/public・apps/admin 双方が参照）
├── src/schema.ts                    # Drizzle スキーマ本体（DEV-07 から生成）
├── src/client.ts                    # createDb(env.DB) と DbClient 型（`@app/schema/client`）
├── src/ulid.ts                      # 公開 ID の生成（`@app/schema/ulid`。DEV-07 §2）
└── migrations/                      # D1 migrations（Drizzle Kit 生成 SQL。apps/admin からのみ適用）

packages/server-kit/                 # 共有パッケージ @app/server-kit（両アプリのサーバー基盤）
├── src/auth/                        # PBKDF2 ハッシュ・ロックアウトカウンタ・セッショントークン/TTL/期限判定
│                                    #   （`@app/server-kit/auth`。DEV-02 §1-4・§7）
└── src/http/                        # AppError 系・レスポンス整形（jsonItem / jsonCursorCollection /
                                     #   toErrorResponse）・カーソルページネーション（`@app/server-kit/http`）

packages/content/                    # 開発者が git で更新する Markdown（@app/content。DEV-06 §1-1）

apps/public/src/
├── pages/
│   ├── api/v1/**/*.ts               # API Route（Walker/OrganizationMember 向け。予約・決済 Webhook・団体運営等）
│   │   └── payments/webhook.ts      #   Stripe Webhook 受信（DEV-09 §2-8-3。Payment/Reservation のデータ保有元が apps/public のため）
│   ├── mypage/**/*.astro            # Walker 認証済み領域（`/mypage/*`）
│   ├── organization/**/*.astro      # OrganizationMember 認証済み領域（`/organization/*`）
│   └── **/*.astro                   # 未認証の公開ページ（検索・団体/保護犬/お散歩枠の一覧・詳細等）
└── lib/
    ├── components/                  # Svelte island（公開・マイページ・団体管理で共通のもの含む）
    └── server/                      # 本プロジェクト固有の新設レイヤー（`Decided` — GOV-01 D-007）
        ├── services/                #   ドメイン別ファイル。reservations.ts / walk-slots.ts / payments.ts /
        │                            #   dogs.ts / incidents.ts / adoption-inquiries.ts / notifications.ts /
        │                            #   geocoding.ts（DEV-10 §9） 等
        │                            #   + organizations.ts（団体自身の操作のみ。審査系は apps/admin 側、§2-1-5）
        │                            #   + payouts.ts（org_admin 向けの参照専用クエリのみ。集計・確定は apps/admin 側、§7）
        ├── walker/                  #   Walker 専用セッション検証・requireWalker・requireActiveWalkerProfile
        │                            #   （DEV-02 §1-2・§3-2。例: session.ts）
        ├── organization/            #   OrganizationMember 専用セッション検証・requireOrganizationMember・
        │                            #   requireRole（DEV-02 §1-3・§3-2。例: session.ts）
        └── validation/              #   drizzle-zod で導出した Zod スキーマ
```

> **`db/` と `http/` をアプリ側に置かない。** D1 クライアントは `packages/schema/src/client.ts`、
> レスポンス整形・エラークラス・ページネーションは `packages/server-kit/src/http/` が唯一の実体で、
> 両アプリが `@app/schema/client` / `@app/server-kit/http` として import する（`Decided` — GOV-01
> D-015）。アプリ内に同等のモジュールを再実装すると 2 つのアプリでエンベロープがずれる。

> 非同期処理・イベント通知・状態遷移・列挙値それぞれに対応する専用ディレクトリは無い。非同期処理は `ctx.waitUntil()` と Cron Triggers（Queues は不採用 —
> DEV-01 §1/§3）、状態遷移はドメイン別 Service 内の単一関数（DEV-01 §4、DEV-09 §3）、列挙値は
> TypeScript の string literal union 型で代替する。

> **認証検証は各 API ルートハンドラ / Astro ページの冒頭で行う**（DEV-04 §2、決定済み）。フレー
> ムワーク提供のミドルウェアスタックが無いため、`apps/public/src/middleware.ts` /
> `apps/admin/src/middleware.ts` に認証を集約しない — いずれもセキュリティヘッダー専用（CLAUDE.md
> 参照）。各ルートは系統ごとのセッション検証関数（`requireSession`〈AdminUser〉/
> `requireWalkerSession`〈Walker〉/ `requireOrganizationSession`〈OrganizationMember〉）を呼んでセッ
> ションを取得し、必要に応じて認可チェック関数（§5）を続けて呼ぶ。

> Cloudflare バインディング（`env.DB` 等）は `Astro.locals.runtime.env` ではなく
> `import { env } from "cloudflare:workers"` で取得する（`Astro.locals.runtime.env` は Astro v6 で
> 削除済みの旧 API であり、採用バージョンの v7 — DEV-01 §1 — にも存在しない）。

> **`apps/admin/src/lib/server/auth/`（AdminUser）と `apps/public/src/lib/server/{walker,organization}/`
> （Walker・OrganizationMember）は完全に分離する**（DEV-02 §1-4、GOV-01 D-004・D-007）。Walker と
> OrganizationMember はいずれも `apps/public` に同居するが、汎用的な「auth」ヘルパー（複数の利用
> 者種別を前提にした共通関数）は書かず、テーブル・クッキー名・セッション検証コードを分けたまま
> `walker/` / `organization/` に個別実装する。共通化してよいのは `packages/server-kit/src/auth/`
> の純粋関数（PBKDF2 ハッシュ、セッショントークン生成・TTL 算出・期限判定、ロックアウトカウンタ）
> に限る（DEV-02 §1-4、GOV-01 D-015）。

> **`apps/public` と `apps/admin` は互いの `src/` を import できない**（DEV-01 §5、レイヤー境界）。
> D1 は両 Worker が共有する同一インスタンスのため（CLAUDE.md「D1/R2/KV バインディングルール」）、
> 一方のアプリが他方のドメインのテーブルへ直接書き込むことは許容されるが、それは import ではなく
> D1 バインディング経由のデータアクセスに限る。Organization の審査系遷移（§2-1-5 相当、DEV-09
> §2-1-5）と Payout の集計・確定（§7）がこのパターンの実例であり、1 テーブルに対して
> `apps/admin`・`apps/public` 双方に Service ファイルが存在する例外的な配置になる。

---

## 2. レイヤー責務と実装原則

各レイヤーの配置と責務の一覧は DEV-01 §5-3 を正とする。実装時の原則：

| レイヤー | 原則 |
| --- | --- |
| Astro Page / Svelte Island | 表示状態管理・ユーザー操作受付・Service または API Route への委譲のみ。D1 に直接アクセスしない |
| API Route | 入出力ハンドリングのみ。業務ロジックを書かない |
| 入力検証 | Service 層の入口（または API Route）で実施。検証は Zod で統一する（DEV-01 §2「リクエストバリデーション」）。Drizzle スキーマから `drizzle-zod` で自動導出することを優先し、手書きの重複定義は避ける |
| Service | 業務ロジック・トランザクション境界・後処理の起動（`ctx.waitUntil()`）・認可チェック関数の呼び出し |
| 認可チェック | `apps/admin`: AdminUser ロールは `admin` の単一ロールのため `requireRole` は不要で、`requireSession(cookies, db)`（DEV-02 §3-1）のみで認可が足りる。`apps/public`: `requireWalker(session, walkerId)` + `requireActiveWalkerProfile(session)`（Walker 系操作）または `requireOrganizationMember(session, organizationId)` + 必要に応じ `requireRole(session, "org_admin")`（Organization 系操作）。いずれも Service の入口で必ず呼ぶ（DEV-02 §3） |
| D1 アクセス | Drizzle のクエリビルダ（`drizzle-orm`、D1/SQLite dialect。DEV-01 §1）経由。`@app/schema/client` の `createDb(env.DB)` が返すクライアントを Service が引数で受け取り、Drizzle スキーマ（`@app/schema`）をクエリする。Organization 系のクエリ関数は `organizationId` を、Walker 系のクエリ関数は `walkerId` を必須引数とし、省略できるオーバーロードは作らない（DEV-07 §11） |
| 状態遷移 | 単一の遷移関数/モジュールに集約（DEV-01 §4、DEV-09 §3）。status の直接更新禁止 |

- 依存方向は Astro Page/Svelte Island/API Route → Service → D1 の一方向のみ（`apps/public`/`apps/admin` 双方共通）。
- URL キーは `public_id`（ULID）。内部 `INTEGER PRIMARY KEY AUTOINCREMENT` を外部に出さない（DEV-07 §1）。
- `apps/admin` の AdminUser（`admin` 単一ロール）はテンプレート標準の admin/editor と異なりロールを 1 種類しか持たない（`Decided` — GOV-01 D-011）。ロール引数による分岐は不要で、`requireSession(cookies, db)` の認証のみで全操作を許可する。

---

## 3. トランザクション方針

| 項目 | 方針 |
| --- | --- |
| 境界 | Service 層に置く。Astro Page / Svelte Island / API Route では直接 D1 の書き込みをまとめない |
| 単位 | 1 業務操作 = 1 トランザクション。複数ステートメントの原子性は Drizzle の `db.batch([...])`（内部で D1 の `env.DB.batch()` を呼び、単一トランザクションとして実行される）でまとめる。逐次に `.run()` を個別実行すると原子性が保証されない |
| 状態遷移関数での適用 | 状態遷移関数（DEV-09）が本体の UPDATE と付随する INSERT（`activity_log` への記録、`notifications` への配信記録等）のように複数テーブルを更新する場合も、必ず `batch()` で 1 トランザクションにまとめる。例: Reservation の `confirmed` 遷移は `reservations.status` 更新 + `walk_slots.reserved_count` 加算 + `activity_log` 記録 + `notifications` 挿入（Walker・OrganizationMember 双方分）を 1 バッチにまとめる（DEV-09 §3-2） |
| 外部 I/O | Stripe API 呼び出し・Geocoding API 呼び出し・メール送信（Resend）をトランザクション（`batch()`）内で同期実行しない。DB 書き込み完了後に `ctx.waitUntil()` で起動する、または（Geocoding のように結果を同一レコードに保存する必要がある場合は）D1 書き込みより前に同期呼び出しを完了させてから 1 つの `batch()` にまとめる（§4・§8、DEV-10 §9） |
| 横断書き込み（例外） | Organization の審査系遷移（`apps/admin` から `organizations` テーブルを更新）・Payout の集計/確定（`apps/admin` から `payments`/`reservations`/`payouts` を集計・更新）のように、他アプリのドメインテーブルへ直接書き込む場合も、境界は呼び出し元アプリの Service 層に置く。トランザクション単位の原則自体は変わらない（§1・§7） |

---

## 4. 非同期処理設計方針

Cloudflare Queues は不採用（`Confirmed` — DEV-01 §1/§3）。重い処理はレスポンスをブロックしない
形で以下の 2 手段に振り分ける（DEV-01 §4「レスポンスをブロックしない」）。

| 手段 | 用途 |
| --- | --- |
| `ctx.waitUntil()` | リクエスト起点の後処理（Resend でのメール送信、監査ログ以外の付随処理）。レスポンス返却後も Worker の実行を継続させる |
| Cron Triggers（Scheduled Worker、`apps/admin`） | 定期処理。データ保管期限の自動削除（OPS-02 §4-3、DEV-07 §10）と、Payout の月次集計バッチ（`Decided` — GOV-01 D-010、§7）の 2 系統を `apps/admin` の Scheduled Worker に集約する |

| 区分 | 方針 |
| --- | --- |
| リトライ | Queues のような自動リトライ基盤は無い。Stripe / Geocoding 等の外部 API 呼び出しは指数バックオフで最大 3 回を呼び出し関数内で実装する（DEV-10 §1） |
| 失敗時 | `failed_jobs` 相当のテーブルは持たない。関連エンティティの状態を `failed` へ更新し（Payment/Payout 等、DEV-09 §2-8・§2-9）、構造化ログ（§9）にエラーを出力する |
| ユーザー通知 | リトライ失敗が利用者影響を持つ場合はメール通知（Resend）+ アプリ内通知（`notifications` テーブル、§4-1） |
| 実装漏れの検出 | 失敗処理の実装漏れを静的解析で強制する仕組みは無いため、コードレビュー必須観点とする（DEV-03 §4） |

### 4-1. 通知はメール + アプリ内通知の併用（PRD-03 FG-13）

チャット・リアルタイム通信は不採用（`Decided` — GOV-01 D-005）だが、予約確定・審査結果・還元
確定・事故報告等はマーケットプレイスの性質上、即時性のあるアプリ内通知が必要なため、**メール
（Resend）と `notifications` テーブルへの配信記録を併用**する（`notification_settings` テーブル
で通知種別ごとの ON/OFF を管理、DEV-07 §5-18・§5-19。PRD-03 F-13-01〜03）。

| 宛先種別 | 機構 |
| --- | --- |
| Walker（`recipient_type = "walker"`） | `notifications` テーブルへの INSERT（アプリ内通知の一覧・未読管理）+ Resend でのメール送信 |
| OrganizationMember（`recipient_type = "organization_member"`） | 同上 |
| プラットフォーム運営（`apps/admin`）向けアラート | Resend で直接メール送信（重大事故の即時共有 — F-12-02 等）。運営向けの `notifications` レコードは持たない（`apps/admin` は AdminUser 専用の別 UI で監視するため） |

- `notifications` への INSERT は外部 I/O ではない D1 書き込みのため、状態遷移本体の `batch()`
  （§3）に含めてよい。**Resend へのメール送信のみ**を `ctx.waitUntil()` で後処理化する（レスポン
  スをブロックしない、DEV-01 §4）。
- 通知の生成は Service 内から直接行う。横断的な単一の「NotificationService」に業務判定そのものを
  持たせない（DEV-05 §9-1 の監査ログと同じ配置方針）。
- Walker/OrganizationMember が `notification_settings` で当該通知種別を OFF にしている場合、
  `notifications` への INSERT と該当チャネルのメール送信の双方をスキップする。
- 実装パターンの正本は `CLAUDE.md`。

---

## 5. 認可チェックの多層防御

本プロジェクトはテナント軸を 2 系統持つ（Organization 側 = `organization_id`、Walker 側 =
`walker_id`）。判断基準・チェック関数のシグネチャ自体の正本は DEV-02 §2・§3。本節は Service/D1
アクセス層の実装原則として単層に頼らず重ねることを定義する（DEV-01 §4「認可チェックの徹底」）。

| 層 | 強制方法 |
| --- | --- |
| D1 アクセス | Drizzle クライアント（`packages/schema/src/client.ts` の `createDb(env.DB)`。`@app/schema/client` としてインポート）とスキーマ（`packages/schema/src/schema.ts`、DEV-07 生成、`@app/schema` としてインポート）経由でアクセスし、文字列連結の Raw SQL を禁止する（DEV-01 §1・§3）。Organization 系クエリ関数は `organizationId`、Walker 系クエリ関数は `walkerId` を必須引数とする（DEV-07 §11） |
| Service（Platform 専用操作） | AdminUser は `admin` 単一ロールのため `requireRole` は不要。`requireSession(cookies, db)`（DEV-02 §3-1）のみで団体審査、Payout 確定・Transfer 実行、全 Organization/Walker 横断閲覧等を許可する |
| Service（Organization 系操作） | `requireOrganizationMember(session, organizationId)` を必ず通す。org_admin 専用操作（スタッフ招待・ロール変更・団体退会申請）はさらに `requireRole(session, "org_admin")` を通す（DEV-02 §3-1） |
| Service（Walker 本人操作） | `requireWalker(session, walkerId)` を必ず通す。予約・決済等、利用資格が前提の操作はさらに `requireActiveWalkerProfile(session)`（`WalkerProfile.status = active` を検証）を通す（DEV-02 §1-2・§3-1） |
| API Route / Astro Page | 操作前に上記いずれかの認可チェック関数を必ず呼ぶ。呼び出し順はセッション検証 → リソース取得 → 認可チェック → 業務処理（DEV-02 §3-2 のコード例） |

D1 には ORM の Global Scope に相当する自動適用機構が無いため（DEV-07 §1・§11）、Service 層の
入口で明示的に検証する。権限チェック漏れの検出は Vitest（Platform 専用操作は
`requireSession(cookies, db)` を必ず通ること、Organization 系操作は
`requireOrganizationMember` を、Walker 系操作は `requireWalker`〈+ 利用資格が前提の操作は
`requireActiveWalkerProfile`〉を必ず通ること）と PR レビュー（DEV-02 §11）の両輪で行う。

---

## 6. AI 機能の実装方針（本プロジェクトでは不採用）

チャット・AI 機能は不採用（`Decided` — GOV-01 D-005、DEV-02 §9、PRD-03 §4-3）。Vercel AI SDK・
`ai_jobs` テーブル・Vectorize は導入しない。将来 AI 機能の採用を検討する場合は GOV-02 に起票の
上、GOV-01 で決定してから、テンプレート標準の AI 実装方針（Vercel AI SDK 経由の呼び出し、
`ctx.waitUntil()` + ステータスポーリングでの非同期化、モデル ID の環境変数管理）を DEV-01 §2 の
確定内容に従って本節に書き起こす。

---

## 7. 決済・還元連携（PRD-03 FG-08・FG-09）

詳細は DEV-10 §2（Stripe / Stripe Connect の Webhook・状態整合）参照、決済プロバイダの選定は
DEV-01 §2。本プロジェクトは Organization 単位のサブスク課金を持たず、Walker の都度課金
（Payment）と Organization への月次還元・送金（Payout）の 2 系統を扱う（`Decided` — GOV-01
D-008）。いずれも `apps/public` が保有する D1 データ（`payments` / `payouts`、DEV-07 §5-12・
§5-13）を対象とするが、Payout の運用主体（admin）に応じて実行元アプリを分ける。

### 7-1. 参加費決済（Payment、`apps/public`）

- 参加費決済は Stripe Payment Intent / Checkout によるセルフサーブ決済（都度課金）。作成・
  確定は `apps/public/src/lib/server/services/payments.ts` から行う。
- Webhook（`payment_intent.succeeded` 等）は `apps/public/src/pages/api/v1/payments/webhook.ts`
  で受信し、`stripe_event_logs` テーブル（DEV-07 §5-20）に記録して冪等性を保証する（DEV-10
  §2-4）。署名検証（`stripe-signature` ヘッダ + Webhook Secret）は Zod 検証より前段で必須実施し、
  検証失敗時はペイロードをパースせず 400 で拒否する（DEV-02 §4）。
- Payment の状態は Stripe Webhook → D1 へ同期（`transitionPayment()`、DEV-09 §2-8 参照。
  StateMachine 相当の単一遷移関数経由）。
- 返金判定（全額/一部、キャンセル条件依存 — GOV-02 TBD-10〜12、`[Open]`）も同じ Service 内で
  行い、`refund_processing` への遷移を経て Stripe の返金 API を呼ぶ。

### 7-2. 団体還元・振込（Payout、集計は `apps/admin`・参照は `apps/public`）

Payout は admin（`apps/admin` の AdminUser）が確定・実行操作を行う対象であり（PRD-03
F-15-09、DEV-02 §2-3「振込処理の実行」は admin/system 専用）、org_admin は自団体分の閲覧
のみ許可される（F-09-02・F-09-04）。この実行権限の違いを反映し、Payout のライフサイクル全体
（集計・確定・Transfer 実行）を `apps/admin` 側に集約する：

| 処理 | 実行元 | 実装 |
| --- | --- | --- |
| 月次集計バッチ（`uncollected → aggregating`） | Cron Triggers（`apps/admin` の Scheduled Worker、`Decided` — GOV-01 D-010） | `apps/admin/src/lib/server/services/payouts.ts` が完了済み Reservation を集計し、共有 D1 の `payments`/`reservations`/`payouts` を直接更新する。Organization の審査系遷移（DEV-09 §2-1-5）と同じパターンで、`apps/public` の `src/` を import するのではなく D1 バインディング経由でアクセスする（§1「境界の明確化」） |
| 確定・振込予定日設定（`aggregating → confirmed → scheduled`） | admin（`apps/admin` の管理画面、SYS-09） | 同じ `apps/admin/src/lib/server/services/payouts.ts` の `transitionPayout()`（DEV-09 §2-9） |
| Stripe Connect Transfer 実行（`scheduled → paid`） | Cron Triggers または admin の手動実行トリガー（`apps/admin`） | 送金自体は同期処理内で行わず、確定後の後処理として実行し、結果を Webhook または実行結果で Payout の状態に反映する |
| 自団体の還元額・振込履歴閲覧（F-09-02・F-09-04） | org_admin（`apps/public`） | `apps/public/src/lib/server/services/payouts.ts` に**参照専用**のクエリ関数のみを置く（`requireOrganizationMember` + `requireRole(session, "org_admin")` でスコープ）。mutate 系の関数は置かない |

> 送金先は Stripe Connect の Connected Account（`organizations.stripe_connect_account_id`、DEV-07
> §5-4）。銀行口座番号自体は D1 に保持しない（DEV-07 §1「決済情報の非保持」）。送金は Job 化し、
> 同期処理内で行わない（§4）。月次集計バッチの Scheduled Worker は `apps/admin` に統一する
> （GOV-01 D-010、DEV-07 §5-13・§10、DEV-09 §2-9）。

---

## 8. パフォーマンスガイドライン

| 項目 | 方針 |
| --- | --- |
| N+1 防止 | Drizzle の `with`（リレーション先の一括取得）を使い、ループ内で `.get()` / `.first()` 相当を N 回呼ばない。複数 ID の一括取得は `inArray(...)` や `db.batch()` を使う（DEV-01 §1） |
| インデックス | 外部キー全カラム、`status`、`public_id`、Organization 系は `organization_id`、Walker 系は `walker_id` を先頭に配置した複合インデックスが必須（DEV-07 §8） |
| キャッシュ | リクエスト内で繰り返し参照するデータは Service 層でリクエスト単位に memoize。リクエストを跨いだキャッシュは Cloudflare KV（DEV-01 §1）を使えるが、実測で必要が確認できた箇所に限る |
| 集計クエリ | Payout の団体還元額等の KPI は集計テーブル（`payouts`）で事前計算し、都度集計しない（更新は Cron Triggers の月次バッチ — §7） |
| 距離検索 | `walk_slots`/`organizations` のエリア・現在地検索は `area_prefecture`/`start_at` 等の複合インデックスで絞り込んだ後に D1 SQL（バインド変数使用）による Haversine 公式で距離計算する。専用の空間検索エンジンは導入しない（`Decided` — GOV-01 D-009、DEV-10 §9）。全件走査での Haversine 計算を避けるため、絞り込み条件（都道府県・日付・状態）を必ず先に適用する |
| ジオコーディング呼び出し | Google Maps Platform Geocoding API は同期呼び出し（5〜10 秒のタイムアウトを設定）。団体・お散歩枠の住所登録・更新時のみ呼び出し、都度の検索リクエストでは呼び出さない（緯度経度は D1 に保存済みの値を使う。DEV-10 §9） |
| 重い処理 | `ctx.waitUntil()` で後処理化、定期処理は Cron Triggers（§4）。レスポンスを同期ブロックしない |

---

## 9. ログ・観測方針

全処理・API に request_id + actor（`{ type, id }`。DEV-09 §3-1 の `Actor` 型）を構造化ログ出力
する（DEV-01 §4）。

| ログ種別 | 出力先 | 必須コンテキスト |
| --- | --- | --- |
| アプリケーション | Cloudflare Workers 標準ログ（保持: Paid 7 日 / Free 3 日、DEV-01 §6） | request_id, actor.type, actor.id |
| 監査（重要操作） | `activity_log` テーブル（自前実装、DEV-01 §2、DEV-07 §4-4）。`causer_type` は `AdminUser` / `OrganizationMember` / `Walker` の 3 系統を判別する | causer_type, causer_id（system 時は NULL）, subject_type, subject_id, event, properties（before/after）, organization_id（該当時） |
| 決済 Webhook | `stripe_event_logs` テーブル（DEV-07 §5-20） | stripe_event_id, event_type, processed_at |
| アプリ内通知配信 | `notifications` テーブル（DEV-07 §5-19） | recipient_type, recipient_id, type, read_at |
| エラー監視 | Cloudflare Workers 標準ログ/メトリクスで開始 → 必要時 `@sentry/cloudflare`（DEV-01 §2、導入時） | 5xx / タイムアウト、Stripe/Geocoding 呼び出しの失敗 |

### 9-1. 監査ログの必須記録操作（`activity_log` テーブル — DEV-01 §2、DEV-07 §4-4）

- 意味のある状態遷移を行う Service の関数（DEV-09 §1 の対象エンティティすべて）は必ず
  `activity_log` へ 1 件記録する。特に **Organization の審査（承認・否認）・Payout の振込確定・
  Reservation のキャンセル・Incident の解決**は旧仕様の必須記録操作を踏襲し必ず記録する
  （DEV-09 §3-5）。専用パッケージは使わず、共通の薄い記録用ヘルパー関数（`recordTransition(...)`
  相当、`apps/admin/src/lib/server/services/activity-log.ts` と同じパターンを `apps/public` 側にも
  用意する）を経由して INSERT する。免除する場合は理由をコメントで明記する。
- 記録は Service 内にインラインで行う（ヘルパー関数の呼び出し程度は可）。横断的な単一の
  「AuditLogService」に判定ロジックそのものを持たせない。コード例は `CLAUDE.md` 参照。
- `causer_type` は DEV-09 §3-1 の `Actor` 型（`"walker" | "organization_member" | "platform" |
  "system"`）をそのまま `AdminUser`/`OrganizationMember`/`Walker` の別に記録し、`actor.type ===
  "system"` の場合は `causer_id` を NULL のまま記録する（「system ユーザーを発明しない」方針。
  発生源は `log_name` / `properties`〈例: `source: system`〉で示す。OPS-02 の自動削除記録も同じ
  方式）。
- **テストや静的解析では「呼び出しの欠落」を検出しにくい**（Vitest / `eslint-plugin-boundaries`
  でも記録漏れ自体は捕捉できない）。状態を変更する Service の関数の新設・レビュー時に
  「`activity_log` への記録はどこか」を必ず確認するコードレビュー必須観点とする（DEV-03 §4）。
  手本にした兄弟 Service にログがないと漏れが連鎖するため、最初の 1 件から徹底する。

---

## 10. 命名・コーディング規約の原則

- 全関数・変数に型を明示する（`any` 禁止。`tsconfig.json` は `astro/tsconfigs/strict` を継承）。
  列挙値は TypeScript の string literal union 型（DEV-09 の各 `*Status` 型等）で表現する
- 早期 return でネストを浅く。1 関数 20 行以下を目安
- ファイル生成のスキャフォールディング CLI は使わない（`npm create astro@latest` 等の再実行は
  `.devcontainer/` / `.claude/` / `.mcp.json` を破壊するため禁止 — DEV-01 §3）。既存のディレクトリ
  構成に手動でファイルを追加する
- デバッグ用の一時的な `console.log` / `debugger` を残さない（構造化ログ出力のための
  `console.log` 呼び出しは対象外 — DEV-01 §4「可観測性優先」）
- 業務上の可変パラメータ（キャンセル猶予期間・レート制限閾値・Payout 集計サイクル等）は Service
  にハードコードしない。非機密の値は `wrangler.jsonc` の `vars`、機密の値（Stripe API Key /
  Webhook Secret / Google Maps Platform API Key 等）は Cloudflare Workers Secrets
  （`wrangler secret put`）で管理し、ローカル開発は `.dev.vars`（gitignored）に記載する
  （デプロイなしに環境ごとの再調整を可能にするため）。Stripe の Secrets は `apps/public`・`apps/admin`
  の両方に同一値を配置する（参加費決済は `apps/public`、Payout の Transfer 実行は `apps/admin` の
  Cron Triggers から呼び出すため。DEV-02 §5、DEV-10 §1-3）。Google Maps Platform API Key は
  `apps/public` にのみ配置する（住所登録・更新の操作元が org_admin/org_staff に限られるため）
- 詳細な規約とコード例は `CLAUDE.md` を正本とする

---

## 11. 付録（任意機能）: データエクスポート

**OPS-01 §4-2（解約時のデータ取扱い）の契約条項が確定してから着手する任意機能。** 契約上の義務
が発生しないプロジェクトでは実装しない。本プロジェクトでは対象が「Organization（保護団体）の退
会（`withdrawn`）時」のデータエクスポートとなる。要件概要：

| 項目 | 要件 |
| --- | --- |
| 内容 | 団体退会後 90 日以内に当該 Organization に紐づくデータ（`dogs` / `walk_slots` / `reservations` / `walk_records` / `payouts` 等、団体スコープ分のみ）を CSV / JSON で一括エクスポート |
| 実行方式 | `ctx.waitUntil()` による非同期処理（§4。Workers の実行時間上限に注意し、大規模データは分割処理する） |
| 配信方式 | Cloudflare R2（DEV-01 §1）上の一時ファイルを署名付き URL（72 時間）でメール通知。署名付き URL の発行方式（R2 presigned URL か API Route 経由のトークン検証か）は **Open**（GOV-02 TBD-49。DEV-10 §4-3 と同じ方式に揃える） |
| 実行権限 | `org_admin` ロールのみ（`requireOrganizationMember` + `requireRole(session, "org_admin")`）。同一 Organization で 1 日 1 回まで |
| 保管期限 | 一時ファイルは 72 時間後に自動削除。実行は監査ログ（`activity_log`）に記録 |

エクスポート対象テーブルは DEV-07 の Organization 系テーブル一覧（§3-6・§3-7）と整合させる。
実装スケルトン・API エンドポイントは `CLAUDE.md` 参照。運用手順（実施フロー・問い合わせ対応）は
OPS-02（運用ハンドブック）参照。

---

## 12. 記入時チェックポイント

- ディレクトリ構成が §1 の確定済み参照実装（`apps/admin` は Inquiry を例にした構成、`apps/public`
  は DEV-02/DEV-09 が個別に確定した `walker/`/`organization/`/`services/` 構成）に従っているか
- Service / D1 アクセスの責務が明確か（Astro Page / API Route から D1 を直接呼び出していないか。
  `apps/public`/`apps/admin` 双方で確認）
- 認可チェック（D1 アクセス層 + Service + 認可チェック関数〈`requireRole`/`requireOrganizationMember`/
  `requireWalker`/`requireActiveWalkerProfile`〉+ API Route/Astro Page）が多層で網羅されているか
  （§5、DEV-02 §11 と一致）
- トランザクション境界が Service 層（`batch()`）に統一されているか。状態遷移が複数テーブルに
  またがる場合（Reservation confirmed 等）に漏れなく 1 トランザクションに収まっているか
- AI（不採用）/ 状態遷移の実装方針が採用方針（GOV-01 D-005 / DEV-09）と整合しているか
- N+1 対策・距離検索の絞り込み順序（§8）が実装に反映されているか
- 状態を変更する Service の関数に監査ログ記録（§9-1）が漏れていないか。特に Organization 審査・
  Payout 確定・Reservation キャンセル・Incident 解決
- 通知がメール + アプリ内通知（`notifications`、§4-1）の併用になっており、`notification_settings`
  の ON/OFF を尊重しているか
- Payout の集計・確定・Transfer 実行が `apps/admin` に、org_admin 向けの参照専用クエリが
  `apps/public` に、それぞれ配置され、mutate 系関数が `apps/public` 側に漏れていないか（§7）
- 業務閾値・外部サービス ID（Stripe / Google Maps Platform）が `vars` / Secrets 化（§10）され、
  Stripe の Secrets が `apps/public`・`apps/admin` の両方に、Google Maps Platform API Key が
  `apps/public` にのみ配置されているか（DEV-02 §5）
- DEV-04 のエンドポイントと API Route / Astro Page が対応しているか
- 技術名の選定を本書に書いていないか（DEV-01 参照になっているか）
- D1 アクセスが Drizzle のクエリビルダ経由になっているか（`env.DB.prepare()` の直呼びが Service
  に残っていないか。距離計算等の特殊クエリを除く。§2・§5、DEV-07 §11）
- `apps/admin`（AdminUser）と `apps/public`（Walker・OrganizationMember）の認証コードが完全に
  分離されており、汎用 auth ヘルパーを書いていないか（§1、DEV-02 §1-4）
- 付録のデータエクスポートは OPS-01 の契約条項確定前に着手していないか
