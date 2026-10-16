# AICHANGELOG.md

本ファイルは、AIエージェントによる作業内容、変更理由、および影響範囲を記録する変更履歴です。

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
