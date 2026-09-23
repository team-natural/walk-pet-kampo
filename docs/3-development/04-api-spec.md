---
doc-id: DEV-04
title: API 仕様
phase: 3
status: draft-ai
owner: Tech Lead / PdM（兼務前提）
last-updated: 2026-09-15
related-docs:
  - DEV-01: 技術スタック決定書・アーキテクチャ原則
  - DEV-02: 認証認可
  - DEV-05: バックエンド実装
  - DEV-06: フロントエンド実装
  - DEV-07: データベース物理設計
  - DEV-09: 状態遷移仕様
  - DEV-10: 統合・外部 API
  - PRD-03: 機能要件
  - 実装規約: `CLAUDE.md`（DEV-01 §9 参照）
---

# 04-api-spec.md — API 仕様

## このセクションの目的

RESTful API の設計規約、認証方式、エラー体系、バージョニング方針、複数エンドポイントを一覧形式で記述する標準パターンを定義する。本プロジェクトは二者間マーケットプレイス（お散歩参加者 Walker × 保護団体 Organization、運営 Platform の 3 者構造 — GOV-01 D-006）であり、`apps/public`・`apps/admin` は独立した Cloudflare Worker としてそれぞれ独自の `/api/v1/` を持つ（`Decided` — GOV-01 D-007、PRD-03 §1「実装先」）。

## 0-H. ハイブリッド編集ガイド（要点）

- 推奨モード: Hybrid（AI 定型化 + Tech Lead 確定）
- 人間確認必須: 認証方式、破壊的変更方針、命名一貫性、セキュリティ影響

---

## 1. API 設計原則

- RESTful 設計を遵守。`apps/public` と `apps/admin` は別オリジンの独立した Worker であり、それぞれが自分の `/api/v1/` を持つ（同一アプリ内の 1 API ではない。DEV-01 §5、PRD-03 §1）
- 全エンドポイントを `/api/v1/` でバージョニング
- リソース名は複数形（`/dogs`、`/reservations`）
- ネスト 1 段まで（例: `/walk-slots/{id}/reservations`）。2 段以上は別エンドポイント
- URL 中の可変部は auto-increment ID ではなく `public_id`（ULID）を使う（DEV-07 §1）。保護団体・保護犬の公開 URL のみ SEO 目的で `slug` を使う（`organizations.slug` / `dogs.slug`、いずれも UNIQUE — DEV-07 §5-4・§5-8）
- HTTP メソッドの意味を尊重（GET / POST / PUT / PATCH / DELETE）
- レスポンスは共通のレスポンス整形関数/型（plain な TypeScript 関数として自前実装、DEV-01 参照）経由のみで生成する
- 権限違反は 403、存在しないリソースは 404 で明確に区別する。本プロジェクトは Organization というテナント境界を持つため（旧テンプレート標準の単一運営前提とは異なり、テナント境界違反という区分が復活する — PRD-02 §2）、403 は次の 2 種を含む（DEV-02 §2-3・§3）：
  1. ロール不足（`admin`/`org_admin`/`org_staff` の権限不足）
  2. 他 Organization のデータへのアクセス（操作対象の `organization_id` と現在の OrganizationMember の所属団体が不一致）

  いずれも `error_code: FORBIDDEN` で表現し、`message` の文言で区別する（§4・§6-2）
- `apps/public` と `apps/admin` は互いのソースコードを import できない（DEV-01 §5）。両アプリは同一の共有 D1（バインディング名 `DB`）に対して直接クエリを発行することがあるが、Service 層の実装ファイルは完全に分離する（§5-0）

---

## 2. 認証

本プロジェクトは 3 系統のアカウント（AdminUser / Walker / OrganizationMember）を完全分離する（`Decided` — GOV-01 D-004・D-007、DEV-02 §1）。3 系統ともセッション技術（D1 セッション + httpOnly 署名クッキー + Web Crypto PBKDF2）は共有するが、テーブル・クッキー名・実装コードは分離する。`jose`/JWT はいずれの系統でも不採用。

### 2-1. AdminUser 認証（`apps/admin`。Platform ロール）

| 項目 | 方針 |
| --- | --- |
| クッキー | `admin_session`（httpOnly、Secure、SameSite=Lax）。属性の正本は DEV-02 §1-1 |
| セッション発行 | `POST /api/v1/auth/login`（`admin_sessions` に行を作成し `admin_session` クッキーを発行。DEV-07 §4-5） |
| セッション失効 | `POST /api/v1/auth/logout`（該当行を削除しクッキーを失効） |
| 認証必須範囲 | `apps/admin` の `/api/v1/*` 全エンドポイント。認証不要の除外: `/auth/login`・`/auth/password/forgot`・`/auth/password/reset`・`/admin-users/invite-accept`、ヘルスチェック（`/health`・`/health/db`・`/health/kv`。`/health/queue` は Queues 不採用のため無し — DEV-01 §1） |
| ロール | `admin` の単一ロール（`Decided` — GOV-01 D-011。旧テンプレート標準の `admin`/`editor` から、サポート等の追加ロールを持たない単一 `admin` ロールへ変更、DEV-07 §4-1。`role` 列自体を持たない）。ロールが常に 1 種類のみのため、Service 層の入口では `requireRole` は不要で、`requireSession(cookies, db)`（DEV-02 §3-1）のみで認可が足りる |
| 検証の実施箇所 | 各 API ルートハンドラ（`apps/admin/src/pages/api/**/*.ts`）の冒頭（`apps/admin/src/middleware.ts` はセキュリティヘッダー付与専用。DEV-05 §2 が正本） |

