---
doc-id: DEV_GUIDE
title: AI との作業マニュアル
phase: cross
status: draft-ai
owner: Tech Lead
last-updated: 2026-09-15
related-docs:
  - README: docs/ 全体の構造ガイド
  - INTAKE: 全文書の入力源
  - DEV-01: 技術スタック決定書
---

# AI との作業マニュアル

このプロジェクトでは Claude Code（AI）を開発パートナーとして使います。
このファイルは **ユーザー向け** の操作ガイドです。AI への指示の出し方と、よくある作業パターンをまとめています。

> 本書は実際にリポジトリに存在する仕組みだけを説明します。ツールを追加・整備したら本書も更新してください。

---

## ⚡ Quick Reference（まずここだけ覚える）

**人間が明示的に行う操作は 2 つだけ。それ以外はすべて日本語で依頼するだけ。**

| 操作 | タイミング |
| --- | --- |
| `security-review` スキルを依頼 | リリース前・重要な機能変更後 |
| `pnpm check` | コミット前・PR 作成前（Prettier + ESLint + 型チェック + 単体テストを一括実行。Turborepo が両アプリと `packages/*` に fan out） |

```
docs を書く／更新する                     → 日本語で依頼するだけ（コマンド不要）
ページ実装                                → 「admin-design で〜」「public-design で〜」と画面種別を指定
MCP（ライブラリドキュメント検索・コード検索など）→ AI が自動で使う（意識不要）
Skills（public-design / admin-design / shadcn-svelte 等）→ AI が自動でロード（意識不要）
実装規約（CLAUDE.md）                     → AI が常時参照（意識不要）
hooks（整形・Lint・型チェック）            → 編集ごとに自動実行（意識不要）
git commit / git push                     → 人間がやる（AI は実行しない）
```

> 専用の「コードレビュー用サブエージェント／コマンド」はこのテンプレートには無い（§4 参照）。PR 前の品質確認は `pnpm check` + 人間による確認で行う。

---

## 1. 全体像：何がどこにあるか

```
（リポジトリルート）― pnpm workspaces + Turborepo のモノレポ（DEV-01 §2、GOV-01 D-001）
├── apps/
│   ├── public/             ← 公開サイト（独立した Cloudflare Worker。src/pages,
│   │                          src/lib/components, src/lib/server, tests/, playwright.config.ts）
│   └── admin/              ← 管理 CMS（独立した Cloudflare Worker。src/pages, src/lib/server,
│                              scripts/seed-user.mjs, tests/, vitest.config.ts, playwright.config.ts）
├── packages/
│   ├── schema/             ← Drizzle スキーマ正本（src/schema.ts, src/ulid.ts, src/client.ts）。
│   │                          migrations/ は生成物で、初回 pnpm db:generate で作られる（apps/admin からのみ適用）
│   ├── server-kit/         ← 両アプリ共通のサーバー基盤（パスワードハッシュ、ロックアウト、
│   │                          セッション規則、HTTP エンベロープ）
│   └── content/            ← 開発者が git で更新する Markdown（Content Collections の実体 — DEV-06 §1-1）
│
├── docs/                   ← プロジェクト仕様書（何を作るか。人間が読む）
│   ├── 00_INTAKE.md        ← ヒアリング情報の起点（全文書の入力源）
│   ├── 00_README.md        ← docs/ の使い方ガイド
│   ├── 00_DEV_GUIDE.md     ← 本書
│   └── 1-business/ 〜 5-governance/
│
├── CLAUDE.md                ← AI 向けの実装規約の正本
│                                （アーキテクチャ、コマンド、D1/R2 バインディングルール、ハード制約）
├── .mcp.json                 ← MCP サーバー定義（astro-docs / svelte / cloudflare-docs / context7 / context-mode / semble / playwright）
├── .claude/
│   ├── settings.json         ← hooks・MCP 有効化・permissions の定義
│   ├── skills/                ← AI に読み込ませる専門知識（§4 の一覧参照）
│   │   ├── admin-design/ public-design/     ← 画面種別ごとの実装チェーンの起点
│   │   ├── shadcn-svelte/                   ← 管理画面 UI コンポーネントの追加・調整
│   │   ├── schema-build/                    ← DEV-07 → Drizzle スキーマ → migration 生成
│   │   ├── scaffold/                        ← 参照実装に倣って Service / Zod / API を書く手順
│   │   └── （デザインチェーン内部スキル: frontend-design / baseline-ui /
│   │         fixing-accessibility / fixing-motion-performance /
│   │         web-design-guidelines / design-review）
│   └── hooks/
│       └── format-and-check.sh  ← 編集ごとに Prettier → ESLint --fix → pnpm typecheck を自動実行
│
└── .claude/skills/shadcn-svelte/rules/   ← ベンダー管理・読み取り専用
    ├── composition.md / forms.md / icons.md / styling.md
```

