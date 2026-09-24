# 一時ステータス・スナップショット（2026-09-24 時点）

> **この文書は一時ファイルであり、役目を終えた時点で削除する。**
>
> - 削除の目安: ①ここに書いた内容が DEV-11（フェーズ表の `状態` 列・申し送り）と GOV-02（TBD）に
>   反映され、かつ ②P12 以降に着手して内容が古くなったとき。どちらかが起きたら削除してよい。
> - **正本ではない。** フェーズの順序と依存は DEV-11、未決事項は GOV-02、環境変数は DEV-10 §11 が
>   正本で、食い違ったら常にそちらが正しい。本書は「今どこまで動いているか」を 1 枚に集めただけの
>   作業用メモである。
> - 参照した文書: DEV-10 / DEV-11 / GOV-01 / GOV-02、`git log dev`、`pnpm test` の出力。

---

## 1. 現在地

| 項目 | 値 |
| --- | --- |
| 作業ブランチ | `dev`（`8a773d0`）。フェーズブランチ 20 本は `dev` から作成済み |
| マージ済みフェーズ | P1〜P11 + 団体有効化（D-038）+ P16 + P17 |
| 未着手フェーズ | P12・P13・P14・P15・P18・P19・P20 |
| テーブル | 32（`packages/schema/src/schema.ts`）。migration は `0000`〜`0004` |
| 単体テスト | 343 件（schema 12 / server-kit 52 / admin 77 / public 202）すべて成功 |
| E2E | public 55 件成功 / admin 11 件成功 + 3 件 skip（`edit-forms.spec.ts`、後述） |
| mock 残数 | `apps/admin` 10 / 28 画面、`apps/public` 15 / 79 画面 |
| CI | 直前まで `public:test:e2e` が 60 秒タイムアウトで落ちていた。`8a773d0` で解消済み |

### 1-1. CI が落ちていた件（解決済み）

Playwright は **`webServer` の起動確認を `globalSetup` より先に**実行する。CI は `.wrangler-state/` を
持たない空の D1 で始まるため、SCR-01（`/`）が初期表示で D1 を読む P10 以降、起動確認が毎回 500 を
受け取り、テストが 1 件も走らないまま `Timed out waiting 60000ms from config.webServer` で終了して
いた。`apps/public/playwright.config.ts` の `webServer.command` で移行を先に流すようにして解消。
経緯と理由は CLAUDE.md「Testing」に記載済み。

---

## 2. フェーズ別の実装状況

`状態` は実際のコードの状態。**DEV-11 §3 の `状態` 列は更新漏れがあり、本表が実態に近い**（§6 参照）。

| # | ブランチ | 状態 | 残っていること / ブロッカー |
| --- | --- | --- | --- |
| P1 | `feature/org-session` | 完了 | — |
| P2 | `feature/notifications` | 完了 | 本番送信は `RESEND_API_KEY` とドメイン認証（TBD-38）待ち。未設定の間は送信をスキップしてログに残す |
| P3 | `feature/uploads` | 完了 | 申請書類の経路のみ P6 側で保留（TBD-25） |
| P4 | `feature/walker-registration` | 完了 | 確認メールの**再送導線が未実装**（期限切れ時は問い合わせ誘導） |
| P5 | `feature/walker-profile` | 完了 | `restricted` / `suspended` は運営操作のため P19 |
| P6 | `feature/org-application` | 完了 | **申請書類の提出（F-03-02）は未実装**（TBD-25）。当面は `needs_more_info` の差し戻しで運用 |
| P7 | `feature/org-profile-staff` | 完了 | 住所のジオコーディング未実装（TBD-40） |
| P8 | `feature/dogs` | 完了 | SYS-10 は読み取り専用（TBD-58 → P14）。写真は 1 枚のみ |
| P9 | `feature/walk-slots` | 完了 | SYS-11/12 読み取り専用。system 起点の自動遷移（受付開始・終了）は P20。中止時の予約連鎖は P13 |
| P10 | `feature/search` | 完了 | **距離検索は動くが当たる行が無い**（緯度経度が空。TBD-40 が入れば立ち上がる）。ページネーション未実装（上限 60 件） |
| P11 | `feature/reservation-hold` | 完了 | **SMS は送っていない**（TBD-61、ログ出力のみ）。`reserved_count` の加減算は P12/P13。期限切れ予約行の掃除は未実装（席は開く） |
| — | `feature/org-activation` | 完了 | D-038 / TBD-63。**有効化リンクの再送手段が運営に無い** → P19 で SYS-07 に追加 |
| P12 | `feature/payments` | 未着手 | **TBD-01/02/08/09（料金）・TBD-37/38/39（ドメイン・メール・Stripe）** |
| P13 | `feature/cancel-refund` | 未着手 | **TBD-10/11/12（キャンセル・返金条件）**。P12 依存 |
| P14 | `feature/admin-ops-rpc` | 未着手 | **TBD-58 を解決するフェーズ**。ここで SYS-10/12/20 の操作系と `edit-forms.spec.ts` を戻す |
| P15 | `feature/walk-records` | 未着手 | ブロッカー無し。ただし参加者側画面は確定予約が前提（§4 参照） |
| P16 | `feature/incidents` | 完了 | 参加者からの報告経路が無い（PRD-04 に画面が無いため）。SYS-20 は読み取り専用（TBD-58 → P14） |
| P17 | `feature/adoption-inquiries` | 完了 | TBD-30〜34 は `[Assumed]` のまま実装。相談終了後も犬は `in_consultation` のまま（団体が手で戻す） |
| P18 | `feature/payouts` | 未着手 | **TBD-29（振込サイクル）**、Stripe Connect。P13 依存 |
| P19 | `feature/admin-platform` | 未着手 | TBD-13・TBD-28。P14 依存 |
| P20 | `chore/ops-hardening` | 未着手 | TBD-60 の実測は staging デプロイが要る |

