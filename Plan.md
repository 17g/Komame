# 『Komame』詳細実装計画書 (Plan.md)

本ドキュメントは、仕様書（`docs/` および `for_agent/`）と現在の実装コードを精査した結果、発見された**ロジック不整合・バグの修正**、および**未実装・不完全な機能の補完**に関する詳細な実装計画を管理する。

---

## 進捗サマリー
- [x] Phase 0: 仕様精査および `for_agent/` 配下への仕様書・ガードレール整備
- [x] Phase 1: コアビジネスロジック・残高整合性バグの修正（最優先）
- [x] Phase 2: 未実装・不完全なコア家計簿機能の実装（仕様完全準拠）
- [x] Phase 3: 管理者機能 & 家族ユーザー管理の実装
- [x] Phase 4: UI/UX・ゲーミフィケーションの動的データ完全連動
- [x] Phase 5: 検証・テスト実行およびプロジェクト設定の最新化
- [x] Phase 6: アプリケーション・DBのポート変更 (3080 / 5532) および README.md 作成・仕様書同期
- [x] Phase 7: ペネトレーションテスト結果に基づく脆弱性改修・セキュリティ強化計画 (VULN-01〜VULN-12)
- [x] Phase 8: 自宅サーバー・ミニPC向け本番環境構築手順書の整備および Docker 本番ビルド構成の不備修正
- [x] Phase 9: 費目マスターメンテナンス機能の実装（標準12費目保護・追加・編集・並び替え・アーカイブ/復元・監査ログ）
- [x] Phase 10: 支出金額入力欄の「単価×個数」計算補助機能の実装（要件 2-7）
- [x] Phase 11: 単価×個数 計算補助UIの個数入力セレクトボックス化（要件 2-7 改訂）
- [x] Phase 12: 新規世帯登録の申請・許可制およびシステム管理者（Super Admin）世帯管理機能の実装（要件 1-1, 1-2, 1-8）
- [x] Phase 13: 初期デモ管理者アカウントのテスト環境限定有効化およびログイン画面表示制御の実装（要件 1-9）
- [x] Phase 14: 貯蓄目標の編集・未達成目標削除・達成済み目標アーカイブ/復元機能の実装（要件 17-2）
- [x] Phase 15: 定例支払い（月次固定費・振替）テンプレート管理 & 自動支払い予定明細追加機能の実装（要件 2-8）
- [x] Phase 16: 口座・決済手段種別の表示名称変更（「デビットカード」→「引落・デビットカード」）（要件 8, 10, 11 / UI仕様 5.1）
- [x] Phase 17: PC用サイドバーのビューポート高固定・下部アクション常時表示対応（要件 13 / UI仕様 2.4）


---

## Phase 0: 仕様精査および `for_agent/` 配下への仕様書・ガードレール整備
- [x] `docs/` 配下のオリジナル仕様書5件の精読と要件抽出
- [x] `src/` 配下の全コード（API、DBスキーマ、UIコンポーネント、テストスクリプト）の精読と仕様対比
- [x] `for_agent/00_system_overview.md` の作成（システム全体像・技術スタック）
- [x] `for_agent/01_requirements_specification.md` の作成（詳細要件・ロール権限・削除ポリシー）
- [x] `for_agent/02_architecture_and_tech_stack.md` の作成（マルチテナント・動的スキーマ・ロギング）
- [x] `for_agent/03_database_design.md` の作成（ER図・テーブル定義・インデックス）
- [x] `for_agent/04_api_specifications.md` の作成（全エンドポイント入出力仕様）
- [x] `for_agent/05_ui_ux_and_design_system.md` の作成（5大テーマ・モバイルファースト・CSS変数）
- [x] `for_agent/06_operation_and_testing_guide.md` の作成（環境構築・検証Ground Truth）
- [x] `for_agent/guardrails.md` の作成（ミス再発防止・会計整合性ガードレール・OS非依存ルール）

---

## Phase 1: コアビジネスロジック・残高整合性バグの修正（最優先）
- [x] **1.1 資金移動 (transfer) 時の移動元口座減額漏れバグの修正 (`src/app/api/transactions/route.ts`)**:
  - 現象: `item.toAccountId` が最初に評価され、`item.type === "transfer"` であっても後続の `else if` に入らず、移動元口座 (`fromAccountId`) から減額されず残高が不正増殖する。
  - 対策: `item.type` を最優先で評価する安全な分岐構造に改修。`transfer` 時に `fromAccountId` の減額と `toAccountId` の増額を確実に実行する。
- [x] **1.2 24時間リバート時の現金・QR・振替受入口座の残高逆算漏れ修正 (`src/app/api/admin/revert/route.ts`)**:
  - 現象: `pm.sourceAccountId` が明示設定されている場合のみ逆算復元しており、現金（`type === 'cash'`）やQR（`type === 'qr_code'`）で自動減額された取引、および投資振替受入で加算された残高の逆算減額が漏れている。
  - 対策: 登録時と同じフォールバックロジックで対象口座を特定し、残高を完全に元の状態へ巻き戻す処理を実装。
- [x] **1.3 投資・積立支出の修正・削除時の受入明細連動処理の安全化**:
  - 現象: 貯蓄・投資（toAccountId 指定）で作成された支出明細を更新・削除した際、自動生成された受入振替明細とのペア更新・削除が連動していない。
  - 対策: ペア明細のID紐付けまたはクエリ特定により、親明細の更新・削除時に受入明細も連動更新・削除するよう実装。

---

## Phase 2: 未実装・不完全なコア家計簿機能の実装（仕様完全準拠）
- [x] **2.1 【要件 7】明細CSVインポート機能の実装 (`src/app/api/admin/csv/route.ts` & `AdminTab.tsx`)**:
  - API: `POST /api/admin/csv` によるCSVファイルのアップロード・パース・カラムマッピング・登録処理。
  - 重複候補警告: 同一日・店舗・金額の既存明細が存在する場合に警告フラグを返却。
  - UI: `AdminTab.tsx` にCSVファイル選択、プレビュー表示、インポート実行ダイアログを実装。
- [x] **2.2 【要件 2-3】登録タブの同費目一括登録モード (`category_batch`) のUI & 送信実装 (`RegisterTab.tsx`)**:
  - UI: 同一費目（例: 食費）固定で、日付・店舗名・金額・メモの行を複数行入力・追加できるUIを構築。
  - 送信: 複数明細を1リクエストで一括登録するロジックを統合。
- [x] **2.3 【要件 2-5】入力離脱時ガード（未保存警告）の実装 (`RegisterTab.tsx`)**:
  - フォーム入力中に別タブへ移動しようとした場合、またはブラウザを閉じようとした場合（`beforeunload`）に確認ダイアログを表示（未入力時は即時遷移）。
- [x] **2.4 【要件 5】機械的サジェストの過去履歴動的集計化 (`RegisterTab.tsx` / API)**:
  - 静的ハードコード（"セブン"等）を廃止し、過去の明細データから入力店舗名に前方一致・部分一致する履歴を検索し、最多使用の「費目」「支払元」を自動サジェストする動的ロジックを実装。
- [x] **2.5 【要件 2-4】タグ付け & カラーラベリングのUI統合 (`tags`, `transaction_tags`)**:
  - 明細登録画面・編集モーダルにタグ入力（`#固定費`, `#自己投資`等）UIを追加。
  - 明細一覧・検索画面でのタグ表示およびタグ絞り込みフィルターを追加。

---

