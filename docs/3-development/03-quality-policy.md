---
doc-id: DEV-03
title: 品質方針
phase: 3
status: draft-ai
owner: Tech Lead / PdM（兼務前提）
last-updated: 2026-09-15
related-docs:
  - BIZ-02: 品質目標 KPI
  - DEV-01: アーキテクチャ原則
  - DEV-02: セキュリティポリシー（レビュー基準の正本 §11）
  - DEV-05: バックエンド実装ガイド
  - DEV-08: デプロイ定義・検証完了ゲート
  - DEV-09: 状態遷移仕様
  - DEV-10: 統合・外部 API 仕様
  - OPS-02: 運用ハンドブック
---

# 03-quality-policy.md — 品質方針

## このセクションの目的

品質目標、完了定義、テスト戦略、レビュー基準、技術的負債の管理方法を定義する。**品質目標の参照源は BIZ-02**。本サービスは Walker（お散歩参加者）× Organization（保護団体）の二者間マーケットプレイスであり（`Decided` — GOV-01 D-006）、3 系統アカウント・テナント境界（`organization_id`）・決済（Stripe / Stripe Connect）・状態遷移の品質担保を特に重視する。

## 0-H. ハイブリッド編集ガイド（要点）

- 推奨モード: Hybrid（AI 整理 + Tech Lead / PdM（兼務前提）レビュー）
- 人間確認必須: 品質目標の現実性、DoD の厳しさ、運用できるテスト戦略

---

## 1. 品質方針

- **品質の定義**: Walker・保護団体双方が安心して継続利用でき、サービス価値（お散歩マッチング・保護犬の里親相談）を損なわない状態
- **優先する品質特性**: 信頼性、パフォーマンス、使いやすさ、変更容易性、安全性（お散歩当日の事故・トラブル対応に関わる情報の正確性 — PRD-03 FG-12）
- **妥協しない最低基準**:
  - 認証・認可・テナント境界（`organization_id`）の欠陥はリリースしない。3 系統アカウント（AdminUser / Walker / OrganizationMember — DEV-01 §1「アカウント系統」、GOV-01 D-007・D-011）の混線を含む
  - 決済（Stripe / Stripe Connect）の整合性問題はリリースしない。二重課金・保護団体への送金漏れ・Webhook 冪等性の欠陥を含む（GOV-01 D-008）
  - データ損失（特に決済済みデータ・保護犬の安全情報）はリリースしない
  - 保護犬・参加者の安全に関わる情報（緊急連絡先、健康・安全情報 — PRD-03 FG-02/FG-05）の欠落・誤表示はリリースしない
- **KPI との接続**: BIZ-02 §2-2 の正本マップ経由で KPI-10〜13 に接続（KPI-14 は廃止 — インシデント解決目安は OPS-02 §2）

---

## 2. 完了定義（DoD）チェックリスト

機能 PR が Merge されるための条件：

