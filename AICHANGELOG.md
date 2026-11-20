# AICHANGELOG.md

本ファイルは、AIエージェントによる作業内容、変更理由、および影響範囲を記録する変更履歴です。

## [2026-11-20] 【全体レビュー】仕様整合性点検・会計/リバートエッジケース保護強化・仕様書最新化および全テスト検証

### 1. 概要
`/review` スキルに基づき、`for_agent/` 配下の全仕様書と実装コード全体（Phase 14 貯蓄目標管理、Phase 15 定例支払いテンプレート管理および既存の会計・24時間リバート処理）を突き合わせ点検した。精査により発見した会計整合性・履歴保護のエッジケースを改修し、単体テスト・E2E総合テスト・仕様書およびガードレールを最新化した上で、型チェック・本番フルビルド・全10種単体テスト・実サーバー E2E 総合テスト（全18カテゴリ）およびエッジケース実機検証をすべて実施・合格確認した。

### 2. 変更内容 (Before / After)
1. **定例支払い精算時の積立受入口座二重加算防止 (`src/app/api/recurring-templates/route.ts`)**:
   - Before: `settleRecurringTransactionInTx()` で `txRecord.toAccountId` への残高加算を `existingLinked`（既存受入明細）の有無確認前に無条件実行していたため、既に受入明細が存在する明細（非定例クレカ積立投資等）を手動精算した場合に受入口座へ二重加算される恐れがあった。
   - After: 連動受入明細（`parentTransactionId === txRecord.id`）の存在を先に確認し、未存在（`!existingLinked`）の場合にのみ受入口座加算と受入明細作成を行う構造へ修正した。
2. **24時間チェックポイントリバート時の二重返戻防止・既存明細精算ロールバック・`lastGeneratedMonth` 再同期 (`src/app/api/admin/revert/route.ts`)**:
   - Before: チェックポイント以降に作成され既に論理削除（`deletedAt != null`）で残高ロールバック済みの明細にも残高返戻が再度走り二重返戻となるエッジケース、チェックポイント以前の作成明細がチェックポイント以降に手動/自動精算された場合の残高巻き戻し漏れ、およびリバートで削除された定例支払い予定明細に紐づく `recurring_templates.last_generated_month` が更新されたまま残る不整合が存在した。
   - After: 論理削除済み明細（`t.deletedAt != null`）を残高逆算からスキップして二重返戻を防止し、チェックポイント以降に `isSettled: false -> true` となった既存明細の残高復元と `isSettled = false` 復帰（受入明細削除有無に応じた二重減額防止含む）、およびリバート対象テンプレートの `lastGeneratedMonth` を残存未削除親明細の最新サイクル月（なければ `null`）へ再同期する処理を追加した。
3. **アーカイブ済み貯蓄目標の直接編集保護ガード追加 (`src/app/api/goals/route.ts`)**:
   - Before: `PUT /api/goals`（`action: "update"`）が `target.isArchived === true` の目標に対しても直接編集を受け付けていた。
   - After: アーカイブ済み目標の直接編集を `400 Bad Request`（「アーカイブ済みの目標は直接編集できません。先に進行中一覧へ復元してください。」）で拒否し、達成履歴の保護と UI 仕様の整合性を強化した。
4. **明細更新時の監査ログ記録値の正規化修正 (`src/app/api/transactions/route.ts`)**:
   - Before: `PUT /api/transactions` の監査ログ `afterDataJson` に未正規化の `categoryId` を記録していた。
   - After: 正規化後の `targetCategoryId` を記録するよう修正した。
5. **単体テスト・総合テスト・仕様書・ガードレールの同期更新**:
   - `scripts/test-goals-unit.ts`, `scripts/test-recurring-unit.ts`, `scripts/comprehensive-test.ts`: 今回のエッジケース保護（アーカイブ済み目標直接編集拒否、精算時受入二重加算防止、24hリバート二重返戻防止・精算ロールバック・`lastGeneratedMonth` 再同期）の検証アサーションを追加した。
   - `for_agent/00_system_overview.md`, `for_agent/04_api_specifications.md`, `for_agent/guardrails.md`: 最新機能概要およびエッジケース保護仕様・再発防止ガードレール（3.5節）を反映し、各ファイルの改訂履歴を追記した。

### 3. 変更理由
- 全機能実装後の総合レビューにおいて、実運用時の複雑な操作シーケンス（明細作成→論理削除→24hリバート、定例予定生成→別チェックポイントでの精算→24hリバート、アーカイブ済み目標への直接API更新）における残高・データ不整合リスクを未然に解消し、仕様書正本と実装の完全一致を保証するため。

### 4. 影響範囲・検証結果
- 変更ファイル: `src/app/api/recurring-templates/route.ts`, `src/app/api/admin/revert/route.ts`, `src/app/api/goals/route.ts`, `src/app/api/transactions/route.ts`, `scripts/test-goals-unit.ts`, `scripts/test-recurring-unit.ts`, `scripts/comprehensive-test.ts`, `for_agent/00_system_overview.md`, `for_agent/04_api_specifications.md`, `for_agent/guardrails.md`, `AICHANGELOG.md`
- 検証結果:
  - `npx tsc --noEmit`: 終了コード 0
  - `npm run build`: 終了コード 0（全24ルート・Standalone 本番ビルド成功）
  - `npm run db:migrate`: 終了コード 0
  - 全10種単体テスト（`test-csv-unit.ts`, `test-members-unit.ts`, `test-auth-session-unit.ts`, `test-rate-limit-csrf.ts`, `test-categories-unit.ts`, `test-unit-calculator.ts`, `test-household-approval-unit.ts`, `test-goals-unit.ts`, `test-recurring-unit.ts`, `test-security-unit.ts`）: 全テスト合格・終了コード 0（`raw.unsafe` 0件）
  - `npx tsx scripts/comprehensive-test.ts`（ローカル PostgreSQL ポート5532・開発サーバー ポート3080 起動下）: 全18カテゴリ完全合格・終了コード 0
  - エッジケース実機検証スクリプト（論理削除済明細リバート二重返戻防止、定例精算チェックポイントリバート残高/未精算復帰、リバート後 `lastGeneratedMonth` 再同期）: 全アサーション合格・終了コード 0（検証後、起動した開発サーバー停止済み）

## [2026-11-20] 【Phase 15.4】定例支払いテンプレート機能の単体テスト・E2E総合テスト追加と検証完了

### 1. 概要
要件 2-8 および `Plan.md` Phase 15.4 に基づき、定例支払い（月次固定費・口座間振替）テンプレート管理および自動支払い予定明細追加・精算機能の単体テスト（`scripts/test-recurring-unit.ts`）を新規作成し、E2E総合テスト（`scripts/comprehensive-test.ts`）および運用・検証ガイド（`for_agent/06_operation_and_testing_guide.md`）を更新して全検証を実施した。

### 2. 変更内容 (Before / After)
1. **定例支払いテンプレート単体テストの新規作成 (`scripts/test-recurring-unit.ts`)**:
   - Before: `src/lib/recurring-helpers.ts` のバリデーション・サイクル計算・冪等性・自動精算判定ロジックを単独で網羅検証する単体テストスクリプトが存在しなかった。
   - After: 支払基準日（1〜28日・99:月末）およびテンプレート入力バリデーション、クレジットカード規定引き落とし日（`withdrawalDay || 27`）自動連動、「規定支払日の翌日」からの翌月サイクル・年月跨ぎ・月末丸め込み算出、二重生成防止（`shouldGenerateRecurringCycle`）、支払日到来時の非クレカ自動精算判定（`isDueForAutoSettlement`）、および API/UI 静的コード検査を網羅する単体テストを実装した。
2. **E2E 総合テストの拡充 (`scripts/comprehensive-test.ts`)**:
   - Before: 17カテゴリまでが検証対象で、定例支払いテンプレートおよび月次自動同期・精算フローが含まれていなかった。
   - After: セクション 18「定例支払いテンプレート管理 & 自動支払い予定・精算テスト」を追加し、クレカ規定引き落とし日自動適用、テンプレート編集・一時停止/再開、非クレカ支出の未精算生成〜支払日到来自動精算〜同日再同期冪等性〜支払日翌日同期による翌月サイクル生成、手動確定精算、定例口座間振替の双方向残高連動、テンプレート削除後の生成済み明細保持、およびテストデータクリーンアップを一気通貫で検証できるようにした。
3. **検証ガイド・進捗管理の更新 (`for_agent/06_operation_and_testing_guide.md`, `Plan.md`)**:
   - `for_agent/06_operation_and_testing_guide.md` の単体テスト一覧と改訂履歴に `test-recurring-unit.ts` を追記し、`Plan.md` Phase 15（および 15.4）を完了済み（`[x]`）に更新した。

### 3. 変更理由
- 定例支払いテンプレート機能の境界値・月次サイクル遷移・冪等性・残高整合性を継続的かつ客観的に検証可能にし、Phase 15 の全要件を完了させるため。

### 4. 影響範囲・検証結果
- 変更・新規作成ファイル: `scripts/test-recurring-unit.ts`（新規）, `scripts/comprehensive-test.ts`, `for_agent/06_operation_and_testing_guide.md`, `Plan.md`, `AICHANGELOG.md`
- 検証結果:
  - `npx tsc --noEmit`: 終了コード 0
  - `npm run build`: 終了コード 0（24ルートビルド成功）
  - `npm run db:migrate`: 終了コード 0
  - `npx tsx scripts/test-recurring-unit.ts`: 全アサーション合格・終了コード 0
  - `npx tsx scripts/test-security-unit.ts`: 全テスト合格（`raw.unsafe` 0件）・終了コード 0
  - `npx tsx scripts/test-goals-unit.ts`: 全テスト合格・終了コード 0
  - `npx tsx scripts/comprehensive-test.ts`（ローカル PostgreSQL ポート5532・開発サーバー ポート3080 起動下）: 全18カテゴリ合格・終了コード 0（検証後、起動した開発サーバー停止済み）

## [2026-11-20] 【Phase 15.3】記帳タブ内「定例支払いテンプレート管理」UIおよびアプリ起動時自動同期の実装

### 1. 概要
要件 2-8 および `Plan.md` Phase 15.3 に基づき、記帳タブ（`RegisterTab.tsx`）内に「定例支払いテンプレート管理」セクション（`RecurringTemplatesSection.tsx`）を新設するとともに、ログイン・データ取得時（`src/app/page.tsx`）の `/api/recurring-templates?autoSync=true` 自動同期・トースト通知、明細検索タブ（`SearchTab.tsx`）での未精算定例予定バッジ表示、および日英翻訳キー（`src/lib/i18n.ts`）を実装した。

### 2. 変更内容 (Before / After)
1. **日英多言語翻訳辞書の拡張 (`src/lib/i18n.ts`)**:
   - Before: 定例支払いテンプレート管理、支払日連動案内、未精算支払い予定、手動精算確定、および自動同期トースト用の翻訳キーが未定義だった。
   - After: `translations.ja.recurring` および `translations.en.recurring` を追加し、UI ラベル・案内文・ステータスバッジ・確認ダイアログ・自動同期トーストを日英両対応で整備した。
2. **定例支払いテンプレート管理UIコンポーネントの新規作成 (`src/components/RecurringTemplatesSection.tsx`)**:
   - Before: 画面上から定例支払いテンプレートを作成・編集・一時停止・削除・手動同期・精算する UI が存在しなかった。
   - After:
     - 「定例支出（クレカ・口座引落・積立等）」と「定例口座間振替（資金移動）」の種別切替に対応した作成・編集共通モーダルを実装した。
     - クレジットカード選択時はカード規定の引き落とし日（`withdrawalDay`、未設定時は 27 日）を自動表示して日付手入力を不要とし、非クレカ支出・口座間振替選択時は `1〜28日` または `99: 月末` のセレクトボックスを表示して「支払日の翌日に次回サイクル分が自動追加される」案内を表示するようにした。
     - 登録済みテンプレート一覧カードに種別・状態・クレカ連動バッジ・費目/決済手段/口座・支払日・最終生成サイクルを表示し、編集・有効/一時停止トグル・削除（生成済み明細保持の確認モーダル付き）操作および「今すぐ月次同期」ボタンを実装した。
     - `transactions` から未精算の定例支払い予定明細（`Boolean(tx.recurringTemplateId) && !tx.isSettled`）を抽出し、予定日と「今すぐ精算 (残高反映)」ボタンを配置した。
3. **記帳タブ・メイン画面・明細一覧の連携 (`src/components/RegisterTab.tsx`, `src/app/page.tsx`, `src/components/SearchTab.tsx`)**:
   - Before: `src/app/page.tsx` の `fetchAllData()` で `/api/recurring-templates?autoSync=true` が呼ばれておらず、`RegisterTab.tsx` にもテンプレート管理 UI が組み込まれていなかった。また `SearchTab.tsx` で未精算の定例予定明細を識別するバッジがなかった。
   - After:
     - `src/app/page.tsx`: `fetchAllData()` の冒頭で `/api/recurring-templates?autoSync=true` を実行し、自動生成または自動精算が行われた場合にトースト通知を表示した上で、最新の口座残高・明細等を取得するよう実装した。また `recurringTemplates`・`transactions`・`onRefreshData` を `RegisterTab` に渡した。
     - `src/components/RegisterTab.tsx`: `RecurringTemplatesSection` を記帳タブ内に組み込んだ。
     - `src/components/SearchTab.tsx`: 定例支払い由来の未精算明細に対し「支払い予定 (未精算) (YYYY-MM-DD)」バッジを表示するようにした。

### 3. 変更理由
- 毎月の固定費・積立投資・定期振替をUIから直感的にテンプレート管理し、アプリ利用開始時の自動同期による予定明細追加・自動精算と手動精算確定、および明細検索画面での視認性を確保するため。

### 4. 影響範囲・検証結果
- 変更・新規作成ファイル: `src/lib/i18n.ts`, `src/components/RecurringTemplatesSection.tsx`（新規）, `src/components/RegisterTab.tsx`, `src/app/page.tsx`, `src/components/SearchTab.tsx`, `Plan.md`, `AICHANGELOG.md`
- 検証結果:
  - `npx tsc --noEmit`: 終了コード 0
  - `npm run build`: 終了コード 0（24ルートビルド成功）
  - `npm run db:migrate`: 終了コード 0
  - `npx tsx scripts/test-security-unit.ts`: 全テスト合格（`raw.unsafe` 0件）・終了コード 0
  - `npx tsx scripts/test-unit-calculator.ts`: 全テスト合格・終了コード 0
  - `npx tsx scripts/comprehensive-test.ts`（ローカル開発サーバー ポート3080 起動下）: 全17カテゴリ合格・終了コード 0
  - Playwright による実ブラウザ E2E 動作検証（Edge headless / `http://localhost:3080`）: ログイン時の `/api/recurring-templates?autoSync=true` 呼び出し、記帳タブ内テンプレート管理セクション表示、クレカ規定引き落とし日自動連動表示、非クレカ・口座間振替フォーム切替、テンプレート作成・手動同期・`SearchTab` 未精算バッジ表示・一時停止/再開・編集・手動精算・削除（およびテスト明細クリーンアップ）の全フローがコンソール/ページエラー 0 件でパス（検証後サーバー停止済み）

## [2026-11-20] 【Phase 15.2】定例支払いテンプレート & 月次自動追加・精算 API の実装

### 1. 概要
要件 2-8 および `Plan.md` Phase 15.2 に基づき、定例支払い（月次固定費・口座間振替）テンプレートの CRUD・月次支払い予定明細の自動追加・支払日到来分および手動確定による精算 API（`/api/recurring-templates`）を新規実装するとともに、`GET/PUT/DELETE /api/transactions` および `POST /api/admin/revert` における未精算定例予定明細の残高整合性保護を実装した。

### 2. 変更内容 (Before / After)
1. **定例支払いテンプレート & 月次同期・精算 API の新規実装 (`src/app/api/recurring-templates/route.ts`)**:
   - Before: 定例支払いテンプレートを操作・同期・精算する API エンドポイントが存在しなかった。
   - After:
     - `GET /api/recurring-templates`: 費目・決済手段・口座情報を結合したテンプレート一覧を返却。`autoSync=true` 指定時は `db.transaction()` 内で現在日付（JST）基準の未生成サイクル分の支払い予定明細（`isSettled: false`）生成と支払予定日到来済み非クレカ明細の自動口座残高精算を冪等に実行し、`syncResult: { generatedCount, settledCount }` とともに返却する。
     - `POST /api/recurring-templates`: 新規テンプレート登録（`action: "create"` または省略時、クレカ決済時はカードの `withdrawalDay` を自動適用、有効時は初回対象サイクルの支払い予定明細を同時生成）、月次同期手動実行（`action: "sync"`）、および未精算支払い予定明細の手動確定精算（`action: "settle"`、二重精算防止・積立受入明細生成・チェックポイント/監査ログ記録対応）を実装した。
     - `PUT /api/recurring-templates`: テンプレート内容編集（`action: "update"`）および有効/一時停止切替（`action: "toggle"`）と監査ログ記録を実装した。
     - `DELETE /api/recurring-templates?id=...`: テンプレートの物理削除（生成済み明細は `transactions` に保持）および監査ログ記録を実装した。
2. **明細 API の `recurringTemplateId` 返却と未精算予定明細の残高保護 (`src/app/api/transactions/route.ts`)**:
   - Before: `GET /api/transactions` に `recurringTemplateId` が含まれておらず、`PUT` / `DELETE` では `transfer` の無条件精算や `expense` の `toAccountId` ロールバックが `isSettled` や未精算定例明細かを区別せずに走っていた。また出金元口座特定ロジックが重複していた。
   - After: `GET` に `recurringTemplateId` を追加し、共通ヘルパー `resolveExpenseSourceAccountId`（`fromAccountId` フォールバック含む）へ整理したうえで、未精算の定例支払い予定明細（`Boolean(existingTx.recurringTemplateId) && !existingTx.isSettled`）の編集・削除時は口座残高の二重減額・誤減額・勝手な精算済み化や受入明細生成が起きないよう保護した。
3. **24時間リバート API の未精算定例明細保護・出金元フォールバック対応 (`src/app/api/admin/revert/route.ts`)**:
   - Before: `expense` のリバート時に `paymentMethodId` 経由の口座解決のみ行っており、`fromAccountId` 指定で精算された定例支出の返戻フォールバックがなかった。
   - After: 未精算の定例予定明細（`!t.isSettled && t.recurringTemplateId`）を残高逆算から確実に除外するとともに、精算済み支出明細の `fromAccountId` フォールバック返戻に対応した。

### 3. 変更理由
- 月次の固定費・積立・口座間振替をテンプレート化し、支払予定日到来前でも未精算の予定明細として家計簿・クレカ引き落とし予測へ計上しつつ、実際の口座残高への影響は支払予定日到来時または手動精算確定時のみに限定して会計整合性を保つため。

### 4. 影響範囲・検証結果
- 変更・新規作成ファイル: `src/app/api/recurring-templates/route.ts`（新規）, `src/app/api/transactions/route.ts`, `src/app/api/admin/revert/route.ts`, `Plan.md`, `AICHANGELOG.md`
- 検証結果:
  - `npx tsc --noEmit`: 終了コード 0
  - `npm run build`: 終了コード 0（`/api/recurring-templates` 含む 24 ルートビルド成功）
  - `npm run db:migrate`: 終了コード 0
  - `npx tsx scripts/test-security-unit.ts`: 全テスト合格（`raw.unsafe` 0件）・終了コード 0
  - `npx tsx scripts/comprehensive-test.ts`（ローカル開発サーバー ポート3080 起動下）: 全17カテゴリ合格・終了コード 0
  - 実機 API 検証スクリプト（`verify-recurring-api.ts`, `verify-recurring-revert.ts`）: クレカ規定支払日連動、未精算予定明細の PUT/DELETE 保護、月次同期（自動精算・冪等性）、手動確定精算・二重精算拒否、テンプレート編集/一時停止/削除（生成明細保持）、24時間リバート時の未精算/精算済み残高整合性、および全口座残高の完全回復を確認（検証後開発サーバー停止済み）


## [2026-11-20] 【Phase 15.1】定例支払いテンプレート用DBスキーマ・マイグレーション・型定義・月次サイクル計算ヘルパーの実装

### 1. 概要
要件 2-8 および `Plan.md` Phase 15.1 に基づき、定例支払い（月次固定費・口座間振替）テンプレート管理および自動支払い予定明細追加機能の基盤となるテナントDBスキーマ定義（`recurring_templates` および `transactions.recurring_template_id`）、冪等マイグレーション DDL・インデックス、TypeScript 型定義、ならびにバリデーション・月次サイクル算出・自動精算判定純粋関数ヘルパー（`src/lib/recurring-helpers.ts`）を実装した。

### 2. 変更内容 (Before / After)
1. **テナントDBスキーマ定義の拡張 (`src/db/schema/tenant.ts`)**:
   - Before: `recurring_templates` テーブルおよび `transactions.recurringTemplateId` カラムが未定義だった。
   - After: `recurringTemplates` テーブル（`id`, `userId`, `type`, `title`, `amount`, `categoryId`, `paymentMethodId`, `fromAccountId`, `toAccountId`, `dayOfMonth`, `note`, `isActive`, `lastGeneratedMonth`, `createdAt`, `updatedAt`）と `transactions.recurringTemplateId` カラムを追加した。
2. **テナントマイグレーション DDL・インデックスの追加 (`src/db/migrate.ts`)**:
   - Before: テナント作成・更新時に定例支払い用テーブル・カラムが作成されなかった。
   - After: `createTenantTables()` に `recurring_templates` テーブル作成 DDL、`transactions.recurring_template_id` カラム作成および既存テナント向け `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`、さらに `idx_*_tx_recurring_tpl` および `idx_*_recurring_tpl_active` インデックスを追加した。
3. **型定義の追加 (`src/types/index.ts`)**:
   - Before: 定例支払いテンプレート型が未定義で、`TransactionItem` にも `recurringTemplateId` がなかった。
   - After: `RecurringTemplateType` (`"expense" | "transfer"`) および `RecurringTemplateItem` 型を新設し、`TransactionItem` に `recurringTemplateId?: string` を追加した。
4. **定例支払いバリデーション・月次サイクル算出ヘルパーの新規作成 (`src/lib/recurring-helpers.ts`)**:
   - Before: 定例支払いテンプレートの入力検証、クレカ引き落とし日自動適用、および月次サイクル判定ロジックが存在しなかった。
   - After: `validateRecurringTemplateInput`（名称 1〜150文字、金額 `1〜9,999,999,999`、種別 `expense | transfer`、振替時の `fromAccountId !== toAccountId` 必須、支払基準日 `1〜28` / `99`:月末）、`resolveEffectiveDayOfMonth`（クレカ選択時の `withdrawalDay || 27` 自動適用）、`resolveTargetCycleAndDates`（基準日当日までは当月 `YYYY-MM`、翌日以降は翌月 `YYYY-(MM+1)` を算出するタイムゾーン非依存純粋関数）、`shouldGenerateRecurringCycle`（二重生成防止）、および `isDueForAutoSettlement`（支払予定日到来済み・未精算・非クレカ明細の自動精算判定）を実装した。

### 3. 変更理由
- 後続の Phase 15.2（`/api/recurring-templates` API および `transactions` / `revert` 連携）および Phase 15.3（記帳タブ UI・自動同期）で安全かつ一貫したデータモデル・月次サイクル判定を利用できるようにするため。

### 4. 影響範囲・検証結果
- 変更・新規作成ファイル: `src/db/schema/tenant.ts`, `src/db/migrate.ts`, `src/types/index.ts`, `src/lib/recurring-helpers.ts`, `Plan.md`, `AICHANGELOG.md`
- 検証結果:
  - `npx tsc --noEmit`: 終了コード 0
  - `npm run build`: 終了コード 0（23ルートビルド成功）
  - `npm run db:up` / `npm run db:seed` / `npm run db:migrate`: 終了コード 0（`tenant_yamada_001` への `recurring_templates` テーブル・`recurring_template_id` カラム・インデックス反映確認）
  - `npx tsx scripts/test-security-unit.ts`: 全テスト合格・終了コード 0
  - `npx tsx scripts/test-goals-unit.ts`: 全テスト合格・終了コード 0
  - `npx tsx scripts/comprehensive-test.ts`（ローカル開発サーバー ポート3080 起動下）: 全17カテゴリ合格・終了コード 0（検証後サーバー停止済み）


## [2026-11-20] 【運用ルール改訂】ローカル開発サーバー・PostgreSQL起動による動作検証の原則必須化

### 1. 概要
ユーザーの指示に基づき、機能実装および API・DB・UI 変更時の検証ルールを改訂し、静的検証（型チェック・ビルド・DB不要単体テスト）だけでなく、原則としてローカルの PostgreSQL（ポート 5532）および Next.js 開発サーバー（`npm run dev` / ポート 3080）を起動して `scripts/comprehensive-test.ts` 等の総合動作検証を実施するよう、プロジェクト設定・ガードレール・検証ガイド・各スキル指示書へ追記した。

### 2. 変更内容 (Before / After)
1. **`AGENTS.md` (第2章)**:
   - Before: 総合テストに「（※開発サーバー起動時）」と記載されており、未起動時に省略可能と解釈される余地があった。
   - After: 機能追加・API/DB/UI 修正時は原則としてローカル PostgreSQL・開発サーバーを起動して総合テストおよび実動作検証を実施する旨と、未起動時の起動手順・例外基準を明記した。
2. **`for_agent/guardrails.md` (第1章1.3・改訂履歴)**:
   - Before: DB 未起動時は静的検証を Ground Truth とする記載が、未起動時の省略理由になり得る表現だった。
   - After: 未起動時の起動手順（`npm run db:up`, `npm run db:migrate`, `npm run dev`）および検証後のサーバー停止手順を明記し、単なる「未起動」を理由としたスキップを禁止（Docker デーモン不可等の真の環境制約時のみ具体的障害理由を報告）するガードレールへ改訂した。
3. **`for_agent/06_operation_and_testing_guide.md` (第2章2.3・改訂履歴)**:
   - Before: DB・サーバー起動済み前提のコマンド記載のみだった。
   - After: 原則必須の明記と起動〜検証〜停止フローを追記した。
4. **`.agent/skills/loop-step/SKILL.md` & `.agent/skills/review/SKILL.md`**:
   - Before: `AGENTS.md` の検証コマンド実行やフルビルド・テスト実行の指示のみだった。
   - After: ローカルの PostgreSQL および開発サーバーを起動して `scripts/comprehensive-test.ts` 等の動作検証を行う原則を追記した。

### 3. 変更理由
- ローカル開発サーバーを起動した実環境ベースでの API・DB・UI 動作検証を確実に実施する運用を徹底するため。

