---
doc-id: DEV-06
title: フロントエンド実装ガイド
phase: 3
status: draft-ai
owner: Tech Lead
last-updated: 2026-09-15
related-docs:
  - DEV-01: 技術スタック決定書・アーキテクチャ原則
  - DEV-04: API 仕様
  - PRD-04: UI/UX 設計（保護団体ページ・管理画面標準構成）
  - CLAUDE.md: コード例・実装パターンの正本
---

# 06-frontend-guide.md — フロントエンド実装ガイド（保護団体ページ・管理画面パターン含む）

## このセクションの目的

DEV-01 で確定したフロントエンドスタックによる実装の設計原則を定義する。画面パターン 5 種
（ダッシュボード / 一覧 / 詳細 / フォーム / 設定）の「構成の考え方」、UI/UX 原則、状態管理
方針、アクセシビリティ / レスポンシブ方針を扱う。

本サービスは業務上 3 領域（公開画面 / 保護団体ページ / プラットフォーム管理画面）を持つが、
実装上のアプリ構成は 2 Worker（`apps/public` / `apps/admin`）であり、**保護団体ページは
`apps/admin` ではなく `apps/public` 側に配置する**（`Decided` — GOV-01 D-007、PRD-04 参照）。
Walker（お散歩参加者）向けマイページも `apps/public` 側にある。つまり `apps/public` は
「一般公開ブラウジング」「Walker マイページ（`/mypage/*`）」「保護団体ページ
（`/organization/*`）」の 3 種類の画面領域を持ち、`apps/admin` はプラットフォーム管理画面
（既存のブログ CMS 管理画面と共存）のみを持つ。

- 技術スタックの選定は本書には書かない（DEV-01 が唯一の正本）。
- **コード例・実装パターンの正本: `CLAUDE.md`**（DEV-01 §9 参照）。
  コンポーネントの書き方・CSS 記法は同ファイルと `.claude/skills/shadcn-svelte/rules/`
  （管理画面のみ）に委ねる。
- 画面を実際に組み立てる際の作業チェーンは `.claude/skills/public-design`（公開画面・マイページ・
  保護団体ページ）/ `.claude/skills/admin-design`（プラットフォーム管理画面）を使う。本書 §4 は
  両スキルの Step 1 が参照する「標準パターン」の正本にあたる。

> DEV-01 §1「アカウント系統」の決定（`Decided` — GOV-01 D-007）により、`apps/public` は Walker
> マイページ・保護団体ページ向けの Service/D1 レイヤーを `apps/admin` と同様に持つ。`CLAUDE.md`・
> `eslint.config.js`（`boundaries/elements`）・DEV-05（バックエンド実装ガイド）はこの決定を反映
> 済み。実際のディレクトリ・コードは未実装で、機能実装時に作成する。

## 0-H. ハイブリッド編集ガイド（要点）

- 推奨モード: Human-first または Hybrid
- 人間確認必須: 状態の置き場所、デザインシステム整合、a11y 基準
- 詳細は 00_README.md §6〜8

---

## 1. ディレクトリ構成

このモノレポでは 3 領域のうち「公開画面」「Walker マイページ」「保護団体ページ」が
`apps/public` に、「プラットフォーム管理画面」が `apps/admin` に同居する（DEV-01 §1
「リポジトリ構成」参照）。