## Phase 3: 管理者機能 & 家族ユーザー管理の実装
- [x] **3.1 【要件 3-2】家族メンバー管理機能の実装 (`src/app/api/admin/members/route.ts` & `AdminTab.tsx`)**:
  - API: 家族メンバー一覧取得、招待リンク発行/メール招待、ロール変更（admin/member）、無効化（論理削除）。
  - UI: `AdminTab.tsx` に家族メンバー一覧カード、招待モーダル、権限変更ボタンを配置。
- [x] **3.2 【要件 1-3 & 3-4】システム設定 & パスワードポリシー動的設定の実装 (`system_settings`)**:
  - API: `/api/admin/settings` によるパスワード強度要件（最小文字数、英大小数字記号）、通貨記号（¥/$）、日付形式の保存・取得。
  - UI: `AdminTab.tsx` にシステム設定フォームを追加。
- [x] **3.3 【要件 3-3】条件付き操作ログエクスポート機能の実装**:
  - ユーザー・期間・操作種別（CREATE/UPDATE/DELETE/REVERT）を指定してCSV/JSON形式でダウンロードする機能を実装。


---

## Phase 4: UI/UX・ゲーミフィケーションの動的データ完全連動
- [x] **4.1 【要件 9】クレジットカード次回引き落とし予定額の完全動的集計 (`DashboardTab.tsx`)**:
  - ハードコードのフォールバック値（85,420円等）を排除。
  - 登録されている全クレジットカードの未精算明細を各カードの締め日・引き落とし日ごとにグループ化し、次回引き落とし予定額と引き落とし元口座の利用可能残高をリアルタイム突合して3段階シグナル（充足 / 注意 / 不足）を表示。
- [x] **4.2 【要件 16-1】こまめ草生やし（Activity Heatmap）の実データ連動 (`DashboardTab.tsx`)**:
  - 固定ダミー配列を排除し、過去4週間（28日間）の実際の明細登録日・件数から曜日別マトリックスを動的生成。
- [x] **4.3 【要件 16-2 & 16-3】まめの樹育成システム & やさしいアドバイスの実データ連動 (`GoalsTab.tsx`)**:
  - 貯蓄目標の達成率や継続ストリーク日数に応じたステージ動的遷移（種/双葉/新芽/実り）。
  - 今月の収支や前月比節約額に基づくポジティブアドバイスの動的生成。

---

## Phase 5: 検証・テスト実行およびプロジェクト設定の最新化
- [x] **5.1 `AGENTS.md` の技術スタックおよび検証コマンドの最新化**:
  - Streamlit/Pythonの誤記述を Next.js 15 / TypeScript / Drizzle ORM / PostgreSQL 16 に修正。
- [x] **5.2 TypeScript型チェック & ビルド検証**:
  - `npx tsc --noEmit` および `npm run build` の正常終了（Exit Code 0）を確認。
- [x] **5.3 総合ビジネスロジックテストの実行 & 更新**:
  - `scripts/comprehensive-test.ts` に修正した資金移動・リバートのテストケースを追加し、全パスを確認。
- [x] **5.4 変更履歴の記録 (`AICHANGELOG.md`)**:
  - 作業内容（Before/After、変更理由、影響範囲）を記録。

---

## Phase 6: アプリケーション・DBのポート変更 (3080 / 5532) および README.md 作成・仕様書同期
- [x] **6.1 設定ファイルおよびコード内のポート番号変更**:
  - `docker-compose.dev.yml`: PostgreSQL ポートを 5532 に変更 (`command: -p 5532`, `ports: ["5532:5532"]`, healthcheck)
  - `docker-compose.prod.yml`: アプリケーションポートを 3080 に変更 (`ports: ["3080:3080"]`, `PORT: 3080`), PostgreSQL ポートを 5532 に変更 (`command: -p 5532`, `DATABASE_URL: ...@postgres:5532/...`, healthcheck)
  - `Dockerfile`: `ENV PORT=3080`, `EXPOSE 3080`
  - `package.json`: scripts の `dev` と `start` に `-p 3080` を追加
  - `.env.example`, `.env.local`: `DATABASE_URL` のポートを 5532 に変更
  - `src/db/index.ts`, `src/db/migrate.ts`, `src/db/seed.ts`: デフォルトのフォールバック URL ポートを 5532 に変更
  - `scripts/*.ts`: E2E テスト・検証スクリプトの接続先を `http://localhost:3080` に更新
- [x] **6.2 プロジェクトルートに `README.md` を作成**:
  - プロジェクト概要、技術スタック、ポート構成（App: 3080, DB: 5532）、開発環境起動手順、本番環境起動手順、テスト検証手順等を網羅
- [x] **6.3 仕様書類 (`for_agent/`, `docs/`) およびガードレールのポート番号記述更新・改訂履歴追記**:
  - `for_agent/00_system_overview.md`
  - `for_agent/02_architecture_and_tech_stack.md`
  - `for_agent/06_operation_and_testing_guide.md`
  - `for_agent/guardrails.md`
  - `docs/environment_setup_guide.md`
- [x] **6.4 ビルド検証 & 型チェック (Ground Truth)**:
  - `npx tsc --noEmit` および `npm run build` を実行し、Exit Code 0 を確認
- [x] **6.5 変更履歴記録 (`AICHANGELOG.md`) & コミット**:
  - `AICHANGELOG.md` に作業内容を記録し、Git コミットを実施

---

## Phase 7: ペネトレーションテスト結果に基づく脆弱性改修・セキュリティ強化計画 (VULN-01〜VULN-12)

- [x] **7.1 [VULN-01 & VULN-05] SQL インジェクションの完全根絶と動的テナントスキーマ名バリデーションの実装**:
  - **対象ファイル**: `src/db/index.ts`, `src/db/migrate.ts`, `src/app/api/transactions/route.ts`, `src/app/api/admin/csv/route.ts`, `src/app/api/admin/revert/route.ts`
  - **実装内容**:
    1. `src/db/index.ts` にスキーマ名ホワイトリスト検証関数 `assertValidSchemaName(schemaName: string)`（正規表現 `/^tenant_[a-zA-Z0-9_-]{1,55}$/`）を実装し、`getTenantSchema()`、`getTenantDb()`、および `src/db/migrate.ts` の `createTenantTables()` の先頭で強制検証する。
    2. `src/app/api/transactions/route.ts`（POST / PUT / DELETE）、`src/app/api/admin/csv/route.ts`（POST import）、`src/app/api/admin/revert/route.ts`（POST）に存在するすべての `raw.unsafe(...)` による口座残高 `UPDATE` 文を撤去する。
    3. Drizzle ORM のパラメータバインディングを用いたクエリ（`db.update(schema.accounts).set({ balance: sql`${schema.accounts.balance} - ${amount}` }).where(eq(schema.accounts.id, accountId))` 等）へ全面的に置換し、複文実行（Stacked Queries）および文字列注入を構造的に遮断する。

- [x] **7.2 [VULN-02 & VULN-10] 家族メンバー管理におけるアカウント乗っ取り (ATO) 防止・User Enumeration 対策・招待時パスワードポリシー適用の実装**:
  - **対象ファイル**: `src/app/api/admin/members/route.ts`, `src/app/api/auth/invite/route.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/signup/route.ts`, `src/app/page.tsx`
  - **実装内容**:
    1. `POST /api/admin/members` でメールアドレス指定時に、既に別世帯に所属している既存ユーザーを本人の認証・同意なしに `household_memberships` へ直接追加する処理を廃止し、既存ユーザーに対しては招待トークンリンク（`/invite?token=...`）を発行して本人が `POST /api/auth/invite` でパスワード認証の上で参加するフローへ統一する。
    2. `POST /api/admin/members` の `action: "reset_password"` において、対象ユーザーが他世帯にも所属している場合は世帯管理者によるグローバルパスワード（`public.users.passwordHash`）の直接上書きを拒否する認可ガードを実装する。
    3. `POST /api/auth/invite` の新規ユーザー登録時に `getHouseholdPasswordPolicy(household.id)` を呼び出し、招待元世帯のカスタムパスワードポリシーを強制適用する。
    4. `POST /api/auth/signup` および `POST /api/auth/login` においても `email.trim().toLowerCase()` によるメールアドレス正規化を統一適用する。
    5. `src/app/page.tsx` におけるログインフォームの初期値からハードコードされた平文パスワード（`Password123!`）を除去（空文字初期化、または開発用クイック入力補助へ分離）する。