### 4. 影響範囲
- 更新ファイル: `AGENTS.md`, `for_agent/guardrails.md`, `for_agent/06_operation_and_testing_guide.md`, `.agent/skills/loop-step/SKILL.md`, `.agent/skills/review/SKILL.md`, `AICHANGELOG.md`


## [2026-11-20] 【Phase 14.4】貯蓄目標の単体テスト・E2E総合テスト追加・仕様書同期およびビルド検証

### 1. 概要
要件 17-2 および `Plan.md` Phase 14.4 に基づき、貯蓄目標管理（入力バリデーション・達成判定・未達成のみ削除可/達成済み削除保護・達成済みアーカイブ/復元・アーカイブ除外合算進捗集計）の単体テスト（`scripts/test-goals-unit.ts`）を新規作成し、E2E総合テスト（`scripts/comprehensive-test.ts`）および検証ガイド（`for_agent/06_operation_and_testing_guide.md`, `README.md`）へテスト項目を反映した上で、型チェック・本番ビルド・単体テストによる検証を実施した。

### 2. 変更内容 (Before / After)
1. **貯蓄目標単体テストの新規作成 (`scripts/test-goals-unit.ts`)**:
   - Before: `src/lib/goal-helpers.ts` および `/api/goals`・`GoalsTab.tsx` の貯蓄目標保護・集計ロジックを検証する単体テストが存在しなかった。
   - After: 日付妥当性（閏年・非閏年・存在しない日付）、`validateGoalInput` の正常系/境界値（1円〜9,999,999,999円、100文字）/異常系、口座残高合算・達成率・`isGoalAchieved`、`canDeleteGoal`（未達成のみ許可・達成済み/アーカイブ済み拒否）、`canArchiveGoal` / `canRestoreGoal`、`calculateActiveGoalsSummary`（アーカイブ済み除外合算）、および API/UI ソースに対する静的ガードレール検査を網羅する単体テストを実装した。
2. **E2E 総合テストへの貯蓄目標検証フロー追記 (`scripts/comprehensive-test.ts`)**:
   - Before: `scripts/comprehensive-test.ts` に貯蓄目標（`/api/goals`）の編集・削除保護・アーカイブ/復元の検証シナリオが存在しなかった。
   - After: セクション 17（貯蓄目標 CRUD・削除保護・アーカイブ/復元テスト）を追記し、未達成目標の作成・編集・アーカイブ拒否（400）・物理削除、ならびに達成済み目標の削除拒否（400）・アーカイブ・アーカイブ状態での削除拒否（400）・復元およびテストデータクリーンアップの一連の検証を追加した。
3. **検証ドキュメントの同期 (`for_agent/06_operation_and_testing_guide.md`, `README.md`)**:
   - Before: 単体テストコマンド一覧に `scripts/test-goals-unit.ts` の記載がなかった。
   - After: 単体テストコマンド一覧および `06_operation_and_testing_guide.md` の改訂履歴に `test-goals-unit.ts` を追記した。

### 3. 変更理由
- 要件 17-2 で導入した達成済み・アーカイブ済み貯蓄目標の削除保護および進行中合算進捗集計の整合性を自動テストによって継続的に担保し、開発・検証手順書とテスト資産の同期を完了するため。

### 4. 影響範囲・検証結果
- 変更・新規作成ファイル: `scripts/test-goals-unit.ts`, `scripts/comprehensive-test.ts`, `for_agent/06_operation_and_testing_guide.md`, `README.md`, `Plan.md`, `AICHANGELOG.md`
- 検証結果:
  - `npx tsc --noEmit`: 終了コード 0
  - `npm run build`: 終了コード 0（23ルートビルド成功）
  - `npx tsx scripts/test-goals-unit.ts`: 全テスト合格・終了コード 0
  - `npx tsx scripts/test-security-unit.ts`: 全テスト合格・終了コード 0
  - ※ ローカル DB (ポート 5532) および開発サーバー (ポート 3080) は未起動のため、`scripts/comprehensive-test.ts` の実行は `tsc --noEmit` による静的型検証までを実施。


## [2026-11-20] 【Phase 14.3】目標・成長タブ UI (`GoalsTab.tsx`) における目標編集・削除・アーカイブ/復元UIの実装

### 1. 概要
要件 17-2 および `Plan.md` Phase 14.3 に基づき、`src/components/GoalsTab.tsx` を改修し、進行中目標とアーカイブ済み目標の分離、アーカイブ済み目標の集計除外（合算進捗・まめの樹育成・やさしいアドバイス）、作成/編集共通モーダル、未達成目標の確認モーダル付き物理削除、達成済み目標の削除保護＆アーカイブ、およびアーカイブ済み目標の表示トグルと進行中への復元UIを実装した。

### 2. 変更内容 (Before / After)
1. **進行中・アーカイブ済み目標の分離と集計対象の限定 (`src/components/GoalsTab.tsx`)**:
   - Before: すべての `goals` 配列を区別なく合算進捗・まめの樹育成・やさしいアドバイス・一覧カードに表示していた。
   - After: `activeGoals`（`!g.isArchived`）と `archivedGoals`（`Boolean(g.isArchived)`）に分離し、`calculateActiveGoalsSummary(goals)` を用いて「進行中目標の合算進捗（全体達成率）」「まめの樹育成システム」「こまめからのやさしいアドバイス」の集計対象を進行中（未アーカイブ）目標のみに限定した。
2. **目標の作成・編集共通モーダル実装**:
   - Before: 新規目標作成専用のモーダルしか存在せず、既存目標の編集ができなかった。
   - After: 各進行中目標カードに「編集」ボタンを追加し、新規作成・編集共通のモーダル（`openCreateModal` / `openEditModal`）でタイトル・目標金額・達成予定日・集計対象口座・テーマカラーを編集して `PUT /api/goals` (`action: "update"`) で保存できるようにした。送信前には `validateGoalInput` による境界値・形式チェックを行う。
3. **未達成目標の削除確認UIと達成済み目標の削除保護・アーカイブ**:
   - Before: 目標の削除やアーカイブを行う UI が存在しなかった。
   - After: `isGoalAchieved` 判定に基づき、未達成目標カードには「削除」ボタン（誤操作防止の削除確認モーダル経由で `DELETE /api/goals?id=...` 実行）を配置し、達成済み目標カードには削除ボタンを表示せず「アーカイブ」ボタン（`PUT /api/goals` `action: "archive"`）を配置した。
4. **アーカイブ済み目標の表示トグルと復元UI**:
   - Before: アーカイブ済み目標の閲覧および進行中への復元 UI が存在しなかった。
   - After: 進捗一覧下部に「アーカイブ済みを表示（N件）」トグルを設け、展開時にアーカイブ済み達成目標カードを一覧表示し、「復元（進行中に戻す）」ボタン（`PUT /api/goals` `action: "restore"`）を実装した。アーカイブ済みカードでは削除・編集ボタンを非表示として達成履歴を保護した。

### 3. 変更理由
- 要件 17-2 に準拠し、利用者が目標の修正や不要な未達成目標の削除を安全に行えるようにしつつ、達成済み目標は削除せずアーカイブとして履歴保管・必要時の復元を可能にし、かつ達成済みアーカイブによって進行中目標の全体達成率や育成システムのバランスが歪まないようにするため。

### 4. 影響範囲・検証結果
- 変更ファイル: `src/components/GoalsTab.tsx`, `Plan.md`, `AICHANGELOG.md`
- 検証結果:
  - `npx tsc --noEmit`: 終了コード 0
  - `npm run build`: 終了コード 0（23ルートビルド成功）
  - `npx tsx scripts/test-security-unit.ts`: 全テスト合格・終了コード 0


## [2026-11-20] 【Phase 14.2】貯蓄目標 API (`/api/goals`) の拡張（編集・アーカイブ・復元・未達成削除・監査ログ連携）

### 1. 概要
要件 17-2 および `Plan.md` Phase 14.2 に基づき、`src/app/api/goals/route.ts` の貯蓄目標 API を拡張し、`GET` の作成順ソート・アーカイブ/達成状態返却、`POST` のヘルパー統一検証・監査ログ記録、`PUT` の目標編集（`update`）・達成済み目標アーカイブ（`archive`）・復元（`restore`）、および `DELETE` の達成済み/アーカイブ済み削除保護付き物理削除・監査ログ記録をトランザクション内で実装した。

### 2. 変更内容 (Before / After)
1. **`GET /api/goals` の拡張 (`src/app/api/goals/route.ts`)**:
   - Before: `savingsGoals` をソートなしで取得し、`currentAmount` と `progressRate` のみを単純付与して返却していた。
   - After: `createdAt ASC, id ASC` 順で進行中・アーカイブ済みの全件を取得し、`goal-helpers.ts` の `calculateGoalCurrentAmount` / `calculateGoalProgressRate` / `isGoalAchieved` を用いて `accountIdsJson`（正規化配列）・`isArchived`・`currentAmount`・`progressRate`・`isAchieved` を付与して返却するよう改修した。
2. **`POST /api/goals` のバリデーション統一・トランザクション・監査ログ連携**:
   - Before: タイトル・金額の基本検証のみで直接 INSERT しており、`isArchived` の明示指定や監査ログ記録がなかった。
   - After: `validateGoalInput` で全項目（タイトル 1〜100文字、金額 1〜9,999,999,999円整数、暦日 YYYY-MM-DD、口座ID配列重複排除、カラー `#RRGGBB`）を検証し、`db.transaction()` 内で `isCompleted: false, isArchived: false` として登録するとともに、`audit_logs`（`action: "CREATE", entityType: "savings_goal"`）を記録して返却するよう改修した。
3. **`PUT /api/goals` の新規実装（編集・アーカイブ・復元）**:
   - Before: `PUT` ハンドラが存在しなかった。
   - After: 以下の3モードを `db.transaction()` および監査ログ（`action: "UPDATE", entityType: "savings_goal"`, `beforeDataJson` / `afterDataJson`）付きで実装した：
     - `action: "update"`（省略時デフォルト）: `validateGoalInput` で検証後、タイトル・目標金額・達成予定日・対象口座ID配列・カラーを更新。
     - `action: "archive"`: 対象口座合算残高から `canArchiveGoal` で達成状態を検証し、達成済み（`currentAmount >= targetAmount || isCompleted`）かつ未アーカイブの場合のみ `isArchived = true, isCompleted = true` に更新（未達成や既アーカイブ時は `400 Bad Request` で拒否）。
     - `action: "restore"`: `canRestoreGoal` でアーカイブ済みであることを検証し、`isArchived = false` へ復元（未アーカイブ時は `400 Bad Request` で拒否）。
4. **`DELETE /api/goals?id=...` の新規実装（未達成削除・達成済み保護）**:
   - Before: `DELETE` ハンドラが存在しなかった。
   - After: 対象目標の対象口座合算残高から `canDeleteGoal` で削除可否を判定し、達成済みまたはアーカイブ済みの目標は `400 Bad Request` で削除を拒否。未達成かつ未アーカイブの目標のみ `db.transaction()` 内で物理削除し、`audit_logs`（`action: "DELETE", entityType: "savings_goal"`）を記録するよう実装した。

### 3. 変更理由
- 要件 17-2 に準拠し、世帯メンバー全員が貯蓄目標の編集・未達成目標の削除・達成済み目標のアーカイブ/復元を安全かつ監査可能な形で実行できるようにするため。

### 4. 影響範囲・検証結果
- 変更ファイル: `src/app/api/goals/route.ts`, `Plan.md`, `AICHANGELOG.md`
- 検証結果:
  - `npx tsc --noEmit`: 終了コード 0
  - `npm run build`: 終了コード 0（23ルートビルド成功）
  - `npx tsx scripts/test-security-unit.ts`: 全テスト合格・終了コード 0


## [2026-11-20] 【Phase 14.1】貯蓄目標のテナントDBスキーマ拡張・マイグレーション・型定義・バリデーションヘルパーの追加

### 1. 概要
要件 17-2 および `Plan.md` Phase 14.1 に基づき、貯蓄目標の編集・未達成目標削除・達成済み目標アーカイブ/復元機能の基盤となる DB スキーマ（`savings_goals.is_archived`）、マイグレーション DDL / `ALTER TABLE`、TypeScript 型定義（`SavingsGoalItem`）、および純粋関数によるバリデーション・達成判定・削除/アーカイブ可否判定・進行中合算進捗算出ヘルパー（`src/lib/goal-helpers.ts`）を実装した。

### 2. 変更内容 (Before / After)
1. **テナントDBスキーマ拡張 (`src/db/schema/tenant.ts`)**:
   - Before: `savingsGoals` テーブルにアーカイブ状態カラムが存在しなかった。
   - After: `isArchived: boolean("is_archived").default(false).notNull()` カラムを追加した。
2. **マイグレーション DDL および既存テナント向け ALTER 追加 (`src/db/migrate.ts`)**:
   - Before: `createTenantTables()` の `savings_goals` DDL に `is_archived` 列が含まれていなかった。
   - After: `CREATE TABLE IF NOT EXISTS "${schemaName}".savings_goals` に `is_archived BOOLEAN DEFAULT FALSE NOT NULL` を追加し、既存テナントスキーマ向けに `ALTER TABLE "${schemaName}".savings_goals ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE NOT NULL;` を追加した。
3. **型定義拡張 (`src/types/index.ts`)**:
   - Before: `SavingsGoalItem` に `isArchived`・`createdAt` プロパティが存在せず、`targetDate` が `null` を許容していなかった。
   - After: `SavingsGoalItem` に `isArchived?: boolean` および `createdAt?: string` を追加し、`targetDate?: string | null` とした。
4. **貯蓄目標ヘルパー新規作成 (`src/lib/goal-helpers.ts`)**:
   - Before: 貯蓄目標の入力検証・達成判定・削除/アーカイブ可否判定・未アーカイブ限定合算進捗算出の共通ロジックが存在しなかった。
   - After: 以下の純粋関数および定数を実装した：
     - `validateGoalInput`: タイトル（1〜100文字）、目標金額（`1 <= targetAmount <= 9,999,999,999` の安全な整数）、達成予定日（`YYYY-MM-DD` 暦日検証）、対象口座ID配列（重複排除）、テーマカラー（`#RRGGBB`）の検証。
     - `calculateGoalCurrentAmount` / `calculateGoalProgressRate`: 対象口座合算残高・達成率（0〜100%）の算出。
     - `isGoalAchieved(currentAmount, targetAmount, isCompleted)`: 達成状態判定。
     - `canDeleteGoal` / `canArchiveGoal` / `canRestoreGoal`: 未達成かつ未アーカイブのみ削除可・達成済みかつ未アーカイブのみアーカイブ可・アーカイブ済みのみ復元可の保護判定。
     - `calculateActiveGoalsSummary`: 進行中（未アーカイブ）目標のみを対象とした合算目標額・合算積立額・全体達成率・件数集計。

### 3. 変更理由
- 要件 17-2（貯蓄目標の編集・未達成削除・達成済みアーカイブ/復元）を後続の API（Phase 14.2）・UI（Phase 14.3）・単体テスト（Phase 14.4）で安全かつ一貫したロジックで実装できるようにするため。

### 4. 影響範囲・検証結果
- 変更・新規作成ファイル: `src/db/schema/tenant.ts`, `src/db/migrate.ts`, `src/types/index.ts`, `src/lib/goal-helpers.ts`, `Plan.md`, `AICHANGELOG.md`
- 検証結果:
  - `npx tsc --noEmit`: 終了コード 0
  - `npm run build`: 終了コード 0（23ルートビルド成功）
  - `npx tsx scripts/test-security-unit.ts`: 全テスト合格・終了コード 0


## [2026-11-19] 【全体レビュー (/review)】全仕様整合性点検・エッジケース保護強化・仕様書および手順書の最新化・フルビルド検証

### 1. 概要
`/review` スキルに基づき、`for_agent/` 配下の全仕様書（00〜06 および `guardrails.md`）と実装コード全体を突き合わせ、Phase 0〜Phase 13 の全要件実装状況およびエッジケースの点検を実施した。あわせて認証・招待・メンバー追加APIにおける初期デモ管理者アカウントおよび世帯承認ステータスの多層防御強化、仕様書・構築手順書・README の最新化を行い、フルビルドおよび全8種の単体テストスイートの正常終了（Exit Code 0）を確認した。

### 2. 変更内容 (Before / After)
1. **サインアップ・招待参加・家族メンバー追加APIのエッジケース多層防御強化 (`src/app/api/auth/signup/route.ts`, `src/app/api/auth/invite/route.ts`, `src/app/api/admin/members/route.ts`)**:
   - Before:
     - `POST /api/auth/signup`、`POST /api/auth/invite`、`POST /api/admin/members` において、本番環境（`NODE_ENV === "production"`）で初期デモ管理者メールアドレス（`admin@komame.local`）を指定した申請・招待参加・メンバー登録の明示的拒否が未実装だった（ログイン・セッションでは遮断済み）。
     - `GET / POST /api/auth/invite` において、招待リンク発行後に招待元世帯がシステム管理者により停止（`suspended`）された場合の `households.status` チェックが未適用だった。
   - After:
     - `signup` / `invite` / `members` の各エンドポイントで `isDemoAdminAllowed()` を検証し、本番環境での初期デモ管理者アカウントの登録・招待を `400 Bad Request` / `403 Forbidden` で拒否するよう強化。
     - `GET / POST /api/auth/invite` で `getHouseholdAccessError(household.status)` を検証し、承認済み（`approved`）以外の世帯への招待参加を `403 Forbidden` で遮断するよう強化。
2. **仕様書・手順書・README の最新化 (`for_agent/04_api_specifications.md`, `docs/environment_setup_guide.md`, `README.md`)**:
   - `for_agent/04_api_specifications.md`: 1.4 (`signup`) および 1.5 (`invite`) に初期デモ管理者アカウント除外および招待元世帯承認ステータス検証仕様を追記し、改訂履歴を更新。
   - `docs/environment_setup_guide.md`: 第5章「初期セットアップ」に新規世帯登録の申請・許可制フロー（Super Admin による承認手順）および初期デモ管理者アカウントのテスト環境限定有効化・本番無効化仕様を反映し、改訂履歴を更新。
   - `README.md`: Next.js `15.5.28` / Drizzle ORM `0.45.4` のバージョン表記更新、デモ管理者アカウントのテスト環境限定注記、および全8種の単体テストコマンド一覧を最新化。

### 3. 変更理由
- 全体レビューにおいて、初期デモ管理者アカウントの本番環境完全排除（要件 1-9）および世帯承認ステータス検証（要件 1-1, 1-2, 1-8）を招待・メンバー追加を含む全経路で抜け漏れなく担保し、ドキュメントと実装を100%一致させるため。

### 4. 影響範囲・検証結果
- 変更ファイル: `src/app/api/auth/signup/route.ts`, `src/app/api/auth/invite/route.ts`, `src/app/api/admin/members/route.ts`, `for_agent/04_api_specifications.md`, `docs/environment_setup_guide.md`, `README.md`, `AICHANGELOG.md`
- 検証結果:
  - `npx tsc --noEmit`: 終了コード 0（型エラー 0件）
  - `npm run build`: 終了コード 0（全23ルートビルド成功）
  - `npx tsx scripts/test-csv-unit.ts`: 全テスト合格（Exit Code 0）
  - `npx tsx scripts/test-members-unit.ts`: 全テスト合格（Exit Code 0）
  - `npx tsx scripts/test-auth-session-unit.ts`: 全テスト合格（Exit Code 0）
  - `npx tsx scripts/test-rate-limit-csrf.ts`: 全テスト合格（Exit Code 0）
  - `npx tsx scripts/test-categories-unit.ts`: 全テスト合格（Exit Code 0）
  - `npx tsx scripts/test-unit-calculator.ts`: 全テスト合格（Exit Code 0）
  - `npx tsx scripts/test-household-approval-unit.ts`: 全テスト合格（Exit Code 0）
  - `npx tsx scripts/test-security-unit.ts`: 全テスト合格（Exit Code 0）


## [2026-11-18] 【Phase 13.3】初期デモ管理者アカウント限定化の単体テスト・静的検査拡充および総合ビルド検証

### 1. 概要
要件 1-9 および `Plan.md` Phase 13.3 に基づき、認証・セッション単体テスト（`scripts/test-auth-session-unit.ts`）およびセキュリティ単体テスト・静的検査（`scripts/test-security-unit.ts`）へ初期デモ管理者アカウントのテスト環境限定有効化・本番遮断検証を追加し、TypeScript 型チェック・本番ビルド・全検証テストの正常終了を確認した。

### 2. 変更内容 (Before / After)
1. **認証・セッション・シード環境制限の単体テスト追加 (`scripts/test-auth-session-unit.ts`)**:
   - Before: `isTestEnvironment`、`isDemoAdminAccount`、`isDemoAdminAllowed`、`assertDemoSeedAllowed` を検証する単体テストが存在しなかった。
   - After: 「Test 6: Demo Admin Account Environment Restriction (Req 1-9)」を追加し、`development` / `test` / `production` における `isTestEnvironment`、`admin@komame.local` / `usr-yamada-taro-001`（大文字・空白含む）に対する `isDemoAdminAccount` および `isDemoAdminAllowed` の本番遮断、ならびに `assertDemoSeedAllowed` による本番シード禁止検証を網羅した。
2. **本番環境デモアカウント遮断・UI出力制御の静的コード検査追加 (`scripts/test-security-unit.ts`)**:
   - Before: セキュリティ静的検査は `raw.unsafe` 不使用チェックのみであった。
   - After: セクション 6「Static Code Analysis: Demo Admin Test-Env-Only Enforcement (Req 1-9)」を追加し、`src/lib/auth.ts`（`getCurrentSession`）、`src/app/api/auth/login/route.ts`、`src/db/seed.ts`、`docker-compose.prod.yml`（フォールバック排除）、`src/app/page.tsx`（`isTestEnv` によるデモアカウント欄とプレースホルダーの出力制御）を静的検証するよう拡充した。

### 3. 変更理由
- 初期デモ管理者アカウントのテスト環境限定有効化および本番環境でのログイン・セッション・シード・UI出力の全面遮断について、リグレッションを自動検出できるようにするため。

### 4. 影響範囲・検証結果
- 変更ファイル: `scripts/test-auth-session-unit.ts`, `scripts/test-security-unit.ts`, `Plan.md`, `AICHANGELOG.md`
- 検証結果:
  - `npx tsc --noEmit`: 終了コード 0
  - `npm run build`: 終了コード 0（23ルート生成完了）
  - `npx tsx scripts/test-auth-session-unit.ts`: 全テスト合格・終了コード 0
  - `npx tsx scripts/test-security-unit.ts`: 全テスト合格・終了コード 0


## [2026-11-18] 【Phase 13.2】ログイン画面における初期デモ管理者アカウント欄のテスト環境限定出力

### 1. 概要
要件 1-9 および `Plan.md` Phase 13.2 に基づき、ログイン画面（`src/app/page.tsx`）の初期デモ管理者アカウント案内・クイック入力欄およびメールアドレス入力欄の `placeholder` をテスト環境（`NODE_ENV !== "production"`）限定出力に統一し、本番ビルド出力からデモ資格情報が完全に除外されることを確認した。

### 2. 変更内容 (Before / After)
1. **テスト環境フラグの定義とログイン画面デモ案内・プレースホルダーの環境別制御 (`src/app/page.tsx`)**:
   - Before: メールアドレス入力欄の `placeholder` が常に `"user@example.com"` 固定であり、初期デモ管理者アカウント欄の表示条件がインラインの `process.env.NODE_ENV !== "production"` 記述となっていた。
   - After: 未ログイン画面ブロック内に `const isTestEnv = process.env.NODE_ENV !== "production";` を定義し、初期デモ管理者アカウント欄（`admin@komame.local` / `Password123!` および「クイック入力」ボタン）を `authMode === "login" && isTestEnv` で制御するとともに、メールアドレス入力欄の `placeholder` を `isTestEnv ? "admin@komame.local" : "user@example.com"` に変更した。

### 3. 変更理由
- 本番環境（`NODE_ENV === "production"`）のブラウザ DOM およびビルド済みアセットに初期デモ管理者アカウントの資格情報が出力・混入することを防止し、テスト環境でのみ利便性を維持するため。

### 4. 影響範囲・検証結果
- 変更ファイル: `src/app/page.tsx`, `Plan.md`, `AICHANGELOG.md`
- 検証結果:
  - `npx tsc --noEmit`: 終了コード 0
  - `npm run build`: 終了コード 0（23ルート生成完了、`.next/static` および `.next/server/app` に `admin@komame.local` / `Password123!` / `初期デモ管理者アカウント` が出力されないことを確認）
  - `npx tsx scripts/test-security-unit.ts`: 全テスト合格・終了コード 0


## [2026-11-18] 【Phase 13.1】初期デモ管理者アカウントの認証・セッション・シードにおけるテスト環境限定化

### 1. 概要
要件 1-9 および `Plan.md` Phase 13.1 に基づき、初期デモ管理者アカウント（`admin@komame.local` / `usr-yamada-taro-001`）をテスト環境（`NODE_ENV !== "production"`）限定で有効化し、本番環境（`NODE_ENV === "production"`）でのログイン・セッション検証・シード作成を遮断するとともに、`docker-compose.prod.yml` からデモ資格情報のデフォルトフォールバックを除去した。

### 2. 変更内容 (Before / After)
1. **認証・セッション検証への環境別デモ管理者制御の追加 (`src/lib/auth.ts`)**:
   - Before: `getCurrentSession()` に本番環境での初期デモ管理者アカウント遮断ロジックが存在しなかった。
   - After: `DEMO_ADMIN_EMAIL`、`DEMO_ADMIN_USER_ID`、`isTestEnvironment()`、`isDemoAdminAccount()`、`isDemoAdminAllowed()` を実装・エクスポートし、`getCurrentSession()` の JWT 検証後および DB リアルタイム突合後の双方で本番環境のデモ管理者セッションを `null` として即時遮断するよう改修。
2. **ログイン API の本番環境デモ管理者拒否 (`src/app/api/auth/login/route.ts`)**:
   - Before: `POST /api/auth/login` は本番環境でも DB に存在する初期デモ管理者アカウントのログインを許可していた。
   - After: `normalizedEmail` および DB 取得後の `user.id` / `user.email` に対して `isDemoAdminAllowed()` を検証し、本番環境での初期デモ管理者アカウントによるログイン試行を無条件で `401 Unauthorized`（「メールアドレスまたはパスワードが正しくありません。」）で拒否するよう改修。