```text
apps/public/src/
├── pages/
│   ├── index.astro ...                # 公開画面（Layout.astro を使用。PRD-04 §3-1 の SCR-NN）
│   ├── mypage/                        # Walker マイページ（認証済み、Walker 用。PRD-04 §3-1 の SCR-21〜33）
│   │   ├── index.astro
│   │   └── ...
│   └── organization/                  # 保護団体ページ（org_admin/org_staff 用、Walker とは別セッション。
│       │                              #   PRD-04 §3-2 の ADM-NN。`Decided` — GOV-01 D-007）
│       ├── login.astro                # 団体スタッフ専用ログイン（ADM-00）
│       ├── index.astro                # 団体ダッシュボード（ADM-01）
│       └── ...
├── content.config.ts                  # Content Collections の定義（§1-1。スキーマは @app/content）
├── lib/
│   ├── components/                    # Svelte アイランド（`$lib` エイリアスの実体）
│   │   ├── ...                        # 公開画面のアイランド（直下。client:* で .astro に埋め込む）
│   │   ├── mypage/                    # マイページ専用アイランド（`Assumed`）
│   │   └── organization/              # 保護団体ページ専用の手組みコンポーネント（テーブル/フォーム/
│   │                                   #   カード/モーダル/トースト）。新規コンポーネントライブラリは
│   │                                   #   追加しない（PRD-04 §6-1、`Assumed`）
│   └── server/                        # `Assumed`。マイページ・保護団体ページの認証済み操作用の
│       │                              #   Service レイヤー（DEV-01 §1 の決定により新設。構成の正本は
│       │                              #   DEV-05 §1。D1 クライアントと HTTP エンベロープはアプリ側に
│       │                              #   置かず `@app/schema/client` / `@app/server-kit/http` を使う）
│       ├── services/
│       ├── walker/                    # Walker（旧称 Member）の認証。OrganizationMember と同一アプリ内でも
│       └── organization/              #   テーブル・セッション Cookie・実装を分ける（汎用 auth ヘルパーを
│                                       #   書かない — DEV-05 §1 の原則を apps/public 内の 2 系統にも適用）
└── layouts/
    ├── Layout.astro                   # 3 領域共通の HTML 骨格・<head>・global.css（CLAUDE.md、名前の共有は意図的）
    └── OrganizationLayout.astro       # 保護団体ページのサイドナビ + ヘッダー + コンテンツの 3 ペインシェル。
                                        #   Layout.astro をラップする（PRD-04 §4-1、`Assumed`）

apps/admin/src/
├── pages/                             # 管理画面。アプリ丸ごとが管理画面のため `/admin` 接頭辞は付けない
│   ├── index.astro                    # ダッシュボード（SYS-01）
│   ├── login.astro
│   └── （参加者/団体/保護犬/予約/決済/振込/お知らせ/お問い合わせ 等 — PRD-04 §3-3）
├── lib/
│   ├── components/
│   │   ├── ui/                        # shadcn-svelte 生成コンポーネント（DEV-01 §1。編集してよい）
│   │   └── admin/                     # 管理画面専用の合成コンポーネント（stat-card 等 — Assumed）
│   ├── server/                        # Service 層（内部構成は DEV-05 §1 が正本。D1/R2 アクセスを集約）
│   └── utils.ts                       # `cn()` 等の共通ユーティリティ
└── layouts/
    └── Layout.astro                   # 管理画面の HTML 骨格・<head>・admin.css
```

公開画面・マイページ・保護団体ページ・プラットフォーム管理画面をディレクトリで分離する。
`apps/public` 内の 3 領域は `pages/` 配下のトップレベルディレクトリ（`mypage/` /
`organization/`、それ以外は公開画面）と `lib/components/` 配下の対応するサブディレクトリで区別し、
`apps/public/src/lib/components/organization/` は公開画面用アイランドと明確に分ける（PRD-04 §4-3）。
`Assumed` と付記した部分はこのテンプレートにまだ実例がない規約案であり、最初の画面を作る際に
確定させ本書を更新する。

---

### 1-1. コンテンツの置き場所（D1 / Content Collections / ページ直書き）

公開画面に出す読み物系コンテンツは、**誰がいつ更新するか**と**閲覧者によって出し分ける必要が
あるか**で置き場所が決まる（`Decided` — GOV-01 D-013）。

| 置き場所 | 使う条件 | 実体 |
| --- | --- | --- |
| **D1** | 閲覧者・ログイン状態によって出し分ける／他テーブルと関係を持つ／運営がデプロイなしで更新する | `packages/schema` のテーブル + `apps/admin` の管理画面 |
| **Content Collections** | 全閲覧者に同一内容だが、**改定履歴を証跡として残す必要がある** | `packages/content/` の Markdown（frontmatter に `version`） |
| **ページ直書き** | 全閲覧者に同一内容で、改定履歴も不要 | `apps/public/src/pages/*.astro` |

迷ったら D1 を選ばない。Cloudflare の課金は D1 の行読み取りに乗るため、閲覧数の多い公開ページ
ほど差が出る。Content Collections はビルド時に解決されるので読み取りが 0 になり、管理画面も
作らずに済む。

