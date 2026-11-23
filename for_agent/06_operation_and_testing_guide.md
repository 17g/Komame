# 『Komame』開発・運用・検証ガイド

## 1. 開発環境のセットアップ (Windows 10/11)

### 1.1 前提条件
- Node.js: v20.x 以上
- Docker Desktop (またはローカル PostgreSQL 16)
- Git

### 1.2 セットアップ手順
```powershell
# 1. 依存関係のインストール
npm install

# 2. 環境変数の準備
Copy-Item .env.example .env.local

# 3. 開発用 PostgreSQL 16 コンテナ起動
npm run db:up

# 4. マスタスキーマおよびテナントスキーマのマイグレーション
npm run db:migrate

# 5. 初期デモデータ (山田家) のシード投入
npm run db:seed

# 6. 開発サーバーの起動
npm run dev
```

- アクセス: `http://localhost:3080`
- デモ管理者アカウント（**テスト環境 `NODE_ENV !== "production"` 限定**）: `admin@komame.local` / `Password123!`
  - ※シードデータにより `is_super_admin = TRUE`（システム管理者権限）および世帯状態 `approved` が付与されており、ログイン後の管理タブから新規世帯登録申請の承認・却下・停止操作を確認・検証できる。
  - ※**本番環境（`NODE_ENV === "production"`）では初期デモ管理者アカウントは完全に無効化**される（ログインAPI・セッション検証で拒否、本番シード実行時の作成禁止、およびログイン画面でのデモアカウント欄非表示）。

---

## 2. 検証コマンド (Verification Ground Truth)

エージェントがコード修正後に実行し、正常終了（Exit Code 0）を確認するコマンド。

### 2.1 型チェック & ビルド検証
```powershell
# TypeScript 型チェック
npx tsc --noEmit

# Next.js 本番ビルド検証 (Standalone 出力含む)
npm run build
```

### 2.2 単体テスト (DB不要・高速検証)
```powershell
# CSV パース・エスケープ・BOM検証単体テスト
npx tsx scripts/test-csv-unit.ts

# 家族メンバー管理・招待トークン・Argon2idハッシュ検証単体テスト
npx tsx scripts/test-members-unit.ts

# 認証・JWTセッション・Fail-Fast検証・トークン失効単体テスト
npx tsx scripts/test-auth-session-unit.ts

# レートリミッター & CSRF Origin 検証単体テスト
npx tsx scripts/test-rate-limit-csrf.ts

# 費目マスター バリデーション & 標準12費目保護単体テスト
npx tsx scripts/test-categories-unit.ts

# 単価×個数 計算補助ロジック単体テスト (正常系・境界値・異常系・サニタイザー)
npx tsx scripts/test-unit-calculator.ts

# 新規世帯登録申請・承認制 & Super Admin 操作バリデーション単体テスト
npx tsx scripts/test-household-approval-unit.ts

# 貯蓄目標管理 (編集・未達成削除・達成済みアーカイブ/復元・合算進捗集計) 単体テスト
npx tsx scripts/test-goals-unit.ts

# 定例支払い (テンプレート入力検証・クレカ規定日連動・翌日サイクル算出・冪等性・自動精算判定) 単体テスト
npx tsx scripts/test-recurring-unit.ts

# 決済手段種別表示ラベル・正規化 (引落・デビットカード統一・direct_debit互換) 単体テスト
npx tsx scripts/test-payment-method-unit.ts

# PC用サイドバー ビューポート高固定・上部内部スクロール・下部アクション常時固定 静的レイアウト検証
npx tsx scripts/test-sidebar-layout-unit.ts

# セキュリティ単体テスト & 静的コード検査 (スキーマ検証、CSVインジェクション無害化、金額境界値、レートリミッター、raw.unsafeゼロ件検査)
npx tsx scripts/test-security-unit.ts
```

### 2.3 E2E & ビジネスロジック総合自動テスト（原則必須）
機能実装および API・DB・UI の変更時は、原則としてローカルの PostgreSQL サービス（ポート 5532）および Next.js 開発サーバー（ポート 3080）を起動した上で、実サーバーに対する動作検証を実行すること：
```powershell
# 1. PostgreSQL が未起動の場合はコンテナを起動し、必要に応じてマイグレーション・シードを実行
npm run db:up
npm run db:migrate

# 2. 開発サーバーが未起動の場合はバックグラウンド等で起動 (`http://localhost:3080`)
npm run dev