- **`apps/public`（公開サイト）と `apps/admin`（管理 CMS）は独立した Cloudflare Worker として別々にデプロイする**（`/admin` パスへの統合ではない）。ESLint（`eslint-plugin-boundaries`、ルートの `eslint.config.js`）が両者の相互 import と `packages/*` から `apps/*` への import を禁止する（DEV-01 §1・§5）。共有コードは `packages/schema`（スキーマ）、`packages/server-kit`（サーバー基盤）、`packages/content`（開発者が更新する Markdown）の 3 つに置く。`packages/config` / `packages/ui` は検討の上で見送っている（DEV-01 §1 参照）
- **技術スタックの正本は `docs/3-development/01-architecture-rules.md`（DEV-01）**。AI が技術判断に迷ったら必ずここに従う。
- **実装規約の正本は `CLAUDE.md`**。複数ファイルに分割せず 1 ファイルに集約している（§5 参照）。
- 実装系スキルは `schema-build`（DEV-07 → Drizzle スキーマ → migration）と `scaffold`（参照実装に倣って Service / Zod バリデーション / API ルートを書く）の 2 つ。**コードジェネレータは持たない — 正解は動く参照実装であって雛形ではない**（§4 参照）。専用サブエージェントは無い。
- **Memory（長期記憶）**: AI の会話をまたいだ記憶はユーザー領域に自動保存される。「〇〇を覚えておいて」と指示すると次回以降も参照される。

---

## 2. `docs/` の起点 3 ファイルの役割

| ファイル | 役割 | 主な読者 | AI の編集権限 |
| --- | --- | --- | --- |
| `00_README.md` | docs/ 全体の構造ガイド。文書一覧・生成順序・ステータスラベル定義 | 新規参加者・コンサル | 読み取り専用（構造は変えない） |
| `00_INTAKE.md` | ヒアリング生記録の正本。全仕様書の唯一の入力源 | コンサル・PdM | 読み取り専用（AI は追記提案のみ） |
| `00_DEV_GUIDE.md` | AI との作業マニュアル（本書） | 開発者 | 自由に更新可 |

> **迷ったら**: 仕様を探すなら `00_README.md` → 該当ドキュメントへ。作業手順を探すなら本書。

---

## 3. 開発フロー（INTAKE → リリースまで）

### 3-0. フェーズ×使用アセット一覧（この表が全体の前提）

開発は 4 フェーズで進む。各フェーズで使うスキル・ツールは以下の通り:

| フェーズ | 工程 | 使うもの | 種別 |
| --- | --- | --- | --- |
| **設計** | 00_INTAKE.md 記入 | 人間 | — |
|  | docs 一式生成（BIZ → PRD → DEV） | 会話で依頼（§3-1 の順序表） | — |
|  | レビュー・確定 | 人間（ステータスラベル運用） | — |
| **基盤** | DEV-07 の物理テーブル設計 → Drizzle スキーマ生成 → `drizzle-kit generate` → `wrangler d1 migrations apply` | `schema-build` スキル（実装済み。DEV-07 → `packages/schema/src/schema.ts` → `pnpm db:generate`）+ 適用は人間（`apps/admin` からのみ実行） | — |
|  | Service / Zod バリデーション / API ルートの実装（DEV-07/DEV-09 が既に確定しているリソース） | `scaffold` スキル（実装済み。`inquiries` の参照実装を別テーブルに当てはめる。`apps/admin` 配下、Astro ページは対象外） | — |
| **実装** | 管理画面の実装（shadcn-svelte 標準パターン） | `admin-design` | スキル |
| （ページ単位で反復） | 公開側の実装（オリジナルデザイン 6 段チェーン） | `public-design` | スキル |
|  | バックエンド（`scaffold` のスコープ外の実装） | 人間 + AI に日本語で依頼（専用サブエージェントは未導入 — Open） | — |
|  | 機能ごとのテスト作成 | Vitest + Playwright（DEV-01 §1、導入済み — `pnpm test` / `pnpm test:e2e`） | — |
|  | 整形・Lint・型チェック（編集ごと自動） | hooks（`format-and-check.sh`） | 自動 |
| **検証** | コードレビュー | `pnpm check` + 人間レビュー（専用 reviewer エージェント/コマンドは未導入 — Open） | — |
|  | セキュリティレビュー（リリース前必須） | `security-review` スキル | スキル |
|  | 全画面の最終ビジュアルスイープ | `design-review` | スキル |
|  | Cloudflare Workers へのデプロイ | `dev` / `main` へのマージで Cloudflare Workers Builds が自動実行（DEV-08 §3、GOV-01 D-002）。手動実行は `wrangler deploy` | — |