- [x] **7.3 [VULN-04 & VULN-06] シークレット管理の厳格化とセッション即時失効・DB突合によるリアルタイム権限検証の実装**:
  - **対象ファイル**: `src/lib/auth.ts`, `src/db/index.ts`, `src/app/api/auth/logout/route.ts`
  - **実装内容**:
    1. `src/lib/auth.ts` および `src/db/index.ts` にて、`NODE_ENV === "production"` 時に `JWT_SECRET`（最低32文字以上かつサンプル既知文字列でないこと）または `DATABASE_URL` が未設定の場合に即座に例外をスローする Fail-Fast 検証を追加する。
    2. `getCurrentSession()` において JWT 署名検証後に `masterDb` で `users`（`isActive === true`）および `household_memberships`（`status === "active"`）を照会し、メンバーの無効化・削除、ロール変更（`admin` ↔ `member`）、および正規の `schemaName` を DB の最新状態から毎回解決して返却する。
    3. ログアウト時（`POST /api/auth/logout`）およびパスワード変更・リセット時に既存の JWT を即時無効化できるよう、失効トークン管理またはユーザー更新時刻（`iat` と `updatedAt` の比較等）によるトークン無効化機構を実装する。

- [x] **7.4 [VULN-07] CSV エクスポートにおける CSV インジェクション (Formula Injection) 防御と RFC 4180 エスケープ統一**:
  - **対象ファイル**: `src/lib/csv.ts`, `src/app/api/admin/csv/route.ts`
  - **実装内容**:
    1. `src/lib/csv.ts` の `escapeCsvCell()` を拡張し、文字列セルの先頭文字が数式トリガー文字（`=`, `+`, `-`, `@`, `\t`, `\r`）に該当する場合（純粋な負の数値型を除く）、先頭にシングルクォート（`'`）を付与して Excel / スプレッドシートでの数式・DDE 実行を無害化する。
    2. `src/app/api/admin/csv/route.ts` の `GET`（口座一覧・全明細の CSV エクスポート）における手動文字列結合を廃止し、`generateCsv()` を使用した RFC 4180 準拠エスケープ出力に統一する。

- [x] **7.5 [VULN-09] 金額・入力パラメータの厳格な境界値バリデーションと DB トランザクション原子性の保証**:
  - **対象ファイル**: `src/lib/utils.ts`（またはバリデーションヘルパー）, `src/app/api/transactions/route.ts`, `src/app/api/accounts/route.ts`, `src/app/api/admin/csv/route.ts`, `src/app/api/admin/revert/route.ts`, `src/app/api/goals/route.ts`
  - **実装内容**:
    1. 金額・数値パラメータの検証関数（整数かつ `1 <= amount <= 9_999_999_999`、口座初期残高は `0 <= balance <= 9_999_999_999`）および一括処理の上限（一括明細登録最大 500 件、CSV ファイルサイズ最大 5MB・最大 5,000 行）を実装し、各 API エンドポイントの入口で不正値を `400 Bad Request` で拒否する。
    2. `transactions`（POST / PUT / DELETE）、`admin/csv`（POST import）、`admin/revert`（POST）における複数テーブル操作と残高更新を `db.transaction(async (tx) => { ... })` で囲み、エラー発生時の完全ロールバックとデータ整合性を保証する。

- [x] **7.6 [VULN-08 & VULN-11] 認証・重要 API のレートリミッター導入および HTTP セキュリティヘッダー・CSRF Origin 検証の実装**:
  - **対象ファイル**: `src/lib/rate-limit.ts`（新規）, `next.config.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/signup/route.ts`, `src/app/api/auth/invite/route.ts`
  - **実装内容**:
    1. IP アドレスおよびアカウント識別子単位のスライディングウィンドウ方式レートリミッター（`src/lib/rate-limit.ts`）を実装し、`POST /api/auth/login`、`POST /api/auth/signup`（動的スキーマ生成 DoS 防御）、`POST /api/auth/invite` に適用する（超過時は `429 Too Many Requests` を返却）。
    2. 状態変更リクエスト（`POST` / `PUT` / `DELETE`）における `Origin` / `Host` ヘッダー整合性検証を追加し、クロスサイトリクエストフォージェリ（CSRF）に対する多層防御を強化する。
    3. `next.config.ts` の `headers()` に `X-Frame-Options: DENY`、`X-Content-Type-Options: nosniff`、`Referrer-Policy: strict-origin-when-cross-origin`、`Permissions-Policy`、`Content-Security-Policy` を設定する。

- [x] **7.7 [VULN-03, VULN-05, VULN-12] 脆弱な NPM 依存パッケージのアップデートと互換性検証**:
  - **対象ファイル**: `package.json`, `package-lock.json`
  - **実装内容**:
    1. `next`、`drizzle-orm`（`>=0.45.2`）、`drizzle-kit`、`postcss`、`sharp` および間接依存パッケージ（`shell-quote`, `source-map-js`, `braces`, `esbuild`, `fast-copy` 等）をセキュリティパッチ適用済みバージョンへアップデート（必要に応じて `overrides` を活用）する。
    2. `npm audit` を実行して Critical / High 脆弱性が解消されていることを確認し、Drizzle ORM スキーマ定義および Next.js 15 App Router の型チェック・ビルド互換性を検証する。

- [x] **7.8 セキュリティ単体テストの作成・仕様書 (`for_agent/`) 同期・総合ビルド検証**:
  - **対象ファイル**: `scripts/test-security-unit.ts`（新規）, `for_agent/02_architecture_and_tech_stack.md`, `for_agent/04_api_specifications.md`, `for_agent/06_operation_and_testing_guide.md`, `for_agent/guardrails.md`, `AICHANGELOG.md`
  - **実装内容**:
    1. スキーマ名バリデーション、CSV 数式インジェクション無害化、金額境界値検証、レートリミッター動作、`raw.unsafe` 不使用の静的コード検査を含むセキュリティ単体テスト（`scripts/test-security-unit.ts`）を作成・実行する。
    2. `for_agent/` 配下の仕様書および `for_agent/guardrails.md` にセキュリティ強化仕様と再発防止ガードレールを反映し、改訂履歴を追記する。
    3. `npx tsc --noEmit` および `npm run build` を実行して Exit Code 0 を確認し、`AICHANGELOG.md` に変更履歴を記録して Git コミットを行う。

---

## Phase 8: 自宅サーバー・ミニPC向け本番環境構築手順書の整備および Docker 本番ビルド構成の不備修正

- [x] **8.1 本番用 Docker ビルド・マイグレーション構成の不備修正 (`next.config.ts`, `Dockerfile`, `.dockerignore`, `docker-compose.prod.yml`, `.env.production.example`)**:
  - `next.config.ts`: `Dockerfile` のマルチステージビルドに対応する `output: "standalone"` を追加。
  - `.dockerignore`: ホスト側の `node_modules`（Windows バイナリ等）や `.next`、`.env*` がコンテナ内に混入するのを防ぐ `.dockerignore` を新規作成。
  - `Dockerfile`: `runner` ステージで `npm run db:migrate` および `npm run db:seed` がコンテナ内から正常実行できるよう、`node_modules`・`src/db`・`src/lib`・`tsconfig.json` を適切に配置。
  - `docker-compose.prod.yml` & `.env.production.example`: 本番用環境変数テンプレート `.env.production.example` を作成し、ヘルスチェック・環境変数読み込み・セキュリティ要件（32文字以上のランダム `JWT_SECRET` 等）を整備。