> **Content Collections の追加手順**（参照実装: `packages/content/articles/` + `@app/content` の
> `articleSchema`）。Markdown の実体は `src/content/` ではなく `packages/content/<コレクション名>/`
> に置き、Zod スキーマを `packages/content/src/schema.ts` に足したうえで、
> `apps/public/src/content.config.ts` の `defineCollection`（`glob` ローダの `base` が
> `../../packages/content/<コレクション名>`）に登録する。`legal/`（利用規約・プライバシーポリシー）
> と `pages/`（③④ の長文化時）は本書の適用結果で置き場所だけ決めており、実体は着手時に作る。

#### 適用結果（PRD-04 の全画面を棚卸しした結果。抜けを残さないため全 SCR を挙げる）

**① D1 — 業務データ（`slug`/`public_id` で引く。判断の余地なし）**

| 画面 | 取得元テーブル |
| --- | --- |
| SCR-02/03 参加保護団体一覧・詳細 | `organizations` |
| SCR-04/05 保護犬一覧・詳細 | `dogs` |
| SCR-06/07 お散歩募集一覧・詳細 | `walk_slots` / `walk_slot_dogs` |
| SCR-17〜20 予約入力・決済確認・完了・失敗 | `reservations` / `payments` |
| SCR-21〜33 マイページ各画面 | `walkers` / `walker_profiles` / `reservations` / `walk_records` / `favorites` / `adoption_inquiries` / `notifications` |
| ADM-01〜23（保護団体ページ）・SYS-01〜22, 26〜28（管理画面） | 各業務テーブル |

**② D1 — お知らせのみ CMS コンテンツとして D1 に置く**

| 画面 | 置き場所 | 理由 |
| --- | --- | --- |
| SCR-34/35 お知らせ一覧・詳細、SYS-23〜25 お知らせ管理 | **D1**（`news`） | `audience` で 公開/参加者限定/団体限定/特定団体/特定利用者 を出し分け、`target_organization_id`・`target_walker_id` は FK。ログインセッションに依存する出し分けはビルド時に解決できない。`published_until` の時限公開も同様 |

**③ Content Collections — 改定履歴が証跡になるもの**

| 画面 | 置き場所 | 理由 |
| --- | --- | --- |
| SCR-39 利用規約 | `packages/content/legal/terms.md` | F-01-06 の同意記録（`walker_profiles.terms_agreed_version`）が「どの版に同意したか」を指すため改定履歴が必須。git がそのまま版管理になる |
| SCR-40 プライバシーポリシー | `packages/content/legal/privacy.md` | 同上。改定告知の根拠として履歴が要る |

**④ ページ直書き — 全閲覧者に同一・改定履歴も不要**

| 画面 | 補足 |
| --- | --- |
| SCR-01 トップページ | ヒーロー・サービス紹介・参加までの流れ等のコピー。セクション構造がレイアウトと不可分で Markdown 1 枚に収まらないため直書きが素直。**掲載する保護犬・団体・お散歩枠は D1 から取得**（コピーとデータの分離を保つ） |
| SCR-36 よくある質問 | `faqs` テーブルと FAQ 管理画面（旧 SYS-26〜28）は作らない |
| SCR-37 利用ガイド / SCR-38 安全に利用するために | 長文化してエンジニア以外が編集したくなったら Content Collections へ移す（③ の版管理は不要なので `packages/content/pages/`） |
| SCR-43 特定商取引法に基づく表示 | 法定表記。変更頻度が極めて低い |
| SCR-09/16/19/20/42 各種完了・案内ページ | 数行の案内文言のみ |
| SCR-44/45 404 / 500 | 実装済み |

**⑤ コンテンツを持たない画面（フォーム・認証のみ）**

SCR-08 参加者登録 / SCR-10〜14 メール確認・ログイン・外部連携・パスワード再設定 / SCR-15 団体登録申請 / SCR-41 お問い合わせ。
入力フォームと固定ラベルのみで、編集対象のコンテンツを持たない。SCR-08・SCR-15 の同意チェックボックスは ③ の規約本文へリンクする。

**⑥ 画面外のコンテンツ — メール文面**