- [ ] 要件（PRD-03 機能 ID）に対応する受け入れ条件を満たす
- [ ] テストが追加 / 更新されている（正常系・バリデーション異常系・権限異常系。Vitest — DEV-01 §1）
- [ ] 型チェック（`pnpm typecheck` = 各アプリで `wrangler types` → `astro check` → `svelte-check`）でエラー 0 件
- [ ] Prettier + ESLint（`pnpm check`。レイヤー境界ルール `eslint-plugin-boundaries` 含む — §3-5）で整形・Lint 済み
- [ ] 関連 Service（`apps/admin/src/lib/server/services/`。GOV-01 D-007 により `apps/public` 側にも同様の Service 層を持つ機能は `apps/public` 側も）/ D1 アクセス関数の Unit テスト（Vitest）がある
- [ ] 3 系統アカウント（AdminUser: 単一ロール `admin`、Walker、OrganizationMember: `org_admin`/`org_staff` — DEV-01 §1「アカウント系統」、GOV-01 D-007・D-011）の権限異常系テストが含まれる。AdminUser はロールが単一のためロール分岐のテストは不要だが、`requireSession(cookies, db)` 未通過時に拒否されることのテストは必須。OrganizationMember はロール（`org_admin`/`org_staff`）× 操作のマトリクステストを含む
- [ ] テナント境界（`organization_id`）を越えたアクセスが拒否されることのテストが含まれる（他団体の保護犬・お散歩枠・予約・スタッフ情報を参照・更新できないことを検証）
- [ ] 決済（Stripe Payment Intent / Checkout、Stripe Connect への送金）を含む変更の場合、Webhook 署名検証・冪等性・失敗時のリトライ / 状態整合のテストがある（GOV-01 D-008、DEV-10 §2）
- [ ] 状態遷移を含む変更の場合、DEV-09 の遷移関数に対する正常遷移・不正遷移双方のテストがある
- [ ] 非同期後処理（`ctx.waitUntil()`）・定期バッチ（Cron Triggers）を含む場合、その起動および失敗時の挙動のモックテストがある（旧仕様の `Queue::fake()` 相当の置き換え — GOV-01 D-010）
- [ ] 外部 API（Stripe / Google Maps Geocoding API 等）呼び出しを含む場合、`fetch` のモックによる正常系・異常系テストがある
- [ ] ログ出力（`request_id` / 操作主体の識別子: `admin_user_id`・`member_id`・`organization_member_id` のいずれか）が適切
- [ ] セキュリティ観点（DEV-02 §11）の自己確認完了
- [ ] DEV ドキュメントへの影響があれば更新済み

---

## 3. テスト戦略

### 3-1. テスト種別

| 種別 | 目的 | 対象 | ツール | カバレッジ目標 | タイミング |
| --- | --- | --- | --- | --- | --- |
| Unit Test | 業務ロジック検証 | Service（`apps/admin`・`apps/public` 双方 — DEV-01 §1、GOV-01 D-007）/ 状態遷移関数（DEV-09）/ 共有パッケージ（`packages/server-kit/tests/`: パスワード・ロックアウト・セッション・エンベロープ・ページネーション、`packages/schema/tests/`: 命名規約・ULID。GOV-01 D-015） | Vitest + `@cloudflare/vitest-plugin`（DEV-01 §1） | 主要 Service 80% 以上 | PR 時 |
| Feature / Integration Test | エンドポイント動作 | Astro API Route（`apps/admin`/`apps/public` の `src/pages/api/**/*.ts`）/ Svelte アイランド | Vitest（同上） | 主要画面・API 100% | PR 時 |
| Architecture Test | レイヤー境界遵守（DEV-01 §5） | Astro Page/API Route → Service → D1 の依存方向（`apps/admin`・`apps/public` 双方） | `eslint-plugin-boundaries`（確定済み。詳細は §3-5） | — | PR 時（Lint 自動） |
| テナント境界・アカウント境界 Test | `organization_id` の越境アクセス防止、3 系統アカウントの分離（DEV-01 §1、GOV-01 D-007・D-011） | Service 層の認可チェック関数 | Vitest（パラメータ化テスト `test.each`） | 主要 Service 100% | PR 時 |
| 決済 Integration Test | Stripe / Stripe Connect 連携の整合性（GOV-01 D-008） | 決済 Service、Webhook ハンドラ | Vitest + Stripe SDK / `fetch` モック | 主要連携 100% | PR 時 |
| 外部 API Integration Test | ジオコーディング（GOV-01 D-009）等の外部連携 | Geocoding 呼び出し Service | Vitest + `fetch` モック | 主要連携 100% | PR 時 |
| E2E Test（**導入済み**・CI で実行） | 主要フロー | 既存: 管理画面ログイン（`apps/admin/tests/e2e/login.spec.ts`）/ Walker 認証（`apps/public/tests/e2e/member-auth.spec.ts`）。追加予定: 参加者オンボーディング・保護団体登録審査・お散歩検索/予約/決済・キャンセル/返金 | Playwright（`playwright` MCP は design-review 用、テストランナーとしても同ツール） | ハイドレーション（`client:*` 忘れ）は E2E でしか捕まらない | PR 時 |
| Static Analysis | 型安全性 | 全 `.ts` / `.astro` / `.svelte` コード | ESLint + TypeScript strict（`astro/tsconfigs/strict`）。`pnpm typecheck` | エラー 0 件 | PR 時 |
| Style Check | コードスタイル | 全コード | Prettier + ESLint（`pnpm check`） | 100% Pass | PR 時（Hook 自動 — `.claude/hooks/format-and-check.sh`） |
| Security Test | 脆弱性検知 | 依存関係 / コード | Dependabot / `/security-review` | High 以上 0 件 | 自動検知 / リリース前 |