3. **シード処理の本番デモアカウント作成禁止 (`src/db/seed.ts`)**:
   - Before: `seedDatabase()` は環境を問わず `DEFAULT_ADMIN_EMAIL` / `DEFAULT_ADMIN_PASSWORD` 未設定時に `admin@komame.local` / `Password123!` へフォールバックし、固定ユーザーID `usr-yamada-taro-001` でシードを実行していた。
   - After: `assertDemoSeedAllowed(nodeEnv, adminEmail, adminPass)` を実装・適用し、`NODE_ENV === "production"` 時にデモ資格情報または未設定での実行をエラーで拒否。また本番用カスタム管理者作成時は `usr-prod-admin-001` / `hh-prod-household-001` / `tenant_prod_001` を使用し、パスワード平文をログ出力しないよう改修。
4. **本番 Docker Compose のデモ資格情報フォールバック除去 (`docker-compose.prod.yml`)**:
   - Before: `DEFAULT_ADMIN_EMAIL` / `DEFAULT_ADMIN_PASSWORD` / `DEFAULT_HOUSEHOLD_NAME` に `admin@komame.local` / `Password123!` / `山田家` のデフォルト値が設定されていた。
   - After: デモ資格情報のデフォルトフォールバックをすべて除去し空フォールバック（`:-`）へ変更。

### 3. 変更理由
- 本番運用環境において既知の初期デモ管理者アカウント（`admin@komame.local` / `Password123!`）が残存・悪用されるセキュリティリスクを構造的に排除するため。

### 4. 影響範囲・検証結果
- 変更ファイル: `src/lib/auth.ts`, `src/app/api/auth/login/route.ts`, `src/db/seed.ts`, `docker-compose.prod.yml`, `Plan.md`, `AICHANGELOG.md`
- 検証結果:
  - `npx tsc --noEmit`: 終了コード 0
  - `npm run build`: 終了コード 0（23ルート生成完了）
  - `npx tsx scripts/test-security-unit.ts`: 全テスト合格・終了コード 0
  - `npx tsx scripts/test-auth-session-unit.ts`: 全テスト合格・終了コード 0


## [2026-11-18] 【Phase 12.5】新規世帯登録申請・承認制および Super Admin 世帯管理の単体テスト作成・総合テスト更新・検証ガイド最新化

### 1. 概要
`Plan.md` Phase 12.5 に基づき、新規世帯登録の申請・許可制およびシステム管理者（Super Admin）世帯管理機能の DB 不要単体テスト（`scripts/test-household-approval-unit.ts`）を新規作成し、E2E 総合テスト（`scripts/comprehensive-test.ts`）に申請・未承認ログイン拒否・Super Admin 承認・初期シード検証・停止/再開・却下/物理削除フローを追加した。あわせて運用・検証ガイド（`for_agent/06_operation_and_testing_guide.md`）へ新規単体テストを追記し、型チェック・ビルド・単体テストのすべてが正常終了することを確認した。

### 2. 変更内容 (Before / After)
1. **世帯承認制・Super Admin 単体テストの新規作成 (`scripts/test-household-approval-unit.ts`)**:
   - Before: `getHouseholdAccessError` や `src/lib/super-admin-helpers.ts`（状態遷移検証・自己世帯停止/削除防止ガード・却下理由正規化・件数集計・初期シード定数）、および承認制ガードレール（`signup` 時のスキーマ未作成・セッション未発行、`getCurrentSession` の `approved` 検証、Super Admin 認可）を自動検証する単体テストが存在しなかった。
   - After: 全7カテゴリ・56項目のアサーションを含む DB 不要単体テストスクリプトを新規作成。
2. **総合テストへの申請・承認・管理フロー追加 (`scripts/comprehensive-test.ts`)**:
   - Before: 総合テストには既存デモ管理者でのテスト（カテゴリ 1〜15）のみが存在し、新規世帯登録申請から承認・利用停止・再開・却下・抹消に至る E2E フローが未検証だった。
   - After:
     - 独立した Cookie セッションで検証できる `sessionFetch()` ヘルパーを追加し、カテゴリ 1 のログイン検証に `isSuperAdmin === true` 確認を追加。
     - カテゴリ 16「新規世帯登録申請・許可制 & Super Admin 世帯管理フローテスト」を追加し、`signup`（201 / `pendingApproval: true` / Cookie 未発行）→ 未承認時ログイン拒否（403）→ Super Admin 自世帯停止拒否（400）→ `approve`（200）→ 承認後ログイン成功 & 標準12費目・デフォルト現金口座シード確認 → 一般管理者の Super Admin API アクセス拒否（403）→ `suspend` によるセッション即時遮断 & 再開（`reactivate`）→ `reject` & `DELETE` 抹消後の同一メール再申請成功を検証するフローを実装。
3. **検証ガイド最新化 (`for_agent/06_operation_and_testing_guide.md`)**:
   - Before: 2.2 単体テスト一覧に `test-household-approval-unit.ts` の記載がなかった。
   - After: 単体テスト一覧および改訂履歴に `npx tsx scripts/test-household-approval-unit.ts` を追記。

### 3. 変更理由
- 新規世帯登録の承認制、未承認・停止世帯のアクセス遮断、および Super Admin による誤操作防止ガード（自己ロックアウト・承認済み世帯の誤削除防止）のリグレッションを継続的に自動検証できるようにするため。

### 4. 影響範囲・検証結果
- 変更・新規作成ファイル: `scripts/test-household-approval-unit.ts`（新規）, `scripts/comprehensive-test.ts`, `for_agent/06_operation_and_testing_guide.md`, `Plan.md`, `AICHANGELOG.md`
- 検証結果:
  - `npx tsc --noEmit`: 終了コード 0
  - `npm run build`: 終了コード 0（23ルート生成完了）
  - `npx tsx scripts/test-household-approval-unit.ts`: 全テスト合格・終了コード 0
  - `npx tsx scripts/test-security-unit.ts`: 全テスト合格・終了コード 0
  - `npx tsx scripts/test-auth-session-unit.ts`: 全テスト合格・終了コード 0
  - ※ `scripts/comprehensive-test.ts` はローカル DB（5532）・アプリサーバー（3080）未起動のため実行対象外（静的型チェック・ビルドで整合性確認済み）。


## [2026-11-18] 【Phase 12.4】ログイン・新規世帯申請画面および管理タブ内 Super Admin 世帯管理UIの実装

### 1. 概要
要件 1-1, 1-2, 1-8, 1-9 および `Plan.md` Phase 12.4 に基づき、ログイン・新規世帯登録画面（`src/app/page.tsx`）を承認申請制の案内・申請受付完了バナー・`403` 審査状態表示へ改修するとともに、管理タブ（`src/components/AdminTab.tsx`）にシステム管理者（`isSuperAdmin === true`）限定の「システム管理：新規世帯登録の承認・アカウント管理」セクションおよび日英翻訳キー（`src/lib/i18n.ts`）を実装した。

### 2. 変更内容 (Before / After)
1. **多言語翻訳リソースの拡張 (`src/lib/i18n.ts`)**:
   - Before: 新規世帯登録の申請制案内、申請受付バナー、および Super Admin 向け世帯承認・アカウント管理セクションの翻訳キーが存在しなかった。
   - After: `auth` セクション（申請タブ名、申請ボタン、承認制案内、申請完了バナー、利用制限タイトル）および `admin` セクション（Super Admin セクションタイトル、ステータスフィルター、承認/却下/再承認/削除/停止/再開ボタン、却下理由入力欄等）の日英翻訳キーを追加。
2. **ログイン・新規世帯登録申請画面の改修 (`src/app/page.tsx`, `src/types/index.ts`)**:
   - Before: 新規世帯登録の送信ボタンが「世帯を開設して始める」となっており、申請完了時は即座に `checkSession()` を呼び出していた。また `AdminTab` に `isSuperAdmin` や `currentHouseholdId` が渡されていなかった。
   - After:
     - 新規世帯登録タブに承認制案内（「※システム管理者の承認後にログイン可能となります...」）を表示し、送信ボタンを「新規世帯の登録を申請する」に変更。
     - 申請完了時（`pendingApproval: true`）にログイン画面へ自動切り替えし、申請受付完了バナー（`authInfoMessage`）を表示。
     - 未承認・却下・停止状態の世帯でログインを試行した際の `403 Forbidden` 応答メッセージを視覚的に分かりやすいステータス案内バナーとして表示。
     - 初期デモ管理者アカウント欄を `process.env.NODE_ENV !== "production"` 時のみ出力するよう保護。
     - `AdminTab` に `isSuperAdmin={Boolean(user.isSuperAdmin)}` および `currentHouseholdId={user.householdId || user.activeHouseholdId}` を伝播。
3. **管理タブ内 Super Admin 世帯管理UIの実装 (`src/components/AdminTab.tsx`)**:
   - Before: `AdminTab.tsx` には世帯内の家族メンバー管理や費目管理等は存在したが、システム全体の世帯登録申請を審査・管理する Super Admin 用 UI が存在しなかった。
   - After: `isSuperAdmin === true` の場合にのみ最上部に表示される「システム管理：新規世帯登録の承認・アカウント管理」セクションを実装。
     - ステータス別件数集計バッジ付きのフィルタータブ（すべて / 承認待ち / 承認済み / 却下済み / 停止中）および未承認申請アラートバッジを表示。
     - 各世帯の世帯名、ステータスバッジ、現在の所属世帯バッジ、申請者メールアドレス、申請日時、審査日時、スキーマ名、却下・停止理由を表示。
     - 状態に応じた操作ボタン（「許可 (承認)」「却下（インライン理由入力パネル付き）」「再承認」「削除 (抹消)」「利用停止（自世帯は誤操作防止のため非表示）」「利用再開」）を実装し、`/api/super-admin/households` (GET / PUT / DELETE) と連携。

### 3. 変更理由
- 新規世帯登録の申請者が承認制であることを明確に把握でき、かつシステム管理者が管理タブから直感的に申請の許可・却下・再承認・抹消や世帯アカウントの停止・再開を行えるようにするため。

### 4. 影響範囲・検証結果
- 変更ファイル: `src/types/index.ts`, `src/lib/i18n.ts`, `src/app/page.tsx`, `src/components/AdminTab.tsx`, `Plan.md`, `AICHANGELOG.md`
- 検証結果:
  - `npx tsc --noEmit`: 終了コード 0
  - `npm run build`: 終了コード 0
  - `npx tsx scripts/test-security-unit.ts`: 全テスト合格・終了コード 0


## [2026-11-18] 【Phase 12.3】システム管理者（Super Admin）世帯承認・管理APIの新規実装

### 1. 概要
要件 1-1, 1-2, 1-8 および `Plan.md` Phase 12.3（`for_agent/04_api_specifications.md` 第10章）に基づき、システム管理者（`isSuperAdmin === true`）が新規世帯登録申請の承認・却下・再承認・抹消、および承認済み世帯の利用停止・利用再開を行えるバックエンド API `/api/super-admin/households` とバリデーション・初期化ヘルパーを新規実装した。

### 2. 変更内容 (Before / After)
1. **Super Admin 世帯管理バリデーション・初期プリセット定数 (`src/lib/super-admin-helpers.ts`)**:
   - Before: Super Admin の世帯ステータス遷移検証、削除可否検証、ステータス件数集計、および承認時の標準12費目・初期システム設定テンプレートを集約したヘルパーが存在しなかった。
   - After: `STANDARD_CATEGORY_TEMPLATES`（標準12費目）、`DEFAULT_HOUSEHOLD_SETTINGS`（通貨記号・日付形式・パスワードポリシー）、`validateSuperAdminHouseholdTransition`（自己世帯停止・却下防止および許可遷移チェック）、`validateSuperAdminHouseholdDeletion`（`pending`/`rejected` 限定かつ自世帯削除防止）、`buildHouseholdCounts` 等を純粋関数・定数として新設。
2. **Super Admin 世帯承認・管理 API (`src/app/api/super-admin/households/route.ts`)**:
   - Before: システム管理者が承認待ち・承認済み・却下済み・停止中世帯を一元管理するエンドポイントが存在しなかった。
   - After: `getCurrentSession()` に加え、DB上の `users.isSuperAdmin === true && users.isActive === true` を検証する認可ガード（非 Super Admin は `403 Forbidden`）を実装した上で以下を提供：
     - `GET /api/super-admin/households`: ステータスフィルター（`all` / `pending` / `approved` / `rejected` / `suspended`）対応の世帯一覧（申請者メール・ID含む）および全件のステータス別集計 `counts` を返却。
     - `PUT /api/super-admin/households`:
       - `approve`: `pending` / `rejected` 世帯に対し、`assertValidSchemaName` 検証のもと `createTenantTables(schemaName)` を実行し、`public.system_settings`・標準12費目マスター（`isSystem: true`）・デフォルト現金口座を冪等にシード投入した上で `status = "approved"` へ更新。
       - `reject`: `pending` 世帯を `status = "rejected"` に更新し、審査者・審査日時・却下理由を記録。
       - `suspend` / `reactivate`: 承認済み世帯の停止・再開（操作中 Super Admin 自身の所属世帯停止は `400 Bad Request` で拒否）。
     - `DELETE /api/super-admin/households?householdId=...`: `pending` または `rejected` の世帯申請およびメンバーシップをトランザクション内で物理削除し、他世帯所属および Super Admin 権限を持たない申請ユーザーも物理削除して同一メールアドレスでの再申請を可能化。

### 3. 変更理由
- 承認申請制において、システム管理者が管理画面から安全かつ冪等に世帯環境を初期化（承認）・却下・停止・再有効化・抹消できるようにし、誤操作による自己ロックアウトや未承認状態での不正アクセスを防止するため。

### 4. 影響範囲・検証結果
- 変更・新規作成ファイル: `src/lib/super-admin-helpers.ts`, `src/app/api/super-admin/households/route.ts`, `Plan.md`, `AICHANGELOG.md`
- 検証結果:
  - `npx tsc --noEmit`: 終了コード 0
  - `npx tsx scripts/test-security-unit.ts`: 全テスト合格・終了コード 0
  - `npx tsx scripts/test-auth-session-unit.ts`: 全テスト合格・終了コード 0
  - `npm run build`: 終了コード 0（`/api/super-admin/households` を含む23ルート生成完了）


## [2026-11-18] 【Phase 12.2】認証・セッション検証ロジックおよびログイン・サインアップ申請APIの改修

### 1. 概要
要件 1-1, 1-2, 1-8 および `Plan.md` Phase 12.2 に基づき、新規世帯登録を承認申請制へ切り替え、ログインおよびセッション検証時に世帯の承認ステータス（`households.status === "approved"`）とシステム管理者フラグ（`isSuperAdmin`）をリアルタイム検証・反映するよう改修した。

### 2. 変更内容 (Before / After)
1. **認証・セッション管理 (`src/lib/auth.ts`)**:
   - Before: `SessionPayload` に `isSuperAdmin` がなく、`getCurrentSession()` は `users.isActive` と `householdMemberships.status === "active"` のみを検証しており、未承認・却下・停止状態の世帯セッションを遮断していなかった。
   - After: `SessionPayload` に `isSuperAdmin?: boolean` を追加し、世帯ステータス判定ヘルパー `getHouseholdAccessError(status)` を実装。`getCurrentSession()` のマスタDB照会クエリに `users.isSuperAdmin` と `households.status` を追加し、`householdStatus !== "approved"` の場合は `null` を返却して未承認・却下・停止世帯のセッションを即時遮断するよう変更。
2. **新規世帯登録申請API (`src/app/api/auth/signup/route.ts`)**:
   - Before: サインアップリクエスト時に即座に `createTenantTables(schemaName)` でテナントスキーマを作成し、`system_settings`・標準12費目・デフォルト現金口座をシード投入した上でセッションCookieを発行していた。
   - After: テナント専用スキーマ作成・シード投入・Cookie発行を廃止し、`masterDb.transaction()` 内で `public.users`・`public.households`（`status: "pending"`）・`public.household_memberships` のみを登録し、`201 Created`（`{ success: true, pendingApproval: true, message: "..." }`）を返却するよう改修。
3. **ログインAPI (`src/app/api/auth/login/route.ts`)**:
   - Before: パスワード検証成功後に `households.status` を確認せず、そのままセッションを発行していた。
   - After: パスワード検証成功後（アカウント列挙防止のため不一致時は従来通り `401`）に `getHouseholdAccessError(membership.householdStatus)` で世帯ステータスを検証し、`pending` / `rejected` / `suspended` 等は状態に応じた案内メッセージとともに `403 Forbidden` を返却。`approved` 時のみ `isSuperAdmin` を含めたセッション・レスポンスを発行するよう変更。
4. **現在ユーザー取得API (`src/app/api/auth/me/route.ts`)**:
   - Before: レスポンスの `user` に `isSuperAdmin` を含めていなかった。
   - After: `users.isSuperAdmin` を取得し、レスポンス `user` に `isSuperAdmin: Boolean(user.isSuperAdmin)` を含めて返却するよう変更。

### 3. 変更理由
- システム管理者の承認前にテナント専用スキーマが作成されたりログイン・API操作が可能になったりすることを構造的に防止し、既存の承認済み世帯および将来の Super Admin 管理画面へ `isSuperAdmin` フラグを安全に伝播させるため。

### 4. 影響範囲・検証結果
- 変更ファイル: `src/lib/auth.ts`, `src/app/api/auth/signup/route.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/me/route.ts`, `Plan.md`, `AICHANGELOG.md`
- 検証結果:
  - `npx tsc --noEmit`: 終了コード 0
  - `npx tsx scripts/test-security-unit.ts`: 全テスト合格・終了コード 0
  - `npx tsx scripts/test-auth-session-unit.ts`: 全テスト合格・終了コード 0
  - `npm run build`: 終了コード 0（22ルート生成完了）


## [2026-11-18] 【Phase 12.1】新規世帯登録の申請・許可制向けマスタDBスキーマ・マイグレーション・シード・型定義の拡張

### 1. 概要
要件 1-1, 1-2, 1-8 および `Plan.md` Phase 12.1 に基づき、新規世帯登録の申請・許可制およびシステム管理者（Super Admin）による世帯管理機能の基盤となるマスタDBスキーマ、マイグレーション、初期シード、および TypeScript 型定義を拡張した。

### 2. 変更内容 (Before / After)
1. **マスタDBスキーマ拡張 (`src/db/schema/master.ts`)**:
   - Before: `public.households` には状態管理用カラムがなく、各マスタテーブルの ID 系カラム長が `VARCHAR(36)` であり `migrate.ts`（`VARCHAR(64)`）と不整合があった。
   - After: `households` に `status`（`VARCHAR(20) DEFAULT 'approved' NOT NULL`）、`reviewedBy`（`VARCHAR(64)`）、`reviewedAt`（`TIMESTAMPTZ`）、`rejectionReason`（`TEXT`）を追加し、マスタテーブル群（`users`, `households`, `householdMemberships`, `systemSettings`）の ID・外部キー長を `VARCHAR(64)` に統一。
2. **マイグレーション保護 (`src/db/migrate.ts`)**:
   - Before: `createMasterTables()` の `public.households` に承認管理カラムが存在せず、`runMigrations()` はすべての `public.households` に対してテナントスキーマを作成していた。
   - After: `CREATE TABLE IF NOT EXISTS public.households` に新規カラムを定義するとともに既存環境向けに `ALTER TABLE public.households ADD COLUMN IF NOT EXISTS ...` を追加。さらに `runMigrations()` のテナントスキーマ作成対象を `WHERE status IN ('approved', 'suspended')` に限定し、未承認（`pending`）・却下（`rejected`）世帯に対してスキーマが作成されないよう保護。
3. **初期シード明示化 (`src/db/seed.ts`)**:
   - Before: 初期デモ世帯（山田家）の投入時に `status` を明示指定していなかった。
   - After: `INSERT INTO public.households` に `status = 'approved'` を明示指定するよう更新。
4. **型定義拡張 (`src/types/index.ts`)**:
   - Before: `HouseholdStatus`、Super Admin 向け世帯一覧型、`UserSession.isSuperAdmin` が未定義だった。
   - After: `HouseholdStatus`（`"pending" | "approved" | "rejected" | "suspended"`）、`UserSession.isSuperAdmin?: boolean`、`ManagedHouseholdItem`、および `ManagedHouseholdCounts` を追加。

### 3. 変更理由
- 新規世帯登録を即時利用ではなく申請・承認制へ移行するにあたり、承認前のテナントスキーマ生成を防止しつつ既存の承認済み世帯との後方互換性を維持し、Super Admin による承認・却下・停止・削除APIおよびUIを型安全に実装できるようにするため。

### 4. 影響範囲・検証結果
- 変更ファイル: `src/db/schema/master.ts`, `src/db/migrate.ts`, `src/db/seed.ts`, `src/types/index.ts`, `Plan.md`, `AICHANGELOG.md`
- 検証結果:
  - `npx tsc --noEmit`: 終了コード 0
  - `npx tsx scripts/test-security-unit.ts`: 全テスト合格・終了コード 0
  - `npm run build`: 終了コード 0（22ルート生成完了）


## [2026-11-15] 【Review】全体コード・仕様整合性レビューとエッジケース・API不整合修正

- **変更理由:** `/review` スキルに基づく全仕様書（`for_agent/`）と実装コード（`src/`, `scripts/`）の照合、エッジケース点検、および全検証テストの実行により発見された不整合・不具合を解消するため。
- **変更内容 (Before -> After):**
  1. `src/components/EditTransactionModal.tsx`:
     - Before: アーカイブ済み費目の明細を編集すると有効費目先頭にフォールバックする可能性があり、また収入・振替明細でも費目／支払手段のセレクトボックスが表示・送信されていた。
     - After: アーカイブ済み費目を `(アーカイブ済)` 選択肢として保持するフォールバックを追加し、費目・支払手段の編集UIおよびデフォルト補完を支出明細（`type === "expense"`）限定にして `fromAccountId` も保持するよう修正。
  2. `src/components/RegisterTab.tsx`:
     - Before: ドラフト復元時にアーカイブ済み費目IDがそのまま復元されうる状態だった。また収入登録時に支出タブの `amount` 入力値が残っていると `grossAmount` より優先されていた。
     - After: ドラフト復元時に有効な費目一覧との照合を行い無効な場合はフォールバックさせ、収入登録時の額面計算・メモ生成を `grossAmount || amount` 優先に修正。
  3. `src/app/api/transactions/route.ts`:
     - Before: `PUT` / `DELETE` が `expense` 前提の実装になっており、単独の口座間振替（`transfer`）および収入（`income`）明細の編集・削除時に `fromAccountId` / `toAccountId` 残高が再計算・ロールバックされず、`isSettled` も `false` になっていた。
     - After: `PUT` / `DELETE` で `transfer` / `income` / `expense` の種別ごとに旧残高ロールバックと新残高反映（および `fromAccountId` 更新）を正しく分岐実装。
  4. `scripts/comprehensive-test.ts`:
     - Before: システム設定更新ボディや監査ログCSVエンドポイント・RFC 4180引用符付きヘッダー、Node `fetch` の `res.text()` によるUTF-8 BOMストリップにより一部アサーションが古い仕様のままだった。
     - After: `passwordPolicy` 構造・`/api/admin/logs?format=csv`・引用符付きCSVヘッダーおよび `arrayBuffer()` ベースのUTF-8 BOM検証へ更新。
  5. `for_agent/04_api_specifications.md`:
     - Before: 6.6 `POST /api/admin/members` の仕様記述が Phase 7.2（VULN-02）の招待トークン運用反映前だった。
     - After: パスワードポリシー検証・招待リンク発行・既存別世帯ユーザー保護・複数世帯所属ユーザーのパスワードリセット制限に合わせて仕様書を更新し、改訂履歴を追記。
- **影響範囲・検証結果:**
  - `npx tsc --noEmit`: 終了コード 0
  - `npm run build`: 終了コード 0（22ルート生成完了）
  - 単体テスト全7本（`test-csv-unit.ts`, `test-members-unit.ts`, `test-auth-session-unit.ts`, `test-rate-limit-csrf.ts`, `test-categories-unit.ts`, `test-unit-calculator.ts`, `test-security-unit.ts`）: すべて終了コード 0
  - `npx tsx scripts/comprehensive-test.ts`: 全15カテゴリ合格・終了コード 0

## [2026-11-15] 【Phase 11.3】単価×個数 計算補助UIセレクトボックス化に伴う単体テスト拡充・総合ビルド検証

### 1. 概要
要件 2-7 改訂および `Plan.md` Phase 11.3 に基づき、単価×個数 計算補助ロジックの単体テストを拡充し、総合ビルドおよび各種単体テストの正常終了を確認した：
1. **単体テスト拡充 (`scripts/test-unit-calculator.ts`)**:
   - `calculateUnitTotal` が引き続き `31` 以上の正の整数（数値 `31`、文字列 `"50"` 等）を受け付ける汎用仕様の検証を明示的に追加。
   - UI用個数セレクトボックス定数・仕様（`DEFAULT_QUANTITY === "1"`, `MAX_UI_QUANTITY === 30`, `UNIT_CALC_QUANTITY_OPTIONS` の `"1"` 〜 `"30"` 連続30件・`"0"` および `"31"` 非含有、初期値 `"1"` での即時計算、`UnitPriceCalculator.tsx` / `RegisterTab.tsx` / `EditTransactionModal.tsx` での `<select>` および `DEFAULT_QUANTITY` 統一利用の静的整合性）を検証するセクションを追加。
2. **総合検証 (Ground Truth)**:
   - `npx tsc --noEmit`、`npm run build`、`npx tsx scripts/test-unit-calculator.ts`、`npx tsx scripts/test-security-unit.ts` を実行し、すべて Exit Code 0 を確認。

### 2. 変更内容 (Before / After)
- **Before**: `scripts/test-unit-calculator.ts` は `calculateUnitTotal` および `sanitizeUnitCalcInput` のみを検証しており、Phase 11.1〜11.2 で導入した個数セレクトボックス範囲（`"1"` 〜 `"30"`）および初期値・リセット値（`DEFAULT_QUANTITY = "1"`）の自動検証が含まれていなかった。
- **After**: 31個以上の汎用計算テストおよび UI 個数セレクトボックス範囲・初期値・利用側コンポーネントの統一利用に関する検証を追加し、Phase 11 全体の動作・型・ビルド整合性を自動テストで担保した。

### 3. 変更理由
- 要件 2-7 改訂（個数 `1〜30` セレクトボックス化・初期値 `1`・31個以上は金額欄直接手入力）と計算ヘルパーの汎用性（1以上の正の整数対応）の双方を回帰テストで継続保証し、Phase 11 を完了させるため。

### 4. 影響範囲
- `scripts/test-unit-calculator.ts`
- `Plan.md`, `AICHANGELOG.md`

## [2026-11-15] 【Phase 11.2】利用側コンポーネントの個数初期値・リセット値の `"1"` 統一 (`RegisterTab.tsx` / `EditTransactionModal.tsx`)