- 公開側 6 段チェーンの内訳: `frontend-design` → `baseline-ui` → `fixing-accessibility` →
  `fixing-motion-performance` → `web-design-guidelines` → `design-review`（`public-design` が起点。
  内部スキルは軽微な修正時に単独起動も可）
- `design-review` は実装フェーズのページ完成ごと + 検証フェーズの最終スイープの両方で使う
- テストは Vitest + Playwright（DEV-01 §1、導入済み）。検証フェーズまで溜めずに実装フェーズ内で機能ごとに書く

### 3-1. 文書生成の流れと各ステップ

```
00_INTAKE.md（人間が記入）
    ↓
BIZ-01 → BIZ-02 → BIZ-03
    ↓
PRD-01 → PRD-02 → PRD-03 →（AI機能あり時: PRD-05）→ PRD-04
    ↓
DEV 文書群（DEV-07 物理DB設計 が実装の起点）
    ↓
DEV-07 → Drizzle スキーマ生成 → drizzle-kit generate → migrations/ → wrangler d1 migrations apply
    ↓                                                     ← schema-build スキル（実装済み）
Service / Zod バリデーション / API Route を実装        ← scaffold スキル（inquiries の参照実装に倣う。
    ↓                                                        Astro ページは対象外）
    ↓
ページ単位で実装（管理画面: admin-design / 公開側: public-design）
    ↓
検証（pnpm check → 人間レビュー → security-review）
```

各文書の生成は「〇〇（入力文書）を参照して △△（対象文書）を書いて」と依頼するだけ。入力文書と確認ポイント:

| Step | 書く文書 | 読む文書 | 人間の確認ポイント |
| --- | --- | --- | --- |
| 1 | INTAKE | ヒアリング情報（人間が記入） | サービス概要・ターゲット・マネタイズ。不明点は `[Open]` |
| 2 | BIZ-01 | INTAKE | ビジネスモデル・提供価値が具体的か |
| 3 | BIZ-02 | INTAKE + BIZ-01 | KPI 目標が具体的か（未確定は `[Assumed: TBD]`） |
| 4 | BIZ-03 | INTAKE + BIZ-01/02 | プラン・料金・機能制限が数値か。DB に影響する `[Open]` の把握 |
| 5 | PRD-01 | INTAKE + BIZ-01〜03 | エンティティ一覧（→ DEV-07 のテーブルになる）・ユビキタス言語 |
| 6 | PRD-02（§6 → §1〜5 の順） | PRD-01 + BIZ-01 | §6 論理データモデルが DEV-07 の元ネタ。テナント境界方針 |
| 7 | PRD-03 | PRD-01/02 + BIZ-01〜03 | 状態遷移・ビジネスルール。状態の列挙値を確定 |
| 8 | PRD-04 / PRD-05（採用時） | PRD-03 | 画面構成 / AI 機能の採否判定ゲート |
| 9 | DEV 文書群 | PRD 群 + DEV-01 | 技術判断はすべて DEV-01 に従っているか |

**ドキュメントステータスの扱い**

| ステータス | 扱い |
| --- | --- |
| `approved` / `[Confirmed]` | 実装してよい |
| `draft-ai` / `[Assumed]` | 実装前に人間が確認・承認する |
| `[Open]` | 未決定。実装しない |

### 3-2. DB 設計 → マイグレーション