- [x] **8.2 自宅サーバー・ミニPC・NAS＋独自ドメイン HTTPS 化（Cloudflare Tunnel / Nginx + Let's Encrypt / Tailscale）対応の本番環境構築手順書の作成・更新**:
  - `docs/environment_setup_guide.md` および `for_agent/06_operation_and_testing_guide.md`、`README.md` を更新し、以下の実践的な手順を網羅：
    1. 事前準備・要件（ハードウェア目安、Docker / Docker Compose、ポート 3080 / 5532）
    2. 本番用シークレット生成（`openssl rand -base64 48` 等）と環境変数設定（Fail-Fast 仕様への対応）
    3. Docker Compose による本番ビルド・起動・DBマイグレーション・初期管理者作成手順
    4. 自宅サーバー＋独自ドメイン HTTPS 化手順（パターンA: ポート開放不要の Cloudflare Tunnel 構成、パターンB: Nginx リバースプロキシ + Let's Encrypt 構成、パターンC: Tailscale Serve / Funnel による VPN 内 HTTPS 構成）※CSRF `Origin`/`Host`/`X-Forwarded-*` ヘッダーおよび `Secure` Cookie の注意点を含む
    5. DB バックアップ・リストア（`pg_dump` / `psql`）、アップデート手順、死活監視・ログ確認・トラブルシューティング
- [x] **8.3 ビルド検証・単体テスト実行・変更履歴記録 (`AICHANGELOG.md`)**

---

## Phase 9: 費目マスターメンテナンス機能の実装

- [x] **9.1 DBスキーマ・マイグレーション・初期シード・型定義の更新**:
  - `src/db/schema/tenant.ts`: `categories` テーブルに `isSystem` (`BOOLEAN DEFAULT FALSE NOT NULL`) カラムを追加。
  - `src/db/migrate.ts`: 新規作成 DDL および既存テナントへの `ADD COLUMN IF NOT EXISTS is_system` と標準12費目への `is_system = TRUE` バックフィルを追加。
  - `src/db/seed.ts` & `src/app/api/auth/signup/route.ts`: 標準12費目の初期投入時に `isSystem: true` を設定。
  - `src/types/index.ts`: `CategoryItem` に `isSystem?: boolean` を追加。
- [x] **9.2 費目バリデーション・保護ロジックおよび `/api/categories` API の完全実装**:
  - `src/lib/category-helpers.ts`: 入力検証（費目名・カラー・アイコン）および標準12費目保護判定（`isSystemProtectedCategory`）を実装。
  - `src/app/api/categories/route.ts`:
    - `GET`: `includeArchived=true`（管理者限定）対応、`sortOrder ASC` 順返却。
    - `POST`: 家庭管理者（`admin`）限定、重複チェック、末尾 `sortOrder` 採番、監査ログ記録。
    - `PUT`: 家庭管理者（`admin`）限定、編集（`update`: 標準12費目保護）、全費目並び順一括更新（`reorder`: 標準12費目含む）、アーカイブ復元（`restore`）、監査ログ記録。
    - `DELETE`: 家庭管理者（`admin`）限定、論理削除アーカイブ（`isArchived = true`、標準12費目保護）、監査ログ記録。
- [x] **9.3 管理タブ UI (`AdminTab.tsx` / `CategoryEditModal.tsx`) & 多言語対応 (`i18n.ts`) の実装**:
  - `src/lib/i18n.ts`: 日英の費目マスター管理用翻訳キーを追加。
  - `src/components/CategoryEditModal.tsx`: 新規追加・編集兼用モーダル（費目名・アイコン絵文字パレット・カラーピッカー・プレビュー）。
  - `src/components/AdminTab.tsx` & `src/app/page.tsx`: 「費目マスター管理」セクション（標準費目保護バッジ、上下並び替え操作、追加/編集/アーカイブ/復元、アプリ全体への即時反映）。
- [x] **9.4 単体テスト作成・総合検証・変更履歴記録**:
  - `scripts/test-categories-unit.ts` の作成・実行。
  - `for_agent/06_operation_and_testing_guide.md` への検証コマンド追記。
  - `npx tsc --noEmit`, `npm run build`, `npx tsx scripts/test-security-unit.ts` の全パス確認。
  - `AICHANGELOG.md` への変更履歴記録。

---

## Phase 10: 支出金額入力欄の「単価×個数」計算補助機能の実装（要件 2-7）

- [x] **10.1 単価×個数計算ヘルパー & 境界値バリデーションおよび多言語翻訳キーの追加**:
  - `src/lib/utils.ts`: 単価と個数から合計金額を算出・検証する純粋関数（例: `calculateUnitTotal(unitPrice, quantity)` — 正の整数チェック、`1 <= 合計金額 <= MAX_AMOUNT (9,999,999,999)` の境界値検証）を追加する。
  - `src/lib/i18n.ts`: 日英翻訳辞書（`register` 等）に計算補助UI用ラベル（計算トグル、単価、個数、合計プレビュー、上限超過メッセージ等）を追加する。
- [x] **10.2 再利用可能なインライン金額計算補助コンポーネントの作成 (`src/components/UnitPriceCalculator.tsx`)**:
  - 既存の5大テーマCSS変数およびモバイルファースト設計（`inputMode="numeric"` によるテンキー起動）に準拠した、折りたたみ可能なインライン展開パネルを実装する。
  - `単価`・`個数` 双方に正の整数が入力された際にリアルタイムで `単価 × 個数` を計算し、上限内であれば親の金額反映コールバックを呼び出す（上限超過時は警告表示し不正値を反映しない）。
  - 折りたたみ時も金額欄の値を保持し、金額入力欄が直接手入力された場合は手動値を優先する挙動に対応する。
- [x] **10.3 記帳タブ (`src/components/RegisterTab.tsx`) の全支出金額入力欄への組み込み**:
  - `single` モード（`entryType === "expense"` 時のみ、収入タブ時は非表示）の金額入力欄に計算補助トグルとインラインパネルを組み込む。
  - `shop_batch`（同店舗一括）および `category_batch`（同費目一括）の各明細行に、行単位で独立開閉・計算可能な計算補助UIを組み込む（行追加・削除時も各行の展開状態がずれないよう適切に管理する）。
  - 計算結果の反映が、一括合計金額表示・離脱時ガード（`isFormDirty`）・自動一時保存（2秒デバウンス）と連動することを確認する。
- [x] **10.4 明細編集モーダル (`src/components/EditTransactionModal.tsx`) の支出編集欄への組み込み**:
  - `transaction?.type === "expense"` 時のみ金額入力欄に計算補助トグルとインラインパネルを表示する（収入・振替編集時は非表示）。モーダル開閉・対象明細切り替え時に展開状態・入力値を初期化する。
- [x] **10.5 単体テスト作成・総合ビルド検証・仕様書同期・変更履歴記録**:
  - `scripts/test-unit-calculator.ts` を新規作成し、正常系・境界値（`1`, `9,999,999,999`）・異常系（`0`, 負数, 小数, 上限超過, 非数字）の単体テストを実装・実行する。
  - `for_agent/06_operation_and_testing_guide.md` の単体テスト一覧および改訂履歴を更新する。
  - `npx tsc --noEmit`, `npm run build`, `npx tsx scripts/test-unit-calculator.ts`, `npx tsx scripts/test-security-unit.ts` を実行してすべて Exit Code 0 を確認する。
  - `AICHANGELOG.md` に作業内容を記録し、Git コミットを行う。