> テストフレームワークは Vitest（unit / feature）+ Playwright（e2e）で確定済み（DEV-01 §1）。旧仕様の Architecture Test は `eslint-plugin-boundaries` による機械検証に置き換える。

> **単体テストと E2E は役割が違う。** 単体テストは `@cloudflare/vitest-plugin` により workerd 上で動くため D1 も KV も本物で、E2E から到達できない条件を担当する：設定値が未設定（`NaN`）のときのフェイルクローズ、セッションの期限切れ、停止済みアカウントの即時失効、未知のメールとパスワード誤りの処理時間が桁で違わないこと（DEV-02 §1）。ロックアウトが無効化されていても E2E は全件通るため、ここは単体でしか守れない。逆にハイドレーション（`client:*` の書き忘れ）はサーバー側で描画されてしまうため E2E でしか捕まらない。

> `pnpm test:e2e` は `--concurrency=1` で実行する。両アプリの E2E が 1 つのローカル D1 を共有する実 dev サーバーを叩くため、並列実行すると DB が壊れる。

### 3-2. 決済（Stripe / Stripe Connect）のテスト戦略

Stripe API 呼び出しは外部ネットワーク呼び出しのため、Vitest では全てモックする（GOV-01 D-008）。

| レイヤー | テスト方法 |
| --- | --- |
| Service（Payment Intent / Checkout 作成） | Stripe SDK 呼び出しをモックし、固定レスポンスを返す |
| Webhook ハンドラ | `stripe.webhooks.constructEvent` による署名検証を通す固定ペイロードでイベント種別ごとの分岐をテスト。署名不正時に処理を拒否することを検証（DEV-10 §2） |
| 冪等性 | 同一 Webhook イベントの重複配信時に二重処理されないことをテスト（受信済みイベント ID の記録・チェック） |
| Stripe Connect（保護団体への送金） | Connected Account への Transfer 呼び出しをモックし、送金額・送金先の算出ロジックを Unit Test で検証 |
| 状態遷移 | 決済・予約の状態遷移（DEV-09）の Unit Test |
| 失敗ケース | Stripe API エラー時のリトライ・返金・状態遷移をテスト |
| Integration（実 Stripe）（**任意**：プロジェクト成長後に導入） | Stripe Test Mode を使った smoke test。必須の DoD には含めない |

### 3-3. テナント境界（organization_id）・3 系統アカウントのテスト戦略

3 系統（AdminUser / Walker / OrganizationMember）は別テーブル・別セッション Cookie に完全分離する（DEV-01 §1「アカウント系統」、GOV-01 D-007・D-011）。以下を必須とする：

- 各系統のセッション / クッキーが他系統のルート・API で認証として通用しないことのテスト
- OrganizationMember の操作が自団体の `organization_id` に紐づくリソース（保護犬・お散歩枠・予約・スタッフ情報等）のみに制限されることのテスト。他団体のリソースへのアクセスは拒否されることを検証
- ロール（`org_admin`/`org_staff`）× 操作のマトリクステスト（Vitest の `test.each`）。AdminUser（`apps/admin`）はロールが単一（`admin`）のためロール×操作のマトリクスは対象外とし、`requireSession(cookies, db)` を通らないリクエストが拒否されることのみをテストする
- Walker はロールを持たずプロフィールの `status` 列で機能解禁を判定するデータ駆動方式のため（DEV-01 §1「Permission」）、`status` の値ごとに許可される操作の境界をテストする