### 2-1. mock のまま残っている画面（= 残作業の実体）

| 画面 | フェーズ |
| --- | --- |
| SCR-18/19/20（`/checkout/*`） | P12 |
| SCR-24/25（参加者の予約一覧・詳細） | P12〜P13 |
| ADM-11/12（団体の予約一覧・詳細、F-06-03） | P12 |
| SCR-26/27/28・ADM-13/14（実施記録） | P15 |
| ADM-15/16・SYS-17/18（還元・振込） | P18 |
| SYS-13/14/15/16（運営の予約・決済） | P12〜P14 |
| SYS-01/02/03/25（ダッシュボード・参加者管理・操作履歴） | P19 |
| ADM-01（団体ダッシュボード） | P19（実データ化は横断機能） |

mock 以外に残っている `TODO` は次の 4 つ — SCR-12（ソーシャルログイン、未採用）、SCR-41（問い合わせ
フォームの POST 結線）、SCR-39/40（規約・プライバシーの本文差し替え）、SCR-43/47（運営者の法人情報。
TBD-35/37 待ち）。

---

## 3. 手配が必要な外部サービス・API キー

`必要時期` は「そのフェーズの実装に要る」ではなく「**その時点までに無いと動かない**」を指す。
キー名は DEV-10 §11 が正本。

| キー / 手配 | 用途 | 設定先 | 必要時期 | 現状 | 依頼先 |
| --- | --- | --- | --- | --- | --- |
| `RESEND_API_KEY` | メール送信（DEV-10 §3） | 両アプリの Secrets（ローカルは `.dev.vars`） | **今すぐ**（P2 以降の通知が全部これ待ち） | 未設定。送信をスキップしてログに残すだけ | Tech Lead（アカウント作成） |
| SPF / DKIM / DMARC | Resend の本番送信条件（TBD-38） | DNS | 本番送信の 30 日前 | 未着手。ドメイン未確定（TBD-37） | 事業責任者 → Tech Lead |
| `MAIL_ADMIN_ALERTS` | P0/P1 事故の即時通知先（F-12-02） | 両アプリの `wrangler.jsonc` `vars` | **本番稼働前に必須** | 空文字。**設定漏れは「重大事故が誰にも届かない」形で表面化する** | 運営（宛先の決定） |
| `FILE_SIGNING_KEY` | 非公開 R2 への署名リンク（D-024） | 両アプリに**同一値** | 今すぐ（事故報告の添付が対象） | 未設定だと添付はファイル名表示のみでリンクにならない | Tech Lead |
| `STRIPE_KEY` / `STRIPE_SECRET` / `STRIPE_WEBHOOK_SECRET` | 参加費決済（DEV-10 §2） | 両アプリの Secrets | **P12 着手前** | 本番契約が未着手（TBD-39） | 事業責任者 |
| Stripe Connect（`STRIPE_CONNECT_WEBHOOK_SECRET` ほか） | 団体還元の送金 | 両アプリの Secrets | P18 着手前 | 未着手。オンボーディング方式も暫定（Express + Account Links `[Assumed]`） | 事業責任者 |
| `GOOGLE_MAPS_API_KEY` | ジオコーディング（DEV-10 §9） | `apps/public` の Secrets | **距離検索を実際に使う時点**（実装は済） | 未取得（TBD-40）。Geocoding API のみへの API 制限 + 課金設定が要る | Tech Lead（課金は事業責任者） |
| SMS プロバイダ + そのキー | 電話番号確認（F-01-02） | `apps/public` の Secrets | **本番の最初の予約まで** | プロバイダ未選定（TBD-61）。確認フローは実装済みで、送信だけログ出力 | Tech Lead |
| Cloudflare リソース ID | D1 / R2 / KV の staging・production | `wrangler.jsonc` | staging デプロイ前 | すべて `replace-with-…` のプレースホルダ | Tech Lead |
| Cloudflare Access のアプリ設定 | `apps/admin` の前段ゲート（D-031） | Cloudflare ダッシュボード | staging デプロイ前 | コードは投入済み。**TBD-60（`ctx.access` が渡るか）を初回デプロイで実測する** | Tech Lead |
| 確定ドメイン | 全体（`APP_URL` / メール / Access） | DNS・各 `vars` | リリース 60 日前 | 未取得（TBD-37。ブランド名 TBD-35 と連動） | 事業責任者 |
| （不要）`R2_ACCESS_KEY_ID` ほか | presigned URL 方式 | — | — | **不要**。D-024 で API Route + 署名トークン方式に決定済み | — |
| （未採用）`GOOGLE_CLIENT_*` / `SENTRY_DSN` | ソーシャルログイン / エラー監視 | — | 採用時 | 未採用 | — |

