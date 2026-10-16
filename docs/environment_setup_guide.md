# 『Komame』開発環境・本番環境 構築および運用ガイド（確定版）

新規開発者やインフラ運用担当者が迷わずセットアップできるよう、開発環境（Windows 10+）および本番環境（Ubuntu Linux + Docker）の手順を詳述します。

---

## 1. 開発環境のセットアップ (Windows 10 / 11)

開発環境では、本番と100%同一のPostgreSQL 16環境をDockerまたはローカルサービスで手軽に立ち上げます。

### 1.1 前提条件
- **OS**: Windows 10 (Build 19041以上) または Windows 11
- **Node.js**: v20.x (LTS) 以上
- **Docker Desktop** (またはローカルPostgreSQL 16)
- **Git**: 最新版

### 1.2 リポジトリの準備とインストール
```powershell
# 1. 依存パッケージのインストール
npm install

# 2. 環境変数設定 (.env.local の作成)
Copy-Item .env.example .env.local

# 3. 開発用 PostgreSQL 16 コンテナの起動
npm run db:up

# 4. マスタスキーマおよびテナントスキーマのマイグレーション
npm run db:migrate

# 5. 開発用デモデータ（山田家、管理者アカウント、初期費目等）のシード投入
npm run db:seed

# 6. 開発サーバーの起動
npm run dev
```
ブラウザで `http://localhost:3000` にアクセスすると Komame アプリケーションが起動します。
- **デモ用初期ログイン**: `admin@komame.local` / `Password123!` （山田家 Household Admin）

---

## 2. 本番環境のセットアップ (Ubuntu 22.04 / 24.04 LTS + Docker)

本番環境では、マルチテナント・スキーマ完全分離を活かした **PostgreSQL 16 + Docker Compose + Nginx リバースプロキシ** によるコンテナ運用を行います。

### 2.1 本番ディレクトリ構成
```
/opt/komame/
├── docker-compose.prod.yml
├── .env.production
├── Dockerfile
├── nginx/
│   └── default.conf
└── data/
    └── postgres/ (DB永続化ボリューム)
```

### 2.2 本番起動手順
```bash
# 1. リポジトリを clone
git clone <repository_url> /opt/komame
cd /opt/komame

# 2. 本番用環境変数の設定
cp .env.production.example .env.production
# .env.production 内の POSTGRES_PASSWORD, JWT_SECRET, APP_ADMIN_PASSWORD 等を変更

# 3. Docker コンテナのビルドとバックグラウンド起動
docker compose -f docker-compose.prod.yml up -d --build

# 4. マスタDBおよび全テナントスキーマの一括マイグレーション
docker compose -f docker-compose.prod.yml exec app npm run db:deploy
```

---

## 3. アプリケーションログ・スロークエリ監視とチューニング

### 3.1 ログの確認方法
アプリケーションログは Pino による構造化 JSON 形式で出力されます。

```bash
# リアルタイムログ追跡
docker compose -f docker-compose.prod.yml logs -f app

# エラーログの抽出
docker compose -f docker-compose.prod.yml logs app | grep '"level":"error"'
```

### 3.2 スロークエリの特定
データベースクエリ実行時間が `200ms` を超過した場合、自動的に以下のような警告ログが記録されます：

```json
{
  "level": "warn",
  "time": "2026-08-16T12:00:00.000Z",
  "msg": "SLOW_QUERY_DETECTED",
  "durationMs": 245,
  "schema": "tenant_yamada",
  "sql": "SELECT * FROM tenant_yamada.transactions WHERE date BETWEEN $1 AND $2",
  "traceId": "a1b2c3d4-e5f6-7890-..."
}
```
このログから対象スキーマとSQLを特定し、インデックス追加やクエリ最適化を実施します。