### 2-2. Walker 認証（`apps/public`。お散歩参加者）

| 項目 | 方針 |
| --- | --- |
| クッキー | `walker_session`（AdminUser・OrganizationMember と異なる名前。DEV-02 §1-2） |
| セッション発行 | `POST /api/v1/auth/register`（`walkers`/`walker_profiles` を作成）、`POST /api/v1/auth/login`（`walker_sessions` に行を作成。DEV-07 §5-1・§5-2・§5-3） |
| セッション失効 | `POST /api/v1/auth/logout` |
| 認証必須範囲 | `/api/v1/me/*` 全エンドポイントと、予約作成・決済・里親相談送信を伴うエンドポイント。公開検索（`/organizations`・`/dogs`・`/walk-slots` の一覧・詳細）・お問い合わせ送信・保護団体登録申請は認証不要（お知らせ・FAQ はそもそも API を持たない — §5-5） |
| ロールなし | Walker はロールを持たない。「本人か」の所有者チェック（`requireWalker(session, walkerId)`）に加え、予約・決済等の利用資格が前提の操作は `requireActiveWalkerProfile(session)`（`walker_profiles.status = active` の検証）を必ず通す（DEV-02 §1-2・§3-1） |
| 検証の実施箇所 | `apps/public/src/pages/api/**/*.ts` の冒頭。Walker 専用のセッション検証モジュールは OrganizationMember 用と共有しない（DEV-02 §1-4） |

### 2-3. OrganizationMember 認証（`apps/public`。保護団体スタッフ）

| 項目 | 方針 |
| --- | --- |
| クッキー | `organization_session`（AdminUser・Walker と異なる名前。DEV-02 §1-3） |
| セッション発行 | `POST /api/v1/organization/invitations/accept`（招待受諾で `organization_members` を作成・`active` に遷移）、`POST /api/v1/organization/auth/login`（`organization_sessions` に行を作成。DEV-07 §5-5・§5-6） |
| セッション失効 | `POST /api/v1/organization/auth/logout` |
| 認証必須範囲 | `/api/v1/organization/*` 配下（`auth/login`・`auth/password/forgot`・`auth/password/reset`・`invitations/accept`・`activate` を除く）全エンドポイント |
| ロール + 境界 | `org_admin` / `org_staff` の 2 階層に加え、Organization 境界の二重認可が必要（DEV-02 §1-3・§3-1）。ロール判定は `requireRole(session, "org_admin" | "org_staff")`、境界判定は `requireOrganizationMember(session, organizationId)`。自団体スコープのため URL に `organizationId` を含めず、セッションの `organization_id` を用いる |
| Organization 切替 | MVP では 1 スタッフ = 1 団体所属を前提とし、切替機構は持たない（`[Assumed]` — PRD-02 §2-3） |

### 2-4. アプリをまたぐ運営者操作（`Decided` — GOV-01 D-022）

Reservation / Payment / Payout / Incident / AdoptionInquiry / WalkerProfile は `apps/public` のドメインであり、状態遷移関数（`transition<Entity>()`）も `apps/public/src/lib/server/services/<entity>.ts` に集約される（DEV-09 §3-1）。しかしこれらの遷移の一部は `admin`（`apps/admin` の AdminUser）が実行者となる（例: Reservation の運営キャンセル代行、Payment の返金、Payout の振込確定、Incident の運営対応、WalkerProfile の利用制限）。**Organization の審査系遷移のみ `apps/admin` 側への例外配置が明記されている**（DEV-09 §2-1-5。D1 が両 Worker の共有インスタンスであることを根拠に、審査という一回性の操作に限り `apps/admin` 側に直接書き込む Service を置く）。それ以外のエンティティは遷移関数の配置（`apps/public`）を動かさない方針のため（DEV-09 §3-1 が明記する対象は Organization のみ）、これらの操作のエンドポイントは `apps/public` 側の `/api/v1/` に置く（§5-15）。

**認可方式**: これらの操作は HTTP エンドポイントとしては公開せず、**Service Binding の RPC** で呼ぶ（`Decided` — GOV-01 D-022）。`apps/public` が `WorkerEntrypoint` を継承した名前付きエントリポイント `AdminOps` を export し、`apps/admin` が `services` バインディング経由で `env.PUBLIC_ADMIN_OPS.cancelReservation(...)` のように直接呼び出す。

| 項目 | 内容 |
| --- | --- |
| 認可の実行場所 | `apps/admin` 側。ページ / API ルートで `requireSession(cookies, db)` を通した後に RPC を呼ぶ。`apps/public` 側は「バインディングを宣言した Worker からしか呼ばれない」ことを信頼の根拠にする |
| 実行者の記録 | RPC 引数に AdminUser の `public_id` を渡し、`apps/public` 側の遷移関数が `activity_log.causer_type = "AdminUser"` / `causer_id` に記録する（DEV-09 §3-5） |
| 採らない方式 | ① `apps/public` から `admin_sessions` を引く ② `admin_session` クッキーの Domain を親ドメインに広げる。②は運営者の管理セッションが公開サイトの全リクエストに同送されることになり、3 系統分離（DEV-02 §1-4）を崩す。①もサブドメインのクッキーが `apps/public` に届かない以上、トークンを別経路で渡す必要があり同じ問題に戻る |
| 実装上の前提 | `apps/public/wrangler.jsonc` の `main` を `src/worker.ts` に変更し、`@astrojs/cloudflare/handler` の `handle` を default export の `fetch` に据えたうえで `AdminOps` を並べて export する（`@astrojs/cloudflare` 14.3.0 で確認済み） |