---

## 4. いま着手できる作業（外部手配を待たないもの）

1. **P15（実施記録）** — `walk_records` の必須 FK は `walk_slot_id` だけで、予約行への FK は無い。
   P16 と同じ理屈で P12 を待たずに実装できる。ただし参加者側（SCR-26/27/28）は「確定した予約の
   参加者に記録を見せる」画面なので、P12 が入るまで実データでは空になる。**団体側（ADM-13/14）
   から着手するのが素直。**
2. **P14 の前半（TBD-58 の解決）** — `AdminOps` の RPC と admin 側の書き込みルートは、SYS-13〜16
   （決済・予約）を含めなければ P12 を待たずに定義できる。入れば SYS-10/12/20 の操作系と
   `edit-forms.spec.ts`（3 件 skip 中）が戻る。DEV-11 の依存（P13 → P14）を変えることになるので、
   先に DEV-11 を直す。
3. **P20 の一部** — 残りの KV レート制限（DEV-02 §7）とデータ保管期限の削除バッチは依存が無い。
4. **文面・法務系の TODO** — SCR-39/40 の規約・プライバシー本文は、法務レビュー結果が出れば
   差し替えるだけ（版番号は `legal.ts` の定数）。

**P12 は外部手配（Stripe 契約 + 料金確定）が揃うまで着手できない。** ここが現在のクリティカルパス。

---

## 5. 事業・法務の判断待ち（P0。すべて確認先は事業責任者）

| TBD | 内容 | これが無いと止まるもの |
| --- | --- | --- |
| TBD-01/02/03/05/08/09 | 決済手数料の負担・税・最低振込額 | P12・P18 |
| TBD-10/11/12 | 無料キャンセル期限・当日返金率・無断キャンセル | P13 |
| TBD-17/18/20 | 保険の要否・団体の保険加入・事故時の責任分担 | 画面文言と規約。**TBD-61（本人確認の水準）にも波及** |
| TBD-29 | 団体への振込サイクル | P18 |
| TBD-35/37 | ブランド名・ドメイン | メール・Access・`APP_URL`・法務表記 |
| TBD-38/39 | メールドメイン認証・Stripe 本番設定 | 本番の通知と決済 |

P1 の技術的未決は TBD-40（Maps）・TBD-58（admin の書き込み経路）・TBD-59（詳細ページのサイトマップ）・
TBD-60（Access の実測）・TBD-61（SMS）の 5 つ。

---

## 6. ドキュメント側の不整合（本書を消す前に直すもの）

1. **DEV-11 §3 の `状態` 列が古い。** P8〜P11・P16・P17 は完了しているが「進行中」「未着手」のまま。
2. **DEV-11 §3-6 の P16 行に `OPS_ALERT_EMAIL` が残っている。** 実装とDEV-10 §11 の正本は
   `MAIL_ADMIN_ALERTS`（同じ行の申し送り ② が正しい）。
3. **DEV-11 §2 の Mermaid 図が `P15 --> P16` のまま。** §3-6 の表では「~~P15~~ なし」に訂正済みで、
   図と表が食い違っている。
4. GOV-02 TBD-61 の期限欄は「P11 着手前 → 本番の最初の予約まで」に更新済み。P11 完了を反映した
   記述になっているので、こちらは追随不要。
