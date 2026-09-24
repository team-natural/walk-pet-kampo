---
doc-id: DEV-01
title: 技術スタック決定書・アーキテクチャ原則
phase: 3
status: draft-ai
owner: Tech Lead
last-updated: 2026-09-15
related-docs:
  - PRD-02: システム構成
  - PRD-05: AI 機能（任意）
  - DEV-02: セキュリティ
  - DEV-05: バックエンド実装
  - DEV-09: 状態遷移
  - DEV-10: 統合・外部 API
---

# 01-architecture-rules.md — 技術スタック決定書・アーキテクチャ原則

## 0. 本書の位置づけ（重要）

本書は docs/ 全体で **技術選定を記載する唯一の文書** である。

- 他の文書（BIZ / PRD / DEV / OPS）は、フレームワーク名・ライブラリ名・インフラ名を **選定として記述してはならない**。技術に言及する必要がある場合は「DEV-01 参照」とする。
- 技術スタックを変更する場合、修正対象は本書と `CLAUDE.md` / `.claude/` 配下の実装規約のみで完結させる。仕様文書（何を作るか）には波及させない。
- AI がコード・文書を生成する際、技術判断に迷ったら必ず本書に従う。本書にない選定は §2 のルールに従い勝手に行わない。
- 本書は `site-template`（Astro SSR + Svelte islands + Tailwind v4、Cloudflare Workers 上で動く Dev Container テンプレート）を土台にしたプロジェクトを前提とする。テンプレート自身の詳細な実装規約は `CLAUDE.md` が正本であり、本書はそれと矛盾しないこと。
- 本書で `Confirmed` と記載した項目はテンプレート標準として確定済み。「案件実装時に確定」と記載した項目は、採用する案件が GOV-02 で追跡し GOV-01 で確定する。**実案件がテンプレ標準から逸脱する場合**も案件側の GOV-01 に記録する（ラベルの意味は 00_README §6 参照）。
- **本プロジェクト（walk-pet-kampo）は 00_README §0-1 が定義する「パターン A（コンテンツ主体サイト）」の範囲を超え、二者間マーケットプレイス（お散歩参加者 × 保護団体）の実装を伴う（`Decided` — GOV-01 D-006）。テンプレート標準の想定より広い範囲（多ロール権限・マーケットプレイス決済・ジオコーディング）を Cloudflare ネイティブな構成で満たす方針とする。** 逸脱の詳細と背景は GOV-01 D-006〜D-009 を参照。

---

## 1. 確定スタック（全プロジェクト共通・必ず使う）