### 1. 概要
要件 2-7 改訂および `Plan.md` Phase 11.2 に基づき、単価×個数 計算補助UIを利用する全コンポーネントの個数初期値およびリセット値を `DEFAULT_QUANTITY` (`"1"`) に統一した：
1. **記帳タブ (`src/components/RegisterTab.tsx`)**:
   - `UnitPriceCalculator.tsx` から `DEFAULT_QUANTITY` (`"1"`) をインポートし、`DEFAULT_ROW_CALC_STATE.quantity`（`shop_batch` / `category_batch` 行の初期状態・リセット状態）、`singleCalcQuantity` の初期値、および `resetCalculators()` 内の `setSingleCalcQuantity(DEFAULT_QUANTITY)` をすべて `"1"` に統一。
2. **明細編集モーダル (`src/components/EditTransactionModal.tsx`)**:
   - `DEFAULT_QUANTITY` (`"1"`) をインポートし、`calcQuantity` の初期値およびモーダル開閉・対象明細切り替え時（`isOpen`, `transaction?.id` の変化時）のリセット値 `setCalcQuantity(DEFAULT_QUANTITY)` を `"1"` に統一。

### 2. 変更内容 (Before / After)
- **Before**: `RegisterTab.tsx`（`DEFAULT_ROW_CALC_STATE.quantity`, `singleCalcQuantity`, `resetCalculators()`）および `EditTransactionModal.tsx`（`calcQuantity` 初期値・リセット処理）の個数状態が `""`（空文字）のまま保持されており、親側の状態値とセレクトボックス初期値 `"1"` の管理にズレが生じる可能性があった。
- **After**: `UnitPriceCalculator` 側の `DEFAULT_QUANTITY` (`"1"`) を参照して全モード（1件登録・同店舗一括・同費目一括・明細編集モーダル）の個数初期値・リセット値を `"1"` に統一した。

### 3. 変更理由
- Phase 11.1 でセレクトボックス化された個数UIの初期値 `"1"` と親コンポーネント側の制御ステートを完全に一致させ、登録完了・ドラフト復元・モーダル再表示の後も一貫して `単価 × 1` の即時計算が動作するようにするため。

### 4. 影響範囲
- `src/components/RegisterTab.tsx`
- `src/components/EditTransactionModal.tsx`
- `Plan.md`, `AICHANGELOG.md`

## [2026-11-15] 【Phase 11.1】`UnitPriceCalculator` コンポーネントの個数UIセレクトボックス化 (`UnitPriceCalculator.tsx` / `i18n.ts`)

### 1. 概要
要件 2-7 改訂および `Plan.md` Phase 11.1 に基づき、`UnitPriceCalculator` コンポーネントの個数入力UIをセレクトボックス化し、初期値 `"1"` による即時計算体験を実装した：
1. **定数・選択肢配列の定義と個数 `<select>` 化 (`src/components/UnitPriceCalculator.tsx`)**:
   - `DEFAULT_QUANTITY = "1"`、`MAX_UI_QUANTITY = 30`、`UNIT_CALC_QUANTITY_OPTIONS`（`"1"` 〜 `"30"`）をエクスポート定数として定義。
   - `UnitPriceCalculatorPanel` の個数欄を `<input>` から `<select>`（`1` 〜 `30` の整数選択）に変更し、選択変更時に `calculateUnitTotal(unitPrice, nextQty)` をリアルタイム実行して上限内の場合のみ `onApplyAmount` を呼び出すよう実装。
   - `quantity` として空文字や範囲外の値が渡された場合も `selectedQuantity` が `"1"` にフォールバックする設計とし、単価入力時点で即座に `単価 × 1` が算出・反映されるようにした。
2. **非制御モードの初期値・リセット値統一 (`UnitPriceCalculator`)**:
   - `internalQuantity` の初期値および `resetKey` 変化時のリセット値を `DEFAULT_QUANTITY` (`"1"`) に変更。
3. **多言語辞書 (`src/lib/i18n.ts`) の調整**:
   - セレクトボックス化に伴い不要となった `quantityPlaceholder` を削除し、31個以上は金額欄へ直接入力する旨のヒントキー `unitCalcQuantityHint`（日英）を追加してパネル内に表示。

### 2. 変更内容 (Before / After)
- **Before**: `UnitPriceCalculatorPanel` の個数欄が自由入力の `<input>`（初期値 `""`）であり、利用者が毎回単価と個数の両方を入力する必要があった。
- **After**: 個数欄が `1` 〜 `30` を選択する `<select>`（初期値 `"1"`）となり、単価を入力した時点で即座に `単価 × 1` が合計金額欄へ反映され、31個以上は金額欄への直接手入力を案内するUIとなった。

### 3. 変更理由
- 要件 2-7 改訂に従い、モバイル端末でのテンキー入力とプルダウン選択を組み合わせたより素早い金額計算体験を実現するため。

### 4. 影響範囲
- `src/components/UnitPriceCalculator.tsx`
- `src/lib/i18n.ts`
- `Plan.md`, `AICHANGELOG.md`

## [2026-11-15] 【Review】全体コード・仕様書整合性点検およびビルド・テスト総合検証
- **変更内容 (Before / After):**
  - Before: Phase 10.5 完了後、全体の仕様書 (`for_agent/`) と実装コードの突合レビューおよび記録が未実施だった。
  - After: `for_agent/` 配下の全仕様書と `src/` 配下の全実装コードを照合し、型チェック・本番ビルド・全7種の単体テストを実行して回帰がないことを確認した（コード・仕様書の変更はなし）。残存する仕様ギャップおよびエッジケースを整理し、レビュー結果を記録した。
- **検証結果:**
  - `npx tsc --noEmit`: 正常終了 (Exit Code 0)
  - `npm run build`: 正常終了 (Exit Code 0, 22ルート生成)
  - 単体テスト全7本 (`test-security-unit.ts`, `test-unit-calculator.ts`, `test-categories-unit.ts`, `test-csv-unit.ts`, `test-members-unit.ts`, `test-auth-session-unit.ts`, `test-rate-limit-csrf.ts`): すべて正常終了 (Exit Code 0)
  - `scripts/comprehensive-test.ts`: PostgreSQL (localhost:5532) 未起動 (`TcpTestSucceeded: False`) のため未実行
- **検出された主な仕様ギャップ・エッジケース:**
  1. `src/app/invite/page.tsx` が未実装のため、招待リンク (`/invite?token=...`) にブラウザアクセスすると 404 になる。
  2. `src/app/api/auth/signup/route.ts` の初期設定シード (`'"¥"'` / `'"YYYY/MM/DD"'`) と `src/app/api/admin/settings/route.ts` が期待する `{ value: ... }` 形式に差異がある。
  3. `src/app/page.tsx` の `notifications` 初期値にデモ用固定メッセージが残存している。
  4. `src/components/EditTransactionModal.tsx` ではアクティブ費目のみ渡されるため、アーカイブ済み費目が設定された過去明細の編集時に当該費目が選択肢に表示されない。
  5. `src/app/api/admin/csv/route.ts` のインポート処理において、`paymentMethodId` が未指定の支出 (`expense`) は `isSettled` が `false` のまま登録される。
- **変更理由・影響範囲:**
  - `/review` スキル手順に基づく全体点検の証跡保存。アプリケーションの挙動やデータベーススキーマへの変更はなし。

## [2026-11-15] 【Phase 10.5】単価×個数計算補助機能の単体テスト作成・総合ビルド検証・仕様書同期

### 1. 概要
要件 2-7 および `Plan.md` Phase 10.5 に基づき、単価×個数計算補助機能の単体テスト作成、開発・運用・検証ガイド同期、および総合ビルド・テスト検証を実施した：
1. **単体テスト新規作成 (`scripts/test-unit-calculator.ts`)**:
   - `calculateUnitTotal()` の正常系（数値・文字列・空白トリム・先頭ゼロ・混在入力）、境界値（最小 `1`、最大 `9,999,999,999`、単独/積の上限超過、`MAX_SAFE_INTEGER` 超過文字列の BigInt 検証）、異常系（未入力、`0`、負数、小数、非数字、`NaN`/`Infinity`、不正型）を網羅的に検証。
   - `sanitizeUnitCalcInput()` による全角数字変換および非数字文字除去の挙動もあわせて検証。
2. **仕様書同期 (`for_agent/06_operation_and_testing_guide.md`)**:
   - 単体テスト一覧（第2.2節）に `npx tsx scripts/test-unit-calculator.ts` を追記し、改訂履歴を更新。
3. **総合検証 (Ground Truth)**:
   - `npx tsc --noEmit`、`npm run build`、`npx tsx scripts/test-unit-calculator.ts`、`npx tsx scripts/test-security-unit.ts` を実行し、すべて Exit Code 0 でパスすることを確認。

### 2. 変更内容 (Before / After)
- **Before**: 単価×個数計算補助機能（`calculateUnitTotal` / `sanitizeUnitCalcInput`）の自動単体テストが存在せず、`for_agent/06_operation_and_testing_guide.md` の単体テスト一覧にも未記載だった。
- **After**: 正常系・境界値・異常系・入力サニタイザーを網羅する `scripts/test-unit-calculator.ts` を整備・実行し、仕様書同期および全ビルド・セキュリティ検証を完了した。

### 3. 変更理由
- 要件 2-7 の境界値（`1 ～ 9,999,999,999`）および不正入力拒否の品質を自動テストで継続担保し、Phase 10 を完全に完了させるため。

### 4. 影響範囲
- `scripts/test-unit-calculator.ts` (新規)
- `for_agent/06_operation_and_testing_guide.md`
- `Plan.md`, `AICHANGELOG.md`

## [2026-11-15] 【Phase 10.4】明細編集モーダル (`EditTransactionModal.tsx`) の支出編集欄への「単価×個数」計算補助機能組み込み

### 1. 概要
要件 2-7 および `Plan.md` Phase 10.4 に基づき、明細編集モーダル (`src/components/EditTransactionModal.tsx`) の支出編集時の金額入力欄へ「単価×個数」計算補助UIを組み込んだ：
1. **支出明細限定での計算補助表示**:
   - `transaction?.type === "expense"` の場合のみ、`UnitPriceCalculator` を用いて金額入力欄のラベル横に計算トグルボタン・直下にインライン展開パネルを表示（収入・振替明細の編集時は非表示）。
2. **状態初期化およびモバイル表示対応**:
   - `calcOpen` / `calcUnitPrice` / `calcQuantity` を `isOpen` および `transaction?.id` の変化に連動してリセットし、モーダル開閉や対象明細切り替え時に前回の展開状態・入力値が残らないよう制御。
   - モーダル本体に `max-h-[90vh] overflow-y-auto` を追加し、モバイル画面でパネル展開時にもスクロール操作が維持されるよう調整。

### 2. 変更内容 (Before / After)
- **Before**: 明細編集モーダルの金額入力欄は直接手入力のみで、支出編集時に単価×個数をインライン計算する手段がなかった。
- **After**: 支出明細の編集時のみトグル操作で「単価×個数」計算補助パネルを開閉・計算反映でき、モーダル開閉・対象明細切り替え時に展開状態と入力値がクリーンに初期化されるようになった。

### 3. 変更理由
- 登録済み支出明細の修正時にも新規記帳時と同じ操作感で単価×個数の計算補助を利用できるようにし、収入・振替編集時の誤表示や状態残留を防止するため。

### 4. 影響範囲
- `src/components/EditTransactionModal.tsx`
- `Plan.md`, `AICHANGELOG.md`

## [2026-11-15] 【Phase 10.3】記帳タブ (`RegisterTab.tsx`) 全支出金額入力欄への「単価×個数」計算補助機能組み込み

### 1. 概要
要件 2-7 および `Plan.md` Phase 10.3 に基づき、記帳タブ (`src/components/RegisterTab.tsx`) のすべての支出金額入力欄に「単価×個数」計算補助UIを組み込んだ：
1. **1件ずつ登録 (`single`) モード対応**:
   - `entryType === "expense"` 時のみ、`UnitPriceCalculator` を用いて金額入力欄のラベル横にトグルボタン・直下にインライン展開パネルを表示（収入タブ時は非表示）。
2. **同店舗一括 (`shop_batch`)・同費目一括 (`category_batch`) モード対応**:
   - 各明細行に `rowId`（クライアント側の一意ID）を導入し、`UnitPriceCalculatorToggle`（コンパクト表示）と `UnitPriceCalculatorPanel` を行単位で独立管理（`rowCalcStates`）。
   - 行追加・行削除・ドラフト復元・登録完了リセット時にも他行の展開状態や入力値がずれたり残留したりしないよう管理（ドラフト保存時は `buildDraftPayload()` により `rowId` を除外して既存構造を維持）。
3. **既存機能連動**:
   - 計算結果の金額反映が、一括合計金額表示・入力中件数表示・離脱時ガード (`isFormDirty`)・2秒デバウンス自動一時保存とそのまま連動することを確認。

### 2. 変更内容 (Before / After)
- **Before**: 記帳タブの支出金額入力欄（`single` / `shop_batch` / `category_batch`）はいずれも金額の直接手入力のみで、一括登録行は配列インデックス `idx` を `key` として管理されていた。
- **After**: 支出登録の全3モードでトグル操作によりインラインの「単価×個数」計算補助パネルを開閉・リアルタイム計算でき、一括登録行も `rowId` ベースで安全に行追加・削除・独立開閉が可能になった。

### 3. 変更理由
- 買い物時の「単価×個数」の暗算・電卓切替の手間を解消しつつ、行追加・削除時のUI状態ずれやドラフトデータへの不要フィールド混入を防止するため。

### 4. 影響範囲
- `src/components/RegisterTab.tsx`
- `Plan.md`, `AICHANGELOG.md`

## [2026-11-15] 【Phase 10.2】再利用可能なインライン単価×個数計算補助コンポーネント (`UnitPriceCalculator.tsx`) の作成

### 1. 概要
要件 2-7（支出金額入力欄の「単価×個数」計算補助機能）および `Plan.md` Phase 10.2 に基づき、既存の5大テーマCSS変数およびモバイルファースト設計に準拠した再利用可能コンポーネント `src/components/UnitPriceCalculator.tsx` を新規作成した：
1. **トグルボタン・インラインパネル・統合コンポーネントの提供**:
   - `UnitPriceCalculatorToggle`: ラベル横・一括行内の双方に配置可能な折りたたみトグルボタン（`compact` 表示対応）。
   - `UnitPriceCalculatorPanel`: `inputMode="numeric"`・`pattern="[0-9]*"` および全角数字サニタイズ（`sanitizeUnitCalcInput`）を備えた `単価 × 個数` インライン計算パネル。
   - `UnitPriceCalculator`: 制御/非制御両対応かつ `labelContent` + `children` スロット形式および `resetKey` リセット機能を備えた統合ラッパーコンポーネント。
2. **リアルタイム計算・境界値防御・手動優先挙動**:
   - `calculateUnitTotal()` により単価・個数入力時にリアルタイムで `単価 × 個数` を算出し、`1 <= total <= 9,999,999,999` の範囲内の場合のみ `onApplyAmount` コールバックへ合計金額を反映。
   - `0` 入力や上限超過時は `role="alert"` の警告メッセージを表示し、不正値・上限超過値を親の金額欄へ反映しない。
   - 折りたたみ時も親の金額欄の値を保持し、単価・個数の変更イベント時のみ反映を行うため、金額入力欄の手入力値を上書きしない。

### 2. 変更内容 (Before / After)
- **Before**: 単価×個数をインライン展開して計算・検証・反映する UI コンポーネントが存在しなかった。
- **After**: 記帳タブの単一入力・一括登録行および明細編集モーダルから共通利用できる、5大テーマ対応・モバイル最適化済みの `UnitPriceCalculator` コンポーネント群が利用可能になった。

### 3. 変更理由
- 次ステップ（記帳タブ `RegisterTab.tsx` および明細編集モーダル `EditTransactionModal.tsx` への組み込み）に向けて、単一・一括行のどちらのレイアウトにも柔軟に組み込める堅牢な計算補助UIを提供するため。

### 4. 影響範囲
- `src/components/UnitPriceCalculator.tsx` (新規)
- `Plan.md`, `AICHANGELOG.md`

## [2026-11-15] 【Phase 10.1】単価×個数計算ヘルパー・境界値バリデーション & 多言語翻訳キー追加

### 1. 概要
要件 2-7（支出金額入力欄の「単価×個数」計算補助機能）の基盤として、計算・境界値検証ロジックと日英翻訳辞書を実装した：
1. **単価×個数計算ヘルパー追加 (`src/lib/utils.ts`)**:
   - `calculateUnitTotal(unitPrice, quantity)` および関連型（`UnitTotalErrorCode`, `UnitTotalResult`）を追加。
   - 単価・個数双方に対する正の整数チェック（半角数字、1以上、小数・負数・0・非数値拒否）および `BigInt` 乗算によるオーバーフロー安全な境界値検証（`1 <= 合計金額 <= MAX_AMOUNT (9,999,999,999)`）を実装。
2. **多言語翻訳キー追加 (`src/lib/i18n.ts`)**:
   - `translations.ja.register` および `translations.en.register` に、計算補助UI用ラベル（`unitCalcToggle`, `unitCalcToggleTitle`, `unitPriceLabel`, `unitPricePlaceholder`, `quantityLabel`, `quantityPlaceholder`, `unitCalcTotalLabel`, `unitCalcInvalidUnitPrice`, `unitCalcInvalidQuantity`, `unitCalcExceedsMax`）を追加。

### 2. 変更内容 (Before / After)
- **Before**: 単価と個数から取引金額上限（`MAX_AMOUNT`）を考慮して安全に合計金額を算出・検証する純粋関数および多言語UI用ラベルが存在しなかった。
- **After**: 整数・境界値・未入力を厳密に区別する `calculateUnitTotal()` 関数と、日英両対応の計算補助UI翻訳キーが利用可能になった。

### 3. 変更理由
- 後続タスク（`UnitPriceCalculator.tsx` コンポーネント作成および記帳タブ・明細編集モーダルへの組み込み、単体テスト作成）で共通利用できる信頼性の高い計算・検証基盤および多言語対応を整えるため。

### 4. 影響範囲
- `src/lib/utils.ts`
- `src/lib/i18n.ts`
- `Plan.md`, `AICHANGELOG.md`

## [2026-11-15] 【Phase 9】費目マスターメンテナンス機能の実装

### 1. 概要
`for_agent/` 配下の仕様書改訂に基づき、管理タブ（`AdminTab`）内に「費目マスター管理」機能および `/api/categories` の完全な CRUD・並び替え・アーカイブ/復元 API を実装した：
1. **DB スキーマ・マイグレーション・シード拡張 (`src/db/schema/tenant.ts`, `src/db/migrate.ts`, `src/db/seed.ts`, `src/app/api/auth/signup/route.ts`, `src/types/index.ts`)**:
   - `categories` テーブルに `is_system`（`BOOLEAN DEFAULT FALSE NOT NULL`）カラムを追加し、初期プリセット12費目を保護対象として識別。
   - 既存テナントスキーマ向けに `ADD COLUMN IF NOT EXISTS is_system` および既存標準12費目への `is_system = TRUE` バックフィルを `migrate.ts` に実装。
2. **バリデーション・保護ロジック & `/api/categories` API 完全実装 (`src/lib/category-helpers.ts`, `src/app/api/categories/route.ts`)**:
   - `GET`: `includeArchived=true`（管理者限定）対応、`sortOrder ASC` 順での返却。
   - `POST`: 家庭管理者（`admin`）限定、重複名・文字数・カラー検証、末尾 `sortOrder` 自動採番、`audit_logs` 記録。
   - `PUT`: 家庭管理者（`admin`）限定、編集（`update`: 標準12費目保護）・全費目並び順一括更新（`reorder`: 標準12費目含む）・アーカイブ復元（`restore`）、`audit_logs` 記録。
   - `DELETE`: 家庭管理者（`admin`）限定、論理削除アーカイブ（`isArchived = true`、標準12費目保護）、`audit_logs` 記録。
3. **管理タブ UI & 多言語対応 (`src/components/AdminTab.tsx`, `src/components/CategoryEditModal.tsx`, `src/lib/i18n.ts`, `src/app/page.tsx`)**:
   - 管理タブ内に「費目マスター管理」セクションを新設し、標準費目保護バッジ表示、全費目の上下並び替え、追加・編集モーダル、アーカイブ・復元トグル一覧を実装。変更時は `onRefreshAll()` で記帳・検索・ダッシュボードへ即時反映。
4. **仕様書同期・単体テスト追加 (`for_agent/*`, `scripts/test-categories-unit.ts`)**:
   - `for_agent/01, 03, 04, 05, 06` を最新仕様に同期し、費目バリデーション・標準12費目保護ロジックの単体テスト `scripts/test-categories-unit.ts` を追加・実行。

### 2. 変更内容 (Before / After)
- **Before**: 初期プリセット12種の自動投入と `GET` / `POST /api/categories`（権限チェック・重複検証・監査ログなし）のみが存在し、UI上から費目の追加・編集・並び替え・アーカイブ・復元ができなかった。
- **After**: 家庭管理者のみが管理タブから安全に費目の追加・編集・全費目並び替え・アーカイブ・復元を行えるようになり、標準12費目は編集・アーカイブから保護され、すべての操作が `audit_logs` に記録されるようになった。

### 3. 変更理由
- ユーザーが家計簿の運用スタイルに合わせてカスタム費目を追加・整理・表示順調整できるようにしつつ、標準費目の誤削除・誤変更や一般メンバーによるマスタ改変を防止するため。

### 4. 影響範囲
- `for_agent/01_requirements_specification.md`, `for_agent/03_database_design.md`, `for_agent/04_api_specifications.md`, `for_agent/05_ui_ux_and_design_system.md`, `for_agent/06_operation_and_testing_guide.md`
- `src/db/schema/tenant.ts`, `src/db/migrate.ts`, `src/db/seed.ts`, `src/types/index.ts`
- `src/lib/category-helpers.ts` (新規), `src/lib/i18n.ts`
- `src/app/api/auth/signup/route.ts`, `src/app/api/categories/route.ts`, `src/app/page.tsx`
- `src/components/AdminTab.tsx`, `src/components/CategoryEditModal.tsx` (新規)
- `scripts/test-categories-unit.ts` (新規)
- `Plan.md`, `AICHANGELOG.md`

## [2026-11-14] 【Hotfix】Docker 本番ビルド時の `next/font/google` エラー解消（@fontsource セルフホスト化）

### 1. 概要
Docker コンテナ環境で `npm run build` を実行した際に発生した `src/app/layout.tsx` の `next/font` エラー（`TypeError: Cannot read properties of null (reading '1') at @next/font/dist/google/loader.js:122:78`）を根本解消するため、ビルド時の Google Fonts 外部通信を撤廃し、`@fontsource` パッケージによるセルフホストへ切り替えた：
1. **依存パッケージの追加 (`package.json`, `package-lock.json`)**:
   - `@fontsource/noto-sans-jp` (`5.3.1`) および `@fontsource/plus-jakarta-sans` (`5.3.0`) を追加。
2. **フォント読み込み・Tailwind 設定の更新 (`src/app/layout.tsx`, `tailwind.config.ts`)**:
   - `next/font/google` の `Noto_Sans_JP` / `Plus_Jakarta_Sans` の呼び出しを削除し、`@fontsource/noto-sans-jp`（400/500/600/700）および `@fontsource/plus-jakarta-sans`（500/600/700/800）の CSS を直接インポート。
   - `tailwind.config.ts` の `fontFamily`（`sans`, `display`）を `'Noto Sans JP'`, `'Plus Jakarta Sans'` に更新。
3. **ガードレール追記 (`for_agent/guardrails.md`)**:
   - 本番 Docker ビルドでの外部ネットワーク依存を排除するため、`next/font/google` を使用しない旨の再発防止ガードレールを追記。

### 2. 変更内容 (Before / After)
- **Before**: `next build` 実行時に Google Fonts (`fonts.googleapis.com` / `fonts.gstatic.com`) へアクセスして数百のフォントファイルを取得・解析していたため、Docker 環境で `loader.js:122` の正規表現パースエラーが発生する場合があった。
- **After**: フォントファイルが npm パッケージ内に同梱され、完全オフライン・確定的にローカルからバンドル（`font-src 'self'` 準拠）される構成となった。

### 3. 変更理由
- Docker 本番ビルド時の `next/font/google` 障害を完全に排除し、どの本番環境でも安定してビルド成功させるため。

### 4. 影響範囲
- `package.json`, `package-lock.json`
- `src/app/layout.tsx`
- `tailwind.config.ts`
- `for_agent/guardrails.md`
- `AICHANGELOG.md`

## [2026-11-14] 【Phase 8】自宅サーバー・ミニPC向け本番環境構築手順書の整備および Docker 本番ビルド構成の不備修正

### 1. 概要
ユーザーの要望（自宅サーバー・ミニPC・NAS等の環境＋独自ドメイン HTTPS 化による本番構築）に基づき、本番用 Docker ビルド・マイグレーション構成の不整合を修正するとともに、実践的な本番環境構築・運用手順書を整備した：
1. **本番用 Docker ビルド・マイグレーション構成の修正**:
   - `next.config.ts`: `Dockerfile` の `COPY --from=builder /app/.next/standalone ./` に対応する `output: "standalone"` 設定を追加。
   - `.dockerignore`: ホスト側の `node_modules`（Windows バイナリ等）や `.next`、`.env*` が Docker ビルドコンテキストに混入し Linux コンテナ内のネイティブモジュール（`@node-rs/argon2`）を上書きする問題を防止するため新規作成。
   - `Dockerfile`: `runner` ステージ内から `docker compose exec app npm run db:migrate` および `npm run db:seed` が正常実行できるよう、`node_modules`, `package.json`, `tsconfig.json`, `src/db`, `src/lib` を適切に配置。
   - `.env.production.example` & `docker-compose.prod.yml`: 本番環境変数テンプレートを作成し、PostgreSQL タイムゾーン（`Asia/Tokyo`）や環境変数注入を整理。
2. **本番環境構築・運用手順書の全面拡充 (`docs/environment_setup_guide.md`, `for_agent/06_operation_and_testing_guide.md`, `README.md`)**:
   - OpenSSL による安全なシークレット生成手順（Fail-Fast 仕様への対応）。
   - 独自ドメイン＋HTTPS 化の 3 方式（方式A: ポート開放不要の Cloudflare Tunnel、方式B: Nginx + Let's Encrypt、方式C: Tailscale Serve による VPN 閉域網 HTTPS）および CSRF `Origin`/`Host` 検証・`Secure` Cookie に関する必須ヘッダー設定手順。
   - 初期セットアップ（Web サインアップまたはシード投入、家族メンバーの招待リンク発行）。
   - 日常運用（`pg_dump` による全スキーマ一括バックアップ & cron 自動化、`psql` リストア、安全なアップデート手順、トラブルシューティング FAQ）。

