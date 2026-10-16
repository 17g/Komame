# AICHANGELOG.md

本ファイルは、AIエージェントによる作業内容、変更理由、および影響範囲を記録する変更履歴です。

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
