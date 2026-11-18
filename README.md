# 『Komame』 - 家族向けマルチテナント家計簿 Web アプリケーション

![License](https://img.shields.io/badge/license-MIT-green.svg)
![Next.js](https://img.shields.io/badge/Next.js-15.5.28-black)
![React](https://img.shields.io/badge/React-19.0.0-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7.3-blue)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue)
![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-0.45.4-brightgreen)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4.17-38B2AC)

『**Komame**』は、共働き世帯や家族での共同家計管理を強力にサポートするマルチテナント対応の家計簿 Web アプリケーションです。  
1世帯ごとに専用の PostgreSQL スキーマを分離・割り当てる「Schema per Tenant」方式を採用し、万全なセキュリティとプライバシー保護、柔軟なカスタマイズ性を両立しています。

---

## 🌟 主な特徴・機能

- **マルチテナント・スキーマ完全分離**:
  - 単一 PostgreSQL 内で家庭ごとに専用スキーマ（`tenant_{household_id}`）を分離管理。
  - 共通接続プールを効率的に共有し、低遅延・高スケーラビリティを実現。
- **直感的な明細登録 & 一括入力**:
  - 支出、収入、口座間振替、投資・積立（受入振替連動）を完全サポート。
  - 同一店舗・過去履歴からの動的サジェスト、同費目の一括入力モード (`category_batch`) を搭載。
- **クレジットカード引き落とし予定額の動的予測**:
  - 締め日・引き落とし日ごとの未精算額を自動集計。
  - 引き落とし元口座の利用可能残高とリアルタイム突合し、3段階シグナル（充足 / 注意 / 不足）を表示。
- **安全なデータ管理 & 24時間リバート機能**:
  - 誤った一括登録や CSV インポートをワンクリックで安全に巻き戻せる「24時間チェックポイントリバート」。
  - 家族メンバーによる操作履歴を記録する監査ログ（CSV/JSON エクスポート対応）。
- **明細 CSV インポート & エクスポート**:
  - 各種クレジットカードや銀行の明細 CSV（RFC 4180 / UTF-8 BOM）の取り込み。
  - カラム自動推定・マッピング・重複候補警告付き。
- **ゲーミフィケーション & モチベーション維持**:
  - **こまめ草生やし（Activity Heatmap）**: 過去4週間の登録頻度を可視化。
  - **まめの樹育成システム**: 貯蓄目標達成率やストリークに応じて種から大樹へ成長。
  - **やさしいアドバイス**: 前月比節約額に基づくポジティブフィードバック。
- **マルチテーマ対応**:
  - 「ナチュラルこまめ」「ダーク」「北欧モダン」「サクラ」「ミントフレッシュ」の5大テーマ切り替え。

---

## 🔌 ポート番号構成一覧

本プロジェクトにおける開発環境および本番環境のポート番号構成は以下の通りです。

| サービス | コンテナ名 | ホスト側ポート | コンテナ内ポート | 接続先URL / 接続文字列 |
| :--- | :--- | :--- | :--- | :--- |
| **Next.js Web アプリ** | `komame-prod-app` | **`3080`** | `3080` | `http://localhost:3080` |
| **PostgreSQL 16 (開発)** | `komame-dev-postgres` | **`5532`** | `5532` | `postgresql://...:@localhost:5532/komame_db` |
| **PostgreSQL 16 (本番)** | `komame-prod-postgres` | 非公開（内部） | `5532` | `postgresql://...:@postgres:5532/komame_prod_db` |

---

## 🛠 技術スタック

- **フロントエンド**: Next.js 15.5.28 (App Router), React 19, TypeScript 5.7.3, Tailwind CSS 3.4.17, Lucide Icons
- **バックエンド / API**: Next.js Route Handlers, Drizzle ORM 0.45.4, postgres.js 3.4.5
- **データベース**: PostgreSQL 16 (Alpine) - Schema per Tenant
- **認証 & セキュリティ**: Argon2id (`@node-rs/argon2`), jose (JWT), HttpOnly SameSite=Lax Cookie
- **ロギング**: Pino 9.6.0 (開発時: `pino-pretty`, 本番: 構造化 JSON / スロークエリ 200ms 自動検知)
- **テスト & 品質管理**: Playwright, tsx, TypeScript Compiler (`tsc`)

---

## 🚀 クイックスタート (開発環境)

### 前提条件
- Node.js: `v20.x` 以上
- Docker Desktop (またはローカル PostgreSQL 16)
- Git

### 1. リポジトリのクローン & パッケージインストール
```bash
git clone <repository_url>
cd Komame
npm install
```

### 2. 環境変数の作成
`.env.example` をコピーして `.env.local` を作成します。
```powershell
# Windows PowerShell
Copy-Item .env.example .env.local
```
```bash
# macOS / Linux
cp .env.example .env.local
```

### 3. 開発用 PostgreSQL コンテナの起動 (ポート 5532)
```bash
npm run db:up
```

### 4. データベースマイグレーション & デモデータの投入
```bash
# マスタスキーマ (public) および初期テナントスキーマの作成
npm run db:migrate

# 初期デモデータ (山田家、口座、決済手段、費目、過去明細等) の投入
npm run db:seed
```

### 5. 開発サーバーの起動 (ポート 3080)
```bash
npm run dev
```

ブラウザで [http://localhost:3080](http://localhost:3080) にアクセスします。

#### 初期ログインアカウント (デモ用管理者 / ※テスト環境 `NODE_ENV !== "production"` 限定)
- **メールアドレス**: `admin@komame.local`
- **パスワード**: `Password123!`
- **所属世帯 / 権限**: 山田家 (Household Admin / Super Admin)
- ※ **本番環境（`NODE_ENV === "production"`）では初期デモ管理者アカウントは完全に無効化**（ログイン・セッション・シード作成の拒否およびログイン画面のデモアカウント欄非表示）されます。

---

## 🚢 本番環境のデプロイ (Docker Compose)

本番用 Docker Compose 設定により、アプリケーション（Next.js スタンドアロンビルド）と PostgreSQL 16 を安全に起動できます。  
自宅サーバー・ミニPC・NAS での構築、独自ドメイン＋HTTPS 化（Cloudflare Tunnel / Nginx + Let's Encrypt / Tailscale）、DB バックアップ・リストア等の詳細手順は **[本番環境・開発環境 構築および運用手順書 (docs/environment_setup_guide.md)](docs/environment_setup_guide.md)** を参照してください。

```bash
# 1. 本番用環境変数ファイルの作成 (POSTGRES_PASSWORD と 32文字以上の JWT_SECRET を設定)
cp .env.production.example .env.production
chmod 600 .env.production

# 2. コンテナのビルド & バックグラウンド起動
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build

# 3. 本番データベースのマイグレーション実行
docker compose --env-file .env.production -f docker-compose.prod.yml exec app npm run db:migrate
```

- Web アプリケーションへのアクセス: リバースプロキシ / トンネル経由で `http://localhost:3080` へ転送
- PostgreSQL サービスはコンテナ内部ネットワーク（ポート `5532`）でのみ通信し、外部からの不正アクセスを遮断します。

---

## 🧪 テスト & コード検証 (Ground Truth)

プロジェクトのコード整合性・品質を担保するため、以下の検証コマンドが用意されています。

```bash
# 1. TypeScript 静的型チェック
npx tsc --noEmit

# 2. Next.js プロダクションビルド検証
npm run build

# 3. 単体テスト (DB接続不要・高速実行)
npx tsx scripts/test-csv-unit.ts                 # CSV パース・エスケープ・BOM検証
npx tsx scripts/test-members-unit.ts             # 家族メンバー招待・Argon2idハッシュ検証
npx tsx scripts/test-auth-session-unit.ts        # 認証・JWT・Fail-Fast・デモ管理者テスト環境限定検証
npx tsx scripts/test-rate-limit-csrf.ts          # レートリミッター & CSRF Origin 検証
npx tsx scripts/test-categories-unit.ts          # 費目マスター & 標準12費目保護検証
npx tsx scripts/test-unit-calculator.ts          # 単価×個数 計算補助ロジック検証
npx tsx scripts/test-household-approval-unit.ts  # 新規世帯登録申請・承認制 & Super Admin 検証
npx tsx scripts/test-security-unit.ts            # セキュリティ単体テスト & 静的コード検査

# 4. 総合ビジネスロジック自動テスト (開発サーバー & DB 起動時)
npx tsx scripts/comprehensive-test.ts
```

---

## 📚 関連ドキュメント

仕様書および開発ガイドラインは `for_agent/` ディレクトリに管理されています。

- [システム全体概要](for_agent/00_system_overview.md)
- [詳細要求仕様書](for_agent/01_requirements_specification.md)
- [アーキテクチャ & 技術スタック設計書](for_agent/02_architecture_and_tech_stack.md)
- [データベース設計書 (ER図・スキーマ)](for_agent/03_database_design.md)
- [API 仕様書](for_agent/04_api_specifications.md)
- [UI/UX & デザインシステム設計書](for_agent/05_ui_ux_and_design_system.md)
- [開発・運用・検証ガイド](for_agent/06_operation_and_testing_guide.md)
- [開発・運用ガードレール (問題解決 & ミス防止)](for_agent/guardrails.md)
- [変更履歴](AICHANGELOG.md)