### 2. 変更内容 (Before / After)
- **Before**:
  - `next.config.ts` に `output: "standalone"` が未設定であり、`.dockerignore` も存在しなかったため、Docker 本番ビルド時に `.next/standalone` 未生成エラーやホスト側 `node_modules` 混入が発生する状態だった。
  - `Dockerfile` の `runner` ステージに `src/db/migrate.ts` 等が含まれておらず、本番コンテナでの `npm run db:migrate` が実行できなかった。
  - `.env.production.example` が存在せず、自宅サーバーでの HTTPS 化やリバースプロキシのヘッダー設定、バックアップ手順の記載が不足していた。
- **After**:
  - `next.config.ts`、`.dockerignore`、`Dockerfile`、`docker-compose.prod.yml`、`.env.production.example` が完全に整合し、本番コンテナのビルドからマイグレーションまで一貫して動作する構成となった。
  - `docs/environment_setup_guide.md` に自宅サーバー・ミニPC＋独自ドメイン HTTPS 化のステップ・バイ・ステップ手順書を完備した。

### 3. 変更理由
- 自宅サーバー・ミニPC 環境で本番運用を開始するにあたり、Docker ビルド・マイグレーション時の不整合を事前に解消し、セキュリティ仕様（Fail-Fast、`Secure` Cookie、CSRF `Origin`/`Host` 検証）を満たす確実な構築・運用手順を提供するため。

### 4. 影響範囲
- `next.config.ts`
- `.dockerignore` (新規)
- `Dockerfile`
- `docker-compose.prod.yml`
- `.env.production.example` (新規)
- `docs/environment_setup_guide.md`
- `for_agent/06_operation_and_testing_guide.md`
- `README.md`
- `Plan.md`
- `AICHANGELOG.md`

## [2026-10-18] 【Review】全体のビルド・テスト・仕様整合性の点検および仕様書・設定の完全同期

### 1. 概要
`review` スキルに基づき、`for_agent/` 配下の全仕様書、`AGENTS.md`、および実装コード・テストスイート全体の包括的点検を実施した：
1. **仕様書と実装コード・依存バージョンの突合・最新化**:
   - `for_agent/00_system_overview.md`: セキュリティパッチ適用後の Next.js (`15.5.28`) および Drizzle ORM (`0.45.4`) の最新バージョンを反映し改訂履歴を追記。
   - `AGENTS.md`: 技術スタックの Framework/ORM バージョン表記を更新し、検証 Ground Truth にセキュリティ単体テスト（`scripts/test-security-unit.ts`）を追加。
   - `for_agent/01_requirements_specification.md`: Phase 7 で実装された動的スキーマ名ホワイトリスト検証（1-5）、レートリミッター（1-6）、HTTP セキュリティヘッダー & CSRF 防御（1-7）、DB 突合リアルタイム認可 & セッション失効（1-8）、CSV 数式インジェクション防御（要件 7）、金額・残高境界値検証および DB トランザクション原子性（要件 11）を要件仕様に反映し改訂履歴を追記。
   - `for_agent/06_operation_and_testing_guide.md`: 2.2 単体テストに、作成済みの全単体テストスクリプト（`test-auth-session-unit.ts`, `test-rate-limit-csrf.ts`, `test-security-unit.ts` 等）を追加し改訂履歴を追記。
2. **全単体テストスイート & フルビルドによる回帰検証 (Ground Truth)**:
   - `scripts/test-csv-unit.ts` (Exit Code 0)
   - `scripts/test-members-unit.ts` (Exit Code 0)
   - `scripts/test-auth-session-unit.ts` (Exit Code 0)
   - `scripts/test-rate-limit-csrf.ts` (Exit Code 0)
   - `scripts/test-security-unit.ts` (Exit Code 0 - 静的コード検査 58 ファイル含む)
   - `npx tsc --noEmit` (Exit Code 0)
   - `npm run build` (Exit Code 0 - 全 22 ページのビルド成功)

### 2. 変更内容 (Before / After)
- **Before**:
  - `for_agent/00_system_overview.md` および `AGENTS.md` の技術スタック表に旧バージョン（Next.js 15.1.6, Drizzle ORM 0.38.4）が残存していた。
  - `for_agent/01_requirements_specification.md` に Phase 7 のセキュリティ強化要件（スキーマ検証、レートリミット、CSRF、トランザクション原子性等）が未反映だった。
  - `for_agent/06_operation_and_testing_guide.md` に一部の単体テスト（認証セッション、レートリミット/CSRF）の実行手順が記載されていなかった。
- **After**:
  - 全仕様書および `AGENTS.md` が最新の実装コードおよびセキュリティ仕様と完全に一致した。
  - プロジェクト内の全 5 つの単体テストスクリプト、型チェック、およびプロダクションビルドがすべて Exit Code 0 で正常終了することを確認した。

### 3. 変更理由
- システムの全仕様書、管理ドキュメント、および実装コードの完全な整合性を保証し、回帰バグがないことを網羅的な自動テストで証明するため。

### 4. 影響範囲
- `AGENTS.md`
- `for_agent/00_system_overview.md`
- `for_agent/01_requirements_specification.md`
- `for_agent/06_operation_and_testing_guide.md`
- `AICHANGELOG.md`

## [2026-10-18] 【Task 7.8】セキュリティ単体テストの作成・仕様書 (for_agent/) 同期・総合ビルド検証

### 1. 概要
ペネトレーションテスト改修（Phase 7: VULN-01〜VULN-12）の完了に伴い、セキュリティ強化項目の恒久的な品質担保と仕様書・ガードレールの同期を実施した：
1. **セキュリティ単体テスト & 静的コード検査の作成・実行 (`scripts/test-security-unit.ts`)**:
   - 動的テナントスキーマ名バリデーション（`assertValidSchemaName`）: ホワイトリスト正規表現による SQL インジェクションおよび不正文字・超過文字列の拒否検証。
   - CSV 数式インジェクション（Formula Injection）防御: 数式トリガー文字（`=`, `+`, `-`, `@`, `\t`, `\r`）へのシングルクォート付与および純粋な負の数値型の計算互換性保持の検証。
   - 金額・残高の境界値バリデーション: `isValidAmount`, `isValidBalance`, `parseValidAmount`, `parseValidBalance` による整数判定・範囲チェック検証。
   - スライディングウィンドウ方式レートリミッター: リクエスト回数制限、`429 Too Many Requests` 時の `retryAfterSeconds` 返却、リセット動作の検証。
   - `raw.unsafe` ゼロ件静的コード検査: `src/` 配下の全 58 ソースファイルを LF 正規化の上で走査し、直接 SQL 実行が 0 件であることを客観的に検証。
2. **仕様書 (`for_agent/`) の最新化・セキュリティ設計の統合**:
   - `for_agent/02_architecture_and_tech_stack.md`: 第2章にスキーマ名バリデーション、リアルタイム権限検証・セッション失効、レートリミッター、セキュリティヘッダー & CSRF 防御、Fail-Fast 環境変数検証の仕様を追記し改訂履歴を更新。
   - `for_agent/04_api_specifications.md`: 第8章「API セキュリティ & バリデーション仕様」を追加（金額境界値、レートリミット、DB トランザクション原子性、CSV 数式インジェクション無害化、CSRF Origin 検証）し改訂履歴を更新。
   - `for_agent/06_operation_and_testing_guide.md`: 2.2 単体テストに `test-security-unit.ts` の実行手順を追加し改訂履歴を更新。
   - `for_agent/guardrails.md`: 金額境界値検証、CSV 数式インジェクション防御、DB トランザクション原子性、`raw.unsafe` ゼロ件検査の維持に関するガードレールを追記し改訂履歴を更新。
3. **客観的検証 (Ground Truth)**:
   - セキュリティ単体テスト: `npx tsx scripts/test-security-unit.ts` (Exit Code 0)
   - 既存単体テスト: `npx tsx scripts/test-csv-unit.ts`, `npx tsx scripts/test-members-unit.ts` (Exit Code 0)
   - 型チェック: `npx tsc --noEmit` (Exit Code 0)
   - プロダクションビルド: `npm run build` (Exit Code 0)

### 2. 変更内容 (Before / After)
- **Before**:
  - セキュリティ機能（スキーマ検証、CSV数式無害化、金額境界値、レートリミッター、`raw.unsafe`排除）を網羅的に検証する単体テストスクリプトが存在しなかった。
  - `for_agent/` 配下の仕様書およびガードレールに Phase 7 で実施した脆弱性改修仕様（VULN-01〜VULN-12）の体系的な記録が不足していた。
- **After**:
  - `scripts/test-security-unit.ts` を新規作成し、DB 接続不要で高速に全セキュリティ仕様と静的コード走査（58ファイル）を自動テスト可能にした。
  - `for_agent/02_architecture_and_tech_stack.md`, `04_api_specifications.md`, `06_operation_and_testing_guide.md`, `guardrails.md` を最新セキュリティ仕様に完全同期した。

### 3. 変更理由
- 今後の開発・改修においてセキュリティ脆弱性が再混入することを防ぐため、単体テストによる自動検査網を構築し、仕様書とガードレールに明文化して開発規約として定着させるため。

### 4. 影響範囲
- `scripts/test-security-unit.ts` (新規)
- `for_agent/02_architecture_and_tech_stack.md`
- `for_agent/04_api_specifications.md`
- `for_agent/06_operation_and_testing_guide.md`
- `for_agent/guardrails.md`
- `Plan.md`
- `AICHANGELOG.md`

## [2026-10-18] 【VULN-03, VULN-05, VULN-12】脆弱な NPM 依存パッケージのアップデートと互換性検証

### 1. 概要
ペネトレーションテスト結果（VULN-03, VULN-05, VULN-12）に基づき、脆弱性が報告されていた主要パッケージおよび間接依存パッケージのセキュリティパッチ適用を実施した：
1. **Next.js のアップデート (`15.1.6` → `15.5.28`)**:
   - Windows 環境における未認証リモートコード実行 (RCE) 脆弱性 (GHSA-p293-qw3h-jr36) を解消。
   - 画像最適化 API における AVIF ファイル悪用 RCE 脆弱性 (GHSA-2xp9-vwfh-vxw4) を解消。
   - SSG/ISR キャッシュポイズニング脆弱性 (GHSA-4jqv-mc3x-m676, GHSA-mcj8-r9mp-w47p) を解消。
2. **Drizzle ORM & Kit のアップデート (`drizzle-orm: 0.38.4` → `0.45.4`, `drizzle-kit: 0.30.4` → `0.31.11`)**:
   - 不適切にエスケープされた SQL 識別子による SQL インジェクション脆弱性 (GHSA-gpj5-g38j-94v9) を構造的に解消。
3. **`overrides` による間接依存パッケージのセキュリティパッチ強制適用**:
   - `postcss`: `8.5.30`（XSS / 任意ファイル読み取り / ソースマップパストラバーサル脆弱性 GHSA-qx2v-qp2m-jg93, GHSA-6g55-p6wh-862q, GHSA-fxqj-rqcc-2cmp, GHSA-r28c-9q8g-f849 を解消）
   - `postcss-selector-parser`: `7.1.6`（CPU 枯渇 DoS 脆弱性 GHSA-rj75-hqrm-r3gf を解消）
   - `sharp`: `0.35.5`（libvips, libheif, librsvg 関連脆弱性 GHSA-f88m-g3jw-g9cj, GHSA-rgj7-g3m4-5g8c, GHSA-wq5f-xc86-pv6w を解消）
   - `shell-quote`: `1.12.0`（コマンドインジェクション脆弱性 GHSA-pqg4-j6r4-53mv を解消）
   - `source-map-js`: `1.2.2`（イベントループ DoS 脆弱性 GHSA-68fv-2mgg-jv7q を解消）
   - `fast-copy`: `4.2.0`（スタック枯渇 DoS 脆弱性 GHSA-jggr-w7fw-pc2j を解消）
   - `esbuild`: `0.28.2`（開発サーバーの不正リクエスト受信脆弱性 GHSA-67mh-4wv8-2f99 を解消）
   - `braces`: `3.0.3`
4. **客観的検証 (Ground Truth)**:
   - `npm audit`: 当初 18 件（Critical 2件、High 9件、Moderate 7件）存在した脆弱性のうち、Critical および Moderate をゼロにし、主要な High 脆弱性をすべて解消。
   - 型チェック: `npx tsc --noEmit` によるエラーゼロ（Exit Code 0）を確認。
   - プロダクションビルド: `npm run build` による全 22 ページの正常ビルド完了（Exit Code 0）を確認。

### 2. 変更内容 (Before / After)
- **Before**:
  - `package.json`:
    - `next`: `^15.1.6`（Windows RCE, AVIF RCE, SSG キャッシュポイズニング脆弱性）
    - `drizzle-orm`: `^0.38.4`（SQL インジェクション脆弱性 GHSA-gpj5-g38j-94v9）
    - `drizzle-kit`: `^0.30.4`
    - `postcss`: `^8.5.1`（XSS, 任意ファイル読み取り脆弱性）
    - `overrides` 未設定のため、間接依存の `sharp`, `shell-quote`, `source-map-js`, `fast-copy`, `esbuild`, `postcss-selector-parser` 等に脆弱性バージョンが採用されていた。
- **After**:
  - `package.json`:
    - `next`: `^15.5.28`
    - `drizzle-orm`: `^0.45.4`
    - `drizzle-kit`: `^0.31.11`
    - `postcss`: `^8.5.30`
    - `overrides`: `braces`, `esbuild`, `fast-copy`, `postcss`, `postcss-selector-parser`, `sharp`, `shell-quote`, `source-map-js` を最新安全バージョンにピン留め。
  - `package-lock.json`:
    - セキュリティパッチ適用済みバージョンで依存関係ツリーを再解決。

### 3. 変更理由
- ペネトレーションテストで指摘された依存ライブラリの既知脆弱性（特に Windows 実行時 RCE、SQL インジェクション、コマンドインジェクション）を迅速かつ安全に排除し、サプライチェーン攻撃や DoS 攻撃のリスクを最小化するため。

### 4. 影響範囲
- `package.json`
- `package-lock.json`
- `Plan.md`
- `AICHANGELOG.md`

## [2026-10-18] 【VULN-08 & VULN-11】認証・重要 API のレートリミッター導入および HTTP セキュリティヘッダー・CSRF Origin 検証の実装

### 1. 概要
ペネトレーションテスト結果（VULN-08 & VULN-11）に基づき、以下のセキュリティ強化を実施した：
1. `src/lib/rate-limit.ts` にスライディングウィンドウ方式のレートリミッターを実装。クライアントIPおよびアカウント単位のタイムスタンプ記録・期限切れ自動GC・429 Too Many Requests レスポンス（`Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`）を提供。
2. 認証・重要API（`POST /api/auth/login`, `POST /api/auth/signup`, `POST /api/auth/invite`）にレートリミッターを適用し、ブルートフォース攻撃や動的テナントスキーマ生成を悪用したリソース枯渇DoS攻撃を遮断。
3. `src/lib/csrf.ts` および `src/middleware.ts` を新設し、API に対する状態変更リクエスト（POST / PUT / DELETE / PATCH）において `Origin` / `Host` ヘッダー整合性検証および `Sec-Fetch-Site: cross-site` 検出を実施。クロスサイトリクエストフォージェリ（CSRF）攻撃を多層防御で `403 Forbidden` 遮断。
4. `next.config.ts` の `headers()` に `X-Frame-Options: DENY`、`X-Content-Type-Options: nosniff`、`Referrer-Policy: strict-origin-when-cross-origin`、`Permissions-Policy`、および Next.js に最適化した `Content-Security-Policy` を設定。
5. 単体テスト（`scripts/test-rate-limit-csrf.ts`）、TypeScript型チェック（`npx tsc --noEmit`）、プロダクションビルド（`npm run build`）のすべてで正常終了（Exit Code 0）を確認。

### 2. 変更内容 (Before / After)
- **Before**:
  - `src/lib/rate-limit.ts`: レートリミッターが存在せず、認証・重要APIに対する無制限のブルートフォース試行や新規登録によるスキーマ生成DoS攻撃が可能だった。
  - `src/lib/csrf.ts` & `src/middleware.ts`: API への状態変更リクエストに対する Origin / Host 整合性検証が存在しなかった。
  - `next.config.ts`: HTTP セキュリティヘッダー（CSP, X-Frame-Options 等）が未設定だった。
  - `src/app/api/auth/login/route.ts`: 同一IPや同一アカウントからの短時間での大量ログイン試行が制限されていなかった。
  - `src/app/api/auth/signup/route.ts`: 短時間での大量世帯・テナントスキーマ生成に対する制限がなかった。
  - `src/app/api/auth/invite/route.ts`: 招待参加およびトークン検証に対するリクエスト頻度制限がなかった。
- **After**:
  - `src/lib/rate-limit.ts`:
    - スライディングウィンドウ方式のレートリミッター（`checkRateLimit`, `createRateLimitResponse`, `getClientIp`）を実装。
    - ログイン用（IP: 10回/分、アカウント: 5回/分）、サインアップ用（IP: 5回/分）、招待用（IP: 10回/分）のプリセットを定義。
  - `src/lib/csrf.ts` & `src/middleware.ts`:
    - `validateCsrfOrigin(req)` による Origin/Host および Referer 整合性検証、`Sec-Fetch-Site: cross-site` 検出を実装。
    - Next.js のミドルウェア（`src/middleware.ts`）で `/api/*` の POST/PUT/DELETE/PATCH リクエストを自動保護。
  - `next.config.ts`:
    - `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `Content-Security-Policy` を設定。
  - `src/app/api/auth/login/route.ts`:
    - IP 単位およびメールアドレス単位のレートリミットを適用。
  - `src/app/api/auth/signup/route.ts`:
    - IP 単位のレートリミット（5回/分）を適用し、テナントスキーマ動的生成 DoS を防御。
  - `src/app/api/auth/invite/route.ts`:
    - GET（10回/分）および POST（10回/分）に IP 単位のレートリミットを適用。
  - `scripts/test-rate-limit-csrf.ts`:
    - レートリミッター動作および CSRF 検証の網羅的な単体テストを作成・実行。

### 3. 変更理由
- 認証エンドポイントへの総当たり（ブルートフォース）攻撃、動的スキーマ生成によるサービス妨害（DoS）攻撃、クロスサイトリクエストフォージェリ（CSRF）攻撃、およびクリックジャッキング等の Web アプリケーション脆弱性を多層的に防御するため。

### 4. 影響範囲
- `src/lib/rate-limit.ts` (新規)
- `src/lib/csrf.ts` (新規)
- `src/middleware.ts` (新規)
- `next.config.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/signup/route.ts`
- `src/app/api/auth/invite/route.ts`
- `scripts/test-rate-limit-csrf.ts` (新規)
- `Plan.md`
- `AICHANGELOG.md`

## [2026-10-18] 【VULN-09】金額・入力パラメータの厳格な境界値バリデーションと DB トランザクション原子性の保証

### 1. 概要
ペネトレーションテスト結果（VULN-09）に基づき、以下のセキュリティ強化および整合性保証を実施した：
1. `src/lib/utils.ts` に金額・口座残高・一括処理の上限定数（`MIN_AMOUNT=1`、`MAX_AMOUNT=9_999_999_999`、`MIN_BALANCE=0`、`MAX_BALANCE=9_999_999_999`、`MAX_BATCH_TRANSACTIONS=500`、`MAX_CSV_FILE_SIZE=5MB`、`MAX_CSV_ROWS=5000`）および厳格な整数検証関数（`isValidAmount`、`isValidBalance`、`parseValidAmount`、`parseValidBalance`）を実装。
2. `src/app/api/transactions/route.ts`（POST / PUT / DELETE）、`src/app/api/accounts/route.ts`（POST / PUT）、`src/app/api/admin/csv/route.ts`（POST preview / import）、`src/app/api/goals/route.ts`（POST）の全エンドポイント入口で不正な金額・残高・ファイルサイズ・行数を `400 Bad Request` で拒絶する境界値バリデーションを導入。
3. `transactions`（POST / PUT / DELETE）、`admin/csv`（POST import）、`admin/revert`（POST）における複数テーブル操作および残高更新処理を `db.transaction(async (tx) => { ... })` で囲み、エラー発生時の完全ロールバックとデータベースの原子性（ACID整合性）を保証。
4. 単体テスト（`scratch/test-vuln09.ts`）、TypeScript型チェック（`npx tsc --noEmit`）、Next.js プロダクションビルド（`npm run build`）の全通過（Exit Code 0）を確認。

### 2. 変更内容 (Before / After)
- **Before**:
  - `src/lib/utils.ts`:
    - 金額や残高の境界値検証ロジックが存在せず、負の金額、極端に巨大な数値（整数オーバーフローや浮動小数点数）の入力チェックが各APIで統一されていなかった。
  - `src/app/api/transactions/route.ts`:
    - POSTでの一括登録件数制限がなく、DoS攻撃や極端な大量登録が可能だった。
    - 残高更新、明細登録、タグ紐付け、監査ログ記録が個別に行われており、途中でエラーが発生した場合に一部の口座残高のみが更新されたまま残る不整合リスクがあった。
    - PUTおよびDELETE時も口座残高ロールバックと明細更新が非トランザクションで実行されていた。
  - `src/app/api/accounts/route.ts`:
    - 口座登録時の初期残高や資金色分け（予約額）の境界値チェックが不十分で、負の値や無効な数値がそのままDBに登録される恐れがあった。
  - `src/app/api/admin/csv/route.ts`:
    - CSVファイルサイズ（5MB制限）や行数（5,000行制限）のガードレールがなく、巨大ファイルによるメモリ枯渇DoSリスクがあった。
    - インポート処理が非トランザクションで実行されており、途中でエラーが発生した場合に一部の明細のみがインポートされ残高不整合となるリスクがあった。
  - `src/app/api/admin/revert/route.ts`:
    - リバート処理中の複数口座残高逆算・明細削除・一時保存削除・チェックポイント無効化が非トランザクションで実行されていた。
  - `src/app/api/goals/route.ts`:
    - 目標金額（targetAmount）の境界値バリデーションが未実施だった。
- **After**:
  - `src/lib/utils.ts`:
    - `MIN_AMOUNT` (1), `MAX_AMOUNT` (9,999,999,999), `MIN_BALANCE` (0), `MAX_BALANCE` (9,999,999,999), `MAX_BATCH_TRANSACTIONS` (500), `MAX_CSV_FILE_SIZE` (5MB), `MAX_CSV_ROWS` (5,000) を定義。
    - `isValidAmount`, `isValidBalance`, `parseValidAmount`, `parseValidBalance` をエクスポート。
  - `src/app/api/transactions/route.ts`:
    - POST: 最大500件上限チェック、各明細の金額・取引種別・日付バリデーションを追加し、全体を `db.transaction(async (tx) => { ... })` でアトミック化。
    - PUT: 金額（1〜9,999,999,999円）・日付バリデーションを追加し、残高同期と明細更新を `db.transaction` でアトミック化。存在しないID時は404を返却。
    - DELETE: 残高巻き戻しと論理削除処理を `db.transaction` でアトミック化。
  - `src/app/api/accounts/route.ts`:
    - POST / PUT: 口座残高（0〜9,999,999,999円）および資金色分け金額（1〜9,999,999,999円）の境界値バリデーションを導入。
  - `src/app/api/admin/csv/route.ts`:
    - 最大5MBのファイルサイズ / データサイズ制限、最大5,000行の行数制限を導入。
    - プレビューおよびインポート時の金額境界値バリデーション（`isValidAmount`）を適用。
    - インポート登録処理全体を `db.transaction` でアトミック化。
  - `src/app/api/admin/revert/route.ts`:
    - リバート処理全体を `db.transaction` でアトミック化し、残高逆算・明細削除・一時保存初期化の完全ロールバックを保証。
  - `src/app/api/goals/route.ts`:
    - POST: 目標金額（1〜9,999,999,999円）の境界値バリデーションを導入。

### 3. 変更理由
- 異常値・巨大数値・負の金額の混入による家計簿残高の破壊やDoS攻撃を遮断し、複数のDB更新処理が途中で失敗した場合でもデータ不整合が一切生じないようトランザクション原子性を確立するため。

### 4. 影響範囲
- `src/lib/utils.ts`
- `src/app/api/transactions/route.ts`
- `src/app/api/accounts/route.ts`
- `src/app/api/admin/csv/route.ts`
- `src/app/api/admin/revert/route.ts`
- `src/app/api/goals/route.ts`
- `Plan.md`
- `AICHANGELOG.md`

## [2026-10-18] 【VULN-07】CSV エクスポートにおける CSV インジェクション (Formula Injection) 防御と RFC 4180 エスケープ統一

### 1. 概要
ペネトレーションテスト結果（VULN-07）に基づき、以下のセキュリティ強化を実施した：
1. `src/lib/csv.ts` の `escapeCsvCell()` を拡張し、セル文字列の先頭文字が数式トリガー文字（`=`, `+`, `-`, `@`, `\t`, `\r`）に該当する場合、先頭にシングルクォート（`'`）を付与して Excel / スプレッドシートでの数式・DDE 実行を無害化する処理を実装。
2. 口座残高などの計算用数値を壊さないよう、純粋な数値型（`typeof value === "number"`。負の数値 `-1500` 等を含む）および真偽値・BigInt 型を数式エスケープの対象外として保護。
3. `src/app/api/admin/csv/route.ts` の `GET`（口座一覧・全明細の CSV エクスポート）における手動文字列結合を全廃し、`generateCsv()` を使用した RFC 4180 準拠エスケープ出力に統一。
4. 単体テスト（`scripts/test-csv-unit.ts`）、TypeScript型チェック（`npx tsc --noEmit`）、Next.js プロダクションビルド（`npm run build`）の全通過（Exit Code 0）を確認。

### 2. 変更内容 (Before / After)
- **Before**:
  - `src/lib/csv.ts`:
    - `escapeCsvCell()` がダブルクォーテーションの二重化（`""`）と外側クォート囲みのみを行っており、`=`、`+`、`-`、`@`、`\t`、`\r` で始まる文字列セルがスプレッドシート閲覧時に数式や DDE コマンドとして自動実行される CSV インジェクション（Formula Injection）の脆弱性があった。
  - `src/app/api/admin/csv/route.ts`:
    - `GET` エンドポイントで `csvContent += `"${a.id}","${a.name}"...`` や `csvContent += `"${t.id}","${t.date}"...`` のように手動でテンプレート文字列結合を行っていたため、店舗名やメモに改行・引用符・数式トリガーが含まれていた場合に CSV 構造が破壊されたりインジェクション攻撃を受ける恐れがあった。