`WorkerEntrypoint` のメソッドは HTTP ルーティングの対象外なので、**この方式ではインターネットから到達できる経路が 1 つも増えない**。共有シークレットの管理も不要。

---

## 3. レスポンス形式

### 3-1. 成功（単一リソース）

```json
{
  "data": {
    "id": "01HXXXX...",
    "name": "サンプル",
    ...
  }
}
```

### 3-2. 成功（コレクション）

**コレクションは全リストがカーソル方式**（`Decided` — GOV-01 D-032）。envelope は 1 種類だけで、リストごとに形が変わることはない。`total` / `last_page` は持たない — カーソル走査では総件数を数えないため（§8）。

```json
{
  "data": [{ "id": "01HXXXX..." }, { "id": "01HYYYY..." }],
  "meta": {
    "per_page": 20,
    "next_cursor": "eyJpZCI6MTAwfQ"
  }
}
```

> 実装済みの参照実装: `packages/server-kit/src/http/response.ts`（`jsonItem` / `jsonCursorCollection` / `toErrorResponse`）、`packages/server-kit/src/http/pagination.ts`（`encodeCursor`/`decodeCursor`）。**両アプリが `@app/server-kit/http` として同じ実装を import する**（`Decided` — GOV-01 D-015）。`apps/public` 側に同等のモジュールを再実装しない — エンベロープが 2 アプリでずれる。

### 3-3. エラー

```json
{
  "message": "The given data was invalid.",
  "errors": {
    "email": ["The email field is required."]
  },
  "error_code": "VALIDATION_FAILED"
}
```

> バリデーション実装ライブラリは Zod に決定済み（DEV-01 §2）。Drizzle スキーマから `drizzle-zod` で自動導出することを優先する。上記の `errors` 形状は Zod の `flatten()`/`format()` 相当の出力に合わせて調整する。

---

## 4. エラーコード体系（標準）

| HTTP | error_code | 意味 |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | 一般的なリクエスト不正 |
| 401 | `UNAUTHENTICATED` | 未認証（`admin_session`/`walker_session`/`organization_session` のいずれも無効・失効） |
| 403 | `FORBIDDEN` | 認証済みだが権限不足。(a) ロール不足（`admin`/`org_admin`/`org_staff`）、(b) 他 Organization のデータへのアクセス（`organization_id` 不一致）のいずれかを指す（DEV-02 §2-3・§3、§1 参照） |
| 404 | `NOT_FOUND` | リソース不存在 |
| 409 | `CONFLICT` | リソースの状態と操作が矛盾 |
| 409 | `INVALID_STATE_TRANSITION` | StateMachine の不正遷移（DEV-09 §3-1。`@app/server-kit/http` の `InvalidStateTransitionError`） |
| 422 | `VALIDATION_FAILED` | バリデーションエラー |
| 429 | `RATE_LIMIT_EXCEEDED` | レート制限超過（DEV-02 §7。ログイン等のブルートフォース対策に加え、予約作成・決済試行等の業務乱用防止も含む） |
| 500 | `INTERNAL_ERROR` | サーバー内部エラー |
| 503 | `SERVICE_UNAVAILABLE` | 外部サービス全滅（Stripe・Google Maps Platform 等） |

---

## 5. エンドポイント一覧

### 5-0. 配置の原則

- **`apps/admin`**: AdminUser 認証・管理（§5-1・§5-2）、保護団体審査（§5-3。Organization の審査系遷移は DEV-09 §2-1-5 が明記する唯一の例外配置）、FG-15 横断リソースの一覧・詳細取得（§5-4。読み取り専用。対象データは `apps/public` ドメインの共有 D1 テーブルだが、読み取りのみのため `apps/admin` 側に専用の参照系 Service を置く — `[Assumed]`）、お問い合わせ管理（§5-5。お知らせ・FAQ は D1 に持たないため管理 API を持たない — GOV-01 D-016）、管理ダッシュボード・監査ログ（§5-6）
- **`apps/public`**: FG-01〜14 全体 — Walker 認証（§5-7）、Organization staff 認証（§5-8）、保護団体登録申請（§5-9）、公開検索（§5-10）、予約・決済（§5-11）、Walker マイページ（§5-12）、団体ページ（§5-13）、お問い合わせの公開面（§5-14）に加え、§2-4 で述べた `admin` によるアプリをまたぐ運営者操作（§5-15、`[Open: 認可方式]`）

### 5-1. `apps/admin` — AdminUser 認証

AdminUser はセルフサーブの新規登録を持たない（招待制、§5-2 の `invite-accept`）。