# 3. 総合テスト実行（検証後、新規起動した開発サーバーは停止すること）
npx tsx scripts/comprehensive-test.ts
```
※ Docker デーモン停止等の真の環境制約で起動不可な場合のみ、その具体的理由を明示すること（単に「未起動だったため」で省略しないこと）。

---

## 3. 本番環境 (自宅サーバー / ミニPC / Linux + Docker Compose)

詳細な本番環境構築・HTTPS化（Cloudflare Tunnel / Nginx + Let's Encrypt / Tailscale Serve）・バックアップ手順は `docs/environment_setup_guide.md` を参照。

### 3.1 構成ファイル
- `next.config.ts`: `output: "standalone"` による本番用スタンドアロン出力を有効化
- `.dockerignore`: ホスト側の `node_modules` や `.next`、`.env*` のコンテナ混入を防止
- `Dockerfile`: Next.js スタンドアロン実行環境に加え、コンテナ内での `npm run db:migrate` / `npm run db:seed` 実行に必要なモジュール・スクリプトを同梱
- `.env.production.example`: 本番用環境変数テンプレート（`POSTGRES_PASSWORD`, 32文字以上のランダム `JWT_SECRET` 等）
- `docker-compose.prod.yml`:
  - `komame-prod-app`: Next.js アプリケーション (公開ポート: `3080:3080`)
  - `komame-prod-postgres`: PostgreSQL 16 (内部ポート: `5532`、ホスト外部非公開)

### 3.2 本番起動・マイグレーション手順
```bash
# 1. 本番用環境変数ファイルの作成とシークレット設定
cp .env.production.example .env.production
chmod 600 .env.production
# ※ .env.production 内の POSTGRES_PASSWORD と JWT_SECRET (openssl rand -base64 48) を設定

# 2. コンテナのビルドとバックグラウンド起動
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build

# 3. マスタスキーマおよびテナントスキーマのマイグレーション
docker compose --env-file .env.production -f docker-compose.prod.yml exec app npm run db:migrate
```

---

## 4. 改訂履歴

- **2026-11-23**: 単体テスト一覧に PC 用サイドバー ビューポート高固定・下部アクション常時固定レイアウト検証（`test-sidebar-layout-unit.ts`）を追加。
- **2026-11-22**: 単体テスト一覧に決済手段種別表示ラベル・正規化単体テスト（`test-payment-method-unit.ts`）を追加。
- **2026-11-20**: 単体テスト一覧に定例支払いテンプレート管理 & 自動支払い予定・精算判定単体テスト（`test-recurring-unit.ts`）を追加。
- **2026-11-20**: 第2章2.3にローカル PostgreSQL・開発サーバーを起動しての総合動作検証を原則必須とする手順および例外規定を追記。
- **2026-11-20**: 単体テスト一覧に貯蓄目標管理（編集・未達成削除・達成済みアーカイブ/復元・合算進捗集計）単体テスト（`test-goals-unit.ts`）を追加。
- **2026-11-18**: 単体テスト一覧に新規世帯登録申請・承認制 & Super Admin 操作バリデーション単体テスト（`test-household-approval-unit.ts`）を追加。
- **2026-11-18**: 初期デモ管理者アカウント（`admin@komame.local`）がテスト環境（`NODE_ENV !== "production"`）限定で有効であり、本番環境（`NODE_ENV === "production"`）ではログイン・セッション・シード作成・ログイン画面表示のすべてが無効化される仕様を追記。
- **2026-11-18**: 開発環境デモ管理者（`admin@komame.local`）が `is_super_admin = TRUE` であり、管理タブから新規世帯申請の承認・却下・停止検証が可能である旨を追記。
- **2026-11-15**: 単体テスト一覧に単価×個数 計算補助ロジック単体テスト（`test-unit-calculator.ts`）を追加。
- **2026-11-15**: 単体テスト一覧に費目マスター バリデーション & 標準12費目保護単体テスト（`test-categories-unit.ts`）を追加。
- **2026-11-14**: 本番用 Docker ビルド構成（`next.config.ts` の `output: "standalone"`、`.dockerignore`、`Dockerfile` のマイグレーション対応、`.env.production.example`）を整備し、本番環境構築手順書（`docs/environment_setup_guide.md`）との連携を更新。
- **2026-10-18**: 単体テストに認証セッション検証（`test-auth-session-unit.ts`）、レートリミッター・CSRF検証（`test-rate-limit-csrf.ts`）、セキュリティ単体テスト & 静的コード検査（`test-security-unit.ts`）を追加。
- **2026-10-18**: 開発・本番環境のポート番号をアプリケーション: `3080`、PostgreSQL: `5532` に統一改訂し、アクセスURLおよび検証前提条件を更新。
- **2026-10-17**: 検証手順に DB 不要・高速実行可能な単体テスト（`test-csv-unit.ts`, `test-members-unit.ts`）を追加。
- **2026-10-17**: `AGENTS.md` の技術スタック（Next.js 15 / TypeScript / Drizzle ORM）との整合性を同期。