- **After**:
  - `src/lib/csv.ts`:
    - `escapeCsvCell()` を刷新。`typeof value === "number"`（負の数値を含む純粋な数値型）や `boolean`、`Date` を適切に処理した上で、文字列セルの先頭が数式トリガー文字（`=`, `+`, `-`, `@`, `\t`, `\r`）の場合に先頭へ `'` を付与して無害化。
  - `src/app/api/admin/csv/route.ts`:
    - `generateCsv()` を導入し、口座一覧（`type === "accounts"`）および全明細（`type === "full"` / その他）のエクスポートを RFC 4180 準拠の完全安全な CSV 出力へ置換。
  - `scripts/test-csv-unit.ts`:
    - 数式トリガー記号（`=`, `+`, `-`, `@`, `\t`, `\r`）のシングルクォート無害化、および純粋な負の数値型（`-1500`）の保護を検証するテストケースを追加。

### 3. 変更理由
- 悪意あるユーザーや店舗名・メモ等に埋め込まれた数式トリガーによって、管理者が CSV を Excel 等で開いた際に意図しないコマンド実行（DDE 攻撃）や情報漏洩が発生するリスクを構造的に防止するため。
- CSV エクスポート処理を `generateCsv()` に統一し、RFC 4180 仕様（改行・引用符のエスケープ、BOM 付与）に完全準拠させるため。

### 4. 影響範囲
- `src/lib/csv.ts`
- `src/app/api/admin/csv/route.ts`
- `scripts/test-csv-unit.ts`
- `Plan.md`
- `AICHANGELOG.md`

## [2026-10-18] 【VULN-04 & VULN-06】シークレット管理の厳格化とセッション即時失効・DB突合によるリアルタイム権限検証の実装

### 1. 概要
ペネトレーションテスト結果（VULN-04 & VULN-06）に基づき、以下のセキュリティ強化を実施した：
1. `src/lib/auth.ts` および `src/db/index.ts` にて、本番環境（`NODE_ENV === "production"` かつ `NEXT_PHASE !== "phase-production-build"`）において `JWT_SECRET`（最低32文字以上かつ既知サンプルキーでないこと）または `DATABASE_URL` が未設定または不適切な場合に即座に例外をスローする Fail-Fast 検証関数（`assertValidJwtSecret`、`assertValidDatabaseUrl`）を実装。
2. `getCurrentSession()` において、JWT 署名検証後に `masterDb` で `users`（`isActive === true`）および `household_memberships`（`status === "active"`）を照会し、メンバーの無効化・削除、ロール変更（`admin` ↔ `member`）、および正規の `schemaName`（ホワイトリスト検証済み）を DB の最新状態から毎回解決して返却するリアルタイム突合検証を実装。
3. ログアウト時（`POST /api/auth/logout`）およびパスワード変更・リセット時に既存の JWT を即時無効化できるよう、メモリ上ブラックリスト（`revokeToken` / `isTokenRevoked`）および `users.updatedAt` とトークン発行時刻（`issuedAtMs` / `iat`）の突合によるトークン即時無効化機構を実装。
4. 単体テスト（`scripts/test-auth-session-unit.ts`）、TypeScript型チェック（`npx tsc --noEmit`）、Next.js プロダクションビルド（`npm run build`）の全通過（Exit Code 0）を確認。

### 2. 変更内容 (Before / After)
- **Before**:
  - `src/lib/auth.ts`:
    - `JWT_SECRET` が環境変数未設定時にハードコードされたサンプル既知文字列（`komame_super_secret_jwt_key_...`）へ暗黙フォールバックし、本番環境でも起動できてしまう脆弱性があった。
    - `getCurrentSession()` が JWT 署名と有効期限のみを検証しており、DB 側でメンバーが無効化・削除されたり権限（admin ↔ member）が降格されても、JWT の有効期限（最大7日間）が切れるまで旧権限で API へのアクセスが可能だった（Stale Session 脆弱性）。
    - ログアウト時はクライアント側の Cookie 削除のみを行っており、Cookie 値を保持した第三者による JWT 再利用をサーバー側で無効化できなかった。
  - `src/db/index.ts`:
    - `DATABASE_URL` が未設定時にローカルのデフォルト URL へ暗黙フォールバックし、本番環境での設定漏れ検知が遅れるリスクがあった。
  - `src/app/api/auth/logout/route.ts`:
    - `clearSessionCookie()` のみを呼び出し、トークン失効や DB 更新は行われていなかった。
- **After**:
  - `src/lib/auth.ts`:
    - `assertValidJwtSecret` を追加し、本番環境で空・32文字未満・既知サンプルキーの場合に即座に例外をスロー。
    - `SessionPayload` に `issuedAtMs`、`iat`、`exp` を追加。
    - `revokeToken` / `isTokenRevoked` によるトークンブラックリストを実装。
    - `getCurrentSession()` で `users`、`household_memberships`、`households` を INNER JOIN してリアルタイム検証し、`users.isActive`、`membership.status`、`membership.role`、`household.schemaName` を毎回 DB から解決。また `issuedAtMs < updatedAt.getTime()` のトークンを即時拒絶。
  - `src/db/index.ts`:
    - `assertValidDatabaseUrl` を追加し、本番環境で `DATABASE_URL` 未設定時に即座に例外をスロー。
  - `src/app/api/auth/logout/route.ts`:
    - `revokeToken(token)` による即時ブラックリスト登録と、`masterDb.update(users).set({ updatedAt: new Date() })` による全セッショントークンのグローバル即時失効化を実装。
  - `scripts/test-auth-session-unit.ts`:
    - Fail-Fast バリデーション、セッショントークン生成・検証、失効リスト、タイムスタンプ突合の単体テストを新規作成し、全パスを確認。

### 3. 変更理由
- 本番運用環境における安全なシークレット設定を強制し、既知キーの漏洩リスクを未然に防止するため。
- メンバー無効化や権限変更が即座に全 API で反映されるリアルタイム権限検証を保証し、ログアウトやパスワードリセット時にトークンが確実に失効する安全なセッションライフサイクルを確立するため。

### 4. 影響範囲
- `src/lib/auth.ts`
- `src/db/index.ts`
- `src/app/api/auth/logout/route.ts`
- `scripts/test-auth-session-unit.ts`
- `Plan.md`
- `AICHANGELOG.md`


### 1. 概要
ペネトレーションテスト結果（VULN-02 & VULN-10）に基づき、以下のセキュリティ強化を実施した：
1. `POST /api/admin/members` において、他世帯に所属する既存ユーザーを本人の同意・認証なく `household_memberships` へ直接追加していた処理を廃止し、ワンタイム招待トークンリンク（`/invite?token=...`）を発行して本人が `POST /api/auth/invite` でパスワード認証の上で参加する安全なフローへ統一。
2. `POST /api/admin/members` の `action: "reset_password"` において、対象ユーザーが他世帯にも所属している場合は世帯管理者によるグローバルパスワード（`public.users.passwordHash`）の直接上書きを `403 Forbidden` で拒否する認可ガードを実装し、クロス世帯のアカウント乗っ取りを防止。
3. `POST /api/auth/invite` による新規ユーザー参加時に `getHouseholdPasswordPolicy(household.id)` を呼び出し、招待元世帯のカスタムパスワードポリシーを強制適用。
4. `POST /api/auth/signup` および `POST /api/auth/login` において `email.trim().toLowerCase()` によるメールアドレス正規化処理を統一適用。
5. `src/app/page.tsx` において、ログインフォームの初期値からハードコードされていた平文パスワード（`Password123!`）を空文字へ初期化し、開発・検証用のクイック入力補助ボタンへ分離。
6. 単体テスト（`scripts/test-members-unit.ts`）、TypeScript型チェック（`npx tsc --noEmit`）、Next.js プロダクションビルド（`npm run build`）の全通過（Exit Code 0）を確認。

### 2. 変更内容 (Before / After)
- **Before**:
  - `src/app/api/admin/members/route.ts`:
    - 管理者が任意の既存ユーザーのメールアドレスを指定した際、ユーザー本人の認証なく直接アクティブメンバーとして世帯に追加されていた（アカウント乗っ取り・情報漏洩リスク）。
    - 管理者が `reset_password` を実行した際、対象ユーザーが複数世帯に所属していてもグローバルパスワードを無条件で上書きしていた。
  - `src/app/api/auth/invite/route.ts`:
    - 招待からの新規登録時にデフォルトのパスワードポリシー（8文字以上）のみを検証し、招待元世帯のカスタムポリシーが無視されていた。
  - `src/app/api/auth/login/route.ts` & `src/app/api/auth/signup/route.ts`:
    - メールアドレスのトリム・小文字正規化が未実施であり、大文字小文字の差異や余計な空白による認証不一致や重複のリスクがあった。
  - `src/app/page.tsx`:
    - フォーム初期値に平文パスワード（`Password123!`）が埋め込まれていた。
  - `src/components/InviteMemberModal.tsx`:
    - 既存ユーザー招待時に「登録・招待準備が完了しました」と画一的に表示されていた。
- **After**:
  - `src/app/api/admin/members/route.ts`:
    - 既存ユーザー追加時は招待リンク発行フローへ変更（`isExistingAccount: true`）。
    - `reset_password` に他世帯所属判定ガード（`sql\`\${householdMemberships.householdId} != \${session.activeHouseholdId}\`` の件数チェック）を追加し、複数世帯所属ユーザーのパスワード強制上書きを拒否。
  - `src/app/api/auth/invite/route.ts`:
    - 新規登録時に `getHouseholdPasswordPolicy(household.id)` を適用。
  - `src/app/api/auth/login/route.ts` & `src/app/api/auth/signup/route.ts`:
    - `email.trim().toLowerCase()` による統一正規化を適用。
  - `src/app/page.tsx`:
    - `email`, `password`, `householdName` を空文字初期化し、デモ用クイック入力ボタンを配置。
  - `src/components/InviteMemberModal.tsx`:
    - 既存アカウント招待時は「世帯招待リンクを発行しました」と状況に即した説明文を表示。
  - `scripts/test-members-unit.ts`:
    - カスタムパスワードポリシー検証およびメール正規化の単体テストを追加。

### 3. 変更理由
- 家族メンバー招待およびパスワードリセットにおけるアカウント乗っ取り（ATO）、ユーザー列挙、クロス世帯セキュリティ境界の侵害リスクを完全に遮断し、招待時にも世帯管理者が設定したセキュリティポリシーを確実に遵守させるため。

### 4. 影響範囲
- `src/app/api/admin/members/route.ts`
- `src/app/api/auth/invite/route.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/signup/route.ts`
- `src/app/page.tsx`
- `src/components/InviteMemberModal.tsx`
- `scripts/test-members-unit.ts`
- `Plan.md`
- `AICHANGELOG.md`

## [2026-10-18] 【VULN-01 & VULN-05】SQL インジェクションの完全根絶と動的テナントスキーマ名バリデーションの実装

### 1. 概要
ペネトレーションテスト結果（VULN-01 & VULN-05）に基づき、以下のセキュリティ強化を実施した：
1. `src/db/index.ts` に動的テナントスキーマ名のホワイトリスト検証関数 `assertValidSchemaName(schemaName: string)`（正規表現 `/^tenant_[a-zA-Z0-9_-]{1,55}$/`）を新設。`getTenantSchema()`、`getTenantDb()`、および `src/db/migrate.ts` の `createTenantTables()` の先頭で強制検証し、不正なスキーマ名（複文・メタ文字・空文字等）を即座に例外遮断する。
2. `src/app/api/transactions/route.ts`（POST / PUT / DELETE）、`src/app/api/admin/csv/route.ts`（POST import）、`src/app/api/admin/revert/route.ts`（POST）に残存していたすべての `raw.unsafe(...)` による口座残高 `UPDATE` 文を撤去。
3. Drizzle ORM のパラメータバインディングを用いたクエリ（`db.update(schema.accounts).set({ balance: sql\`${schema.accounts.balance} ...\` }).where(eq(schema.accounts.id, ...))`）へ全面的に置換し、複文実行（Stacked Queries）および文字列注入を構造的に完全遮断した。
4. 単体テスト、TypeScript型チェック（`npx tsc --noEmit`）、Next.js プロダクションビルド（`npm run build`）の全通過（Exit Code 0）を確認した。

### 2. 変更内容 (Before / After)
- **Before**:
  - `src/db/index.ts`: `getTenantSchema` および `getTenantDb` で渡された `schemaName` 文字列を検証せずそのまま使用していた。
  - `src/db/migrate.ts`: `createTenantTables(schemaName)` でスキーマ名の形式チェックを行っていなかった。
  - `src/app/api/transactions/route.ts`: POST, PUT, DELETE 内で口座残高を更新する際、テンプレートリテラルと `raw.unsafe(...)` を直接使用していた（計14箇所）。
  - `src/app/api/admin/csv/route.ts`: POST（インポート処理）内で口座残高を更新する際、`raw.unsafe(...)` を直接使用していた（計7箇所）。
  - `src/app/api/admin/revert/route.ts`: POST（リバート処理）内で口座残高を逆算復元する際、`raw.unsafe(...)` を直接使用していた（計5箇所）。
- **After**:
  - `src/db/index.ts`:
    - `assertValidSchemaName(schemaName: string)` を実装・エクスポート（`/^tenant_[a-zA-Z0-9_-]{1,55}$/` 判定）。
    - `getTenantSchema` および `getTenantDb` の先頭で呼び出し、不正値を例外スローして遮断。
  - `src/db/migrate.ts`:
    - `createTenantTables` の先頭で `assertValidSchemaName(schemaName)` を呼び出し、マイグレーション時のスキーマ名検証を強制。
  - `src/app/api/transactions/route.ts`:
    - POST, PUT, DELETE 内の残高更新をすべて `db.update(schema.accounts).set({ balance: sql\`...\` }).where(...)` へ置換し、`raw.unsafe` を完全排除。
  - `src/app/api/admin/csv/route.ts`:
    - インポート時の残高更新をすべて `db.update(schema.accounts).set({ balance: sql\`...\` }).where(...)` へ置換し、`raw.unsafe` を完全排除。
  - `src/app/api/admin/revert/route.ts`:
    - リバート時の残高逆算復元をすべて `db.update(schema.accounts).set({ balance: sql\`...\` }).where(...)` へ置換し、`raw.unsafe` を完全排除。

### 3. 変更理由
- SQLインジェクション脆弱性およびマルチテナント分離境界の突破リスクを根本的に排除し、安全なパラメータバインドクエリと厳格なスキーマ名ホワイトリスト検証を徹底するため。

### 4. 影響範囲
- `src/db/index.ts`
- `src/db/migrate.ts`
- `src/app/api/transactions/route.ts`
- `src/app/api/admin/csv/route.ts`
- `src/app/api/admin/revert/route.ts`
- `Plan.md`
- `AICHANGELOG.md`

## [2026-10-18] アプリケーション・PostgreSQLポート番号変更 (3080 / 5532) および README.md 作成・仕様書同期

### 1. 概要
ユーザーからの指示に基づき、開発環境（dev）および本番環境（prod）の稼働ポート番号を変更した。
- アプリケーション: `3000` → `3080`
- PostgreSQL 16: `5432` → `5532`

あわせて、プロジェクト総合ガイドとなる `README.md` をルートディレクトリに新規作成し、仕様書類（`for_agent/`, `docs/`）およびガードレールに新しいポート番号の記述・改訂履歴を反映した。型チェック、Next.js プロダクションビルド、単体テスト（CSV / メンバー管理）をすべて実行し、正常終了（Exit Code 0）を確認した。

### 2. 変更内容 (Before / After)
- **Before**:
  - アプリケーションはポート 3000 で起動（`docker-compose.prod.yml`, `Dockerfile`, `package.json: "dev": "next dev"`）。
  - PostgreSQL はポート 5432 で起動（`docker-compose.dev.yml: 5432:5432`, `docker-compose.prod.yml: @postgres:5432`, `.env.example`, `.env.local`）。
  - プロジェクトルートに `README.md` が存在しなかった。
  - テスト・検証スクリプトおよび仕様書内で `http://localhost:3000` やポート `5432` が記載されていた。
- **After**:
  - **設定 & コンテナ定義**:
    - `docker-compose.dev.yml`: `command: -p 5532`, `ports: ["5532:5532"]`, `healthcheck` をポート 5532 対応に改修。
    - `docker-compose.prod.yml`: `app` サービスに `ports: ["3080:3080"]`, `PORT: 3080` を設定。`DATABASE_URL` を `@postgres:5532`、PostgreSQL サービスに `command: -p 5532`、`healthcheck` をポート 5532 対応に改修。
    - `Dockerfile`: `ENV PORT=3080`, `EXPOSE 3080` に更新。
    - `package.json`: `dev` スクリプトを `next dev -p 3080`、`start` スクリプトを `next start -p 3080` に更新。
    - `.env.example`, `.env.local`: `DATABASE_URL` を `localhost:5532` に更新。
    - `src/db/index.ts`, `src/db/migrate.ts`, `src/db/seed.ts`: 環境変数未設定時のデフォルトフォールバック URL を `localhost:5532` に更新。
  - **テストスクリプト**:
    - `scripts/browser-e2e-test.ts`, `scripts/comprehensive-test.ts`, `scripts/ui-render-test.ts`: 接続先 BASE_URL を `http://localhost:3080` に更新。
  - **README.md 作成**:
    - プロジェクト概要、マルチテナント・コア機能、ポート番号構成一覧表、技術スタック、クイックスタート手順（dev: 3080 / 5532）、本番デプロイ手順（prod）、テスト検証コマンド一覧、仕様書リンクを網羅した包括的な `README.md` を作成。
  - **仕様書 & ガードレールの同期**:
    - `for_agent/00_system_overview.md`: ネットワーク & ポート構成章（第5章）を追加、改訂履歴を追記。
    - `for_agent/02_architecture_and_tech_stack.md`: ネットワーク・ポート構成章（第4章）を追加、改訂履歴を追記。
    - `for_agent/06_operation_and_testing_guide.md`: アクセスURL（`http://localhost:3080`）、事前前提条件、本番ポート構成を更新し改訂履歴を追記。
    - `for_agent/guardrails.md`: 事前確認ガードレール（ポート 5532）を更新し改訂履歴を追記。
    - `docs/environment_setup_guide.md`: アクセスURL、起動手順、改訂履歴を更新。
  - **進捗管理**:
    - `Plan.md`: Phase 6 タスクを定義・完了チェックを反映。

### 3. 変更理由
- 開発・本番環境におけるポート重複回避、セキュリティ要件、およびプロジェクトの可視性・オンボーディング体験向上のため。

### 4. 影響範囲
- `docker-compose.dev.yml`
- `docker-compose.prod.yml`
- `Dockerfile`
- `package.json`
- `.env.example`, `.env.local`
- `src/db/index.ts`, `src/db/migrate.ts`, `src/db/seed.ts`
- `scripts/browser-e2e-test.ts`, `scripts/comprehensive-test.ts`, `scripts/ui-render-test.ts`
- `README.md`
- `for_agent/00_system_overview.md`
- `for_agent/02_architecture_and_tech_stack.md`
- `for_agent/06_operation_and_testing_guide.md`
- `for_agent/guardrails.md`
- `docs/environment_setup_guide.md`
- `Plan.md`
- `AICHANGELOG.md`

## [2026-10-18] Mermaid構文エラーの修正およびガードレール追記

### 1. 概要
`docs/architecture_and_tech_stack.md` の「1. 全体アーキテクチャ方針」に記述されていたMermaid図において、パースエラー（構文エラー）が発生していた問題を修正した。また、同様の記法を用いていた仕様書正本（`for_agent/02_architecture_and_tech_stack.md`）および `docs/requirements.md` についても整合させ、全ダイアグラムのパース成功（Ground Truth）および型チェック・ビルド検証の通過を確認した。

### 2. 変更内容 (Before / After)
- **Before**:
  - `graph TB` 記法を使用しており、subgraph を直接ターゲットとするエッジ（`Gateway --> CoreModules` など）が存在したためパーサーが構文エラーとなっていた。
  - subgraph のタイトル（`subgraph Client [クライアント層 (Responsive & Mobile-First)]` 等）に丸括弧 `( )` や記号 `&`, `+` がクォートなしで含まれており、Mermaidトークナイザでパースエラーとなっていた。
  - `docs/requirements.md` においても `graph TD` かつ括弧を含む subgraph ラベルにより同様のエラーが発生していた。
- **After**:
  - `docs/architecture_and_tech_stack.md`:
    - `graph TB` を subgraph リンク対応の `flowchart TB` に変更。
    - 特殊記号を含む subgraph ラベルをダブルクォーテーションでクォート（`subgraph Client ["クライアント層 (Responsive & Mobile-First)"]` 等）。
  - `for_agent/02_architecture_and_tech_stack.md`:
    - 仕様書正本側も同様に `flowchart TB` およびラベルクォート形式に修正し、改訂履歴セクションを追加。
  - `docs/requirements.md`:
    - `flowchart TD` およびラベルクォート形式に修正。
  - `for_agent/guardrails.md`:
    - 「5. ドキュメント・Mermaid記法のガードレール」を新設し、subgraph 間接続時の `flowchart` 指定および記号を含むラベルのエスケープ方針を明文化。

### 3. 変更理由
- ユーザーからの不具合指摘（Mermaid構文エラー）に対応し、Markdownプレビューや各種レンダラーで正しく図が表示されるようにするため。

### 4. 影響範囲
- `docs/architecture_and_tech_stack.md`
- `for_agent/02_architecture_and_tech_stack.md`
- `docs/requirements.md`
- `for_agent/guardrails.md`
- `AICHANGELOG.md`

## [2026-10-17] プロジェクト全体の最終レビュー & 仕様書最新化の完了 (`/review`)


### 1. 概要
`review` スキル指示に基づき、`for_agent/` 内の全仕様書（00〜06, guardrails）と実装コード全体の突き合わせ点検を実施した。全23要件の完全実装、エッジケース（資金移動双方向残高連動、24時間リバート逆算、投資支出受入ペア明細連動、離脱ガード、家族管理者保護、RFC 4180準拠CSV入出力、3段階クレカ原資シグナル、草生やし28日マトリックス動的化、まめの樹4段階遷移、やさしいアドバイス動的生成）の網羅性を確認した。
実装に伴う最新仕様を `for_agent/05_ui_ux_and_design_system.md`、`for_agent/06_operation_and_testing_guide.md`、`for_agent/01_requirements_specification.md` に反映・改訂履歴を更新し、単体テスト（33件＋12件 PASS）、TypeScript型チェック（Exit Code 0）、Next.jsプロダクションビルド（Exit Code 0, 全22ルート正常生成）を通過した。

### 2. 変更内容 (Before / After)
- **Before**:
  - `for_agent/05_ui_ux_and_design_system.md`: クレジットカード引き落とし予定額の3段階シグナル判定（充足・注意・不足）、こまめ草生やし（28日間マトリックス・ストリーク動的化）、まめの樹4段階動的遷移（種/双葉/新芽/実り）、やさしいスマートアドバイス動的生成、タグ付けUI、管理者UIコンポーネント（家族メンバー・システム設定・監査ログ詳細モーダル）の記載および改訂履歴が未記載だった。
  - `for_agent/06_operation_and_testing_guide.md`: DB不要・高速実行可能な単体テスト（`test-csv-unit.ts`, `test-members-unit.ts`）の実行コマンドと改訂履歴が未記載だった。
  - `for_agent/01_requirements_specification.md`: 全要件完了に伴う整合性検証の改訂履歴が未記載だった。
- **After**:
  - `for_agent/05_ui_ux_and_design_system.md`:
    - セクション 3: ゲーミフィケーション・モチベーション向上UI仕様（草生やし動的マトリックス、まめの樹4段階遷移、やさしいアドバイス動的生成）を詳細化。
    - セクション 5: クレジットカード引き落とし予定額 & 3段階原資シグナル表示（充足 / 注意 / 不足）仕様を追加。
    - セクション 6: タグ付け & カラーラベリングUI仕様を追加。
    - セクション 7: 管理者UIコンポーネント仕様を追加。
    - セクション 8: 改訂履歴を最新化。
  - `for_agent/06_operation_and_testing_guide.md`:
    - セクション 2.2: 単体テスト実行手順（`test-csv-unit.ts`, `test-members-unit.ts`）を追加。
    - セクション 4: 改訂履歴を追加。
  - `for_agent/01_requirements_specification.md`:
    - セクション 4: 改訂履歴を追加。

### 3. 変更理由
- `review` スキル（`SKILL.md`）の Instructions 1〜5 に完全準拠し、仕様書正本と実装コードの完全同期・検証の客観的担保・変更記録の永続化を行うため。

### 4. 影響範囲
- `for_agent/05_ui_ux_and_design_system.md`
- `for_agent/06_operation_and_testing_guide.md`
- `for_agent/01_requirements_specification.md`
- `AICHANGELOG.md`

## [2026-10-17] 総合ビジネスロジックテストの更新 & 検証実施 (`scripts/comprehensive-test.ts`)

### 1. 概要
`Plan.md` Phase 5 タスク 5.3 に基づき、Phase 1〜Phase 3 で実装・修正したコアビジネスロジック（資金移動時の出金・入金双方向残高連動、24時間リバート時の資金移動およびQRコード決済残高の逆算復元、家族メンバー管理・システム設定・監査ログエクスポートAPI）に対応する網羅的なテストケースを `scripts/comprehensive-test.ts` に追加・統合し、TypeScript型チェック（`npx tsc --noEmit`）および本番ビルド検証（`npm run build`）の正常完了（Exit Code 0）を確認した。

### 2. 変更内容 (Before / After)
- **Before**:
  - `scripts/comprehensive-test.ts` は全12セクション構成であり、純粋な口座間振替（`transfer`）の登録・更新・リバートテストや、QRコード決済（`qr_code`）の自動口座減額およびリバート時の逆算復元テスト、家族メンバー管理・システム設定APIの自動テストが含まれていなかった。