トランザクションメール（予約確認・審査結果・還元通知等）は `apps/*/src/lib/server/mail/` の
`render*Email()` テンプレート関数、つまり**コードとして開発者が管理する**（DEV-10 §3-3）。運営が
デプロイなしに文面を変えたいという要求は現時点で出ていない（GOV-02 TBD-43）。

> **①〜⑥ で PRD-04 の全画面（SCR-01〜45、ADM-00〜23、SYS-01〜28）を網羅する。** 画面を追加する
> ときは本節のどれに当たるかを決めてから実装する。決めずに D1 テーブルを足すのが一番よくある事故。

実装は `apps/public/src/content.config.ts` が `packages/content/legal/` を `glob()` ローダーで
読む。

```typescript
// apps/public/src/content.config.ts
const legal = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "../../packages/content/legal" }),
  schema: legalSchema, // version, effectiveDate, title
});
```

> `output: "server"` では `getStaticPaths()` が**黙って無視される**。Content Collections から
> 生成するページには `export const prerender = true` を必ず書く — 書き忘れると一覧は出るのに
> 個別ページだけ 500 になる。

---

## 2. 状態管理方針

Astro は各リクエストごとに SSR するだけで、サーバー側にコンポーネント状態を保持し続ける仕組み
は持たない。**3 領域すべてに共通して**、真実の源は常に D1（Service 経由）で、クライアント側の
状態は「表示・入力中の一時的な写し」に限定する。この方針は保護団体ページの一覧・フォームにも
そのまま適用する（PRD-04 §6 のコンポーネント方針とは独立の、状態管理レベルの原則）。

| 状態の種類 | 配置 | 理由 |
| --- | --- | --- |
| ユーザー入力のフォーム | Svelte アイランドのローカル state（`$state`） | 送信時に API ルート（または Service 呼び出し）へ渡し、サーバー側 D1 が正本 |
| ビジネスデータ（予約・保護犬・お散歩枠等）のステータス | Service/API 経由で取得し Svelte state に反映 | サーバー側（D1）が正本。ミューテーション後は再取得または楽観的更新 |
| 非同期処理進行中の表示 | ポーリング（`ctx.waitUntil()` で走る後処理の状態を対応テーブルから取得） | サーバー側の Job 状態に同期 |
| モーダル開閉・ドロップダウン | クライアント側（管理画面: shadcn-svelte の `Dialog` / `DropdownMenu`。公開画面・保護団体ページ: 手組みコンポーネントが内部で管理） | クライアントローカルで完結。Alpine.js 相当の自前実装は不要 |
| アニメーション・トランジション | クライアント側（Svelte の `transition:` + CSS） | サーバー往復不要 |
| 一時的な UI フィードバック（トースト） | 管理画面: shadcn-svelte の Toast/Sonner 相当。公開画面・保護団体ページ: 手組みトーストコンポーネント（`apps/public/src/lib/components/organization/` 等） | サーバーから通知 |

**禁止**: クライアント側 JS に業務ロジックを書く、サーバー側とクライアント側で同じ状態を
二重管理する。

---

## 3. Astro / Svelte 実装の設計原則

構文レベルの必須規約（`client:*` ディレクティブの使い分け、Svelte 5 runes の書き方）は
`CLAUDE.md` を正本とする。設計上の原則：

- 認可は Astro ページのフロントマター（サーバー側で実行される先頭のスクリプト）の冒頭で必ず
  実行する。領域ごとに異なる関数・テーブルで検証する：`apps/admin` は
  `admin`（AdminUser。単一ロールのため `requireSession` のみで足り、ロール引数は不要 —
  `Decided` — GOV-01 D-011）、`apps/public` のマイページは Walker の認証状態（ロールを
  持たずプロフィールの `status` 列で判定 — DEV-01 §1）、保護団体ページは
  `org_admin` / `org_staff`（OrganizationMember、`organization_id` にひもづく）を検証する。
  API ルートもハンドラの先頭で同様に認可を行う（`apps/public` / `apps/admin` いずれの
  `src/middleware.ts` もセキュリティヘッダー専用で、認証・認可は行わない — DEV-05 §1 が正本）。
