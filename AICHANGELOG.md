# AICHANGELOG.md

本ファイルは、AIエージェントによる作業内容、変更理由、および影響範囲を記録する変更履歴です。

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