| Layer | 決定 | Version / 備考 |
| --- | --- | --- |
| Infra | **Cloudflare Workers** | ホスティング・デプロイ・オートスケールすべて。`astro build` の出力自体が Worker になる（`@astrojs/cloudflare` アダプタ）。`./dist` は `ASSETS` バインディング経由で配信 |
| リポジトリ構成 | 1 リポジトリ内の pnpm workspaces + Turborepo モノレポ（`Confirmed` — GOV-01 D-001） | `apps/public`（公開サイト）・`apps/admin`（管理 CMS）を独立した Cloudflare Worker として別々にデプロイし、`packages/schema`（Drizzle スキーマ + migrations）・`packages/server-kit`（パスワードハッシュ、ロックアウト、セッション規則、HTTP エンベロープ、アップロード検証と非公開ファイルの署名 — GOV-01 D-035）・`packages/content`（開発者が git で更新する Markdown。Content Collections の実体 — DEV-06 §1-1）を両者が参照する。2 リポジトリ構成（公開サイト用・管理サイト用）から移行した経緯は GOV-01 D-001 参照。共有パッケージは「2 つ目の利用者が現れてから作る」方針を取る。`packages/config`（ESLint/TS の共有設定）・`packages/ui`（共有コンポーネント）・`packages/types`（schema からの型再エクスポート専用パッケージ）は検討の上で見送り：ESLint のレイヤー境界ルールはパスパターンでアプリごとにスコープできるためルート 1 ファイルの `eslint.config.js` で足り、TypeScript も各アプリが外部共有 config（`astro/tsconfigs/strict`）を `extends` して重いオプションを共有済みで、アプリ固有の差分（`include`/`exclude`・`paths`・`types`）を各 `tsconfig.json` に数行書くだけで済むため現状の 2 アプリ規模では共有パッケージ化の利得が間接参照コストを上回らず（アプリが 3 つ以上に増える・共有設定が数行を超える・ドリフトが実際に発生する、のいずれかが起きた時点で `packages/config` 導入を再検討する）、`packages/ui` は public 側にコンポーネントライブラリを持たない方針（本表の「UI コンポーネント（公開画面）」参照）・shadcn-svelte の `components.json` が 1 アプリのスタイルシートと 1:1 対応する設計のため共有すべき実体がなく、`packages/types` は実際の利用者（`apps/admin` 以外の参照元）が出てくるまでは `packages/schema` の `$inferSelect` を直接使えば足りるため作らない。**本プロジェクトでは `apps/public` が公開ブラウジングに加え Walker（お散歩参加者）・Organization（保護団体スタッフ）の 2 種類の認証済み領域を持つ（`Decided` — GOV-01 D-007）。プラットフォーム運営者（admin）のみ `apps/admin` を使う。** 3 者の領域分けは PRD-01 §1-1・DEV-02 §2 参照 |
| アカウント系統（本プロジェクト固有） | 3 系統・完全分離（`Decided` — GOV-01 D-007） | `apps/admin`: AdminUser（単一ロール `admin`、運営者専用。ロールが常に 1 種類のため role 列自体を持たない — GOV-01 D-011）。`apps/public`: ①Walker（`/mypage/*`。旧称 Member）②OrganizationMember（org_admin/org_staff。`/organization/*`）。3 系統は別テーブル・別セッション Cookie（DEV-02 §1）。`apps/public` は本決定によりページ/API ルート → Service → D1 のレイヤー構造（§5）を `apps/admin` と同様に持つ（テンプレート標準の「apps/public は D1 アクセスを持たない」という前提からの逸脱。`CLAUDE.md` および `eslint.config.js` の `boundaries/elements` は本決定を反映済み。**ディレクトリと Walker 認証は実装済み**〈`lib/server/{auth,services,validation}/`〉。残りの Service は機能実装時に追加する） |
| 環境分離（staging/production） | `wrangler.jsonc` の environments 機能（`Confirmed`） | `apps/public`/`apps/admin` それぞれの `wrangler.jsonc` 内の `env.staging` / `env.production` で分離し、D1/R2/KV は環境ごとに別インスタンスを定義する。staging 環境は用意する（OPS-02 §3-1 のマイグレーション dry-run 前提）。プロジェクト丸ごと複製方式は不採用。詳細は DEV-08 §2 |
| Backend / Frontend | Astro | v7（latest） / `output: 'server'`（SSR 専用、SSG は対象外） |
| インタラクティブ UI | Svelte | v5（runes 構文：`$state` 等）。Astro ページに `client:*` ディレクティブでアイランドとして埋め込む。ページ全体の SPA 化はしない |
| UI コンポーネント（管理画面） | shadcn-svelte | `apps/admin/components.json` 経由で `apps/admin/src/lib/components/ui` に生成。基盤は `bits-ui`。公開画面には導入しない |
| UI コンポーネント（公開画面） | なし（プレーン Tailwind） | 独自デザイン方向を都度決める（PRD-04 参照）。コンポーネントライブラリは入れない |
| CSS | Tailwind CSS | v4（`@tailwindcss/vite` 経由、CSS-first。`@import "tailwindcss";` で開始）。`tailwind.config.js` は使わない |
| Database | Cloudflare D1（SQLite 互換） | バインディング名は必ず `DB`。マイグレーションは Drizzle Kit 生成 SQL（`packages/schema/migrations/` + `wrangler d1 migrations apply`、`apps/admin` からのみ実行） |
| ORM / スキーマ管理 | Drizzle（`drizzle-orm` + `drizzle-kit`、SQLite/D1 dialect） | スキーマ定義の正本は DEV-07（Markdown テーブル定義）。`schema-build` スキル（実装済み）が DEV-07 の記述から Drizzle スキーマ（TS、`packages/schema/src/schema.ts`）を生成し、そこから `drizzle-kit generate`（`pnpm db:generate`）で migration SQL（`packages/schema/migrations/`）を生成する 2 段階パイプライン。`packages/schema` は `apps/public`/`apps/admin` 双方から参照される共有パッケージ。型は Drizzle が `$inferSelect` で自動導出するため型定義ファイルの別生成は不要（`apps/admin` が `packages/schema` から直接 import する。別パッケージへの再エクスポートは行わない — DEV-01 §1「リポジトリ構成」参照） |
| バックエンド実装の展開（開発時のみ） | `scaffold` スキル（コードジェネレータは持たない） | `scaffold`（`.claude/skills/scaffold/`）が DEV-07（テーブル定義）・DEV-09（状態遷移）を読み、既存テーブルに対する Service・Zod バリデーション・API ルートを書く。**Plop 等のテンプレート生成器は使わない — 正解は動く参照実装（`inquiries`）であって雛形ではない。** スコープは `services/`・`validation/`・`pages/api/` のみで、`packages/schema` は `schema-build`、画面は `admin-design`/`public-design` が担当する |
| ファイルストレージ | Cloudflare R2 | バインディング名は必ず `BUCKET` |
| Cache / Queue | Cloudflare KV 採用・Queues 不採用（`Confirmed`） | KV は認証エンドポイントの失敗回数カウンタ（DEV-02 §7）とメンテナンスモードフラグ（OPS-02 §3-3/§3-5)用。Queues はコンテンツ主体サイトには過剰なため不採用（§3）— 必要が生じたら新規 GOV-01 決定で追加。Session は本書 §2「API 提供（認証）」で決定済み（D1 ベース） |
| Mail | Resend（`resend` npm パッケージ、fetch ベースの公式 SDK） | プロジェクト開始時に導入。Node 専用 SDK は Workers で動かないことがあるため、fetch ベースで動作するものを選ぶ |
| Testing | Vitest + Playwright（`Confirmed`） | Unit / Feature = Vitest（Workers 実行環境は `@cloudflare/vitest-plugin` で再現。`vitest ^4.1.0` に peer 依存し、vitest 5 では miniflare が起動に失敗する）、E2E = Playwright。Architecture テスト（レイヤー境界）は下記 Static Analysis（`eslint-plugin-boundaries`）が担う。テスト戦略の詳細は DEV-03 §4 |
| Formatter | Prettier | `prettier-plugin-astro` / `prettier-plugin-svelte` / `prettier-plugin-tailwindcss`（Tailwind クラス順の自動統一）。`printWidth: 9999`（自動折り返しなし） |
| Lint | ESLint（flat config） | `eslint-plugin-astro` / `eslint-plugin-svelte` / `typescript-eslint` |
| 型チェック | アプリ: `wrangler types` → `astro check`／`packages/*`: `tsc --noEmit` | `pnpm typecheck` として一括実行（Turborepo が両アプリと `packages/*` に fan out）。アプリ側で `tsc --noEmit` 単体を使わないのは `.astro` / `.svelte` を解析できないため |
| Static Analysis | ESLint + TypeScript strict（`astro/tsconfigs/strict`）+ `eslint-plugin-boundaries`（`Confirmed`） | `eslint-plugin-boundaries` で §5 のレイヤー境界（`apps/public` ⇔ `apps/admin` の相互 import 禁止、UI コンポーネントから `lib/server/*` への import 禁止、`packages/*` から `apps/*` への import 禁止）を機械検証する。加えて `no-restricted-imports` がページ/コンポーネントからの `@app/schema`（テーブル定義）の import を禁止する — DB ハンドル（`@app/schema/client`）の受け渡しは許すが、クエリは Service 層にだけ置く。ルール定義はルート 1 ファイルの `eslint.config.js`（flat config）に置く（DEV-03 §5 参照） |
| 言語方針 | 日本語のみ・i18n 機構なし（`Confirmed`） | テンプレート標準は日本語単一言語。i18n ライブラリ・URL 言語プレフィックスは持たず、UI 文字列は日本語ハードコードを許容する。多言語対応が必要な案件は GOV-02 起票の上、Astro の i18n ルーティング等の導入を案件側 GOV-01 で決定する |
| Permission | 自前実装（専用ライブラリなし） | 専用のロールライブラリは不採用。`apps/admin` の AdminUser はロールが常に単一（`admin`）のため role 列自体を持たず、`apps/public` の OrganizationMember は `org_admin` / `org_staff`（保護団体スタッフ専用、`organization_id` に紐づく）をテーブルの列として直書きする 1 系統 3 ロール構成とする（`Confirmed` — GOV-01 D-011、構造の正本は PRD-01 §1-2）。Walker（お散歩参加者）はロールを持たず、プロフィールの `status` 列で機能解禁を判定するデータ駆動方式（DEV-02 §2 参照） |
| AI 開発支援 | Claude Code + `.mcp.json`（`astro-docs` / `svelte` / `cloudflare-docs`: 中核スタックの公式ドキュメント + Svelte コード検証、`context7`: その他ライブラリのドキュメント取得、`playwright`: design-review、`semble`: コード検索、`context-mode`: コンテキスト圧縮） | 単一統合 MCP はなく、複数 MCP の組み合わせで代替。開発ワークフローは 00_DEV_GUIDE 参照 |