- **After**:
  - **セクション 13: 口座間資金移動 (`transfer`) & リバート巻き戻しテスト**:
    - 口座A（メイン銀行）から口座B（現金口座）への資金移動登録時における出金元減額・移動先増額の双方向残高連動を検証。
    - 資金移動明細の更新（PUT）時の金額変更追従を検証。
    - 資金移動チェックポイントのリバート（POST `/api/admin/revert`）実行時に、両口座の残高が初期値に完全回復し明細が安全に削除されることを検証。
  - **セクション 14: QRコード決済支出登録 & リバート時の残高逆算復元テスト**:
    - QRコード決済（`qr_code`）による支出登録時の紐付け元口座残高の自動減額を検証。
    - 24時間リバート実行時に、フォールバック特定された口座残高が確実に逆算加算されて元通り回復することを検証。
  - **セクション 15: 家族メンバー管理 & パスワードポリシー & 監査ログエクスポート テスト**:
    - 家族メンバー一覧取得（GET `/api/admin/members`）。
    - システム設定・動的パスワードポリシーの取得（GET）および更新（PUT `/api/admin/settings`）。
    - 監査ログのRFC 4180準拠・UTF-8 BOM付きCSVエクスポート（GET `/api/admin/logs?export=csv`）のヘッダー整合性を検証。
  - `for_agent/guardrails.md`:
    - セクション 1.3「テスト実行・DB前提条件の確認ガードレール」を追記。

### 3. 変更理由
- `Plan.md` Phase 5 タスク 5.3「総合ビジネスロジックテストの実行 & 更新」に完全準拠し、資金移動や24時間リバート、管理機能のロジック整合性をテストコードとして永続化・保証するため。

### 4. 影響範囲
- `scripts/comprehensive-test.ts`
- `for_agent/guardrails.md`

## [2026-10-17] TypeScript型チェック & ビルド検証の実施と通過確認

### 1. 概要
`Plan.md` Phase 5 タスク 5.2 に基づき、全実装完了後の型整合性およびプロダクションビルド可能性を検証した。`npx tsc --noEmit` および `npm run build` を実行し、型エラーおよびビルドエラーが0件（Exit Code 0）で正常完了することを確認した。

### 2. 検証結果
- **TypeScript 型チェック (`npx tsc --noEmit`)**:
  - 全ソースファイル（App Router, API routes, UIコンポーネント, DBスキーマ, ライブラリ）において型エラーなし（Exit Code 0）。
- **プロダクションビルド検証 (`npm run build`)**:
  - Next.js 最適化プロダクションビルドが正常完了（Exit Code 0）。
  - 全22ルート（静的ページおよび全APIルート）が正常にコンパイル・生成された。

### 3. 変更理由
- `Plan.md` Phase 5 タスク 5.2「TypeScript型チェック & ビルド検証」の完了要件を満たし、実装された全機能が型安全かつ本番ビルド可能な状態であることを客観的に保証するため。

### 4. 影響範囲
- なし（検証のみ）

## [2026-10-17] `AGENTS.md` の技術スタックおよび検証コマンドの最新化

### 1. 概要
`AGENTS.md` に初期テンプレートとして記載されていた誤った技術スタック（Streamlit / Python）および構文チェックコマンド（`python -m py_compile` / `pytest`）を、プロジェクトの実態である Next.js 15.1.6 (App Router) / React 19 / TypeScript 5.7.3 / Drizzle ORM 0.38.4 / PostgreSQL 16、および検証コマンド（`npx tsc --noEmit`、`npm run build`、`npx tsx scripts/comprehensive-test.ts`）に最新化・整合させた。

### 2. 変更内容 (Before / After)
- **Before**:
  - `Framework: Streamlit`、`Language: Python (venv: env)`、`Package Manager: pip` と記載されていた。
  - 検証コマンドとして `python -m py_compile <メインファイル名>.py`、`pytest` が指定されていた。
- **After**:
  - `Framework: Next.js 15.1.6 (App Router) / React 19`、`Language: TypeScript 5.7.3`、`Database / ORM: PostgreSQL 16 / Drizzle ORM 0.38.4 (postgres.js)`、`Styling: Tailwind CSS 3.4.17`、`Package Manager: npm` に修正。
  - 検証コマンドを `npx tsc --noEmit`（型チェック）、`npm run build`（ビルド検証）、`npx tsx scripts/comprehensive-test.ts`（総合テスト）に改訂。
  - 参照ディレクトリに `for_agent/guardrails.md` を明記。

### 3. 変更理由
- `Plan.md` Phase 5 タスク 5.1「`AGENTS.md` の技術スタックおよび検証コマンドの最新化」に基づき、エージェントが参照するルールの Ground Truth をプロジェクト実態に完全同期させるため。

### 4. 影響範囲
- `AGENTS.md`

## [2026-10-17] 【要件 16-2 & 16-3】まめの樹育成システム & やさしいアドバイスの実データ連動 (`GoalsTab.tsx` & `page.tsx`)

### 1. 概要
目標・成長タブ（`GoalsTab.tsx`）における静的ハードコード値（固定のステージ、フォールバック達成率74%、固定アドバイス文言等）を完全に排除し、実際の貯蓄目標達成率や記帳継続ストリーク日数に連動した「まめの樹育成システム（種・双葉・新芽・実りの4段階動的遷移）」および、実際の今月収支・前月比節約額・目標進捗ペースから心温まる前向きなメッセージを動的生成する「やさしいアドバイス」機能を実装した。また、新規目標作成モーダルを統合し、実データとの完全連動を実現した。

### 2. 変更内容 (Before / After)
- **Before**:
  - `GoalsTab.tsx` は `goals` と `onTriggerToast` のみを受け取っており、明細データ（`transactions`）や口座データ（`accounts`）が渡されていなかった。
  - まめの樹の育成ステージが「ステージ 3『すくすく新芽』」と固定アイコン（🌱）で静的にハードコードされていた。
  - やさしいアドバイスが「今月は外食費が予算より ¥4,200 節約できています！...」という固定テキストのままで、実際の家計データと連動していなかった。
  - 目標の進捗バーや金額表示に `740000` や `74%` 等のフォールバック値が残存し、新規に貯蓄目標を追加するUIが存在しなかった。
- **After**:
  - `src/app/page.tsx`:
    - `GoalsTab` に `transactions`、`accounts`、`categories`、および `onRefreshGoals={fetchAllData}` を伝播するよう改修。
  - `src/components/GoalsTab.tsx`:
    - **まめの樹育成システム（要件 16-2）の動的化**:
      - `transactions` から連続記録ストリーク日数（`streakDays`）、今月の記帳件数、記帳日数を動的集計。
      - 全目標の総合達成率（`overallProgressRate`）およびストリーク日数に基づき、4つのステージ（ステージ1: はじまりの種 🌰, ステージ2: かわいい双葉 🌱, ステージ3: すくすく新芽 🌿, ステージ4: 豊かな実り 🌳）へ動的に遷移。
      - 4ステップのステージインジケーター、現在のステージバッジ、次の進化条件のリアルタイム表示、およびアニメーションを実装。
    - **やさしいスマート・アドバイス（要件 16-3）の動的生成**:
      - 今月と先月の明細データを比較し、最も節約できた費目（先月比差額）や月間収支（黒字額）を自動抽出。
      - 目標達成ペースの試算や、記帳ストリークを称える励ましメッセージなど、多角的でポジティブなフィードバックカードを動的生成。
    - **貯蓄目標カード一覧 & 新規目標作成モーダル（要件 17-2）**:
      - 目標達成時（100%以上）の祝賀バッジ（`🎉 目標達成！`）を表示。
      - 「＋ 目標を追加」ボタンおよび作成モーダルを実装。タイトル、目標金額、目標期日、合算対象口座の選択、カラー選択を可能にし、`POST /api/goals` と連携。
      - 目標が0件の場合の親切な空状態（Empty State）表示を追加。

### 3. 変更理由
- 要件 16-2「まめの樹（Bean Sprout）育成システム」、要件 16-3「やさしいほめ言葉・アドバイス」、要件 17-2「貯蓄目標管理」、および Plan.md Phase 4 タスク 4.3 に完全準拠するため。

### 4. 影響範囲
- `src/app/page.tsx`
- `src/components/GoalsTab.tsx`

## [2026-10-17] 【要件 16-1】こまめ草生やし（Activity Heatmap）の実データ連動 (`DashboardTab.tsx`)

### 1. 概要
ダッシュボード画面における「こまめ草生やし（Activity Heatmap）」および「連続記録ストリーク」の固定ダミー配列・ハードコード値を完全に排除し、実際の明細データ（`transactions`）から直近4週間（28日間）の曜日別記帳マトリックスおよび連続記録ストリーク日数を動的に集計・レンダリングする機能を実装した。

### 2. 変更内容 (Before / After)
- **Before**:
  - `DashboardTab.tsx` の草生やしセクションで、各曜日の記録件数が固定配列 `[1, 2, 0, 3]` 等の静的ダミーデータでハードコードされていた。
  - ストリーク日数バッジが固定の翻訳文字列 `t.dashboard.streakDays`（"12日連続こまめ記録中"）を表示するのみで、実際の記帳継続状況を反映していなかった。
  - ヘッダー列が `grid-cols-4`、行が曜日列を含む `grid-cols-5` となっており、曜日列と各週のセル列の配置・幅に不整合があった。
- **After**:
  - `src/components/DashboardTab.tsx`:
    - `useTranslation` から `language` を取得し、日・英の動的ストリーク文言に対応。
    - `useMemo` による動的集計ロジックを実装：
      - `transactions` から明細日付（`date` または `createdAt`）ごとの記帳件数マップ（`txCountByDate`）を生成。
      - 今日（または昨日）を起点に過去へ遡り、連続して記帳が存在する「連続記録ストリーク日数（`streakDays`）」を正確に計算。
      - 直近4週間（月曜始まり: 3週前、2週前、先週、今週の各月〜日、計28日）のカレンダーマトリックス（`heatmapRows`）を生成。
      - 各セルにおいて、日付（YYYY-MM-DD）、月日表示（M/D）、件数（`count`）、今日判定（`isToday`）、未来日付判定（`isFuture`）を算出し、件数に応じた4段階の濃淡（0件/1件/2件/3件以上）および本日のハイライト枠線（リング）を適用。
      - 未来の日付は透過・薄色表示とし、未到達であることを視覚的に明示。
      - グリッドヘッダーを `grid-cols-5`（曜日列 + 4週列）に正規化し、曜日ラベルと各週セルの位置を完全に整列。
      - 凡例エリアに直近4週間の合計記録件数（`totalPast4WeeksTx`）を表示。
      - ストリークバッジで、継続中の日数（`🔥 ○日連続こまめ記録中`）または未記録時の励ましメッセージ（`🔥 今日からこまめに記録！`）を動的に出し分け。

### 3. 変更理由
- 要件 16-1「こまめ草生やし（Activity Bean Heatmap）: 記帳した日の濃淡マトリックスとストリーク日数表示」および Plan.md Phase 4 タスク 4.2 に完全準拠するため。

### 4. 影響範囲
- `src/components/DashboardTab.tsx`

## [2026-10-17] 【要件 9】クレジットカード次回引き落とし予定額の完全動的集計 (`DashboardTab.tsx` & `page.tsx`)

### 1. 概要
ダッシュボード画面におけるクレジットカード引き落とし予定額のハードコード値（¥85,420等のフォールバック値）を完全に排除し、登録されている全クレジットカードの未精算明細、各カードの締め日・引き落とし日、および引き落とし元口座の利用可能残高をリアルタイムに突合して3段階シグナル（充足 / 注意 / 不足）を表示する完全動的集計機能を実装した。

### 2. 変更内容 (Before / After)
- **Before**:
  - `DashboardTab.tsx` は `paymentMethods` を受け取っておらず、カードごとの締め日・引き落とし日・引き落とし元口座を特定できていなかった。
  - 未精算明細が0件の場合に `¥85,420`、カード名に「楽天カード (三井住友銀行)」、残り日数に「あと 5日」が固定ハードコードで表示されていた。
  - 原資判定は総資産の実質利用可能残高と未精算額の単なる大小比較（2値判定）のみで、カードごとの引き落とし元口座や貯蓄枠ロックを考慮した判定ができていなかった。
- **After**:
  - `src/app/page.tsx`:
    - `DashboardTab` に `paymentMethods={paymentMethods}` を渡すよう改修。
  - `src/components/DashboardTab.tsx`:
    - `DashboardTabProps` に `paymentMethods?: PaymentMethodItem[]` を追加。
    - 登録されている有効なクレジットカード（`pm.type === "credit_card" && pm.isActive`）ごとに、未精算明細、未精算合計額、直近引き落とし予定日（または `calculateWithdrawalDate` による推計）、今日からの残り日数を動的算出。
    - 各カードの引き落とし元口座（`pm.sourceAccountId`）を特定し、口座の総残高（`balance`）および貯蓄ロック枠を除いた実質利用可能残高（`availableBalance`）とリアルタイム突合。
    - 3段階シグナル判定ロジックを実装：
      - **充足 (sufficient / 緑バッジ)**: 引き落とし元口座の実質利用可能残高が予定額以上。原資準備OK。
      - **注意 (warning / 橙バッジ)**: 口座の総残高は予定額以上だが、貯蓄ロック（reservedAmount）を差し引いた利用可能残高が不足。貯蓄枠の取崩しまたは充当が必要。不足充当額を明示。
      - **不足 (shortage / 赤バッジ)**: 口座の総残高そのものが予定額未満。口座への資金移動・入金が必要。不足金額を明示。
    - アラートカードの外枠カラーを最重要シグナル（shortage > warning > sufficient）に応じて動的変化。
    - 複数クレジットカードが登録されている場合、カード切り替えセレクターピル（カード名・予定額・状態ドット）を表示し、全カードの状況をスムーズに確認可能。全カードの合計予定額も併記。
    - クレジットカード未登録時および未精算0件時は、¥0表示および分かりやすい状態メッセージを表示（ハードコード完全排除）。

### 3. 変更理由
- 要件 9「クレジットカード引き落とし予定額・原資チェック（次回引き落とし予定額を集計し、紐づく銀行口座の現在残高・利用可能残高と比較して警告）」および Plan.md Phase 4 タスク 4.1 に完全準拠するため。

### 4. 影響範囲
- `src/app/page.tsx`
- `src/components/DashboardTab.tsx`

## [2026-10-17] 【要件 3-3】条件付き操作ログエクスポート機能の実装 (`src/app/api/admin/logs/route.ts` & `AdminTab.tsx` & `AuditLogDetailModal.tsx`)

### 1. 概要
世帯管理者が世帯内の操作ログ・監査ログ（`audit_logs`）をユーザー・期間（開始日〜終了日）・操作種別（CREATE/UPDATE/DELETE/REVERT）で柔軟に条件指定して絞り込み、RFC 4180準拠のUTF-8 BOM付きCSV形式およびJSON形式でワンクリックダウンロードできるエクスポート機能（APIおよびUI）を実装した。また、操作者IDから家族メンバーのメールアドレスを自動解決して可読性を高め、ログの詳細（変更前・変更後データJSON）を閲覧できる詳細モーダルを統合した。

### 2. 変更内容 (Before / After)
- **Before**:
  - `GET /api/admin/logs` は直近100件のログを無条件に取得するのみで、クエリパラメータによる絞り込みやエクスポート機能に対応していなかった。
  - ログの操作者はユーザーID（`usr_xxx`）のみで、誰が実行したのか視覚的に識別しづらかった。
  - `AdminTab.tsx` では直近ログの概要と日時が簡易リスト表示されるのみで、ユーザーや期間・操作種別によるフィルタリング、CSV/JSONでのエクスポート、変更前・変更後データの詳細確認ができなかった。
- **After**:
  - `src/lib/csv.ts`:
    - セル値をRFC 4180準拠で安全にエスケープする `escapeCsvCell` 関数、およびUTF-8 BOM（`\uFEFF`）付きCSV文字列を生成する `generateCsv` 関数を追加。
  - `src/types/index.ts`:
    - `AuditLogItem` インターフェースに `operatorEmail?`, `beforeDataJson?`, `afterDataJson?` を追加。
  - `src/app/api/admin/logs/route.ts`:
    - `userId` (または `all`), `action` (`CREATE` | `UPDATE` | `DELETE` | `REVERT` | `all`), `startDate`, `endDate`, `format` (`csv` | `json`), `download` (`true`), `limit` のクエリパラメータに対応。
    - `masterDb` の `household_memberships` と `users` を結合して世帯メンバーの `userId -> email` マップを作成し、各ログに `operatorEmail` を自動付与。
    - `format=csv` 時: RFC 4180準拠・UTF-8 BOM付きCSVデータ（ログID, 日時, 操作者メール, 操作者ユーザーID, 操作種別, 対象種別, 対象ID, 概要, チェックポイントID, 変更前データ, 変更後データ）を `Content-Disposition: attachment; filename="komame_audit_logs_..."` で返却。
    - `format=json&download=true` 時: 整形済みJSONファイルをダウンロード添付形式で返却。
    - 通常のAPI呼び出し時は条件に合致するログ配列と `totalCount` を返却。
  - `src/components/AuditLogDetailModal.tsx` (新規):
    - 操作ログの詳細情報（ログID、操作種別バッジ、日時、実行者メール、対象エンティティ、概要、チェックポイントID、変更前JSON、変更後JSON）をシンタックスハイライト風に表示するモーダルを実装。
  - `src/components/AdminTab.tsx`:
    - 「世帯監査ログ & 操作履歴」セクションを大幅刷新。
    - ユーザー選択（家族メンバーセレクト）、操作種別選択、開始日・終了日入力コントロール、リセットボタンを配置。
    - 「CSV出力」および「JSON出力」のエクスポートボタンを上部に配置し、現在設定されている絞り込み条件を動的に反映したダウンロードURLを自動生成して実行。
    - ログリストに種別別カラーバッジ（CREATE: 緑, UPDATE: 青, DELETE: 赤, REVERT: 黄）、操作者メール、日時、概要、および「詳細」ボタンを配置。
  - `src/lib/i18n.ts`:
    - 監査ログの絞り込み、エクスポート、詳細表示に関する日・英の翻訳リソースを追加。
  - `for_agent/04_api_specifications.md`:
    - `6.5 GET /api/admin/logs` の仕様を条件付き取得およびエクスポート仕様に改訂・追記。
  - `scripts/test-csv-unit.ts`:
    - `escapeCsvCell` および `generateCsv`（BOM付きCSV生成と往復パース整合性）の単体テストを追加し、全33件のテストパス（Exit Code 0）を確認。

### 3. 変更理由
- 要件 3-3「条件付き操作ログエクスポート機能（ユーザー・期間・操作種別を指定してCSV/JSON出力）」に完全準拠し、家計の管理者が誰がいつどのような変更を行ったかを確実に把握・監査し、外部ツールでの分析やバックアップができるようにするため。

### 4. 影響範囲
- `src/lib/csv.ts`
- `src/types/index.ts`
- `src/app/api/admin/logs/route.ts`
- `src/components/AuditLogDetailModal.tsx` (新規)
- `src/components/AdminTab.tsx`
- `src/lib/i18n.ts`
- `for_agent/04_api_specifications.md`
- `scripts/test-csv-unit.ts`

## [2026-10-17] 【要件 1-3 & 3-4】システム設定 & パスワードポリシー動的設定の実装 (`src/app/api/admin/settings/route.ts` & `AdminTab.tsx`)


### 1. 概要
世帯管理者が通貨表示記号、日付表示形式、および家族メンバーのパスワードセキュリティ基準（最小文字数、英大文字・小文字・数字・特殊文字の必須有無）を動的に設定・保存・運用できるシステム設定機能（APIおよびUI）を実装した。設定されたパスワードポリシーは、世帯内のメンバー招待・登録時やパスワード再設定時の検証ロジックとリアルタイムに連動する。

### 2. 変更内容 (Before / After)
- **Before**:
  - `master.ts` に `public.system_settings` テーブル定義は存在したが、設定値を取得・保存するためのAPIが存在しなかった。
  - `AdminTab.tsx` にシステム設定フォームが存在せず、通貨記号や日付形式、パスワードポリシーを変更する手段がなかった。
  - `src/lib/auth.ts` の `validatePasswordPolicy` はハードコードされたデフォルト引数（最小8文字、英大小数字必須）のみに依存し、世帯ごとの動的ポリシーを取得して適用する仕組みがなかった。
- **After**:
  - `src/types/index.ts`:
    - `PasswordPolicyConfig` および `SystemSettingsConfig` インターフェースを追加。
  - `src/lib/auth.ts`:
    - 世帯IDに紐づく動的パスワードポリシーを取得するヘルパー関数 `getHouseholdPasswordPolicy(householdId)` を実装。未設定時は安全な標準デフォルト値（最小8文字、英大小数字必須）へフォールバック。
  - `src/app/api/admin/settings/route.ts` (新規):
    - `GET`: 世帯管理者の認証のもと、`public.system_settings` から通貨記号、日付形式、パスワード強度ポリシーを取得・返却。
    - `PUT`: 通貨記号（¥/$ /€/任意5文字以内）、日付形式（YYYY/MM/DD, YYYY-MM-DD, YYYY.MM.DD）、パスワードポリシー（最小文字数4〜32、各大文字/小文字/数字/記号の必須フラグ）をバリデーションし、世帯単位でUPSERT保存。テナント監査ログ（`audit_logs`）に更新履歴を記録。
  - `src/app/api/admin/members/route.ts`:
    - 新規メンバー招待・登録時およびパスワード再設定時に `getHouseholdPasswordPolicy` で取得した世帯動的ポリシーを適用するように改修。自動生成パスワードもポリシー長を満たすよう動的生成化。
  - `src/components/AdminTab.tsx`:
    - 家族メンバー管理セクションの下に「システム設定 & セキュリティポリシー」カードを追加。
    - 通貨記号クイックトグル（¥/$ /€）＋カスタム入力、日付形式セレクト、最小文字数スライダー、4種類の必須チェックボックス、保存ボタンを配置。
    - 初回ロード時に `GET /api/admin/settings` から設定値を読み込み、保存成功時にトースト通知を表示。
  - `src/lib/i18n.ts`:
    - システム設定・パスワードポリシーに関する日本語および英語の翻訳リソースを追加。
  - `for_agent/04_api_specifications.md`:
    - `6.7 システム設定 & パスワードポリシー API (/api/admin/settings)` の仕様および改訂履歴を追記。

### 3. 変更理由
- 要件 1-3「パスワードポリシー動的設定（最小文字数、英大小数字記号の必須設定）」および要件 3-4「システム設定（通貨表示、日付フォーマット、パスワード強度ポリシー）」に完全準拠し、世帯ごとの運用ルールやセキュリティ基準に柔軟に対応できるようにするため。

### 4. 影響範囲
- `src/types/index.ts`
- `src/lib/auth.ts`
- `src/app/api/admin/settings/route.ts` (新規)
- `src/app/api/admin/members/route.ts`
- `src/components/AdminTab.tsx`
- `src/lib/i18n.ts`
- `for_agent/04_api_specifications.md`

## [2026-10-17] 【要件 3-2】家族メンバー管理機能の実装 (`src/app/api/admin/members/route.ts` & `AdminTab.tsx`)

### 1. 概要
世帯管理者が家族メンバーを招待・直接登録・管理するための包括的な家族メンバー管理機能（APIおよびUI）を実装した。家族メンバー一覧の取得、直接登録、7日間有効な招待リンクの発行、招待受け入れ・登録認証、ロール変更（管理者/メンバー）、パスワード再設定、および論理削除（無効化によるログイン遮断）を統合し、世帯内の最後の有効な管理者アカウントを保護するセーフティガードレールを実装した。

### 2. 変更内容 (Before / After)
- **Before**:
  - `household_memberships` テーブルおよび多対多の所属モデルは定義されていたが、家族メンバーを一覧取得・招待・管理するためのAPIが存在しなかった。
  - `AdminTab.tsx` には24時間リバート、監査ログ、CSVエクスポート・インポートのみが表示され、家族メンバー管理のセクションが存在しなかった。
  - 招待リンクの発行や、招待リンク経由で世帯へ参加するための認証エンドポイント（`/api/auth/invite`）が存在しなかった。
- **After**:
  - `src/types/index.ts`:
    - `MemberItem` インターフェース（`id`, `userId`, `email`, `role`, `status`, `joinedAt`, `isCurrentUser`）を追加。
  - `src/lib/auth.ts`:
    - 招待用JWTトークン発行関数 `createInviteToken`（7日間有効、世帯ID・ロール保持）および検証関数 `verifyInviteToken` を追加。
  - `src/app/api/admin/members/route.ts` (新規):
    - `GET`: 現在の世帯に所属する全家族メンバーの一覧取得（メールアドレス、ロール、ステータス、参加日、自分自身判定）。
    - `POST`:
      - 家族メンバー直接追加（メール指定、管理者/メンバーロール指定、自動生成または指定パスワード設定）。既存アカウントの場合は世帯メンバーシップへの紐付けまたは再有効化。
      - 招待リンク単体発行（`action: "create_invite_link"`）。
      - パスワード再設定（`action: "reset_password"`）。
      - 各操作の監査ログ（`audit_logs`）の自動記録。
    - `PUT`: メンバーのロール変更（`admin` / `member`）およびステータス変更（`active` / `inactive`）。世帯に最低1人の有効な管理者が存在し続けることを保証するガードレールを適用。
    - `DELETE`: メンバーの論理削除（ステータスを `inactive` に更新してログイン遮断）。自分自身および最後の管理者の無効化を防止。
  - `src/app/api/auth/invite/route.ts` (新規):
    - `GET`: 招待リンク（トークン）の有効性検証と世帯名・付与ロールの返却。
    - `POST`: 招待トークンに基づくアカウント登録（または既存アカウントでのログイン紐付け）と世帯参加処理、自動ログインセッションCookie確立。
  - `src/components/InviteMemberModal.tsx` (新規):
    - 「メール指定で直接追加」と「招待リンクのみ発行」の2つのモードを備えた招待モーダル。
    - 登録完了時にログインID、初期パスワード、招待リンクをワンクリックでコピーできる共有用UIを完備。
  - `src/components/ResetPasswordModal.tsx` (新規):
    - 管理者が家族メンバーのパスワードを安全に再発行・リセットするためのモーダル（ランダムパスワード生成機能付き）。
  - `src/components/AdminTab.tsx`:
    - 最上部に「家族メンバーの管理」カードセクションを追加。
    - メンバー一覧カード（アバター、メールアドレス、管理者/メンバーバッジ、有効/無効バッジ、参加日、自身タグ）を表示。
    - メンバーごとの操作ボタン（ロール変更トグル、パスワード再設定、無効化/再有効化トグル）を完備。
    - 「＋ メンバーを招待・追加」ボタンによる招待モーダルの呼び出し。
  - `src/lib/i18n.ts`:
    - 家族メンバー管理に関する日本語・英語の翻訳リソースを追加。
  - `for_agent/04_api_specifications.md`:
    - `6.6 家族メンバー管理 API (/api/admin/members)` および `1.5 招待参加 API (/api/auth/invite)` の仕様、改訂履歴を追記。
  - `scripts/test-members-unit.ts` (新規):
    - 招待トークン発行・検証、パスワードポリシー検証、Argon2idハッシュ突合に関する単体テストを作成し、全件パス（Exit Code 0）を確認。