---

## Phase 11: 単価×個数 計算補助UIの個数入力セレクトボックス化（要件 2-7 改訂）

- [x] **11.1 `UnitPriceCalculator` コンポーネントの個数UIセレクトボックス化 (`src/components/UnitPriceCalculator.tsx` / `src/lib/i18n.ts`)**:
  - `UnitPriceCalculatorPanel` の個数入力欄（`<input>`）を `1` 〜 `30` の整数を選択する `<select>` 要素（`DEFAULT_QUANTITY = "1"`, `MAX_UI_QUANTITY = 30` 等の定数・オプション配列を使用）へ変更する（31個以上は金額入力欄へ直接手入力する仕様）。
  - 個数の選択変更時はリアルタイムで `calculateUnitTotal(unitPrice, nextQty)` を実行し、上限内であれば `onApplyAmount` を呼び出す。
  - 非制御モード（`UnitPriceCalculator`）の `internalQuantity` 初期値および `resetKey` 変化時のリセット値を `"1"` に変更し、単価入力時点で即座に `単価 × 1` が反映される挙動にする。
  - 必要に応じ `src/lib/i18n.ts` の個数関連ラベル/プレースホルダー表現を確認・調整する。
- [x] **11.2 利用側コンポーネントの個数初期値・リセット値の `"1"` 統一 (`src/components/RegisterTab.tsx` & `src/components/EditTransactionModal.tsx`)**:
  - `RegisterTab.tsx`: `DEFAULT_ROW_CALC_STATE.quantity`、`singleCalcQuantity` の初期値、および `resetCalculators()` 内の `setSingleCalcQuantity("1")` を `"1"` に更新する（`single` / `shop_batch` / `category_batch` 全モード対応）。
  - `EditTransactionModal.tsx`: `calcQuantity` の初期値およびモーダル開閉・対象明細切り替え時のリセット値 `setCalcQuantity("1")` を `"1"` に更新する。
- [x] **11.3 単体テスト拡充・総合ビルド検証・変更履歴記録 (`scripts/test-unit-calculator.ts` / `AICHANGELOG.md`)**:
  - `scripts/test-unit-calculator.ts`: `calculateUnitTotal` が引き続き `1` 以上の正の整数（31以上含む）を受け付ける汎用仕様のテストを維持しつつ、UI用個数オプション範囲（`1`〜`30`）および初期値 `"1"` に関する検証を追加・実行する。
  - `npx tsc --noEmit`, `npm run build`, `npx tsx scripts/test-unit-calculator.ts`, `npx tsx scripts/test-security-unit.ts` を実行し、すべて Exit Code 0 を確認する。
  - `AICHANGELOG.md` に変更内容を記録し、Git コミットを行う。

---

## Phase 12: 新規世帯登録の申請・許可制およびシステム管理者（Super Admin）世帯管理機能の実装（要件 1-1, 1-2, 1-8）

- [x] **12.1 マスタDBスキーマ拡張・マイグレーション・シード・型定義の更新 (`src/db/schema/master.ts`, `src/db/migrate.ts`, `src/db/seed.ts`, `src/types/index.ts`)**:
  - `src/db/schema/master.ts`: `households` テーブルに `status`（`varchar("status", { length: 20 }).default("approved").notNull()`）、`reviewedBy`（`varchar("reviewed_by", { length: 64 })`）、`reviewedAt`（`timestamp("reviewed_at", { withTimezone: true })`）、`rejectionReason`（`text("rejection_reason")`）を追加し、IDカラム長整合性を確認する。
  - `src/db/migrate.ts`:
    - `createMasterTables()` に `public.households` の新規カラム定義および既存環境向け `ALTER TABLE public.households ADD COLUMN IF NOT EXISTS ...` を追加する。
    - `runMigrations()` におけるテナントスキーマ作成対象を `WHERE status IN ('approved', 'suspended')` に限定し、未承認（`pending`）・却下（`rejected`）世帯に対してスキーマが作成されないよう保護する。
  - `src/db/seed.ts`: 初期デモ世帯（山田家）の投入時に `status = 'approved'` を明示設定する。
  - `src/types/index.ts`: `HouseholdStatus` 型（`"pending" | "approved" | "rejected" | "suspended"`）、`UserSession` への `isSuperAdmin?: boolean` 追加、およびシステム管理者向け世帯一覧アイテム型 `ManagedHouseholdItem` を定義する。

- [x] **12.2 認証・セッション検証ロジックおよびログイン・サインアップ申請APIの改修 (`src/lib/auth.ts`, `src/app/api/auth/signup/route.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/me/route.ts`)**:
  - `src/lib/auth.ts`:
    - `SessionPayload` に `isSuperAdmin?: boolean` を追加する。
    - `getCurrentSession()` のマスタDB照会クエリに `users.isSuperAdmin` および `households.status` を追加し、`record.householdStatus !== "approved"` の場合は `null` を返却して未承認・却下・停止世帯のセッションを即時遮断する。
  - `src/app/api/auth/signup/route.ts`:
    - 申請時点でのテナント専用スキーマ作成・初期費目/口座シード・セッションCookie発行を廃止し、`public.users` / `public.households`（`status: "pending"`） / `public.household_memberships` のみをマスタDBへ登録して `{ success: true, pendingApproval: true, message: "..." }`（`201 Created`）を返却するよう改修する。
  - `src/app/api/auth/login/route.ts` & `src/app/api/auth/me/route.ts`:
    - `login`: パスワード検証成功後に所属世帯の `households.status` を確認し、`pending` / `rejected` / `suspended` の場合はそれぞれの状態を明示したメッセージとともに `403 Forbidden` を返却する（パスワード不一致・未存在時は従来通り `401` でアカウント列挙を防止）。`approved` 時は `isSuperAdmin` を含めてセッション・レスポンスを発行する。
    - `me`: レスポンスの `user` に `isSuperAdmin` を含めて返却する。

- [x] **12.3 システム管理者（Super Admin）世帯承認・管理APIの新規実装 (`src/app/api/super-admin/households/route.ts`)**:
  - `getCurrentSession()` に加え、DB上の `users.isSuperAdmin === true` を検証する認可ガード（非Super Adminは `403 Forbidden`）を実装する。
  - `GET /api/super-admin/households`: 登録申請中および登録済みの世帯一覧（世帯名、申請者メールアドレス、ステータス、申請日時、審査日時、却下理由）およびステータス別件数集計（`counts`）を返却する（`status` クエリフィルタ対応）。
  - `PUT /api/super-admin/households`:
    - `action: "approve"`（承認・再承認）: `pending` または `rejected` の世帯を対象に、`assertValidSchemaName` 検証のうえ `createTenantTables(schemaName)` を実行し、`system_settings`・標準12費目・デフォルト現金口座を冪等に初期シード投入した上で、`status = "approved"`, `reviewedBy`, `reviewedAt`, `rejectionReason = null` に更新する。
    - `action: "reject"`（却下）: `pending` 世帯を `status = "rejected"`, `reviewedBy`, `reviewedAt`, `rejectionReason` に更新する。
    - `action: "suspend"` / `"reactivate"`（停止・再開）: 承認済み世帯の `status` を `"suspended"` / `"approved"` に切り替える（現在操作中のSuper Admin自身の所属世帯の停止は `400 Bad Request` で拒否し自己ロックアウトを防止）。
  - `DELETE /api/super-admin/households?householdId=...`: `rejected` または `pending` の世帯申請レコードを物理削除し、他世帯に所属していない申請ユーザーもあわせて物理削除することで、同一メールアドレスでの再申請を可能にする（`approved` / `suspended` や自世帯の削除は拒否）。