- 保護団体ページの認可では、ロール検証に加えて対象データが自団体（`organization_id`）の
  ものであることを Service 層で必ず検証する（テナント境界。DEV-02 §3 相当）。他団体の保護犬・
  予約・実施記録等が一覧・詳細に混入しないことは、権限外ロールの拒否と同格の必須検証項目とする。
- Svelte アイランドの `onMount()` はデータ読み込みと初期化のみ。状態遷移・外部 API・メール
  送信等の副作用はユーザー操作のイベントハンドラ内で行う（DEV-01 §8）。
- Astro/Svelte にはフレームワーク標準の DI コンテナはない。Service 関数は明示的に import して
  呼ぶ。
- 一覧の検索・フィルタ条件は URL クエリ（`Astro.url.searchParams` / クライアント側は
  `URLSearchParams`）に保持し、リロード・共有可能にする。
- ループ描画には必ず一意キーを付与する（`{#each items as item (item.id)}`）。
- Astro ページ / API ルートから D1 を直接叩かない。必ず Service 経由（DEV-01 §4・§5）。
  `apps/public` のマイページ・保護団体ページも同じ原則に従う（§1 の `Assumed` 参照）。

---

## 4. 画面パターン 5 種の構成の考え方

PRD-04 §4-2 の標準構成に対応する。**保護団体ページ・プラットフォーム管理画面の両方**が対象
であり、実装アプローチのみ異なる：プラットフォーム管理画面は shadcn-svelte のプリミティブ
（DEV-01 §1）を組み合わせて構成し、保護団体ページは新規コンポーネントライブラリを追加せず
プレーン Tailwind + `apps/public/src/lib/components/organization/` の手組みコンポーネントで構成
する（PRD-04 §6-1）。マイページ・公開画面は密な管理系 UI を必要とせず、この 5 パターンの
対象外とする（`public-design` チェーンで個別に設計する）。

### 4-1. ダッシュボード

- 構成: KPI カード群（4〜6 枚目安）→ 推移グラフ → 直近イベント一覧、の縦積み（PRD-04 §4-2）。
  例: ADM-01 団体ダッシュボード、SYS-01 管理ダッシュボード。
- KPI カードは「値 + 前週比等のデルタ + アイコン」をセットで表示する。プラットフォーム管理画面
  は shadcn `Card` + Lucide アイコン、保護団体ページは手組みのカードコンポーネント + Heroicons
  相当（PRD-04 §8、`Assumed`）を使う。
- グラフ・イベント一覧は個別の Svelte アイランドに分割し、遅延読み込み可能にする。
- グラフ描画は保護団体ダッシュボード・プラットフォーム管理ダッシュボードのいずれも DEV-01 §2
  のグラフ描画ライブラリ（LayerChart）のみ使用する（別チャートライブラリの導入禁止）。

### 4-2. 一覧画面

- 構成: ヘッダー（件数 + 主要アクション）→ フィルタバー → 一括操作バー → テーブル。
  例: ADM-08 お散歩募集一覧、SYS-06 保護団体一覧。
- 検索 + フィルタ + ソート + ページネーション + 一括操作を標準装備とする。プラットフォーム
  管理画面のテーブルは `npx shadcn-svelte add table` 等で必要になった時点で追加する。保護団体
  ページのテーブルは `apps/public/src/lib/components/organization/` に手組みで実装し、shadcn の
  `Table` を移植・複製しない。
- 一括操作バーは選択がある時のみ表示し、破壊的操作には確認ダイアログを必須とする（プラット
  フォーム管理画面: shadcn `AlertDialog`。保護団体ページ: 手組みの確認モーダルコンポーネント
  1 実装に集約し、画面ごとに自作しない — §5）。
- フィルタ状態は URL クエリに反映する（§3）。

### 4-3. 詳細画面

- 構成: ヘッダー（対象名 + アクション）→ 情報表示（項目が多い場合はタブ分割）→ 関連情報。
  例: ADM-07 保護犬詳細・編集、SYS-05 申請詳細・審査。
- プラットフォーム管理画面のタブは shadcn `Tabs`、保護団体ページのタブは手組みのタブ
  コンポーネントを使う。保護犬の非公開情報（健康・安全情報 — PRD-01 §3-2 の `internalNotes`）
  は団体スタッフのみが編集・閲覧できるタブとして分離する（PRD-04 §4-3）。