```
1. DB 設計前に [Assumed] / [Open] をゼロにする
   「PRD-01〜03 の [Assumed] と [Open] を一覧にして、DB 設計に影響するものを教えて」
   → 1 つずつ確定し「[Confirmed] に更新して」

2. DEV-07 を書く
   「PRD-01・PRD-02（特に §6）・PRD-03 を参照して DEV-07 の物理テーブル定義を書いて」
   → 全テーブルに PK / created_at / updated_at、URL 露出テーブルに public_id（ULID/UUID）があるか確認

3. マイグレーションファイルを作成（`schema-build` スキル。Drizzle スキーマ生成 → `pnpm db:generate` — DEV-01 §1）
   「DEV-07 を参照して Drizzle スキーマ（`packages/schema/src/schema.ts`）を更新し、`pnpm db:generate` で migration SQL を生成して」
   → migration は `apps/admin` からのみ実行する（同一リポジトリ内の app 単位の所有権。DEV-01 / CLAUDE.md の D1/R2 バインディングルール参照）

4. 適用
   ! pnpm db:migrate          # = apps/admin の wrangler d1 migrations apply DB --local
                              #     --persist-to ../../.wrangler-state
   → `--persist-to ../../.wrangler-state` を落とすと 2 つ目の空 DB が黙って作られる（CLAUDE.md）。
     wrangler を直接叩く場合も必ず付ける。
   → 本番反映は OPS 側の手順に従う。down() の自動生成は無いため、ロールバックが必要な変更は
     新しい migration で対応する（forward-only）

5. ページ / API Route / Service の作成
   → ルート表・ファイル構成を一括生成するツールはこのテンプレートに未導入（Open / future work）。
     PRD-04 の画面一覧を見ながら、公開ページは `apps/public/src/pages/**/*.astro`、
     管理側の API Route / Service は `apps/admin/src/pages/api/**/*.ts`・
     `apps/admin/src/lib/server/services/` を画面/機能単位で都度作成する
   → 「PRD-04 の画面一覧から、必要な Astro ページと API Route の一覧を出して」と依頼して
     洗い出してから着手すると漏れが減る
```

### 3-3. 実装（バックエンド / フロントエンド / テスト）

ページ単位で中身を作っていく。画面種別でスキルを指定する:

```
管理画面:「admin-design スキルで団体スタッフ一覧画面を実装して」
  → shadcn-svelte の既存パターン（CLAUDE.md）に準拠して実装
    → fixing-accessibility → design-review（実ブラウザ検証）まで自動でチェーン

公開側:「public-design スキルでトップページを作って。ブリーフ: ...」
  → frontend-design（デザイン方向）→ baseline-ui → fixing-accessibility
    → fixing-motion-performance → web-design-guidelines → design-review の 6 段チェーン
  → LP / トップ / 料金はフルチェーン、認証画面などの単純ページは短縮（AI が判断して申告）

バックエンド:「PRD-03 §2 のお知らせ（News）公開機能を実装して」
  → CLAUDE.md のレイヤー原則（Astro Page/API Route → Service → D1、DEV-01 §5 参照）に従い実装
    認可チェック（`apps/admin` は単一ロール `admin` のため `requireSession` のみで足り、`apps/public` は `org_admin` / `org_staff` のロール検証）は Service / D1 アクセス層で必ず強制（DEV-01 §4、GOV-01 D-011）
  → 専用のバックエンド実装エージェントは未導入（Open）。日本語で直接依頼する

テスト: Vitest（unit）+ Playwright（e2e）に確定済み（DEV-01 §1）
  → 導入後は、検証フェーズまで溜めずに機能完成ごとに書く運用にする
```

> コード変更のたびに hooks（`format-and-check.sh`）が Prettier → `eslint --fix` → `pnpm typecheck`
> を自動実行し、エラーは AI に自動フィードバックされます。手動で実行する必要はありません
> （コミット前・PR 前の最終確認には `pnpm check` を使う）。

### 3-3b. 検証フェーズ（リリース前）

```
1. 整形・Lint・型チェック・単体テストの最終確認: ! pnpm check
   （E2E は別コマンド: ! pnpm test:e2e ← 事前に pnpm db:generate が必要）
2. 「変更内容をレビューして」と人間目線のセルフレビューを依頼
   （専用 reviewer エージェント/コマンドは未導入 — Open）
3. security-review スキルで「変更内容のセキュリティレビューをして」と依頼   ← リリース前・重要な変更後
4. 画面が絡む変更は design-review スキルで最終ビジュアルスイープ
```

### 3-4. コミット・プッシュ手順

> **ルール: コミット・プッシュは人間が行う。AI は `git commit` / `git push` を実行しない。**