---

## 2. 機能別標準ライブラリ（採用時のみ・これ以外は選定禁止）

その機能をプロジェクトで採用する場合に使うライブラリの一意化リスト。「必ず使う」ではなく「**使うならこれを使い、代替の選定・自作をしない**」というルール。リストにない機能が必要になった場合は GOV-01 で決定し、本書に追記する。Cloudflare Workers はエッジランタイムであり Node.js 標準 API に一部制限があるため、**導入前に対象パッケージの Workers 対応（fetch ベース / `nodejs_compat` 不要）を確認すること**。

| 機能 | Package | 導入 / 備考 |
| --- | --- | --- |
| LLM 組み込み | Vercel AI SDK（`ai` + 各プロバイダの `@ai-sdk/*`） | fetch ベースで Workers 対応。プロバイダは Claude / Gemini / ChatGPT のみ |
| OAuth / SSO | Arctic | 軽量・Workers のエッジランタイムで動作する OAuth2 クライアント。LINE ログイン等、専用パッケージが無いプロバイダは同ライブラリの上に自前実装する |
| API 提供（認証） | 自前実装（D1 裏付けのセッショントークン + httpOnly 署名クッキー。追加ライブラリ不要） | トークン認証の単一パッケージは不採用。`jose`/JWT は採用しない — 用途がステートレス API ではなく管理画面/マイページのログインのみのため、失効可能なセッション方式を優先する。**AdminUser と Member は完全に別系統**（別テーブル・別クッキー名・別セッション実装）とする（DEV-02 参照）。単発トークンは**用途で 2 方式を使い分ける**（`Decided` — GOV-01 D-037）。**D1 に行を持つもの**（招待 `invitations`、パスワードリセット・メール確認の各 `*_tokens`、申請 `organization_application_tokens`）は `crypto.getRandomValues` による 256bit のランダム値を行に保存し、`used_at` / `expires_at` で失効させる。**行を持たない capability**（非公開 R2 オブジェクトの期限付きリンク、データエクスポートの 72 時間 URL — DEV-05 §11）は Web Crypto の HMAC 署名（`crypto.subtle.sign`）で自作する（実装: `@app/server-kit/files` の `signObjectPath`）。いずれも `jose` は使わない |
| リクエストバリデーション | Zod | リクエスト検証の標準機構はない。API ルート（DEV-04）・フォーム（DEV-06）双方の入力検証をこれに統一する。Drizzle スキーマから `drizzle-zod` で自動導出することを優先し、手書きの重複定義を避ける |
| パスワードハッシュ | Web Crypto API（PBKDF2、`crypto.subtle`） | パスワードハッシュ化の標準関数はない。`@node-rs/argon2` 等のネイティブ Node アドオンは Workers で動作しないため不採用。Web Crypto は Workers に標準実装済みで追加パッケージ不要 |
| CSRF 対策 | Astro 組み込みの Origin チェック（`security.checkOrigin`、既定で有効） | セッションがクッキーベース（上記）のため必須。GET/HEAD/OPTIONS 以外のリクエストで、`Content-Type` が form 系（`application/x-www-form-urlencoded`/`multipart/form-data`/`text/plain`）または未指定の場合に Origin 検証を強制する（`node_modules/astro/dist/core/app/origin-check.js` 参照）。追加ライブラリ・自前実装は不要。detail は DEV-02 §6 |
| 定期実行 / バッチ | Cloudflare Cron Triggers（`Confirmed`） | `wrangler.jsonc` の `triggers.crons` で定義し、Scheduled Worker（`scheduled()` ハンドラ）内で日次バッチ（データ保管期限の自動削除 — OPS-02 §4-3 等）を実行する |
| 日付・時間入力 | shadcn-svelte `Calendar` + `Popover`（`npx shadcn-svelte add calendar popover`） | 外部 JS 日付ライブラリ（flatpickr 等）を単独導入しない。管理画面でネイティブ `<input type="date">` は使わない（§3） |
| 決済（都度課金 + マーケットプレイス分割送金） | Stripe（`stripe` npm パッケージ）+ Stripe Connect | 参加費決済（Payment Intent / Checkout）に加え、保護団体への還元金送金に Stripe Connect（Connected Account への Transfer）を用いる（`Decided` — GOV-01 D-008、旧仕様の Connect 採用の判断を踏襲）。Workers 上で動かす場合は `wrangler.jsonc` に `nodejs_compat` フラグが必要（SDK の Node 依存のため）。Webhook 署名検証必須（DEV-10 §2） |
| ジオコーディング | Google Maps Platform Geocoding API（専用パッケージ不使用、`fetch` で直接呼び出し） | 保護団体・お散歩枠の住所登録・更新時に緯度経度へ変換し、エリア検索・現在地からの距離検索に利用する（`Decided` — GOV-01 D-009）。距離計算は D1 に対する SQL（バインド変数使用）による Haversine 公式で行い、専用の空間検索エンジンは導入しない。詳細は DEV-10 §9 |
| ファイルストレージ | Cloudflare R2（`env.BUCKET`、テンプレート標準バインディング） | 第一候補・ゼロ設定。外部 S3 互換ストレージへの切替は原則不要 |
| 全文検索 | D1 の FTS5 virtual table（第一候補） | 対応状況は導入時に要確認。不足時は外部検索サービス（Meilisearch Cloud 等）を fetch 経由で利用。自前の `LIKE` 全文検索実装は避ける |
| 監査ログ | 自前の D1 テーブル（`activity_log`） | 専用パッケージは不採用。単一運営が前提のためテナントスコープ列は持たない（DEV-07 参照）。必須記録操作は DEV-05 §9-1 相当の節で定義する |
| 2FA / MFA | `otpauth`（TOTP、Workers 対応） | 管理者アカウント等で要求時 |
| Web Push 通知 | FCM HTTP v1 API（fetch 直呼び出し） | `web-push` 等の Node 向けパッケージは Workers の crypto 実装差異で動作しない場合があるため、HTTP API 直叩きを第一候補とする |
| 多言語 UI | 不採用（`Confirmed` — §1 言語方針参照） | テンプレート標準は日本語のみ。多言語案件では案件側で決定・追記する |
| DB コンテンツの翻訳 | D1 の JSON 列（`json_extract` で参照） | 専用パッケージは不採用。属性ごとに `{"ja": "...", "en": "..."}` 形式で保持する |
| エラー監視 | Cloudflare Workers 標準ログ/メトリクスで開始 → 必要になった時点で `@sentry/cloudflare` | Sentry の Cloudflare Workers 専用パッケージを使う（Node 版 SDK ではない） |
| 画像処理 | Cloudflare Images（第一候補） | エッジネイティブでリサイズ・変換。要件を満たせない場合のみ他ライブラリを検討し GOV-01 に記録する |
| Excel / CSV | `xlsx`（SheetJS、Excel）+ 文字列生成（CSV） | `fs` 依存の Node 専用ライブラリは Workers で動かないため、導入前に edge runtime 対応を確認する |
| PDF 生成 | Cloudflare Browser Rendering API（`@cloudflare/puppeteer`） | Headless Chromium を自前運用しない、Cloudflare ネイティブの代替 |
| グラフ描画 | LayerChart（Svelte + D3 ベース） | shadcn-svelte と組み合わせて使われることが多いチャートライブラリ。第一候補、他ライブラリの併用は禁止 |
| Vector DB（RAG 採用時） | Cloudflare Vectorize | 追加インフラなしで D1 / Workers と統合できる第一候補。詳細は PRD-05 |