- 監査履歴（変更履歴）を詳細画面から参照できるようにする。
- 一覧への戻り導線を必ず用意する。

### 4-4. フォーム画面

- 構成: ヘッダーに「保存 / キャンセル」を固定配置 → 入力セクション（段階入力はタブ / ステップで
  分割）→ 危険操作は最下部に隔離。例: ADM-09 お散歩募集追加。
- プラットフォーム管理画面は shadcn `Field` / `FieldGroup` を使用する。保護団体ページは同等の
  手組みフォーム部品（ラベル + 入力 + エラー表示のセット）を `components/organization/` に
  集約する。
- バリデーションエラーは項目ごとにインライン表示。保存中はスピナー等で多重送信を防止。
- 削除等の危険操作は視覚的に区別し（警告色 + 枠）、確認ダイアログを必須とする。
- お散歩枠のステータス変更（開催中止等）は必ず確認モーダルを経由し、予約済み参加者への通知を
  伴うことを画面上で明示する（PRD-04 §4-3）。事故・トラブル報告フォームは、重大度が高い場合に
  運営へ即時共有される旨を送信前に明示する（PRD-04 §4-3、PRD-03 F-12-02）。
- 参考実装: `apps/admin/src/pages/login.astro` + `apps/admin/src/lib/components/login-form.svelte`
  （Card + FieldGroup + Field の組み合わせ）。**これはコンポーネント構成の見本であり、UI のみ**
  （送信ハンドラを持たない）。同様に保護団体ページの団体ログイン（ADM-00、
  `apps/public/src/pages/organization/login.astro`）はプレーン Tailwind + 手組みフォーム部品で
  同等の構成（ロゴ/カード + 入力欄 + エラー表示）を実装する。

### 4-5. 設定画面

- 構成: セクションタブ（基本 / 支払い / ドメイン / 連携 / 危険操作）で分割。例: ADM-02 団体情報
  編集、ADM-23 団体退会・掲載終了申請。
- プラットフォーム管理画面は shadcn `Tabs`、保護団体ページは手組みのタブコンポーネントを使う。
- 「危険操作」（団体退会・掲載終了申請等）は独立タブに隔離する。

---

## 5. UI コンポーネント方針

適用範囲（PRD-04 §1-1・§6 が正本、本節はフロントエンド実装の観点から具体化する）：

| 画面領域 | UI ライブラリ | 理由 |
| --- | :---: | --- |
| プラットフォーム管理画面（`apps/admin`） | ✅ shadcn-svelte | 想定ユースケース（DEV-01 §1） |
| 保護団体ページ（`apps/public/organization/*`） | ❌（新規ライブラリ追加なし） | プレーン Tailwind + 手組みコンポーネント（PRD-04 §6-1、`Assumed`。理由は同節参照：`apps/public` に第 2 のコンポーネントライブラリを持ち込まない、既存の Tailwind 資産を流用できる、画面数が shadcn-svelte 規模を正当化しない） |
| Walker マイページ（`apps/public/mypage/*`） | ❌ | 公開画面と同じくプレーン Tailwind（`public-design` チェーン） |
| 公開画面（LP・マーケティング等） | ❌ | プレーン Tailwind + Astro/Svelte で個別実装（`public-design` スキル） |

- **プラットフォーム管理画面**は shadcn-svelte の標準コンポーネント（DEV-01 §1、
  `apps/admin/src/lib/components/ui`）を最優先で使う。独自スタイルの乱立を防ぎ、`admin.css` の
  テーマ変数の一括変更を効かせる。新規コンポーネントを書く前に、`apps/admin/src/lib/components/ui/`
  に同等品がないか、無ければ `npx shadcn-svelte add <component>` で追加できないかを必ず確認する
  （`shadcn-svelte` スキル参照）。
- **保護団体ページ**は `apps/public/src/lib/components/organization/` にテーブル/フォーム/カード/
  モーダル/トーストの手組みコンポーネントを集約し、画面ごとの重複実装を避ける（PRD-04 §6-1・
  §6-2）。命名は機能を表す名前にする（`WalkSlotList`、`ReservationTable` 等）。同一意味の別名
  コンポーネントを乱立させない。