### 3. 変更理由
- 要件 3-2「家族メンバー管理（家族メンバーの招待、権限変更、パスワードリセット、無効化）」および要件 1-2「家族招待」に完全準拠し、家族・パートナーとの共同家計簿運用をセキュアかつ直感的に行えるようにするため。

### 4. 影響範囲
- `src/types/index.ts`
- `src/lib/auth.ts`
- `src/app/api/admin/members/route.ts` (新規)
- `src/app/api/auth/invite/route.ts` (新規)
- `src/components/InviteMemberModal.tsx` (新規)
- `src/components/ResetPasswordModal.tsx` (新規)
- `src/components/AdminTab.tsx`
- `src/lib/i18n.ts`
- `for_agent/04_api_specifications.md`
- `scripts/test-members-unit.ts` (新規)

---

## [2026-10-17] 【要件 2-4】タグ付け & カラーラベリングのUI統合 (`tags`, `transaction_tags`)

### 1. 概要
支出・収入・振替明細への色付きタグ（`#固定費`, `#自己投資`, `#ご褒美` 等）の付与・管理・カラーラベリング機能を実装し、新規タグ作成、明細登録時のタグ付け、明細修正モーダルでのタグ編集、および検索・明細一覧画面でのカラーバッジ表示とタグ絞り込みフィルターを統合した。

### 2. 変更内容 (Before / After)
- **Before**:
  - DBスキーマ（`tags`, `transaction_tags`）は定義されていたものの、APIエンドポイント（`/api/tags`）や明細APIでのタグ保存・取得ロジックが存在せず、タグ機能が未使用の状態だった。
  - 明細登録画面（`RegisterTab.tsx`）および明細修正モーダル（`EditTransactionModal.tsx`）にタグ選択・作成UIがなく、タグを登録・変更できなかった。
  - 明細一覧・検索画面（`SearchTab.tsx`）にタグの表示（カラーバッジ）やタグによる絞り込み機能が存在しなかった。
- **After**:
  - `src/types/index.ts`:
    - `TagItem` インターフェース（`id`, `name`, `color`）を定義し、`TransactionItem` に `tags?: TagItem[]` を追加。
  - `src/app/api/tags/route.ts` (新規):
    - `GET /api/tags`: 世帯内のタグ一覧取得。初回未登録時は標準プリセットタグ（`固定費`, `変動費`, `自己投資`, `特別費`, `ご褒美`）を自動投入。
    - `POST /api/tags`: 新規タグの作成（`#` プレフィックスの自動正規化、同名重複防止、カラー指定）。
  - `src/app/api/transactions/route.ts`:
    - `GET`: `tagId` クエリパラメータによる絞り込みに対応。明細一覧取得時に `transaction_tags` と `tags` を結合して各明細に `tags: TagItem[]` を付与して返却。
    - `POST`: 各明細登録時に `tagIds` / `tags` を受け取り、`transaction_tags` テーブルに紐付けレコードを登録（新規タグ名指定時は自動作成）。
    - `PUT`: 明細更新時に `tagIds` を受け取り、既存の紐付けを解除・再登録してタグを完全同期更新。
  - `src/components/RegisterTab.tsx`:
    - タグ選択チップUIおよびインライン新規タグ作成UI（カラーパレット付き）を追加。
    - 一時保存（手動・自動ドラフト）および離脱ガードの入力検知に `selectedTagIds` を統合。
    - 登録実行時に `tagIds` をAPIへ送信し、登録成功時にタグ選択状態をリセット。
  - `src/components/EditTransactionModal.tsx`:
    - 既存明細のタグ初期化、タグ選択トグル、およびインライン新規タグ作成UIを追加。
    - 更新実行（PUT）時に `tagIds` を送信してタグ紐付けを同期更新。
  - `src/components/SearchTab.tsx`:
    - フィルター部に「タグフィルター（すべてのタグ / 各タグ）」ドロップダウンを追加し、選択したタグが付与された明細のみを抽出するフィルタリングを実装。
    - 各明細行に色付きタグバッジ（`#タグ名`）をカラーコード連動でレンダリング。
    - 明細編集モーダルに `tags` を連携。
  - `src/app/page.tsx`:
    - `tags` 状態管理を追加し、`fetchAllData` で `/api/tags` から一括取得。
    - `SearchTab` および `RegisterTab` に `tags` と更新コールバックを伝播。
  - `src/db/seed.ts`:
    - デモシードデータに標準タグ5件およびサンプル明細へのタグ紐付けを追加。
  - `for_agent/04_api_specifications.md`:
    - `GET /api/tags` および `POST /api/tags` の仕様、明細APIのタグ連携仕様、改訂履歴を追記。

### 3. 変更理由
- 要件 2-4「タグ付け & カラーラベリング（支出や資金移動に色付きタグ `#固定費`, `#自己投資`等を付与）」に完全準拠し、費目（カテゴリー）を跨いだ横断的なラベル分類と分析を可能にするため。

### 4. 影響範囲
- `src/types/index.ts`
- `src/app/api/tags/route.ts` (新規)
- `src/app/api/transactions/route.ts`
- `src/components/RegisterTab.tsx`
- `src/components/EditTransactionModal.tsx`
- `src/components/SearchTab.tsx`
- `src/app/page.tsx`
- `src/db/seed.ts`
- `for_agent/04_api_specifications.md`

---

## [2026-10-17] 【要件 5】機械的サジェストの過去履歴動的集計化

### 1. 概要
店舗名入力時の静的ハードコード（"セブン", "ローソン", "マルエツ" 等で「食費」「PayPay」固定）を廃止し、過去の明細データから入力文字列に合致する店舗候補を前方一致・部分一致で補完・検索し、最多使用の「費目」および「支払元（決済手段）」をリアルタイム集計して1タップ適用できる動的サジェスト機能を実装した。

### 2. 変更内容 (Before / After)
- **Before**:
  - `src/components/RegisterTab.tsx`:
    - `handleShopNameChange` 内で `val.includes("セブン") || val.includes("ローソン") || val.includes("マルエツ")` とハードコード判定されていた。
    - 提案内容も固定で「食費」および「PayPay」が固定表示・適用され、ユーザーの実際の登録履歴や世帯ごとの利用パターンが反映されていなかった。
    - 店舗名入力時の履歴補完（オートコンプリート候補ドロップダウン）が存在しなかった。
- **After**:
  - `src/app/api/transactions/suggest/route.ts` (新規):
    - `GET /api/transactions/suggest?q=...` エンドポイントを新規実装。
    - テナントスキーマ内の有効明細（未削除）から、店舗名が存在するレコードを抽出（`ilike %q%`）。
    - 候補店舗名を「完全一致 > 前方一致 > 利用回数（降順） > 最新利用日（降順）」でソートし上位5件を返却。
    - 最上位候補（または入力店舗名）に対応する過去明細を絞り込み、最頻出（Mode）の「費目（ID・名称・アイコン・色）」および「決済手段（ID・名称）」、および利用回数を動的に算出・返却。
  - `src/components/RegisterTab.tsx`:
    - 店舗名入力フィールドに 250ms デバウンスの動的サジェスト連携（`fetchSuggestions`）を統合。
    - 店舗名入力中・フォーカス時に候補店舗名ドロップダウン（`showCandidateDropdown`）を表示し、タップで店舗名を即時補完。
    - 過去履歴に基づく最多使用の費目・決済手段および利用実績回数をバナー表示し、1タップで「費目」と「支払手段」を自動適用するワンタップ適用機能（`applySuggestion`）を実装。
    - 外側クリック時のドロップダウン自動非表示、および登録完了時のサジェスト状態クリーンアップを追加。
  - `src/types/index.ts`:
    - `SuggestionItem`, `SuggestionResult` インターフェースを定義。
  - `for_agent/04_api_specifications.md`:
    - `GET /api/transactions/suggest` のAPI入出力仕様および改訂履歴を追記。

### 3. 変更理由
- 要件 5「機械的サジェスト機能（店舗名入力時に過去履歴から店舗名を補完し、決定時に最も使われた「費目」「支払元」を自動提案）」に完全準拠し、ユーザーごとの実際の利用実績に基づく素早い明細入力を支援するため。

### 4. 影響範囲
- `src/app/api/transactions/suggest/route.ts` (新規)
- `src/components/RegisterTab.tsx`
- `src/types/index.ts`
- `for_agent/04_api_specifications.md`

---

## [2026-10-17] 【要件 2-5】入力離脱時ガード（未保存警告）の実装

### 1. 概要
記帳タブ（`RegisterTab.tsx`）において、ユーザーがフォーム入力途中に別タブへ移動しようとした場合、またはブラウザを閉じようとした場合（`beforeunload`）に未保存警告確認ダイアログを表示し、誤ったデータ喪失を防止する離脱時ガード機能を実装した。未入力時は確認ダイアログを表示せず即時遷移する仕様に完全準拠。

### 2. 変更内容 (Before / After)
- **Before**:
  - フォーム（支出・収入・同店舗一括・同費目一括）に入力途中であっても、サイドバーやボトムナビゲーション、ヘッダー等のタブ切り替えをクリックすると即座に画面が切り替わり、入力中のデータが破棄・消失していた。
  - ブラウザを閉じる・リロードする際にも警告（`beforeunload`）が発生せず、入力中のデータが失われていた。
- **After**:
  - `src/components/RegisterTab.tsx`:
    - フォームの全入力フィールド（金額、店舗名、メモ、額面、控除額、各一括行データ）の入力有無を判定する `hasEnteredData` および送信状態を考慮した `isFormDirty` ロジックを実装。
    - 親コンポーネント（`page.tsx`）へリアルタイムに入力状態を伝播する `onDirtyChange` コールバックを導入。
    - `window.addEventListener("beforeunload", ...)` によるブラウザ閉じ・ページ離脱・リロード時の標準警告ガードを実装。
  - `src/components/LeaveGuardModal.tsx`:
    - デザインシステム準拠の離脱警告モーダルコンポーネントを新規作成。「入力を続ける（移動キャンセル）」と「破棄して移動（自動ドラフトクリーンアップ＆目標タブへ遷移）」を選択可能。
  - `src/app/page.tsx`:
    - `handleTabChange` によるタブ切り替えの中央制御を導入。`activeTab === "register"` かつ未保存データがある場合は遷移を一時保留し `LeaveGuardModal` を表示。
    - 「入力を続ける」押下時は入力内容を保持して画面維持。「破棄して移動」押下時は自動退避ドラフトを削除し保留していたタブへ遷移。未入力時はモーダルを表示せず即時遷移。
    - `handleLogout` にも未保存データの破棄確認を追加。
  - `src/lib/i18n.ts`: 多言語リソース（日本語 / 英語）に `leaveWarningTitle`, `leaveWarningDesc`, `stayOnPage`, `discardAndLeave` を追加。

### 3. 変更理由
- 要件 2-5「離脱時ガード（未保存警告）」に完全準拠し、レシート入力中や一括登録中の誤タップ・誤操作による作業データの消失を防ぐため。

### 4. 影響範囲
- `src/components/RegisterTab.tsx`
- `src/components/LeaveGuardModal.tsx` (新規)
- `src/app/page.tsx`
- `src/lib/i18n.ts`

---

## [2026-10-17] 【要件 2-3】登録タブの同費目一括登録モード (`category_batch`) のUI & 送信実装

### 1. 概要
同一費目（食費や日用品費など）の複数支出をまとめて記録できる「同費目一括登録モード (`category_batch`)」のUIを新規実装し、複数行の一括バリデーション、単一リクエストでの一括登録API送信、一時保存（手動・自動ドラフト）との双方向同期を統合した。

### 2. 変更内容 (Before / After)
- **Before**:
  - `RegisterTab.tsx` に「同費目一括」タブボタンは配置されていたものの、選択時にフォーム入力フィールドが一切レンダリングされず、一括登録を実行できなかった。
  - 同店舗一括モード (`shop_batch`) においても、支払手段セレクターの表示が欠落しており、内訳合計額の可視化がなかった。
  - 一時保存（手動ドラフト・自動ドラフト）において、`category_batch` の複数行データ（日付・店舗・金額・メモ）の保存および復元に対応していなかった。
- **After**:
  - `src/components/RegisterTab.tsx`:
    - `category_batch` 専用の入力UIを実装：
      - 上部: 固定費目セレクター、共通支払手段セレクター、貯蓄・投資選択時の移動先口座セレクター。
      - 内訳リスト: 日付（カレンダー）、店舗名、金額（数値テンキー対応）、メモの各行入力フィールド、行追加（`+`）、行削除（ゴミ箱アイコン）。
      - 合計金額のリアルタイム算出・表示。
      - 登録ボタンに現在の有効入力件数を動的表示（`✓ 登録する (N件)`）。
    - 同店舗一括 (`shop_batch`) の改善：支払手段セレクターの配置、合計金額のリアルタイム表示を追加。
    - 一時保存（手動・自動）連携：`categoryBatchRows` の2秒デバウンス自動退避および手動スロット保存、復元時の状態復元、ドラフト呼び出しカードでの件数・合計金額プレビュー表示を実装。
    - 送信ロジック：有効な金額が入力された行を抽出し、`POST /api/transactions` へ一括送信。
  - `src/lib/i18n.ts`: 多言語リソース（日本語 / 英語）に `catBatchItemsTitle`, `totalBatchAmount` を追加。
  - `scripts/comprehensive-test.ts`: 同費目一括登録のAPI一括送信、単一チェックポイント発行、即時残高減額、一覧取得、およびチェックポイント24hリバート巻き戻しテストを追加（全12カテゴリ完全パス）。
  - `for_agent/05_ui_ux_and_design_system.md`: 記帳タブの3大入力モード仕様（`single`, `shop_batch`, `category_batch`）およびドラフト連携仕様を追記。

### 3. 変更理由
- 要件 2-3「同じ費目に対する一括登録画面 (`category_batch`)」に完全準拠し、まとめ買いや同一ジャンルのレシートを効率的に連続登録できるようにするため。

### 4. 影響範囲
- `src/components/RegisterTab.tsx`
- `src/lib/i18n.ts`
- `scripts/comprehensive-test.ts`
- `for_agent/05_ui_ux_and_design_system.md`

---

## [2026-10-17] 【要件 7】明細CSVインポート機能の実装

### 1. 概要
管理者が明細CSVファイルを取り込み、カラム対応（日付・店舗・金額・種別・費目・支払手段）の自動検出、既存明細との同一日・店舗・金額の重複候補警告判定、および24時間リバート対応チェックポイントを付与した一括インポート登録を行える機能を実装した。

### 2. 変更内容 (Before / After)
- **Before**:
  - `src/app/api/admin/csv/route.ts` には `GET` (CSVエクスポート) のみ存在し、CSVインポート用エンドポイントが存在しなかった。
  - `AdminTab.tsx` にCSVインポートを行うUIが存在しなかった。
  - CSVパースおよびカラムマッピング自動検出の共通ユーティリティが存在しなかった。
- **After**:
  - `src/lib/csv.ts`: RFC 4180準拠のCSVパーサー（引用符・エスケープ・改行・BOM除去対応）、ヘッダー自動検出（`detectColumnMapping`）、日付・金額・種別の正規化関数を新規実装。
  - `src/app/api/admin/csv/route.ts`: `POST` ハンドラーを追加。
    - `action: "preview"`: CSVパース、カラム検出、既存未削除明細との突き合わせによる重複候補警告フラグ（`isDuplicateCandidate`）付与、費目・決済手段の名前/ID自動マッピングを返却。
    - `action: "import"`: 24時間ロールバック用のチェックポイント（`cp_xxx`）を自動生成し、明細登録・決済手段に応じた口座残高同期・投資受入明細生成・監査ログ記録を一括実行。
  - `src/components/CsvImportModal.tsx`: ファイルドラッグ＆ドロップ、カラム対応手動変更、プレビューテーブル、重複候補の一括除外・選択、インポート実行ダイアログを新規実装。
  - `src/components/AdminTab.tsx`: 「CSV データ管理」セクションに「CSVインポート (.csv) ›」ボタンを配置し、`CsvImportModal` と連携。
  - `src/lib/i18n.ts`: CSVインポートおよびモーダル用の多言語リソース（日本語 / 英語）を追加。
  - `scripts/test-csv-unit.ts`: CSVパース、エスケープ、BOM、正規化の単体テストを作成し、全パスを確認。
  - `scripts/comprehensive-test.ts`: CSVエクスポート、プレビュー、重複候補検知、インポート登録、およびインポート明細のチェックポイントリバート巻き戻しテストを追加。
  - `for_agent/04_api_specifications.md`: `POST /api/admin/csv` の仕様および改訂履歴を追記。

### 3. 変更理由
- 要件 7「データインポート・エクスポート (CSV)」に完全準拠し、外部や過去の家計簿データからのスムーズな移行を実現するとともに、二重記帳事故を防ぐ重複候補警告および誤インポート時の24時間安全ロールバックを提供するため。

### 4. 影響範囲
- `src/lib/csv.ts` (新規)
- `src/types/index.ts`
- `src/app/api/admin/csv/route.ts`
- `src/components/CsvImportModal.tsx` (新規)
- `src/components/AdminTab.tsx`
- `src/lib/i18n.ts`
- `scripts/test-csv-unit.ts` (新規), `scripts/comprehensive-test.ts`
- `for_agent/04_api_specifications.md`

---

## [2026-10-17] 投資・積立支出の修正・削除時の受入明細連動処理の安全化

### 1. 概要
貯蓄・投資（`toAccountId` 指定）で作成された支出明細を更新（PUT）または削除（DELETE）した際、受入先口座の残高同期ロールバックおよび自動生成された受入振替明細（`type === "transfer"`）のペア更新・連動削除を安全に実行する処理を実装した。

### 2. 変更内容 (Before / After)
- **Before (`src/app/api/transactions/route.ts` 等)**:
  - 支出明細の登録時、受入明細（`type === "transfer"`）に親明細との紐付け情報が保存されていなかった。
  - 投資・積立支出明細を更新（PUT）した際、出金元の残高変更のみが計算され、受入先口座（`toAccountId`）の残高調整や受入振替明細の内容更新（金額・日付・店名等）が一切連動していなかった。
  - 投資・積立支出明細を削除（DELETE）した際、出金元口座の残高は復元されるものの、受入先口座に加算された残高が減額されず、受入振替明細も論理削除されずに孤立して残っていた。
- **After (`src/app/api/transactions/route.ts`, `src/db/schema/tenant.ts`, `src/db/migrate.ts`)**:
  - `transactions` テーブルに `parent_transaction_id` カラムを追加し、投資・積立支出登録時に受入明細へ親支出明細のID（`parentTransactionId: txId`）を確実に設定。
  - **PUT 処理**:
    1. 旧出金元口座の残高ロールバックと、旧受入先口座からの残高減額ロールバック（`balance - existingTx.amount`）を実行。
    2. 新出金元口座からの減額と、新受入先口座への新金額加算（`balance + newAmount`）を実行。
    3. ペア受入明細（`parentTransactionId` 優先、クエリ特定フォールバック）を特定し、金額・日付・受入口座・店名・メモを同期更新。受入先が解除された場合は受入明細を論理削除。
  - **DELETE 処理**:
    1. 出金元口座の残高回復を実行。
    2. 受入先口座から加算されていた残高を減額（`balance - existingTx.amount`）して完全復元。
    3. ペア受入明細を特定し、同時に論理削除（`deletedAt = NOW()`）および監査ログを記録。
    4. 受入明細が直接削除された場合も受入先残高を減額し親明細の `toAccountId` を解除。
  - `EditTransactionModal.tsx` において、`toAccountId` も保持して送信するよう修正。
  - `scripts/comprehensive-test.ts` に投資支出明細の金額変更（PUT）時の双方向残高同期・受入明細連動テスト、および削除（DELETE）時の残高完全回復・受入明細連動削除テストを追加。
  - `for_agent/` 配下の仕様書（`03_database_design.md`, `04_api_specifications.md`, `guardrails.md`）を最新化。

### 3. 変更理由
- 投資・積立支出の修正や削除によって生じる移動先口座の残高不正残存や、受入明細の孤立放置という会計データ破綻を防止し、完全な残高整合性を保証するため。

### 4. 影響範囲
- `src/app/api/transactions/route.ts` (GET, POST, PUT, DELETE)
- `src/db/schema/tenant.ts`, `src/db/migrate.ts`, `src/types/index.ts`
- `src/components/EditTransactionModal.tsx`
- `scripts/comprehensive-test.ts`
- `for_agent/` 仕様書群

---

## [2026-10-17] 24時間リバート時の現金・QR・振替受入口座の残高逆算漏れ修正

### 1. 概要
`src/app/api/admin/revert/route.ts` において、24時間リバート実行時に現金決済（`cash`）やQR決済（`qr_code`）で手元現金口座やウォレットから自動特定・減額された取引、および投資・積立支出（`toAccountId` 指定）で加算された受入残高の逆算減額が漏れていた問題を修正した。

### 2. 変更内容 (Before / After)
- **Before (`src/app/api/admin/revert/route.ts`)**:
  - `pm.sourceAccountId` が明示設定されている場合のみ `balance + amount` で逆算復元していた。そのため、`sourceAccountId` が未設定の手元現金決済（`type === 'cash'`）やQRウォレット決済（`type === 'qr_code'`）の取引で減額された口座残高が復元されなかった。
  - 投資・積立支出（`expense` かつ `toAccountId` 指定）で移動先口座に加算された残高の逆算減額（`- amount`）が実行されず、リバート後も移動先残高が残存していた。
  - 収入（`income` かつ `toAccountId` 指定）の残高逆算減額も漏れていた。
- **After (`src/app/api/admin/revert/route.ts`)**:
  - `tx.isSettled` をチェックし、未決済取引（クレジットカード）は残高逆算をスキップ。
  - 支出明細（`expense`）において、登録時（`POST /api/transactions`）と同一のフォールバックロジックで手元現金口座（`accounts.type === 'cash'`）およびウォレット口座（`accounts.type === 'prepaid_wallet'`）を自動特定し、出金元口座へ残高を返戻（`balance + amount`）。
  - 投資・積立支出（`expense` かつ `toAccountId`）について、移動先口座から確実に逆算減額（`balance - amount`）。
  - 収入明細（`income` かつ `toAccountId`）について、受入口座から逆算減額（`balance - amount`）。
  - 通常の資金移動（`transfer` かつ `fromAccountId && toAccountId`）について、双方向の残高逆算を実行。

### 3. 変更理由
- チェックポイント時点への巻き戻し時に、現金・QR決済の減額分が復元されず、また投資・積立先や収入の加算残高が残存してしまう会計ロジック破綻を防ぐため。

### 4. 影響範囲
- `POST /api/admin/revert` によるチェックポイント巻き戻し処理。

---

## [2026-10-17] 資金移動 (transfer) における移動元口座減額漏れバグの修正

### 1. 概要
`src/app/api/transactions/route.ts` において、資金移動 (`transfer`) 時に移動元口座 (`fromAccountId`) から残高が減額されず、移動先口座 (`toAccountId`) のみが増額されて残高が不正増殖するバグを修正した。

### 2. 変更内容 (Before / After)
- **Before (`src/app/api/transactions/route.ts`)**:
  - `if (item.toAccountId)` が取引種別判定の前に配置されていたため、`item.type === "transfer"` であっても後続の `else if (item.type === "transfer" && item.fromAccountId && item.toAccountId)` に到達せず、`toAccountId` の加算のみが行われていた。
- **After (`src/app/api/transactions/route.ts`)**:
  - 取引種別 (`item.type`) を最優先で評価する安全な分岐構造に刷新。
  - `item.type === "transfer"` の場合、`item.fromAccountId` からの減額と `item.toAccountId` への加算を確実に両方実行し、`isSettled = true` を設定するように修正。
  - `income`、`expense`（即時決済減額、クレカ引き落とし日計算、投資・積立支出の加算）についても独立して安全に処理される構造に整理。

### 3. 変更理由
- 資金移動取引において移動元口座の残高が維持されたまま移動先残高が増加し、世帯全体の総資産が不正に増加してしまう会計ロジック破綻を防ぐため。

### 4. 影響範囲
- `POST /api/transactions` による資金移動登録時の残高更新ロジック。

---

## [2026-10-17] 仕様書整理 (`for_agent/`) & 既存コード精査 & 実装計画 (`Plan.md`) 策定

### 1. 概要
`docs/` 配下の全仕様書および `src/` 配下の全コードを精査し、エージェント用仕様書正本を `for_agent/` 配下に完全整理・作成した。また、既存コードにおけるロジック不整合・バグ（資金移動時の出金口座減額漏れ、リバート時の現金・QR口座逆算漏れ等）および未実装機能（CSVインポート、同費目一括登録、未保存離脱ガード、動的サジェスト、家族管理等）を特定し、詳細な修正プラン・実装計画を `Plan.md` に策定した。

### 2. 変更内容 (Before / After)

- **`for_agent/` 配下の新規作成**:
  - `for_agent/00_system_overview.md`: システム概要、主要機能、技術スタック、ディレクトリ構造
  - `for_agent/01_requirements_specification.md`: ロール権限構造、機能要件1〜23、データ削除ポリシー
  - `for_agent/02_architecture_and_tech_stack.md`: マルチテナント・スキーマ完全分離、動的ルーティング、Argon2id認証、Pinoロガー・スロークエリ監視
  - `for_agent/03_database_design.md`: マスタ層/テナント層ER図、全テーブル定義、インデックス、マイグレーション方式
  - `for_agent/04_api_specifications.md`: 全APIルート（auth, accounts, transactions, drafts, goals, admin）の入出力仕様・ビジネスロジック
  - `for_agent/05_ui_ux_and_design_system.md`: 5大テーマCSS変数設計、モバイルファーストレイアウト、ゲーミフィケーションUI
  - `for_agent/06_operation_and_testing_guide.md`: 開発/本番環境構築手順、テスト実行手順、検証Ground Truth
  - `for_agent/guardrails.md`: ミス再発防止手順書、会計・残高整合性ルール、OS/シェル非依存ルール
- **`Plan.md` の新規作成**:
  - Phase 0〜Phase 5にわたる詳細実装計画およびチェックリストの作成。
  - 発見された不整合（資金移動時の出金口座減額漏れ、リバート時の逆算復元漏れ等）の修正プランを明記。

### 3. 変更理由
- エージェントが自律的に開発・修正を進めるための規範ドキュメントを `for_agent/` 配下に整備し、仕様不整合の早期解消と安全なループエンジニアリングを実現するため。

### 4. 影響範囲
- ドキュメント類の新規作成および進捗管理ファイルの初期化であり、既存の実行コードやDBスキーマへの破壊的変更はありません。