---

## 3. 不採用・禁止リスト

AI・開発者が「一般的なベストプラクティス」として提案・導入しがちだが、本テンプレートでは **意図的に採用しない** もの。方針転換する場合は GOV-01 に記録の上、本書を書き換える。

| 不採用 | 理由 |
| --- | --- |
| React / Vue / 他の UI フレームワーク | インタラクティブ UI は Svelte 一本。二重管理回避 |
| shadcn-svelte 以外の Svelte UI キット（Skeleton、Flowbite-Svelte 等） | 管理画面の UI は shadcn-svelte に統一（PRD-04 / DEV-06 参照） |
| プレースホルダを使わない SQL 文字列の組み立て | SQL Injection 防止。D1 へのアクセスは必ず `env.DB.prepare(...).bind(...)` または Drizzle 経由 |
| Drizzle 以外の ORM/クエリビルダ（Prisma、Kysely 等） | Prisma はネイティブバイナリ依存が強く Workers と相性が悪い。ORM は Drizzle に一本化（本書 §1） |
| `jose` / JWT ベースのセッション、ネイティブ Node アドオン系ハッシュライブラリ（`@node-rs/argon2` 等） | 認証は D1 セッション + Web Crypto（PBKDF2）に一本化（本書 §2）。ネイティブアドオンは Workers で動作しない |
| Vercel AI SDK 以外の LLM クライアント（自作 HTTP クライアント含む） | 統合レイヤーの一元化。プロバイダ切替容易性 |
| Claude / Gemini / ChatGPT 以外の LLM プロバイダ | コスト・運用範囲の統制 |
| `tailwind.config.js` | Tailwind v4 は `@theme` CSS-first 方式 |
| `@astrojs/tailwind` | 非推奨パッケージ。Astro 7 の peer deps を破壊する |
| npm のみ / yarn | pnpm workspaces + Turborepo を使う（`pnpm-workspace.yaml` + `turbo.json`。2 リポジトリ構成から `apps/public`/`apps/admin` + `packages/schema` の 1 リポジトリ構成へ移行したため、モノレポ対応のパッケージマネージャが必要になった。`Confirmed` の逆転 — GOV-01 D-001 参照） |
| スキャフォールディング CLI（`npm create astro@latest` 等）の再実行 | `.devcontainer/` / `.claude/` / `.mcp.json` を破壊する。既存ファイルの上に手動構築する |
| ブラウザ標準の UI（管理画面での `confirm()` / `alert()` / `<input type="date">` 等） | 管理画面の UI は shadcn-svelte に統一。公開ページはネイティブ HTML のままでよい |
| Cloudflare Queues | コンテンツ主体サイトに非同期ジョブキュー（Consumer Worker・リトライ設計・DLQ）は過剰。重い処理は `ctx.waitUntil()` と Cron Triggers で賄う。必要が生じたら新規 GOV-01 決定で採用する |
| Vitest / Playwright 以外のテストフレームワーク併用 | テストコードの一貫性（§1 で Vitest + Playwright に確定）。変更は GOV-01 経由 |