| メソッド | パス | 用途 | 認証 |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/login` | ログイン | 不要 |
| POST | `/api/v1/auth/logout` | ログアウト | 必須 |
| POST | `/api/v1/auth/password/forgot` | パスワードリセット要求 | 不要 |
| POST | `/api/v1/auth/password/reset` | パスワードリセット実行 | 不要 |
| GET | `/api/v1/auth/me` | 現在のユーザー | 必須 |

### 5-2. `apps/admin` — AdminUser 管理

AdminUser は単一ロール（`admin`）のみのため、`role` 列を持たず、ロール変更という概念自体がない（`Decided` — GOV-01 D-011）。

| メソッド | パス | 用途 |
| --- | --- | --- |
| GET | `/api/v1/admin-users` | AdminUser 一覧 |
| POST | `/api/v1/admin-users` | AdminUser 追加（招待） |
| GET | `/api/v1/admin-users/{id}` | 詳細 |
| PATCH | `/api/v1/admin-users/{id}` | 状態変更（有効化/無効化） |
| DELETE | `/api/v1/admin-users/{id}` | 無効化 |
| POST | `/api/v1/admin-users/invite-accept` | 招待受諾（Web Crypto HMAC 署名トークンで検証。DEV-02 §1-1） |

### 5-3. `apps/admin` — 保護団体審査（admin — DEV-09 §2-1-5）

Organization テーブル自体は `apps/public` のドメインだが、審査系遷移（`under_review → approved/rejected` 等）は `admin` が実行者のため `apps/admin/src/lib/server/services/organizations.ts` に置く（例外配置。§2-4 と異なり DEV-09 が明記する唯一の配置例外）。

| メソッド | パス | 用途 |
| --- | --- | --- |
| GET | `/api/v1/organizations` | 保護団体一覧（横断。`status` フィルタで審査待ちを抽出） |
| GET | `/api/v1/organizations/{id}` | 詳細・提出書類の確認（署名付き URL、DEV-10 §4-3） |
| GET | `/api/v1/organizations/{id}/members` | 所属スタッフ一覧（横断確認） |
| POST | `/api/v1/organizations/{id}/transition` | 審査系遷移（body: `{ to: OrganizationStatus, reason？ }`。`pending_review→under_review`、`under_review→approved/needs_more_info/rejected`、`approved/suspended/deactivated` 相互遷移を許可範囲内で受け付ける。不正遷移は 409 `INVALID_STATE_TRANSITION`。DEV-09 §2-1-2） |

### 5-4. `apps/admin` — 横断管理（参照系 API `[Assumed]`）

本セクションのエンドポイントはすべて参照系（GET）である。書き込み・状態遷移が必要な操作は §5-15（Reservation/Payment/WalkerProfile）または §5-13 と同一のエンドポイントを `admin` 権限で用いる（Incident/AdoptionInquiry。§2-4 参照）。Payout は §5-4-1（`apps/admin` の運営データ）を参照。Dog / WalkSlot の横断編集（SYS-10・SYS-12 相当）も §5-15 と同じ RPC 方式に従う（`Decided` — GOV-01 D-022）。

| メソッド | パス | 用途 |
| --- | --- | --- |
| GET | `/api/v1/walkers` | お散歩参加者一覧・検索 |
| GET | `/api/v1/walkers/{id}` | 参加者詳細 |
| GET | `/api/v1/dogs` | 保護犬一覧（横断） |
| GET | `/api/v1/dogs/{id}` | 保護犬詳細（横断） |
| GET | `/api/v1/walk-slots` | お散歩募集一覧（横断。非公開含む） |
| GET | `/api/v1/walk-slots/{id}` | お散歩募集詳細（横断） |
| GET | `/api/v1/reservations` | 予約一覧（横断） |
| GET | `/api/v1/reservations/{id}` | 予約詳細（横断） |
| GET | `/api/v1/payments` | 決済一覧（横断） |
| GET | `/api/v1/payments/{id}` | 決済詳細（横断） |
| GET | `/api/v1/incidents` | 事故・トラブル一覧（横断） |
| GET | `/api/v1/incidents/{id}` | 事故・トラブル詳細（横断） |
| GET | `/api/v1/adoption-inquiries` | 里親相談一覧（横断） |
| GET | `/api/v1/adoption-inquiries/{id}` | 里親相談詳細（横断） |

### 5-4-1. `apps/admin` — 団体還元・振込（Payout、admin — GOV-01 D-010、DEV-09 §2-9）

Payout は月次 Cron Triggers による集計から確定・Stripe Connect Transfer 実行まで一貫して `apps/admin` の運営データとして扱う（DEV-05 §7-2、DEV-09 §2-9 が正本）。`apps/public` 側は org_admin 向けの参照専用エンドポイントのみ持つ（§5-13）。

| メソッド | パス | 用途 |
| --- | --- | --- |
| GET | `/api/v1/payouts` | 団体還元・振込一覧（横断） |
| GET | `/api/v1/payouts/{id}` | 団体還元・振込詳細（横断） |
| POST | `/api/v1/payouts/{id}/confirm` | 集計完了・調整額確定（`aggregating → confirmed`。F-09-03、DEV-09 §2-9） |
| POST | `/api/v1/payouts/{id}/schedule` | 振込予定日の確定（`confirmed → scheduled`） |
| POST | `/api/v1/payouts/{id}/hold` | 異常検知時の保留（`aggregating/confirmed → on_hold`） |

### 5-5. `apps/admin` — お問い合わせ管理（admin）

`inquiries`（標準テーブル、DEV-07 §4-3）は `apps/public` の公開フォームから作成されるが、対応（ステータス変更）は `apps/admin` が担う（`inquiries` の参照実装の配置パターンを踏襲 — DEV-05 §1）。

> **お知らせ・FAQ は API を持たない**（`Decided` — GOV-01 D-016）。お知らせは `packages/content/news/` の Content Collections、FAQ は `apps/public/src/lib/faq.ts` の TypeScript 定数で、いずれもビルド時に解決されるため取得する API も管理する API も無い（DEV-06 §1-1）。

| メソッド | パス | 用途 |
| --- | --- | --- |
| GET | `/api/v1/inquiries` | お問い合わせ一覧（admin） |
| GET | `/api/v1/inquiries/{id}` | 詳細 |
| PATCH | `/api/v1/inquiries/{id}` | 対応状況・担当者変更（`new/in_progress/resolved`。DEV-09 §2-12） |

### 5-6. `apps/admin` — 管理ダッシュボード・監査ログ

| メソッド | パス | 用途 |
| --- | --- | --- |
| GET | `/api/v1/admin/dashboard` | KPI 集計（未審査申請・決済失敗・本日の予定等） |
| GET | `/api/v1/admin/audit-logs` | 監査ログ（`activity_log`、DEV-07 §4-4。`causer_type` で `AdminUser`/`OrganizationMember`/`Walker` を判別） |

### 5-7. `apps/public` — Walker 認証

| メソッド | パス | 用途 | 認証 |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/register` | 参加者登録（`walkers`/`walker_profiles` 作成、F-02-01） | 不要 |
| POST | `/api/v1/auth/login` | ログイン | 不要 |
| POST | `/api/v1/auth/logout` | ログアウト | 必須 |
| POST | `/api/v1/auth/password/forgot` | パスワードリセット要求 | 不要 |
| POST | `/api/v1/auth/password/reset` | パスワードリセット実行 | 不要 |
| POST | `/api/v1/auth/verify-email/{token}` | メールアドレス確認（F-01-01） | 不要（トークンで検証） |
| POST | `/api/v1/auth/verify-phone` | 電話番号確認コード送信（F-01-02） | 必須 |
| POST | `/api/v1/auth/verify-phone/confirm` | SMS コード照合 | 必須 |
| GET | `/api/v1/auth/callback/{provider}` | ソーシャルログイン（F-01-07、Medium/MVP 対象外 `△`） | 不要 |
| GET | `/api/v1/auth/me` | 現在の Walker 情報 | 必須 |