```
1. 「今の変更内容からコミットメッセージの案を出して」と依頼
2. ! git add <変更ファイル> → ! git status で確認
3. ! git commit -m "メッセージ"
4. ! git push
```

リリース前・重要な機能変更後は 1 の前に `security-review` スキルでレビューを依頼する。

---

## 4. スキル一覧と用途

### プロジェクト管理スキル（フェーズの道具。手で育てる）

| スキル | フェーズ | 使う場面 |
| --- | --- | --- |
| `schema-build` | 基盤 | DEV-07 のテーブル定義を Drizzle スキーマに反映し、migration SQL を生成（DEV-07 → `packages/schema/src/schema.ts` → `pnpm db:generate`） |
| `scaffold` | 基盤 | 既存テーブル（schema-build 済み）に対して Service / Zod バリデーション / API ルートを実装。`apps/admin/src/lib/server/services/inquiries.ts` を参照実装として別テーブルに当てはめる。Astro ページは対象外 |
| `admin-design` | 実装 | 管理画面の実装（shadcn-svelte 標準パターン → a11y → 実ブラウザ検証） |
| `public-design` | 実装 | 公開側ページの実装（デザイン方向〜検証の 6 段チェーンの起点） |
| `shadcn-svelte` | 実装 | 管理画面 UI コンポーネントの追加・調整（`npx shadcn-svelte add <component>` を含む） |
| `design-review` | 実装・検証 | 実ブラウザでのビジュアル検証（両画面共通・単独でも使える） |
| `frontend-design` / `baseline-ui` / `fixing-accessibility` / `fixing-motion-performance` / `web-design-guidelines` | 実装 | デザインチェーンの内部スキル。軽微な修正時は単独起動も可（余白 → baseline-ui、a11y → fixing-accessibility 等） |

### このテンプレートに無いもの

- **専用サブエージェント**（backend / frontend / reviewer / security-audit / test-writer 相当）。バックエンド実装もコードレビューも日本語で直接依頼する
- **コードジェネレータ**（Plop 等の雛形生成）。旧リポジトリ構想の `backend-scaffold` / `page-skeleton` / `resource-scaffold` は存在しない。正解は動く参照実装（`inquiries`）であって雛形ではない、という方針（GOV-01 D-012）
- **Astro ページのデザイン・実装の自動生成**。ページは `admin-design` / `public-design` が担当する（`scaffold` はバックエンド層のみ）

追加する場合は GOV-01 で決定した上で本書と DEV-01 を更新すること。架空のツール名を書かない。

### 標準スキル（Claude Code 標準機能。プロジェクト専用ではない）

| スキル | タイミング |
| --- | --- |
| `security-review` | リリース前・重要な機能変更後 |

新しいスキルを追加したらこの表と §1 の構成図を更新すること。

---

## 5. 自動で動いている機能（意識不要）

### MCP（必要なときに AI が自動で呼び出す）

`.mcp.json` に定義されたサーバーのみが使われる。用途別の使い分けは `CLAUDE.md`「MCP servers」節が正本。

### 実装規約（AI が常時参照。繰り返しミスがあったら育てる）

実装規約は **`CLAUDE.md` 1 ファイル**に集約されている（アーキテクチャ、コマンド、D1/R2 バインディングルール、
ハード制約、フォーマット/Lint 方針）。`.claude/skills/shadcn-svelte/` はベンダー管理のため直接編集しない（更新はディレクトリごと差し替える）。

```
「Service を通さず .astro ページから env.DB.prepare() を直接呼んでくる」
→「その禁止事項を CLAUDE.md に追記して」
```

設計原則（なぜそうするか）は docs/3-development/ 側、コードの書き方（どう書くか）は `CLAUDE.md` 側、という分担です。

---

## 6. 困ったときの対処

| 状況 | 対処 |
| --- | --- |
| AI が的外れな方向に進んでいる | 「一度止めて。〇〇の目的は△△です」と文脈を与える |
| AI が想定外のライブラリを提案してくる | 「DEV-01 の §2 / §3 を確認して」と指示する |
| 前の会話の内容を覚えていない | 「memory を確認して」と言う |
| ブラウザで変更が反映されない | `! npx astro dev status` で daemon の状態を確認、または `! npx astro dev logs` |
| migration でエラーが出た | エラーログをそのまま貼る |
| Lint / 型チェックエラーが直らない | 「pnpm typecheck のエラーを修正して」と依頼 |