---

## 4. アーキテクチャ原則一覧

| 原則名 | 内容 | 違反例 | 適用例 |
| --- | --- | --- | --- |
| **レイヤー責務分離** | `apps/admin` と `apps/public` の両方で Astro ページ/API ルート → Service → D1 の責務を厳守（ディレクトリ構成は DEV-05 で確定。本プロジェクトは `apps/public` も Walker/Organization 向けの Service/D1 レイヤーを持つ — `Decided` GOV-01 D-007） | `.astro` ページ内で直接 D1 クエリを書く | `apps/admin/src/lib/server/services/` または `apps/public/src/lib/server/services/` 経由でビジネスロジック、D1 アクセスはその内部に集約 |
| **認可チェックの徹底** | 管理系の全操作は Service 層で認可を検証（構造の正本は PRD-01 §1-2。admin・`org_admin`/`org_staff` の 1 系統 3 ロール + Organization 境界）。`apps/admin` は AdminUser のロールが単一（`admin`）のため `requireSession(cookies, db)` のみで足り、ロール引数による `requireRole` の絞り込みは不要 | 認可チェックを飛ばして API ルートから直接 D1 を更新 | `apps/admin` は `requireSession(cookies, db)`、`apps/public` の Organization 系操作は `requireRole(session, "org_admin")` のような検証関数を Service 呼び出し前に必ず通す |
| **レスポンスをブロックしない** | 重い後処理（メール送信・監査ログ・通知）はレスポンス返却後に実行し、定期処理は Cron Triggers に寄せる（Queues は不採用 — §3） | API ルート内でメール送信完了を同期的に待ってからレスポンスを返す | `ctx.waitUntil()` で後処理をバックグラウンド化、日次処理は Scheduled Worker |
| **状態遷移の集約** | エンティティの状態遷移は単一の遷移関数/モジュールに集約 | 各所で status の文字列を直書き | `transition(entity, "approved")` のような単一の遷移関数経由 |
| **可観測性優先** | 全リクエスト/ジョブに request_id + admin_user_id を構造化ログ出力 | エラー時にどの管理者の操作か追跡不能 | `console.log(JSON.stringify({ requestId, adminUserId, ... }))` |
| **境界の明確化** | Astro ページ（表示制御）/ API ルート（業務判定）/ D1（永続化）/ 外部連携の責任を混在させない | Svelte コンポーネント内に業務ルールを重複実装 | API ルート側で業務判定、コンポーネントは表示のみ |
| **安全な変更容易性** | 小さく安全に変更できる構造 | 巨大な Astro ページ・密結合 | Service 分離、Feature Flag 活用 |