- **ブラウザ標準の UI をプラットフォーム管理画面に持ち込まない。** 確認ダイアログ・アラート・
  日付選択・カラー選択のようにブラウザが独自の見た目で描画するものは、shadcn-svelte の同等品に
  置き換える。見た目が OS ごとに変わり、テーマ変数も i18n も効かないため。確認ダイアログは
  画面ごとに自作せず、共通コンポーネントの 1 実装に集約する。
- **保護団体ページ**も確認ダイアログは `components/organization/` の共通コンポーネント 1 実装
  に集約し、`confirm()` を画面ごとに直接呼ばない。一方、日付選択のような入力コントロールは
  `apps/public` に shadcn 相当の代替がないため、スタイル調整を施したネイティブ
  `<input type="date">` 等の使用を許容する（`Assumed` — 将来 §6-1 の再検討条件に達した場合は
  見直す）。

---

## 6. CSS 方針

- 色・余白等はデザイントークンとして定義し、任意値の直書きは最後の手段とする。プラットフォーム
  管理画面は `apps/admin/src/styles/admin.css` の CSS 変数（`@theme inline`）を使う。公開画面・
  マイページ・保護団体ページはいずれも `apps/public/src/styles/global.css` のプレーン Tailwind
  を使う（DEV-01 §1、PRD-04 §6-2）——独自のデザイントークン層は持たず、色・余白等は都度の
  Tailwind ユーティリティで決定する。
- テーマ（色・角丸）はテーマ変数の一元管理で行い、コンポーネント個別の上書きをしない
  （プラットフォーム管理画面のみ該当。`apps/public` はトークンレス）。
- ダークモード対応は `admin.css` の標準テーマ機構に乗る（プラットフォーム管理画面のみ。
  公開画面・マイページ・保護団体ページはダークモード非対応）。
- 記法ルール（`@theme` 等の CSS-first 設定）は `CLAUDE.md` の Architecture 節を正本とする。

---

## 7. クライアントサイド JS の利用範囲

- 許可: モーダル開閉・ドロップダウン・トランジション等、クライアントで完結する UI 状態のみ。
- 禁止: 業務ロジック・API 呼び出し結果の判定・バリデーション確定。これらは必ずサーバー側
  （API ルート / Service）に置く。クライアント側の即時フィードバック用バリデーションは
  UX 目的でのみ許可し、確定判定はサーバー側で再度行う。この原則は保護団体ページ・マイページの
  フォームにも同様に適用する。

---

## 8. ファイルアップロード

- MIME / 拡張子 / サイズ / 実バイトの 4 重検証（DEV-02 §4 の基準に準拠）
- ファイル名は ULID で renaming
- ストレージは Cloudflare R2（`env.BUCKET`）。操作は Service 層に置く（コンポーネントから
  直接触らない）。保護犬の写真等、保護団体ページからのアップロードも同じ Service 層経由とする
  （§1 の `apps/public` Service レイヤーに集約）。

---

## 9. アクセシビリティ（a11y）

| 観点 | 方針 |
| --- | --- |
| キーボード操作 | 全インタラクション対応 |
| フォーカスリング | `:focus-visible` で必ず可視化 |
| 色のみで状態表現しない | アイコン + 色 + テキストの 3 要素 |
| 画像 alt | 必ず設定（保護犬・保護団体の写真を含む — PRD-04 §7） |
| フォーム | `<label>` 紐付け、エラー説明 |
| カラーコントラスト | WCAG AA 以上 |
| ランドマーク | `<nav>` / `<main>` / `<aside>` を使い分ける（保護団体ページ・プラットフォーム管理画面の 3 ペイン構造 — PRD-04 §4-1） |

準拠基準は WCAG 2.2、対応レベルは AA 相当（PRD-04 §7）。実装時の詳細な監査・修正フローは
`.claude/skills/fixing-accessibility` スキルに委ねる（`public-design` / `admin-design` チェーン
の中で必ず通過する）。

---

## 10. レスポンシブ方針

- 公開画面・マイページはモバイルファーストで実装し、ブレークポイントは Tailwind 標準のみを
  使う（利用シーンの多くが外出先での検索・予約のため — PRD-04 §4-5）。