### 5-8. `apps/public` — Organization staff 認証

| メソッド | パス | 用途 | 認証 |
| --- | --- | --- | --- |
| POST | `/api/v1/organization/auth/login` | ログイン | 不要 |
| POST | `/api/v1/organization/auth/logout` | ログアウト | 必須 |
| POST | `/api/v1/organization/auth/password/forgot` | パスワードリセット要求 | 不要 |
| POST | `/api/v1/organization/auth/password/reset` | パスワードリセット実行 | 不要 |
| POST | `/api/v1/organization/invitations/accept` | 招待受諾（`organization_members` を `active` で作成。DEV-09 §2-3） | 不要（トークンで検証） |
| GET | `/api/v1/organization/auth/me` | 現在の OrganizationMember 情報 | 必須 |

### 5-9. `apps/public` — 保護団体登録申請（F-03、未認証）

団体スタッフアカウントは審査承認後に発行されるため（F-03-06）、申請時点では OrganizationMember を作成しない。

| メソッド | パス | 用途 | 認証 |
| --- | --- | --- | --- |
| POST | `/api/v1/organization-applications` | 申請フォーム送信（`organizations` を `pending_review` で作成、F-03-01） | 不要 |
| POST | `/api/v1/organization-applications/{id}/documents` | 申請書類・本人確認書類アップロード（R2、F-03-02） | 不要（申請 ID + アップロードトークンで検証 `[Assumed]`） |
| POST | `/api/v1/organization/resubmit` | 追加確認依頼への対応（`needs_more_info → under_review`、F-03-05） | 必須（org_admin） |
| POST | `/api/v1/organization/activate` | 承認後の初回パスワード設定（`organization_members` を `org_admin` で作成し `organization_session` を発行。F-03-06） | 不要（招待同様のトークンで検証） |
| POST | `/api/v1/organization/withdrawal` | 団体退会・掲載終了申請（`approved/suspended/deactivated → withdrawn`。F-04-05） | 必須（org_admin） |

### 5-10. `apps/public` — 公開検索（F-07、未認証）

| メソッド | パス | 用途 |
| --- | --- | --- |
| GET | `/api/v1/organizations` | 保護団体一覧・検索（F-07-01） |
| GET | `/api/v1/organizations/{slug}` | 保護団体詳細（`approved` のみ。F-07-01） |
| GET | `/api/v1/dogs` | 保護犬一覧・検索（F-07-02） |
| GET | `/api/v1/dogs/{slug}` | 保護犬詳細（公開情報のみ。`internal_notes` は含まない。F-07-02） |
| GET | `/api/v1/walk-slots` | お散歩募集一覧・検索（エリア・日付・団体・初心者可否等、`lat`/`lng`/`radius_km` で距離検索。F-07-03・F-07-04） |
| GET | `/api/v1/walk-slots/{id}` | お散歩募集詳細（F-07-05） |

### 5-11. `apps/public` — 予約・決済（Walker、F-07-06・F-08）