### 3-4. 非同期処理（ctx.waitUntil() / Cron Triggers）のテスト戦略

旧仕様の非同期ジョブキューが担っていた処理は、GOV-01 D-010 により `ctx.waitUntil()` + Cloudflare Cron Triggers に置き換える。

| レイヤー | テスト方法 |
| --- | --- |
| Service（後処理の起動） | `ctx.waitUntil()` に渡す関数が正しい引数で呼ばれることをモックで検証 |
| 後処理本体（メール送信・監査ログ記録・送金集計等） | 後処理関数を単体で Unit Test（Resend 呼び出し・D1 書き込みをモック） |
| Cron Triggers（Scheduled Worker） | `scheduled()` ハンドラを Vitest から直接呼び出し、定期バッチ（データ保管期限の自動削除・月次 Payout 集計等 — GOV-01 D-010、OPS-02 §4-3）の実行結果を検証 |
| 失敗ケース | 後処理が例外を投げてもレスポンスに影響しないこと、リトライ / エラーログの記録を検証 |

### 3-5. レイヤー境界の検証（eslint-plugin-boundaries）

DEV-01 §5 が定めるレイヤー境界（Astro Page / API Route → Service → D1）は `eslint-plugin-boundaries` で機械検証する（`Confirmed`・導入済み — `eslint.config.js` の `boundaries/dependencies` ルール）。GOV-01 D-007 により `apps/public` も `apps/admin` と同様の Service / D1 レイヤーを持つため、境界ルールは両アプリに適用する。定義するルールは「`apps/public` ⇔ `apps/admin` の相互 import 禁止」「UI コンポーネントから `src/lib/server/*` への import 禁止」「`packages/*` から `apps/*` への import 禁止」の 3 つに加え、`no-restricted-imports` による「ページ / コンポーネントからの `@app/schema`（テーブル定義）import 禁止 — クエリは Service 層にだけ置く」。あわせて PR レビュー（§4）で以下を人間が確認する（import 検査では捕捉できない観点）：

- `.astro` ページ内で直接 `env.DB.prepare()` を呼んでいないか（DEV-01 §8 アンチパターン）
- Svelte アイランドの `onMount` 内で状態遷移を実行していないか
- API Route が Service を経由せず D1 に直接アクセスしていないか
- 認可チェック（3 系統アカウントのロール検証・`organization_id` の一致検証）が Service / D1 アクセスの境界で強制されているか

設定の実体は `eslint.config.js`（`boundaries/elements` + `boundaries/files` + `boundaries/dependencies`）を参照。

### 3-6. 状態遷移テスト

Reservation（予約）・Payment（決済）・Organization（審査ステータス）等の状態遷移は、DEV-09 §5 が定めるテスト戦略に従い、全遷移パターン（正常遷移・不正遷移）にテストがあることを目標とする。DEV-03 独自にテストコードのパターンは重複定義せず、DEV-09 を正本として参照する。

### 3-7. テストデータ生成

- ORM は Drizzle（DEV-01 §1、決定済み）。テストデータ生成のヘルパー（Factory 相当）は Drizzle スキーマの型（`typeof table.$inferInsert`）を使った INSERT ヘルパー関数、またはテスト用シード SQL として用意する
- テナント境界のテストデータは複数の Organization（例: 団体 A / 団体 B）を用意し、越境アクセスを試すデータセットを作る
- ロール（`org_admin`/`org_staff`）× 操作のマトリクステスト（Vitest のパラメータ化テスト `test.each`）を用意する。AdminUser はロールが単一（`admin`）のためマトリクス化不要

---

## 4. コードレビュー基準

PR レビュー観点：

