# 『Komame』システムアーキテクチャ・技術スタック設計書（確定版）

## 1. 全体アーキテクチャ方針

『Komame』は、**「複数家庭（マルチテナント）の家計簿データをスキーマ完全分離によって安全・高パフォーマンスに管理する」** とともに、**「開発環境（Windows）と本番環境（Ubuntu Linux）でPostgreSQL 16に完全統一し、環境差異ゼロの単一ビジネスロジックを貫く」** アーキテクチャを採用します。

```mermaid
graph TB
    subgraph Client [クライアント層 (Responsive & Mobile-First)]
        MobileWeb["iPhone / スマホブラウザ (最優先)"]
        DesktopWeb["PC / タブレットブラウザ"]
        FutureNativeApp["将来: モバイルネイティブアプリ (Flutter / React Native)"]
    end

    subgraph AppServer [アプリケーション層 (Node.js - Next.js 15 App Router)]
        Gateway["API Gateway / Auth Middleware (JWT & Tenant Schema Router)"]
        subgraph CoreModules [ドメインモジュール]
            AuthMod["認証・権限・世帯管理 (Argon2id)"]
            TxMod["明細登録・一括入力・サジェスト"]
            DraftMod["2段階一時保存 (Manual / Auto 2s debounce)"]
            AccountMod["口座・カード・資金フロー・色分け"]
            GoalMod["貯蓄目標・ゲーミフィケーション"]
            AdminMod["操作ログ・24hチェックポイントリバート"]
            ExportMod["CSVインポート / エクスポート (UTF-8 BOM)"]
        end
        LoggingEngine["Pino Logger (HTTP / DBスロークエリ 200ms監視)"]
    end

    subgraph DatabaseLayer [データベース永続化層 (PostgreSQL 16 + Drizzle ORM)]
        subgraph MasterSchema [public スキーマ (認証・ルーティング)]
            MasterTables["users, households, household_memberships, system_settings"]
        end
        subgraph TenantSchemas [家庭専用スキーマ群 (Schema per Tenant)]
            SchemaA["tenant_yamada (accounts, transactions, categories, drafts, audit_logs...)"]
            SchemaB["tenant_sato (accounts, transactions, categories, drafts, audit_logs...)"]
        end
    end

    MobileWeb --> Gateway
    DesktopWeb --> Gateway
    FutureNativeApp -.-> Gateway
    Gateway --> CoreModules
    CoreModules --> DatabaseLayer
    CoreModules -.-> LoggingEngine
```

---

## 2. 技術スタックの確定構成

| レイヤー | 採用技術 | 選定理由 |
| :--- | :--- | :--- |
| **フロントエンド / バックエンド** | **Next.js 15 (App Router + React 19 + TypeScript)** | ・モバイルファーストの高速なSSR/CSRレンダリング<br>・同一リポジトリで`/api/v1/...` REST APIとUIを統合<br>・PWA化が容易 |
| **データベース** | **PostgreSQL 16 (開発・本番統一)** | ・**環境差異ゼロ**: 開発(Windows)と本番(Ubuntu)で100%同一の挙動<br>・マルチテナント・スキーマ完全分離（1,000テナントでも接続オーバーヘッド0ms、省メモリ） |
| **ORM / クエリビルダー** | **Drizzle ORM (`drizzle-orm`)** | ・SQLライクで型安全、オーバーヘッド極小<br>・マルチテナントの動的スキーマ切り替え（`SET search_path` / スキーマ修飾）が極めてシンプルかつ高速 |
| **データベースドライバ** | **`postgres` (postgres.js)** | ・純粋なTypeScript/JS製で高速、軽量な接続プール内蔵<br>・スキーマ切り替えクエリやトランザクション処理のレイテンシ最小 |
| **スタイリング** | **TailwindCSS + CSSカスタムプロパティ（CSS変数による5テーマ切替）** | ・軽量・高速で5大テーマ切替が即座に反映<br>・スマホ最適化（テンキー、スクロール連動バー）の完全な制御 |
| **ロギング & 監視** | **Pino + スロークエリ監視インターセプター** | ・JSONストリームログ、低オーバーヘッド<br>・200ms以上のDBクエリを自動検出しSQLと実行時間を警告ログ出力 |
| **認証 & セキュリティ** | **`@node-rs/argon2` + `jose` (JWT) + Secure Cookies** | ・Rust製でWindows/Linux問わず追加ビルド不要で高速動作<br>・最高度のパスワードハッシュ化＆アクティブ世帯コンテキストのセキュアな伝播 |

---

## 3. マルチテナント・スキーマ完全分離の実装アーキテクチャ

### 3.1 動的スキーマ解決と接続プール共有
- 単一の共通PostgreSQL接続プール（30〜50コネクション）を全世帯で共有。
- APIリクエスト受信時、JWT内の `activeHouseholdId` からスキーマ名（例: `tenant_550e8400_...`）を特定。
- Drizzle ORMのクエリ実行時に該当スキーマを自動適用し、**オーバーヘッド 0ms〜0.2ms で最速のテナント切り替え** を実現。

### 3.2 マイグレーション運用
- デプロイ時およびコンテナ起動時に、マスタスキーマの `households` テーブルを走査し、全世帯スキーマへ順次 Drizzle Migration を適用する自動スクリプトを実行。
- 新規世帯作成時は、即座に最新スキーマのテーブル群を作成・初期シード投入。

---

## 4. Docker & デプロイメント構成

- **開発環境 (Windows 10+)**:
  - `docker-compose.dev.yml` を標準とし、`npm run db:up` 一発で本番同一のPostgreSQL 16が数秒で起動（ローカル直接接続にも環境変数 `DATABASE_URL` で完全対応）。
- **本番環境 (Ubuntu Linux)**:
  - `docker-compose.prod.yml`:
    - `komame-app`: Node.js multi-stage buildコンテナ（Alpine Linuxベース）
    - `komame-db`: PostgreSQL 16 コンテナ（永続化ボリューム付き）
    - `komame-proxy`: Nginx（SSL/TLS終端、gzip/brotli圧縮、静的キャッシュ）