---

## 5. レイヤー構造

`apps/public`（公開サイト + Walker/Organization）と `apps/admin`（プラットフォーム運営専用）は独立した Astro プロジェクト・Cloudflare Worker であり（§1「リポジトリ構成」参照）、本プロジェクトでは両方が Service / API Route / D1 レイヤーを持つ（`Decided` — GOV-01 D-007。テンプレート標準では `apps/public` はこのレイヤーを持たないが、本プロジェクトはマーケットプレイス機能のため拡張する）。

### 5-1. Web（Astro + Svelte）

```
Astro Page (.astro) → Svelte Island (client:*、表示・操作受付のみ)
Astro Page / API Route → Service → D1 (env.DB.prepare、apps/public・apps/admin 双方)
                                       ↓
                     (後処理: ctx.waitUntil / 定期処理: Cron Triggers)
```

### 5-2. API（apps/public・apps/admin 双方）

```
Request → Astro API Route (各アプリの src/pages/api/**/*.ts) → Service → D1
                                                          ↓
                                          (後処理: ctx.waitUntil)
```

### 5-3. レイヤー責務

| レイヤー | 責務 | 配置 |
| --- | --- | --- |
| Astro Page | ページのレンダリング、Svelte アイランドの配置、`<head>`/レイアウト選択 | `apps/public/src/pages/**/*.astro`（公開/Walker/Organization） / `apps/admin/src/pages/**/*.astro`（プラットフォーム管理） |
| Svelte Island | クライアント側の表示状態管理、ユーザー操作受付、API への委譲（サーバー層を直接 import しない） | `apps/public/src/lib/components/`（プレーン Tailwind） / `apps/admin/src/lib/components/`（shadcn-svelte 含む） |
| API Route | リクエストの入出力ハンドリングのみ | `apps/public/src/pages/api/**/*.ts` / `apps/admin/src/pages/api/**/*.ts` |
| Service | 業務ロジック、トランザクション制御、後処理の起動（DEV-05 で確定） | `apps/public/src/lib/server/services/` / `apps/admin/src/lib/server/services/` |
| D1 アクセス | クエリ組み立て、認可チェックの強制 | 各アプリの Service 内。Drizzle クライアントは共有パッケージの `@app/schema/client`（`createDb(env.DB)`）を使い、アプリ側に `db/` を作らない（GOV-01 D-015） |
| Middleware | 認証状態の付与、セキュリティヘッダー | `apps/public/src/middleware.ts` / `apps/admin/src/middleware.ts`（各アプリに 1 つずつ。認証は行わずセキュリティヘッダーのみ） |