| メソッド | パス | 用途 | 認証 |
| --- | --- | --- | --- |
| POST | `/api/v1/walk-slots/{id}/reservations` | 予約入力（参加条件チェック含む。`processing` で作成、F-07-06） | 必須（Walker、要 `active`） |
| GET | `/api/v1/reservations/{id}` | 予約詳細（決済前確認画面用） | 必須（Walker 本人） |
| POST | `/api/v1/reservations/{id}/checkout-session` | Stripe Checkout Session / Payment Intent 作成（`awaiting_payment` へ、F-08-01） | 必須（Walker 本人） |
| POST | `/api/v1/payments/webhook` | Stripe Webhook（決済成功/失敗/返金。署名検証必須、§7） | 不要（署名検証） |
| GET | `/api/v1/me/reservations` | 予約履歴一覧（F-08-07） | 必須（Walker） |
| GET | `/api/v1/me/reservations/{id}` | 予約詳細 | 必須（Walker 本人） |
| POST | `/api/v1/me/reservations/{id}/cancel` | 参加者都合のキャンセル（`confirmed/organization_reviewing/scheduled → cancelled_by_walker`。F-08-03） | 必須（Walker 本人） |

### 5-12. `apps/public` — Walker マイページ（FG-02・FG-10・FG-11・FG-13）

| メソッド | パス | 用途 |
| --- | --- | --- |
| GET | `/api/v1/me/profile` | プロフィール確認（F-02-02） |
| PATCH | `/api/v1/me/profile` | プロフィール編集（氏名・住所・緊急連絡先・犬の飼育経験等。F-02-02・F-02-03） |
| POST | `/api/v1/me/withdrawal` | 退会申請（`any → withdrawn`。F-02-06） |
| GET | `/api/v1/me/favorites` | お気に入り一覧（F-02-04） |
| POST | `/api/v1/me/favorites` | お気に入り登録（`favoritable_type`/`favoritable_id`） |
| DELETE | `/api/v1/me/favorites/{id}` | お気に入り解除 |
| GET | `/api/v1/me/notification-settings` | 通知設定確認（F-02-05） |
| PATCH | `/api/v1/me/notification-settings` | 通知種別ごとの ON/OFF（F-13-03） |
| GET | `/api/v1/me/notifications` | アプリ内通知一覧（F-13-01） |
| PATCH | `/api/v1/me/notifications/{id}/read` | 既読化 |
| GET | `/api/v1/me/walk-records` | お散歩記録一覧（F-10-02） |
| GET | `/api/v1/me/walk-records/{id}` | お散歩記録詳細 |
| GET | `/api/v1/me/support-summary` | 累計参加回数・累計団体還元額（F-10-03） |
| POST | `/api/v1/dogs/{id}/adoption-inquiries` | 里親相談フォーム送信（F-11-01。`Dog.adoption_status` を `listed → in_consultation` へ連鎖遷移、DEV-09 §2-11-3） |
| GET | `/api/v1/me/adoption-inquiries` | 相談履歴一覧（F-11-03） |
| GET | `/api/v1/me/adoption-inquiries/{id}` | 相談詳細 |
| POST | `/api/v1/me/adoption-inquiries/{id}/withdraw` | 相談の取下げ |

すべて認証必須（Walker 本人）。

### 5-13. `apps/public` — 団体ページ（org_admin/org_staff、自団体スコープ — FG-04〜FG-06・FG-09〜FG-12）

`requireOrganizationMember(session, organizationId)` により自団体のデータのみに強制スコープする（DEV-02 §3-1）。ロール欄の記載がない操作は `org_admin`/`org_staff` 双方が実行可能。`admin` によるこれらのエンドポイントへの横断アクセス（PRD-04 SYS-19〜22 相当）は §2-4 と同じ `[Open: 認可方式]` の対象。