- [x] **12.4 ログイン・新規世帯申請画面 (`src/app/page.tsx`) および管理タブ内 Super Admin 世帯管理UI (`src/components/AdminTab.tsx`, `src/lib/i18n.ts`) の実装**:
  - `src/lib/i18n.ts`: 新規世帯登録申請・承認待ち案内、およびシステム管理者向け世帯承認・アカウント管理セクションの日英翻訳キーを追加する。
  - `src/app/page.tsx`:
    - 新規世帯登録タブのボタン文言を申請制表記（「新規世帯の登録を申請する」等）に変更し、「※システム管理者の承認後にログイン可能となります」の案内を表示する。
    - 申請完了時（`pendingApproval: true`）にログイン画面へ切り替え、申請受付完了バナーを表示する。
    - 承認待ち・却下・停止状態でのログイン試行時に返却される `403` メッセージを分かりやすく表示する。
    - `AdminTab` に `isSuperAdmin={Boolean(user.isSuperAdmin)}` および `currentHouseholdId={user.householdId}` を渡す。
  - `src/components/AdminTab.tsx`:
    - `isSuperAdmin === true` の場合にのみ表示される「システム管理：新規世帯登録の承認・アカウント管理」セクションを実装する。
    - ステータスフィルター（すべて / 承認待ち / 承認済み / 却下済み / 停止中）と未承認件数バッジ、各世帯の情報表示、および状態に応じた操作（「許可（承認）」「却下（理由入力対応）」「再承認」「削除（抹消）」「利用停止」「利用再開」）を実装する。

- [x] **12.5 単体テスト・E2E総合テストの更新とビルド検証・変更履歴記録 (`scripts/test-household-approval-unit.ts`, `scripts/comprehensive-test.ts`, `for_agent/06_operation_and_testing_guide.md`, `AICHANGELOG.md`)**:
  - `scripts/test-household-approval-unit.ts` を新規作成し、世帯ステータス判定・ログイン可否・Super Admin 操作バリデーション（自己世帯停止・削除ガード等）の単体テストを実行する。
  - `scripts/comprehensive-test.ts` の新規サインアップ検証フローを、申請（`pending`）→未承認時ログイン拒否（`403`）→Super Admin（`admin@komame.local`）による承認→承認後ログイン成功のフローへ更新する。
  - `for_agent/06_operation_and_testing_guide.md` の単体テスト一覧に `test-household-approval-unit.ts` を追記する。
  - `npx tsc --noEmit`, `npm run build`, `npx tsx scripts/test-household-approval-unit.ts`, `npx tsx scripts/test-security-unit.ts` を実行し、すべて Exit Code 0 を確認する。
  - `AICHANGELOG.md` に作業内容を記録し、Git コミットを行う。

---

## Phase 13: 初期デモ管理者アカウントのテスト環境限定有効化およびログイン画面表示制御の実装（要件 1-9）

- [x] **13.1 認証・セッション検証・ログインAPIおよびシード処理における初期デモ管理者アカウントのテスト環境限定化 (`src/lib/auth.ts`, `src/app/api/auth/login/route.ts`, `src/db/seed.ts`, `docker-compose.prod.yml`)**:
  - `src/lib/auth.ts`:
    - テスト環境判定関数 `isTestEnvironment(nodeEnv = process.env.NODE_ENV): boolean`（`nodeEnv !== "production"`）および初期デモ管理者アカウント判定関数 `isDemoAdminAccount(identifier?: string | null): boolean`（メールアドレス `admin@komame.local` またはユーザーID `usr-yamada-taro-001`）、環境別デモ管理者許可判定関数 `isDemoAdminAllowed(identifier?: string | null, nodeEnv = process.env.NODE_ENV): boolean` を実装する。
    - `getCurrentSession()` において、本番環境（`NODE_ENV === "production"`）かつ対象ユーザーが初期デモ管理者アカウント（`admin@komame.local` または `usr-yamada-taro-001`）である場合は無条件で `null` を返却しセッションを遮断する。
  - `src/app/api/auth/login/route.ts`:
    - 本番環境（`NODE_ENV === "production"`）において `normalizedEmail === "admin@komame.local"` または検索された `user.id === "usr-yamada-taro-001"` の場合、認証を拒否し `401 Unauthorized`（「メールアドレスまたはパスワードが正しくありません。」）を返却する。
  - `src/db/seed.ts` & `docker-compose.prod.yml`:
    - `src/db/seed.ts`: 本番環境（`NODE_ENV === "production"`）でシードを実行した際、初期デモ管理者アカウント（`admin@komame.local` / `Password123!`）の作成を禁止する検証関数 `assertDemoSeedAllowed(nodeEnv, adminEmail, adminPass)` を実装・適用し、本番環境でのデモアカウント作成をエラーで防止する。
    - `docker-compose.prod.yml`: `DEFAULT_ADMIN_EMAIL` / `DEFAULT_ADMIN_PASSWORD` / `DEFAULT_HOUSEHOLD_NAME` からデモ資格情報（`admin@komame.local`, `Password123!`, `山田家`）のデフォルトフォールバックを除去する。

- [x] **13.2 ログイン画面 (`src/app/page.tsx`) における初期デモ管理者アカウント欄のテスト環境限定出力**:
  - `src/app/page.tsx`:
    - テスト環境フラグ（`const isTestEnv = process.env.NODE_ENV !== "production"`）を定義し、ログイン画面下部の「💡 初期デモ管理者アカウント（`admin@komame.local` / `Password123!` および『クイック入力』ボタン）」欄を `authMode === "login" && isTestEnv` の場合のみレンダリングし、本番環境（`NODE_ENV === "production"`）では DOM に一切出力しないよう改修する。
    - メールアドレス入力欄の `placeholder` もテスト環境時のみ `"admin@komame.local"`、本番環境時は `"user@example.com"` とする。

- [x] **13.3 単体テスト・静的検査の拡充と総合ビルド検証・変更履歴記録 (`scripts/test-auth-session-unit.ts`, `scripts/test-security-unit.ts`, `AICHANGELOG.md`)**:
  - `scripts/test-auth-session-unit.ts` および `scripts/test-security-unit.ts` に、初期デモ管理者アカウント（`admin@komame.local` / `usr-yamada-taro-001`）がテスト環境（`development` / `test`）でのみ有効であり本番環境（`production`）ではログイン・セッション・シードのすべてで拒否されること、および `src/app/page.tsx` で初期デモ管理者アカウント欄がテスト環境限定で出力されていることの検証テストを追加・実行する。
  - `npx tsc --noEmit`, `npm run build`, `npx tsx scripts/test-auth-session-unit.ts`, `npx tsx scripts/test-security-unit.ts` を実行し、すべて Exit Code 0 を確認する。
  - `AICHANGELOG.md` に作業内容を記録し、Git コミットを行う。

---

## Phase 14: 貯蓄目標の編集・未達成目標削除・達成済み目標アーカイブ/復元機能の実装（要件 17-2）

