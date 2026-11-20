# 『Komame』開発・運用ガードレール (Guardrails)

本ドキュメントは、エージェントが本プロジェクトで作業を行う際のミスやトラブルに対する**問題解決および注意を促すための手順書**です。

---

## 1. 環境・シェル・実行ルールの鉄則

### 1.1 OS・シェル環境確認 CoT の徹底
エージェントは `run_command` を呼び出す直前に、必ず以下の思考プロセスを評価すること：
1. **ホストOSの確認**: Windows
2. **使用シェルの確認**: PowerShell
3. **Cwd（作業ディレクトリ）の整合性確認**: `c:\Users\ina90\Documents\Workspace\Komame`
4. **構文の安全性確認**:
   - `&&` や `||` による複数コマンド連結は行わない（単一コマンドに分割するかスクリプト化）。
   - POSIX 固有コマンド（`rm -rf`, `cat`, `ls`, `mkdir -p`）を使わない。
   - インラインワンライナー（`powershell -Command "..."` や `node -e "..."`）はエスケープ事故を防ぐため禁止。
   - シェルリダイレクト（`>` / `>>`）は文字コード（UTF-16LE）化するため厳禁。`write_to_file` を使用する。

### 1.2 技術スタックの認識
- 本プロジェクトは **Next.js 15 (React 19, TypeScript) + Drizzle ORM + PostgreSQL 16** です。
- `AGENTS.md` の初期テンプレートに誤記（Python/Streamlit）がある場合でも、実プロジェクトの Next.js 構成に基づいて検証コマンド（`npm run build`, `npx tsc --noEmit` 等）を実行すること。

### 1.3 テスト実行・ローカル開発サーバー動作検証ガードレール（原則必須）
- **ローカル開発サーバーでの動作検証の原則実施**:
  - 機能実装および API・DB・UI の変更を行った場合、型チェック（`npx tsc --noEmit`）・ビルド検証（`npm run build`）・DB不要単体テストのみで作業を完了とせず、**原則としてローカルの PostgreSQL サービス（ポート 5532）および開発サーバー（`npm run dev`、ポート 3080）を起動して動作検証（`npx tsx scripts/comprehensive-test.ts` や対象 API / ブラウザ画面での疎通確認）を必ず実施すること**。
- **未起動時の起動・停止手順**:
  1. ポート `5532`（PostgreSQL）がリッスンしていない場合は、`npm run db:up`（`docker compose -f docker-compose.dev.yml up -d`）で起動し、スキーマ変更がある場合は `npm run db:migrate`（初回または空DB時は `npm run db:seed`）を実行する。
  2. ポート `3080`（Next.js 開発サーバー）がリッスンしていない場合は、バックグラウンドプロセス（`IsDaemon: true`）として `npm run dev` を起動し、リッスン開始を確認した上で `npx tsx scripts/comprehensive-test.ts` やブラウザ/API 動作検証を実行する。
  3. 本作業で新規に起動したバックグラウンド開発サーバーは、検証完了後にタスク管理ツール等で適切に停止する。
- **例外（起動不可時の取り扱い）**:
  - 単に「未起動だった」ことを理由に動作検証をスキップしてはならない。
  - Docker デーモン未インストール・権限不足・ポート競合解消不可など、環境上のやむを得ない理由でローカル DB または開発サーバーの起動に失敗した場合に限り、無限リトライを避けて起動失敗の具体的な原因・エラーログをユーザーへ明示した上で、静的検証（`tsc` / `build` / 単体テスト）の結果を報告すること。

---

## 2. データベース・マルチテナントのガードレール

### 2.1 マスタスキーマとテナントスキーマの混同禁止
- `public` スキーマにはシステム全体で共有するデータ（`users`, `households`, `household_memberships`, `system_settings`）のみを配置すること。
- 家計簿の実データ（口座、決済手段、費目、明細、下書き、目標、監査ログ）は**必ず世帯専用スキーマ（`tenant_{household_id}`）内に配置・アクセス**すること。
- テナントDBへのアクセスは `getTenantDb(session.schemaName)` を経由し、直接 `public` にクエリを発行しないこと。
- **新規世帯登録申請時のスキーマ未作成と世帯承認検証**:
  - `POST /api/auth/signup` では `households.status = 'pending'` として `public` スキーマのみに保存し、テナント専用スキーマ（`tenant_xxx`）を作成しないこと。スキーマおよび初期シードはシステム管理者（`is_super_admin === true`）の承認時にのみ生成すること。
  - `POST /api/auth/login` および `getCurrentSession()` では必ず `households.status === 'approved'` を検証し、未承認・却下・停止世帯のログインおよび API アクセスを遮断すること。