| メソッド | パス | 用途 | ロール |
| --- | --- | --- | --- |
| GET | `/api/v1/organization/profile` | 団体情報確認 | — |
| PATCH | `/api/v1/organization/profile` | 団体情報編集（紹介文・所在地公開範囲等。F-04-01・F-04-02） | org_admin |
| GET | `/api/v1/organization/members` | 所属スタッフ一覧 | — |
| POST | `/api/v1/organization/members/invite` | スタッフ招待（`invitations` 作成。F-04-03） | org_admin |
| PATCH | `/api/v1/organization/members/{id}` | ロール変更・停止/復帰（F-04-04） | org_admin |
| GET | `/api/v1/organization/dogs` | 保護犬一覧（団体内。F-05-01） | — |
| POST | `/api/v1/organization/dogs` | 保護犬登録（公開プロフィール + 非公開の健康・安全情報。F-05-02） | — |
| GET | `/api/v1/organization/dogs/{id}` | 保護犬詳細（`internal_notes` 含む） | — |
| PATCH | `/api/v1/organization/dogs/{id}` | 保護犬編集・削除/非公開化（F-05-02・F-05-04） | — |
| POST | `/api/v1/organization/dogs/{id}/adoption-status` | 里親募集状況の遷移（body: `{ to }`。F-05-03、DEV-09 §2-5） | — |
| GET | `/api/v1/organization/walk-slots` | お散歩枠一覧（F-06-01） | — |
| POST | `/api/v1/organization/walk-slots` | お散歩枠登録（日時・場所・定員・参加費・候補犬。F-06-01） | — |
| GET | `/api/v1/organization/walk-slots/{id}` | お散歩枠詳細 | — |
| PATCH | `/api/v1/organization/walk-slots/{id}` | 編集・定員変更（F-06-04） | — |
| POST | `/api/v1/organization/walk-slots/{id}/publish` | 公開（`draft/scheduled → open`。F-06-02） | — |
| POST | `/api/v1/organization/walk-slots/{id}/cancel` | 開催中止（body: `{ reason: "organization" \| "weather" \| "dog_condition" }`。予約済み Reservation へ連鎖遷移、DEV-09 §2-6-4） | — |
| GET | `/api/v1/organization/reservations` | 予約者一覧確認（F-06-03） | — |
| GET | `/api/v1/organization/reservations/{id}` | 予約詳細確認 | — |
| POST | `/api/v1/organization/reservations/{id}/cancel` | 団体都合キャンセル（`→ cancelled_by_organization`。F-08-04） | — |
| POST | `/api/v1/organization/reservations/{id}/no-show` | 無断キャンセル記録（`scheduled → no_show`） | org_staff |
| POST | `/api/v1/organization/walk-slots/{id}/walk-record` | 実施結果登録（担当犬・担当スタッフ・写真・コメント。関連 Reservation を `completed` へ連鎖遷移。F-10-01） | org_staff |
| GET | `/api/v1/organization/walk-records` | 実施記録一覧 | — |
| GET | `/api/v1/organization/walk-records/{id}` | 実施記録詳細 | — |
| GET | `/api/v1/organization/payouts` | 団体還元・振込履歴確認（閲覧のみ。確定操作は運営側 §5-15。F-09-02・F-09-04） | org_admin |
| GET | `/api/v1/organization/payouts/{id}` | 明細確認 | org_admin |
| GET | `/api/v1/organization/incidents` | 事故・トラブル報告履歴（F-12-01） | — |
| POST | `/api/v1/organization/incidents` | 事故・トラブル報告（重大度 P0/P1 は運営へ即時共有。F-12-01・F-12-02） | org_staff |
| GET | `/api/v1/organization/incidents/{id}` | 対応状況確認 | — |
| POST | `/api/v1/organization/incidents/{id}/transition` | 対応状況・再発防止策の更新（body: `{ to, prevention_measures? }`。F-12-03、DEV-09 §2-10） | — |
| GET | `/api/v1/organization/adoption-inquiries` | 里親相談一覧（F-11-02） | — |
| GET | `/api/v1/organization/adoption-inquiries/{id}` | 相談対応詳細 | — |
| POST | `/api/v1/organization/adoption-inquiries/{id}/transition` | 対応状況の更新（body: `{ to }`。DEV-09 §2-11） | — |
| GET | `/api/v1/organization/notifications` | 通知一覧（F-13-01） | — |
| GET | `/api/v1/organization/notification-settings` | 通知設定確認 | — |
| PATCH | `/api/v1/organization/notification-settings` | 通知種別ごとの ON/OFF | — |

### 5-14. `apps/public` — お問い合わせ（公開、FG-14）

| メソッド | パス | 用途 | 認証 |
| --- | --- | --- | --- |
| POST | `/api/v1/inquiries` | お問い合わせフォーム送信（F-14-03） | 不要 |

> FG-14 のうちお知らせ（F-14-01 / SCR-34・35）と FAQ（F-14-02 / SCR-36）はエンドポイントを持たない。ページが Content Collections・TypeScript 定数から直接描画するため、取得する API が無い（`Decided` — GOV-01 D-016、§5-5 の注記）。

### 5-15. `apps/public` — プラットフォーム運営者操作（admin、RPC。§2-4、`Decided` — GOV-01 D-022）

対象エンティティ（Reservation/Payment/WalkerProfile）の遷移関数が `apps/public` 側に集約されているため（DEV-09 §3-1）、`admin` が実行者となる操作もここに置く。Payout は例外的に `apps/admin` 側が遷移関数を持つため §5-4-1 を参照（DEV-09 §2-9）。

**これらは HTTP エンドポイントではない。** `apps/public/src/worker.ts` が export する `AdminOps`（`WorkerEntrypoint`）のメソッドとして実装し、`apps/admin` が Service Binding 経由で呼ぶ（§2-4）。URL を持たないため、§3 のレスポンス envelope・§4 のエラーコードは適用されず、戻り値は素の TypeScript の値、失敗は例外で返す。

| RPC メソッド | 引数 | 用途 |
| --- | --- | --- |
| `cancelReservationByPlatform` | `{ publicId, reason, actorPublicId }` | 運営判断によるキャンセル代行（`→ cancelled_by_platform`。F-08-04、DEV-09 §2-7-3） |
| `refundPayment` | `{ publicId, amount?, actorPublicId }` | 返金処理（Stripe 返金 API 呼び出し。F-08-06） |
| `transitionWalkerProfile` | `{ publicId, to, actorPublicId }` | 参加者の利用制限・停止・復帰（`WalkerProfile.status`、DEV-09 §2-4） |
| `updateDogByPlatform` | `{ publicId, patch, actorPublicId }` | 保護犬の横断編集（SYS-10。§5-13 の参照系に対する書き込み側） |
| `updateWalkSlotByPlatform` | `{ publicId, patch, actorPublicId }` | お散歩募集の横断編集・中止（SYS-12） |

`actorPublicId` は `apps/admin` が `requireSession` で確定させた AdminUser の `public_id`。`apps/public` 側は値の真正性を検証せず、バインディング経由でしか呼ばれないことを信頼の根拠にする（§2-4）。

---

## 6. リクエスト・レスポンス例

### 6-1. お散歩募集の予約 → 決済セッション作成

**Request**

```http
POST /api/v1/walk-slots/01HABCDE.../reservations
Content-Type: application/json
Cookie: walker_session={session_token}

{
  "participant_count": 1
}
```

**Response 201**

