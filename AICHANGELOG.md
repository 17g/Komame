# AICHANGELOG.md

本ファイルは、AIエージェントによる作業内容、変更理由、および影響範囲を記録する変更履歴です。

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