- [x] **14.1 テナントDBスキーマ・マイグレーション・型定義・バリデーションヘルパーの追加 (`src/db/schema/tenant.ts`, `src/db/migrate.ts`, `src/types/index.ts`, `src/lib/goal-helpers.ts`)**:
  - `src/db/schema/tenant.ts`: `savingsGoals` テーブルに `isArchived: boolean("is_archived").default(false).notNull()` カラムを追加する。
  - `src/db/migrate.ts`: `createTenantTables()` の `savings_goals` テーブル作成 DDL に `is_archived BOOLEAN DEFAULT FALSE NOT NULL` を追加し、既存テナントスキーマ向けに `ALTER TABLE "${schemaName}".savings_goals ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE NOT NULL;` を追加する。
  - `src/types/index.ts`: `SavingsGoalItem` に `isArchived?: boolean` および `createdAt?: string` を追加する。
  - `src/lib/goal-helpers.ts`（新規）: 貯蓄目標の入力バリデーション（タイトル、目標金額 `1 <= targetAmount <= 9,999,999,999`、予定日、対象口座配列、カラー）、達成状態判定（`isGoalAchieved(currentAmount, targetAmount, isCompleted)`）、削除可否判定（未達成かつ未アーカイブのみ削除可、達成済み・アーカイブ済みは削除不可）、アーカイブ可否判定（達成済みのみアーカイブ可）、および進行中（未アーカイブ）目標のみの合算進捗算出関数（`calculateActiveGoalsSummary`）を純粋関数として実装する。

- [x] **14.2 貯蓄目標 API (`src/app/api/goals/route.ts`) の拡張（編集・アーカイブ・復元・未達成削除・監査ログ連携）**:
  - `GET /api/goals`: 進行中・アーカイブ済みを含む目標一覧を取得し、対象口座合算残高（`currentAmount`）、達成率（`progressRate`）、`isArchived` を付与して返却する。
  - `POST /api/goals`: 入力値・金額境界値を検証し、`isCompleted: false`, `isArchived: false` で登録するとともに監査ログ（`action: "CREATE", entityType: "savings_goal"`）を記録する。
  - `PUT /api/goals`:
    - `action: "update"`（または省略時）: 目標情報の編集（タイトル、目標金額、達成予定日、対象口座ID配列、カラー）を行い、監査ログ（`action: "UPDATE", entityType: "savings_goal"`）に `beforeDataJson` / `afterDataJson` を記録する。
    - `action: "archive"`: 対象目標の現在残高合算による達成状態を検証し、達成済み（`currentAmount >= targetAmount || isCompleted`）の場合のみ `isArchived = true`, `isCompleted = true` に更新して監査ログを記録する（未達成の場合は `400 Bad Request` で拒否）。
    - `action: "restore"`: アーカイブ済み目標の `isArchived` を `false` に更新して進行中一覧へ復元し、監査ログを記録する。
  - `DELETE /api/goals?id=...`: 対象目標が達成済み（`currentAmount >= targetAmount || isCompleted`）またはアーカイブ済み（`isArchived === true`）の場合は `400 Bad Request` で削除を拒否し、未達成目標のみ物理削除して監査ログ（`action: "DELETE", entityType: "savings_goal"`）を記録する。

- [x] **14.3 目標・成長タブ UI (`src/components/GoalsTab.tsx`) における目標編集・削除・アーカイブ/復元UIの実装**:
  - 進行中目標（`!g.isArchived`）とアーカイブ済み目標（`Boolean(g.isArchived)`）を分離し、「全目標の合算進捗（全体達成率）」「まめの樹育成システム」「やさしいアドバイス」の集計対象を進行中（未アーカイブ）目標のみに限定する（`calculateActiveGoalsSummary` 連動）。
  - 各進行中目標カードに「編集」ボタンを配置し、新規作成と共通化されたモーダル（または編集モード）でタイトル・目標金額・達成予定日・対象口座・テーマカラーを編集・保存できるようにする。
  - 未達成目標カードには「削除」ボタン（誤操作防止の確認UI付き）を配置し、達成済み目標カードには削除ボタンを表示せず「アーカイブ」ボタンを配置する。
  - 進捗一覧内に「アーカイブ済みを表示（N件）」トグルを設け、展開時にアーカイブ済み達成目標カードを一覧表示し、「復元（進行中に戻す）」ボタン（削除ボタンは非表示で保護）を実装する。

- [x] **14.4 単体テスト・E2E総合テストの追加とビルド検証・変更履歴記録 (`scripts/test-goals-unit.ts`, `scripts/comprehensive-test.ts`, `for_agent/06_operation_and_testing_guide.md`, `AICHANGELOG.md`)**:
  - `scripts/test-goals-unit.ts` を新規作成し、目標入力バリデーション、達成判定、未達成のみ削除可・達成済み削除拒否ガード、達成済みのみアーカイブ可・復元、および合算進捗集計からのアーカイブ除外ロジックの単体テストを実行する。
  - `scripts/comprehensive-test.ts` および `for_agent/06_operation_and_testing_guide.md` に貯蓄目標の編集・削除・アーカイブ/復元のテスト項目を追記する。
  - `npx tsc --noEmit`, `npm run build`, `npx tsx scripts/test-goals-unit.ts`, `npx tsx scripts/test-security-unit.ts` を実行し、すべて Exit Code 0 を確認する。
  - `AICHANGELOG.md` に作業内容を記録し、Git コミットを行う。

---

## Phase 15: 定例支払い（月次固定費・振替）テンプレート管理 & 自動支払い予定明細追加機能の実装（要件 2-8）

- [x] **15.1 テナントDBスキーマ・マイグレーション・型定義・月次サイクル計算ヘルパーの追加 (`src/db/schema/tenant.ts`, `src/db/migrate.ts`, `src/types/index.ts`, `src/lib/recurring-helpers.ts`)**:
  - `src/db/schema/tenant.ts`: `recurring_templates` テーブル定義を追加し、`transactions` テーブルに `recurringTemplateId: varchar("recurring_template_id", { length: 64 })` カラムを追加する。
  - `src/db/migrate.ts`: `createTenantTables()` に `recurring_templates` テーブル作成 DDL、`transactions.recurring_template_id` の `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`、およびインデックスを追加する。
  - `src/types/index.ts`: `RecurringTemplateItem` 型および `TransactionItem` への `recurringTemplateId?: string` を追加する。
  - `src/lib/recurring-helpers.ts`（新規）:
    - テンプレート入力バリデーション（名称 1〜150文字、金額 `1 <= amount <= 9,999,999,999` の整数、取引種別 `expense | transfer`、振替時の `fromAccountId !== toAccountId` 必須検証、支払基準日 `1`〜`28` または `99`:月末）。
    - クレジットカード選択時の規定引き落とし日（`payment_methods.withdrawal_day || 27`）自動適用ロジック（`resolveEffectiveDayOfMonth`）。
    - 「規定支払日の翌日」からの月次サイクル判定・支払予定日算出ロジック（`resolveTargetCycleAndDates(referenceDateStr, effectiveDayOfMonth)`：基準日当日までは当月サイクル `YYYY-MM`、基準日の翌日以降は翌月サイクル `YYYY-(MM+1)` を返し、該当サイクルの支払予定日 `scheduledWithdrawalDate` と取引日 `date` を算出する純粋関数）。
    - 支払予定日到来済み（`scheduledWithdrawalDate <= today`）かつ未精算（`isSettled === false`）の非クレジットカード明細の自動精算対象判定ヘルパー。