```json
{
  "data": {
    "id": "01HZZZZ...",
    "walk_slot_id": "01HABCDE...",
    "status": "processing",
    "participant_count": 1,
    "created_at": "2026-08-18T10:00:00Z"
  }
}
```

**Request（決済セッション作成）**

```http
POST /api/v1/reservations/01HZZZZ.../checkout-session
Content-Type: application/json
Cookie: walker_session={session_token}
```

**Response 200**

```json
{
  "data": {
    "checkout_url": "https://checkout.stripe.com/c/pay/cs_test_..."
  }
}
```

### 6-2. Organization 境界外アクセス（他団体の予約を閲覧しようとした場合）

本プロジェクトはテナント境界（Organization）を持つため、ロール不足と Organization 境界違反はいずれも 403 `FORBIDDEN` で表現する（DEV-02 §3、§1 参照）。

**Response 403**

```json
{
  "message": "この予約は自団体のものではありません。",
  "error_code": "FORBIDDEN"
}
```

ロール不足の場合（`org_staff` が `org_admin` 専用操作を実行）:

```json
{
  "message": "この操作には org_admin ロールが必要です。",
  "error_code": "FORBIDDEN"
}
```

---

## 7. Webhook

| 提供元 | エンドポイント | 用途 |
| --- | --- | --- |
| Stripe（決済） | `POST /api/v1/payments/webhook`（`apps/public`） | `payment_intent.succeeded`/`payment_intent.payment_failed`/`charge.refunded`（DEV-09 §2-8-3、DEV-10 §2-4） |
| Stripe（Connect オンボーディング） | `POST /api/v1/payments/webhook/connect`（`apps/public`） | `account.updated`（Organization 自身の Connect オンボーディング状態同期。DEV-10 §2-4） |
| Stripe（Connect 送金） | `POST /api/v1/payments/webhook/transfers`（`apps/admin`。Payout は運営データのため — GOV-01 D-010） | `transfer.created`/`transfer.reversed`（Payout の状態同期。DEV-09 §2-9-3、DEV-10 §2-4） |

すべて署名検証必須（`stripe-signature` ヘッダ + Webhook Secret、DEV-02 §4）。冪等性は `stripe_event_logs`（DEV-07 §5-20）への記録で確保する。詳細は DEV-10 §2。

---

## 8. ページネーション

- デフォルト 20 件 / ページ
- 最大 100 件 / ページ
- クエリパラメータ: `?cursor=eyJpZCI6MTAwfQ&per_page=50`。`cursor` は不透明な文字列で、クライアントは中身を解釈しない
- **全リストがカーソル方式**（`Decided` — GOV-01 D-032）。ページ番号方式（`?page=2` + `total` / `last_page` / `links`）は採らない: envelope が 2 種類に割れて `scaffold` の参照実装が分岐すること、`OFFSET` が読み飛ばす行を毎回再スキャンすること、総件数の `COUNT` が D1 の行読み取り課金に直接乗ることの 3 点による。総件数を表示したい画面が出てきた場合は、その画面専用の集計エンドポイントを足す（リスト API の形は変えない）
- 実装: Service 層でキーセット走査（`WHERE id < ?` + `ORDER BY id DESC` + `LIMIT per_page + 1` の「次ページ有無」プローブ）を組み立て、§3-2 の envelope は両アプリ共通の `@app/server-kit/http`（`jsonCursorCollection` / `encodeCursor` / `decodeCursor`）で生成する（GOV-01 D-015、§3-2）。参照実装は `apps/admin/src/lib/server/services/inquiries.ts` の `listInquiries()` と `apps/admin/src/pages/api/v1/inquiries/index.ts`

---

## 9. バージョニング・破壊的変更方針

- バージョンは URL パスに含める（`/api/v1/`、`/api/v2/`）。`apps/public`/`apps/admin` は独立してバージョンを進める
- v1 は最低 12 ヶ月サポート
- 破壊的変更は v2 として新規バージョンで提供
- フィールド追加は非破壊変更（既存クライアント無視）
- フィールド削除・型変更は破壊変更

---

## 10. レート制限

レート制限値の正本: DEV-02 §7 参照（本書では値を再掲しない）。ログイン/パスワードリセット等のブルートフォース対策に加え、本プロジェクトはマーケットプレイス特有の業務乱用（予約作成・決済試行・里親相談送信・事故報告の濫用）もアカウント単位（`walkerId`/`organizationId`）の KV カウンタで制限する（DEV-02 §7）。3 系統（AdminUser/Walker/OrganizationMember）はそれぞれ独立したロックアウトカウンタを持つ。

---

## 11. 記入時チェックポイント

- 全エンドポイントが認証要否・ロール要否（`admin`/`org_admin`/`org_staff`、または Walker 本人）で分類されているか
- `apps/public`/`apps/admin` の配置が GOV-01 D-007・PRD-03 §1 と一致しているか（FG-01〜14 は `apps/public`、FG-15 は `apps/admin`）
- Organization 境界（テナント境界）の 403 バリエーションが §1・§4・§6-2 で明記されているか
- エラーコード体系が網羅的か
- リクエスト / レスポンス例が型レベルまで具体化されているか
- Webhook（Stripe 決済 + Connect）の署名検証パターンが明示されているか
- §2-4・§5-15 の `[Open: 認可方式]`（アプリをまたぐ運営者操作）が実装時までに確定し、本書へ反映される見込みが記録されているか
- 破壊的変更時のバージョニング方針が明確か