---

## 6. 非機能要件（NFR）

旧仕様の数値目標をそのまま踏襲し、指標名のみ本プロジェクトの技術スタックに合わせている。AI 機能は不採用（PRD-05、GOV-01 D-005）のため AI 関連の性能指標は持たない。

| 区分 | 要件 | 数値目標 | 根拠 |
| --- | --- | --- | --- |
| 性能：主要画面 | Astro ページ初期描画 p95 | 1.5 秒以内 | UX |
| 性能：API | 主要 API ルート p95 | 500ms 以内 | KPI-10（BIZ-02 §2-2） |
| 性能：エリア・距離検索 | お散歩募集検索（ジオコーディング距離計算含む）p95 | 800ms 以内 | KPI-10 |
| 性能：予約・決済フロー | 予約確定操作から Stripe 決済確定までの p95 | 3 秒以内（Stripe 側レイテンシ含む） | KPI-11 |
| 可用性：アプリケーション全体 | 月間稼働率 | PRD-02 §5-2 参照（正本） | KPI-12a / KPI-12b |
| スケール：DB | 同時アクティブセッション | 数百〜数千 | 中規模想定（PRD-02 §5-1 の想定規模） |
| 観測性：ログ保管 | アプリケーションログ | Workers Logs 標準保持: Paid 7 日 / Free 3 日（2026-08 確認）。超過保持が必要な場合は Logpush で外部保管 | 運用要件 |
| 観測性：監査ログ | 重要操作（審査・還元確定・キャンセル等） | 永続（D1 テーブル） | コンプライアンス |