- **初期デモ管理者アカウントのテスト環境限定ガードレール**:
  - 初期デモ管理者アカウント（`admin@komame.local` / `usr-yamada-taro-001`）はテスト環境（`NODE_ENV !== "production"`）でのみ有効とし、本番環境（`NODE_ENV === "production"`）ではログイン（`POST /api/auth/login`）・セッション検証（`getCurrentSession`）・シード作成（`src/db/seed.ts`）・ログイン画面UI（`src/app/page.tsx`）のすべてで無効化・非出力とすること。

### 2.2 ID の採番規則
- ランダムIDは重複を防ぐため `crypto.randomUUID().replace(/-/g, "")` を用い、プレフィックスを付与すること：
  - 口座: `acc_xxx`
  - 決済手段: `pm_xxx`
  - 費目: `cat_xxx`
  - 明細: `tx_xxx`
  - 一時保存: `draft_xxx`
  - 定例支払いテンプレート: `tpl_xxx`
  - 貯蓄目標: `goal_xxx`
  - チェックポイント: `cp_xxx`
  - 監査ログ: `log_xxx`

---

## 3. 会計・残高整合性のガードレール（過去のミスと再発防止）

### 3.1 資金移動 (transfer) における出金・入金双方向連動の漏れ防止
- **原因となった過去の事象**:
  `src/app/api/transactions/route.ts` の POST 処理において、`if (item.toAccountId)` が最初に評価されていたため、`item.type === "transfer"` であっても後続の `else if (item.type === "transfer" && item.fromAccountId && item.toAccountId)` が実行されず、移動元口座（`fromAccountId`）の減額がスキップされ、移動先のみ増額されて残高が不正に増殖するバグが発生した。
- **再発防止策**:
  残高更新ロジックは必ず取引種別（`item.type`）を最優先で分岐させること。
  ```typescript
  if (item.type === "transfer") {
    // 1. fromAccountId の減額
    // 2. toAccountId の増額
  } else if (item.type === "income") {
    // toAccountId の増額
  } else if (item.type === "expense") {
    // 決済手段に応じた減額
    // もし toAccountId が指定されていれば投資・積立先への増額 & 振替受入明細生成
  }
  ```

### 3.2 24時間リバート時の現金・QR口座逆算漏れの防止
- **原因となった過去の事象**:
  リバート処理（`admin/revert/route.ts`）で、`pm.sourceAccountId` が明示的に設定されている口座のみを `balance + amount` しており、現金（`type === 'cash'`）やQR（`type === 'qr_code'`）で手元現金口座やウォレットから自動特定・減額された取引の逆算復元が漏れていた。
- **再発防止策**:
  残高の逆算復元時は、登録時（`POST /api/transactions`）と100%同一の口座特定フォールバック（現金口座特定、ウォレット特定）を行い、確実に同額を戻すこと。
  また、投資・積立支出（`expense` かつ `toAccountId`）で加算された受入残高も同時に逆算減額すること。

### 3.3 一時保存データの下書き上書き・リバート時初期化
- リバート実行時は、要件定義書に従い `drafts` レコードを全件物理削除して空に初期化すること。
- 手動保存データが存在する状態で未復元のまま新規登録を完了しようとする場合、手動下書きデータが破棄される旨の警告確認モーダルを必ず表示すること。

### 3.4 投資・積立支出の修正・削除時における受入明細・口座残高の双方向連動
- **原因となった過去の事象**:
  貯蓄・投資（`type === "expense"` かつ `toAccountId` 指定）で作成された支出明細を更新・削除した際、出金元の残高ロールバックのみが行われ、受入先口座（`toAccountId`）の残高ロールバックや自動生成された受入振替明細（`type === "transfer"`）の連動更新・論理削除が漏れて残高不整合や不要な受入明細の孤立が発生していた。