- [x] **15.2 定例支払いテンプレート & 月次自動追加・精算 API の実装 (`src/app/api/recurring-templates/route.ts`, `src/app/api/transactions/route.ts`, `src/app/api/admin/revert/route.ts`)**:
  - `src/app/api/recurring-templates/route.ts`（新規）:
    - `GET /api/recurring-templates`: テンプレート一覧取得（費目名・決済手段名・種別・口座名を結合）。`autoSync=true` 指定時は現在日付基準で有効テンプレートの未生成サイクル分の「支払い予定（`isSettled: false`）」明細自動追加、および支払予定日到来済みの非クレカ未精算明細の口座残高精算（`isSettled: true` 更新＋残高減額/加算＋積立受入明細生成）を `db.transaction()` 内で冪等に実行し、`syncResult: { generatedCount, settledCount }` とともに返却する。
    - `POST /api/recurring-templates`: 新規テンプレート登録（`action: "create"` または省略時、有効時は初回対象サイクルの支払い予定明細も同時生成）、月次同期手動実行（`action: "sync"`）、および未精算支払い予定明細の手動確定精算（`action: "settle", transactionId`）を実装し、監査ログ・チェックポイントを記録する。
    - `PUT /api/recurring-templates`: テンプレート編集および有効/一時停止（`isActive`）切替を実装し、監査ログを記録する。
    - `DELETE /api/recurring-templates?id=...`: テンプレートの物理削除（生成済み明細は保持）および監査ログ記録を実装する。
  - `src/app/api/transactions/route.ts` & `src/app/api/admin/revert/route.ts`:
    - `GET /api/transactions` の返却フィールドに `recurringTemplateId` を含め、未精算（`isSettled === false`）の定例支払い予定明細を更新・削除・24hリバートした際も、`isSettled` 状態に応じて二重減額や不正な残高逆算が起きないよう残高整合性を保証する。

- [x] **15.3 記帳タブ内「定例支払いテンプレート管理」UIおよびアプリ起動時自動同期の実装 (`src/components/RegisterTab.tsx`, `src/app/page.tsx`, `src/lib/i18n.ts`)**:
  - `src/lib/i18n.ts`: 定例支払いテンプレート管理および支払い予定（未精算）・精算確定に関する日英翻訳キーを追加する。
  - `src/components/RegisterTab.tsx`:
    - 記帳タブ内に「定例支払いテンプレート管理」セクション（テンプレート一覧・新規作成/編集フォーム・手動同期・未精算支払い予定一覧）を追加する。
    - 支出（クレカ・口座引き落とし・積立投資等）と口座間振替の切り替えに対応し、クレジットカード選択時はカード規定の引き落とし日（支払日の翌日に次回分自動追加）を自動表示し、口座引き落とし・振替等の場合は任意の日（1〜28日 / 月末）を選択できるUIを実装する。
    - 各テンプレートの編集、有効/一時停止トグル、削除ボタン、および未精算の支払い予定明細に対する「今すぐ精算（残高へ反映）」ボタンを実装する。
  - `src/app/page.tsx`:
    - ログイン後のデータ取得時（`fetchAllData`）に `/api/recurring-templates?autoSync=true` を呼び出し、月次支払い予定の自動追加または支払日到来分の自動精算が行われた場合にトースト通知および明細・口座残高の最新化を行う。

- [x] **15.4 単体テスト・E2E総合テストの追加とビルド検証・変更履歴記録 (`scripts/test-recurring-unit.ts`, `scripts/comprehensive-test.ts`, `for_agent/06_operation_and_testing_guide.md`, `AICHANGELOG.md`)**:
  - `scripts/test-recurring-unit.ts` を新規作成し、テンプレート入力バリデーション、クレカ規定引き落とし日の自動連動、「規定支払日の翌日」での次回サイクル年月・支払予定日算出、二重生成防止（冪等性）、および支払日到来時の精算判定ロジックの単体テストを実行する。
  - `scripts/comprehensive-test.ts` および `for_agent/06_operation_and_testing_guide.md` に定例支払いテンプレートの検証項目を追記する。
  - `npx tsc --noEmit`, `npm run build`, `npx tsx scripts/test-recurring-unit.ts`, `npx tsx scripts/test-security-unit.ts` を実行し、すべて Exit Code 0 を確認する。
  - `AICHANGELOG.md` に作業内容を記録し、Git コミットを行う。

---

## Phase 16: 口座・決済手段種別の表示名称変更（「デビットカード」→「引落・デビットカード」）（要件 8, 10, 11 / UI仕様 5.1）

- [x] **16.1 決済手段種別表示ラベル・正規化ヘルパーの実装と口座・決済手段UIの更新 (`src/lib/utils.ts`, `src/components/AccountsTab.tsx`, `src/components/AddAccountModal.tsx`, `src/components/EditPaymentMethodModal.tsx`)**:
  - `src/lib/utils.ts`: 決済手段種別のUI表示名称を統一解決する純粋関数 `getPaymentMethodTypeLabel(type)`（`credit_card`: クレジットカード、`qr_code`: QR・バーコード決済、`debit_card` / `direct_debit`: 引落・デビットカード、`cash`: 現金）および編集フォーム用種別正規化ヘルパー（既存 `direct_debit` → `debit_card`）を実装する。
  - `src/components/AccountsTab.tsx`: 決済手段一覧カードの種別バッジ表示を `getPaymentMethodTypeLabel(pm.type)` へ置換し、`debit_card` および既存互換の `direct_debit` を「引落・デビットカード」に統一表示する。
  - `src/components/AddAccountModal.tsx`: 決済手段追加モーダルの種別セレクトにおける `debit_card` オプション表示を「引落・デビットカード」へ変更する（DB内部値 `debit_card`・銀行口座のみ選択可の制約・通常登録時の即時減額等の既存挙動は維持）。
  - `src/components/EditPaymentMethodModal.tsx`: 決済手段編集モーダルの種別セレクトにおける `debit_card` オプション表示を「引落・デビットカード」へ変更し、既存 `direct_debit` データを開いた場合も「引落・デビットカード（`debit_card`）」として整合表示・銀行口座のみ選択可の制約を適用する。
  - 単体テスト・静的検証（`npx tsc --noEmit`, `npm run build`, `npx tsx scripts/test-security-unit.ts`）およびローカル PostgreSQL（5532）・開発サーバー（3080）上での総合テスト（`npx tsx scripts/comprehensive-test.ts`）・UI表示確認を実施し、`AICHANGELOG.md` 記録・Git コミットを行う。

---

## Phase 17: PC用サイドバーのビューポート高固定・下部アクション常時表示対応（要件 13 / UI仕様 2.4）

- [x] **17.1 PC用サイドバー (`src/components/Sidebar.tsx`, `src/app/page.tsx`) のビューポート高固定・上部内部スクロール・下部アクション常時下端固定の実装**:
  - `src/components/Sidebar.tsx`:
    - `<aside>` の `min-h-screen` を `h-screen`（または `h-dvh`）＋ `sticky top-0 self-start shrink-0` へ変更し、メインエリアの縦長に連動してサイドバーが縦に引き伸ばされないようにする。
    - 上部エリア（ロゴ・通知ボタン・ナビゲーション・UIテーマ切替・言語切替）のコンテナに `flex-1 min-h-0 overflow-y-auto` を設定し、ウィンドウ縦幅が狭いPC画面でもメインエリアとは独立して縦スクロール可能にする。
    - 下部フッター領域（ユーザー情報・CSVダウンロードボタン・ログアウトボタン）に `shrink-0` を設定し、常にサイドバー下端へ固定表示されてメイン画面のスクロール不要で即座にアクセスできるようにする。
  - `src/app/page.tsx`: 親Flexコンテナのレイアウト設定がサイドバーの `sticky top-0` および高さ固定と競合しないことを確認・調整する。
  - 静的検証（`npx tsc --noEmit`, `npm run build`, `npx tsx scripts/test-security-unit.ts`）およびローカル PostgreSQL（5532）・開発サーバー（3080）上での総合テスト（`npx tsx scripts/comprehensive-test.ts`）・PC画面（長尺スクロール時および縦幅縮小時）の実画面動作検証を実施し、`AICHANGELOG.md` 記録・Git コミットを行う。