- 要件の意図に沿っているか（PRD-03 機能 ID 対応）
- レイヤー責務（DEV-01 §5-3）が守られているか（`apps/admin`・`apps/public` 双方 — GOV-01 D-007）
- 命名がユビキタス言語（PRD-01）と整合しているか
- セキュリティ観点（DEV-02 §11）が満たされているか
- N+1 クエリ相当の非効率な D1 アクセスが発生していないか
- 重い処理がレスポンスをブロックしていないか（`ctx.waitUntil()` / Cron Triggers — DEV-01 §4、GOV-01 D-010）
- 状態遷移は単一の遷移関数（DEV-09）経由か
- テナント境界（`organization_id`）が強制されているか（他団体のリソースへの越境アクセスを防いでいるか）
- 3 系統アカウント（AdminUser / Walker / OrganizationMember）の認可チェックが強制されているか
- 決済（Stripe / Stripe Connect）を扱う変更は Webhook 署名検証・冪等性が担保されているか
- 状態を変更する Service メソッドが監査ログを記録しているか（`activity_log`、DEV-05 §9-1。記録呼び出しの **欠落** は Arch テスト・静的解析で検出できないため、レビューが唯一の防御線）
- エンドユーザー向けメールが共通の送信経路（Resend、DEV-01 §1）経由か
- 業務閾値・外部サービス ID がハードコードされていないか（DEV-05 §10）
- テストが境界条件・例外系も含むか
- 過剰抽象化していないか

AI による自動レビュー（実装規約の正本: `CLAUDE.md`、DEV-01 §9 参照）の後、人間レビュー必須。

---

## 5. 技術的負債の管理

| 区分 | 方針 |
| --- | --- |
| 識別 | PR レビューで「TODO（負債）」コメント、GitHub Issues に転記 |
| 返済比率 | 開発工数の一定割合（目安 20%）を負債返済に割り当て |
| 可視化 | GitHub Project の `tech-debt` ラベル |
| 優先順位 | セキュリティ > 性能 > 保守性 > スタイル |

---

## 6. テスト実行コマンド

テストツールは Vitest（unit/feature）+ Playwright（e2e）で確定済み（DEV-01 §1）。

```bash
# 全テスト（両アプリ）
pnpm test

# 特定アプリのみ
pnpm --filter admin test
pnpm --filter public test

# 特定テスト（例）
pnpm --filter admin exec vitest run reservationService

# カバレッジ付き（例）
pnpm --filter admin exec vitest run --coverage

# E2E テスト（Playwright 導入後の例）
npx playwright test
```

---

## 7. KPI 接続

| KPI ID | 内容 | テストでの担保 |
| --- | --- | --- |
| KPI-10 | 主要 API p95（定義の正本は DEV-01 §6） | Integration / Performance Test、リリース前にレポート確認 |
| KPI-11 | 予約・決済フロー完了時間 p95（定義の正本は DEV-01 §6） | 決済 Integration Test（§3-2）で計測、E2E 導入後は主要フロー計測に統合 |
| KPI-12a / KPI-12b | 稼働率（管理・団体側 / 公開側） | 数値の正本は PRD-02 §5-2。死活監視・デプロイゲートは OPS-02（運用ハンドブック）参照 |
| KPI-13 | 一次応答時間 | 数値の正本は OPS-01 §3-3。テストでの直接担保対象外（サポート運用側の KPI） |

> KPI-14（MTTR）は廃止済み — インシデント解決目安は OPS-02 §2 に一本化（BIZ-02 §2-2）。

---

## 8. 記入時チェックポイント

- 品質方針が KPI（BIZ-02）と接続されているか
- DoD が実行可能か（理想論で終わっていないか）
- テスト戦略がプロジェクトのリソースに合うか
- 3 系統アカウント・テナント境界（`organization_id`）・決済（Stripe / Stripe Connect）・状態遷移のテスト方針が含まれているか
- レビュー基準が PR 時のチェック項目として運用可能か