- **再発防止策**:
  - `transactions` テーブルに `parent_transaction_id` を持たせ、受入明細と親支出明細を確実にペアリングすること。
  - 親明細の更新時（PUT）は、旧受入先口座から旧金額を戻し（減額）、新受入先口座に新金額を加算し、ペア受入明細の内容（金額・日付・受入口座・店名）を同期更新すること。受入先が解除された場合は受入明細を論理削除すること。
  - 親明細の削除時（DELETE）は、受入先口座から金額を減額して残高を回復し、ペア受入明細も同時に論理削除すること。

### 3.5 定例支払い精算と 24時間リバート時の二重返戻・二重加算防止
- **定例支払い精算時の受入二重加算防止 (`api/recurring-templates/route.ts`)**:
  - 積立投資先（`toAccountId`）を持つ未精算支出明細を精算する際は、先に連動受入明細（`parentTransactionId === txRecord.id`）の存在を確認し、未存在の場合にのみ受入口座残高への加算と受入明細の作成を行うこと。
- **24時間リバート時の残高整合性 & テンプレート履歴再同期 (`api/admin/revert/route.ts`)**:
  - チェックポイント以降に作成された明細のうち既に論理削除済み（`deletedAt != null`）のレコードは削除時に残高ロールバック済みのため、リバート時の残高逆算から必ずスキップして二重返戻を防止すること。
  - チェックポイント以前に作成され、チェックポイント以降に精算（`isSettled: false -> true`）された既存明細についても監査ログから対象を特定し、口座残高の逆算と `isSettled = false` への復元を行うこと。
  - リバートで定例支払い予定明細が物理削除された場合は、対象 `recurring_templates.last_generated_month` を残存明細の最新サイクル月（なければ `null`）へ再同期すること。

---

## 4. コード編集・ファイル更新時の鉄則
- 編集時は `view_file` で事前に内容を確認し、既存ロジックやコメント・docstringを破壊しないこと。
- `Plan.md` を更新する際は既存の完了済みタスク（`- [x]`）を絶対に消去せず、差分をマージすること。
- **React 19 / TypeScript における `unknown` 型プロパティの JSX 条件レンダリングガードレール**:
  `AuditLogItem` 等の `unknown` 型プロパティ（`beforeDataJson`, `afterDataJson` 等）を JSX 内で `{item.data && <Component />}` と直接評価すると、戻り値の型が `unknown | ReactNode` と推論され `TS2322: Type 'unknown' is not assignable to type 'ReactNode'` エラーが発生する。必ず `{item.data != null && <Component />}` または `{Boolean(item.data) && <Component />}` を使用して明示的に真偽値に変換すること。
- **SQLインジェクション完全防止とパラメータバインディングの徹底 (VULN-01/05)**:
  - `raw.unsafe(...)` による SQL 文字列直接実行は原則禁止とし、Drizzle ORM の型安全クエリおよびパラメータバインディング（`db.update(schema.accounts).set({ balance: sql\`${schema.accounts.balance} + ${amount}\` }).where(eq(schema.accounts.id, accountId))` 等）を徹底すること。
  - 動的テナントスキーマ名の取得・利用時は、必ず `assertValidSchemaName(schemaName)` によるホワイトリスト検証（`/^tenant_[a-zA-Z0-9_-]{1,55}$/`）を通過させること。
  - `scripts/test-security-unit.ts` を定期的に実行し、`src/` 配下に `raw.unsafe` の使用が 0 件であることを客観的に検証すること。
- **金額・残高の境界値バリデーションと不正入力の早期拒否 (VULN-09)**:
  - 金額入力（支出・収入・振替）を処理する API エンドポイントでは、必ず `isValidAmount`（`1 <= amount <= 9,999,999,999`）で検証すること。
  - 口座残高の初期登録・更新時は `isValidBalance`（`0 <= balance <= 9,999,999,999`）で検証すること。
  - 不正な値（0、負の数値、小数、安全な整数範囲超過、文字列形式外）は即座に `400 Bad Request` を返却し、不正データが DB に混入するのを防ぐこと。
