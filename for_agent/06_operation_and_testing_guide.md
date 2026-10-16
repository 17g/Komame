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

- アクセス: `http://localhost:3000`
- デモ管理者アカウント: `admin@komame.local` / `Password123!`

---

## 2. 検証コマンド (Verification Ground Truth)

エージェントがコード修正後に実行し、正常終了（Exit Code 0）を確認するコマンド。

### 2.1 型チェック & ビルド検証
```powershell
# TypeScript 型チェック
npx tsc --noEmit

# Next.js 本番ビルド検証
npm run build
```

### 2.2 単体テスト (DB不要・高速検証)
```powershell
# CSV パース・エスケープ・BOM検証単体テスト
npx tsx scripts/test-csv-unit.ts

# 家族メンバー管理・招待トークン・Argon2idハッシュ検証単体テスト
npx tsx scripts/test-members-unit.ts
```

### 2.3 E2E & ビジネスロジック総合自動テスト
PostgreSQL サービスおよび Next.js 開発サーバーが起動している状態で以下を実行：
```powershell
npx tsx scripts/comprehensive-test.ts
```

---

## 3. 本番環境 (Ubuntu Linux + Docker)

### 3.1 構成
- `docker-compose.prod.yml`:
  - `komame-app`: Next.js アプリケーション
  - `komame-db`: PostgreSQL 16
  - `komame-proxy`: Nginx リバースプロキシ

### 3.2 起動手順
```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec app npm run db:migrate
```

---

## 4. 改訂履歴

- **2026-10-17**: 検証手順に DB 不要・高速実行可能な単体テスト（`test-csv-unit.ts`, `test-members-unit.ts`）を追加。
- **2026-10-17**: `AGENTS.md` の技術スタック（Next.js 15 / TypeScript / Drizzle ORM）との整合性を同期。