- 保護団体ページ・プラットフォーム管理画面はモバイル対応「最小限」（緊急確認程度）とし、本格
  作業はデスクトップ前提とする（PRD-04 §4-5）。サイドバーはドロワー化してモバイル対応し、
  テーブルは横スクロールを許容する。
- カード群・フォームのグリッドは 1 列（モバイル）→ 2〜4 列（デスクトップ）を基本とする。

---

## 11. パフォーマンス

| 項目 | 方針 |
| --- | --- |
| 初期描画 | 非表示部品は遅延読み込み（Svelte アイランドの `client:visible` 等） |
| 大きなリスト | 一意キー徹底 + ページネーション |
| 画像 | `loading="lazy"` を明示 |
| フォーム入力の同期 | フォーカス喪失時基本、リアルタイム検索は debounce 300ms 以上 |
| 検索・フィルタの反映 | debounce 300ms、確定後 500ms 以内に結果反映（保護団体ページ・プラットフォーム管理画面 — PRD-04 §4-4） |
| アニメーション | compositor 対象プロパティ（`transform` / `opacity`）中心の CSS/Svelte トランジションのみ |

アニメーション・パフォーマンスの詳細な監査は `.claude/skills/fixing-motion-performance`
スキルに委ねる（`public-design` チェーンの Step 4）。保護団体ページ・プラットフォーム管理画面
は最小限の enter/exit トランジションに留め、演出目的のモーションは追加しない。

---

## 12. テスト方針

テストフレームワークは Vitest + Playwright（DEV-01 §1、導入済み）。以下は最低限のテスト観点
として維持する：

- **認可（プラットフォーム管理画面）**：未認証ユーザーが管理画面にアクセスできないこと。
  配置・実行は `apps/admin/tests/unit/`（`pnpm test`）。
- **認可（保護団体ページ）**：`org_staff` ロールで `org_admin` 専用操作（団体スタッフ招待・退会申請
  等）にアクセスできないこと、未ログインで `/organization/*` にアクセスできないこと。
- **テナント境界（保護団体ページ）**：他団体の保護犬・お散歩枠・予約・実施記録等が一覧・詳細に
  混入しないこと（`organization_id` スコープ、§3）。org_admin / org_staff の認可と同格の必須
  検証項目とする。

> `apps/public` の単体テストは配置済み（`apps/public/tests/unit/`、`apps/public/vitest.config.ts`
> が `d1Databases: ["DB"]` / `kvNamespaces: ["KV"]` を宣言。実行は `pnpm test`）。マイページ・
> 保護団体ページの Service レイヤー（§1）を追加する際は、同ディレクトリに既存の `auth.test.ts` /
> `inquiries.test.ts` と同じ形式で追加する。R2 を使うテストを書く場合は `vitest.config.ts` に
> `r2Buckets: ["BUCKET"]` の追加が必要（`apps/admin` 側は追加済み — DEV-03 §3-1）。

---

## 13. 記入時チェックポイント

- 公開画面・マイページ・保護団体ページ・プラットフォーム管理画面の 4 領域（業務上は 3 領域、
  実装上は `apps/public`/`apps/admin` の 2 アプリ）が分かれて整理されているか
- 保護団体ページ・プラットフォーム管理画面の標準パターン 5 種（ダッシュボード / 一覧 / 詳細 /
  フォーム / 設定）が網羅されているか
- プラットフォーム管理画面は shadcn-svelte、保護団体ページ・マイページ・公開画面はプレーン
  Tailwind という区分が PRD-04 §6・DEV-01 §1 と矛盾していないか（保護団体ページに新規
  コンポーネントライブラリを持ち込んでいないか）
- **UI 文字列がハードコードされていないか — 標準は日本語ハードコード可（DEV-01 §1 言語方針）**
- ロール（`org_admin` / `org_staff`）による認可、および AdminUser の認証（`requireSession`）が
  Service 層で強制されているか
- 保護団体ページのテナント境界（`organization_id` スコープ）が Service 層で強制されているか
- PRD-04 の画面 ID（SCR-NN / ADM-NN / SYS-NN）と Astro ページ/Svelte アイランドが対応している
  か
- a11y チェックリスト（§9）とレスポンシブ方針（§10）が満たされているか
- 技術名の選定を本書に書いていないか（DEV-01 参照になっているか）