---

## 7. 依存関係管理方針

| 項目 | 方針 |
| --- | --- |
| 採用基準 | メンテナンス継続中、利用実績 1000+ stars 目安、ライセンス互換、Cloudflare Workers（edge runtime）での動作実績 |
| 更新 | Dependabot + GitHub Security Advisories で追随。メジャーバージョン更新は影響評価の上で実施 |
| 廃止対応 | 代替を検討し GOV-02 に記録。決定は GOV-01 経由で本書へ反映 |

---

## 8. アンチパターン

| アンチパターン | 問題 | 正しい方法 |
| --- | --- | --- |
| Astro ページ内で直接 `env.DB.prepare()` を呼ぶ | レイヤー違反、認可チェック漏れ | Service 経由でアクセス |
| Service 内で D1 クエリを都度コピペで量産する | クエリの一貫性欠如 | 共通クエリ関数/ヘルパーに集約 |
| Svelte アイランドの `onMount` 内で状態遷移を実行 | 再マウントごとに副作用が再実行される | 遷移はユーザー操作のイベントハンドラ内で実行、`onMount` は表示データの初期化のみ |
| アプリ内に `db/` や `http/` を作り、レスポンス整形・カーソル・エラークラスを 2 アプリで二重実装する | 2 つの Worker でエンベロープとエラー形がずれる | `@app/schema/client`（D1 クライアント）と `@app/server-kit/http`（エンベロープ・`AppError`・ページネーション）を両アプリが import する（§5-3、GOV-01 D-015） |
| URL に内部 `id`（連番）を使う | 推測可能で列挙攻撃を受けやすい | ULID / UUID を公開 ID として使う |
| status を文字列で直接更新 | 不正遷移を許容 | 状態遷移関数経由 |
| R2 のオブジェクトキーをそのまま公開 URL として返す | アクセス制御不能 | キーのみ保存し、署名付き URL を発行する |
| Service 層の認可チェックを飛ばす | 権限のない操作が通る | `apps/admin` は `requireSession(cookies, db)`、`apps/public` はロール（`org_admin`/`org_staff`）と Organization 境界の検証を Service の入口で必ず強制 |
| （多言語案件のみ）UI 文字列を Astro / Svelte にハードコード | 多言語化不能、表記ゆれ | 標準は日本語のみでハードコード可（§1 言語方針）。多言語採用案件では i18n 導入決定後に翻訳関数経由へ移行 |

---

## 9. 実装規約との関係

技術固有のコーディングパターン・コード例は docs/ ではなく、リポジトリの `CLAUDE.md` および `.claude/` 配下（実装規約・スキル）が正本である。

- 現存: `CLAUDE.md`（アーキテクチャ、コマンド、D1/R2 バインディングルール、ハード制約の正本）
- 現存: `.claude/skills/`（`public-design` / `admin-design` / `shadcn-svelte` / `fixing-accessibility` 等、実装時のワークフロー）
- 現存: `.claude/skills/shadcn-svelte/rules/`（コンポーネント構成・フォーム・スタイリング・アイコンの規約。ベンダー管理のため直接編集しない）
- 実装済み: `schema-build` スキル（DEV-07 → Drizzle スキーマ → migration の生成、`.claude/skills/schema-build/`）
- 実装済み: `scaffold` スキル（DEV-07/DEV-09 → 既存テーブルに対する Service/Zod バリデーション/API ルート、`.claude/skills/scaffold/`。Astro ページは対象外）

> 実装系スキルは上記 2 つだけで、**コードジェネレータは存在しない**。`backend-scaffold` / `page-skeleton` / `resource-scaffold`（Plop ベース）は旧リポジトリの構想であり、本リポジトリには無い（GOV-01 D-012）。

---

## 10. 記入時チェックポイント

- 技術名が本書の外（BIZ / PRD / 他 DEV / OPS）に選定として書かれていないか
- §2 にない機能ライブラリを AI・開発者が勝手に導入していないか
- 数値目標（§6）が BIZ-02 の KPI と矛盾していないか
- 禁止事項（§3）が開発速度ではなく運用品質から説明できるか
- `Open` のまま残っている §1/§2 の項目が、実装着手前に GOV-01 で決定されているか