- **CSV エクスポート時の数式インジェクション (Formula Injection) 防御 (VULN-07)**:
  - CSV 出力を行う際は手動の文字列結合を行わず、必ず `src/lib/csv.ts` の `generateCsv` および `escapeCsvCell` を経由すること。
  - 文字列セルの先頭が数式トリガー記号（`=`, `+`, `-`, `@`, `\t`, `\r`）の場合、シングルクォート（`'`）を先頭に付与して Excel 等での不正コマンド・DDE 実行を無害化すること。
- **DB トランザクションによる原子性の保証**:
  - 口座残高の更新と明細の挿入・更新・削除など、複数の状態変更が伴う処理は必ず `db.transaction(async (tx) => { ... })` で囲むこと。途中でエラーが発生した場合は自動ロールバックを行い、残高の不整合を残さないこと。
- **Scratch テストスクリプト実行時のインポートパス解決**:
  `<appDataDir>\brain\<conversationId>\scratch\` 配下に作成した一時スクリプトからプロジェクト内モジュールを読み込む場合、相対パス（`./src/...`）は scratch フォルダ起点となり `MODULE_NOT_FOUND` となるため、絶対パス（例: `c:/Users/.../Komame/src/db/index`）またはエイリアス解決を利用すること。
- **Docker 本番ビルドにおけるフォントのセルフホスト徹底 (`next/font/google` 禁止)**:
  - **原因となった事象**: Docker コンテナ内での `next build` 実行時に `next/font/google` が Google Fonts へ外部アクセスして CSS/フォントファイルを解析・取得する際、環境や CDN 応答差異により `TypeError: Cannot read properties of null (reading '1')` (`@next/font/dist/google/loader.js:122`) でビルドが失敗した。
  - **再発防止策**: フォントは外部ネットワークに依存する `next/font/google` ではなく、`@fontsource/noto-sans-jp` および `@fontsource/plus-jakarta-sans` によるローカルバンドル（セルフホスト）を維持すること。

---

## 5. ドキュメント・Mermaid記法のガードレール

### 5.1 Mermaid構文エラーの防止
- **subgraph 間・subgraph への接続**:
  `graph TB` や `graph TD` は旧記法であり、subgraph をターゲットとするエッジ（`Gateway --> CoreModules` など）を記述すると構文エラー（Parse error）となる。必ず `flowchart TB` または `flowchart TD` を使用すること。
- **特殊記号を含むラベルのエスケープ**:
  ノードや subgraph のラベルに丸括弧 `( )`、角括弧 `[ ]`、`&`、`+`、`/`、コロン `:` などの記号が含まれる場合、`subgraph ID [タイトル]` と直接書くとトークナイザが誤認して構文エラーとなる。必ずダブルクォーテーションで囲み、`subgraph ID ["タイトル (詳細)"]` または `nodeId["ラベル (詳細)"]` の形式で記述すること。

---

## 6. 改訂履歴

- **2026-11-20**: 全体レビューに伴い第3章3.5「定例支払い精算と 24時間リバート時の二重返戻・二重加算防止」ガードレールを追記。
- **2026-11-20**: 第1章1.3を改訂し、ローカルの PostgreSQL（ポート 5532）および開発サーバー（ポート 3080）を起動しての動作検証を原則必須とするガードレールを追記。
- **2026-11-18**: 第2章2.1に初期デモ管理者アカウント（`admin@komame.local`）のテスト環境（`NODE_ENV !== "production"`）限定有効化ガードレールを追記。
- **2026-11-18**: 第2章2.1に新規世帯登録申請時のテナントスキーマ未作成ルールおよび `login` / `getCurrentSession` での `households.status === 'approved'` 必須検証ガードレールを追記。
- **2026-11-14**: Docker 本番ビルド時の `next/font/google` ビルドエラー再発防止のため、フォントの `@fontsource` セルフホスト必須化ガードレールを追記。
- **2026-10-18**: セキュリティ強化ガードレール（金額境界値検証、CSV数式インジェクション防止、DBトランザクション原子性、`raw.unsafe` ゼロ件検査）を追記。
- **2026-10-18**: SQLインジェクション防止ガイドライン（`raw.unsafe` 排除・スキーマ名ホワイトリスト検証）および Scratch スクリプトのパス解決注意事項を追記。
- **2026-10-18**: 開発用 PostgreSQL 起動ポートの変更（5432 → 5532）に伴い、事前確認ガードレールのポート番号を更新。

