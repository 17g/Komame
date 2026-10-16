# 『Komame』システムアーキテクチャ・技術スタック設計書

## 1. マルチテナント・スキーマ完全分離アーキテクチャ

本システムは、**単一PostgreSQL 16データベース内で家庭ごとに専用スキーマを作成する「Schema per Tenant」方式**を採用しています。

```mermaid
graph TB
    subgraph Client [クライアント層 (Responsive Web)]
        MobileWeb["スマートフォンブラウザ (iPhone最優先)"]
        DesktopWeb["PC / タブレットブラウザ"]
    end

    subgraph AppServer [アプリケーション層 (Next.js 15 App Router)]
        Gateway["認証 / JWT セッションミドルウェア"]
        subgraph CoreModules [ドメインモジュール]
            AuthMod["認証・世帯管理 (Argon2id)"]
            TxMod["明細登録・一括入力・サジェスト"]
            DraftMod["2段階一時保存 (Manual / Auto 2s)"]
            AccountMod["口座・資金フロー・バーチャル貯蓄"]
            GoalMod["貯蓄目標・ゲーミフィケーション"]
            AdminMod["操作ログ・24hチェックポイントリバート"]
            CsvMod["CSVインポート / エクスポート (UTF-8 BOM)"]
        end
        Logger["Pino Logger (スロークエリ200ms監視)"]
    end

    subgraph DatabaseLayer [データベース層 (PostgreSQL 16 + Drizzle ORM)]
        subgraph MasterSchema [public スキーマ]
            MasterTables["users, households, household_memberships, system_settings"]
        end
        subgraph TenantSchemas [家庭専用スキーマ (tenant_xxx)]
            SchemaA["tenant_yamada (accounts, transactions, categories, drafts, audit_logs...)"]
            SchemaB["tenant_sato (accounts, transactions, categories, drafts, audit_logs...)"]
        end
    end

    MobileWeb --> Gateway
    DesktopWeb --> Gateway
    Gateway --> CoreModules
    CoreModules --> DatabaseLayer
    CoreModules -.-> Logger
```

### 1.1 動的スキーマ解決と接続プール共有
- **共通接続プール**: 全世帯で単一の共通PostgreSQL接続プール（最大30コネクション）を共有。
- **動的ルーティング**: APIリクエスト受信時、Cookieに格納されたJWTトークンから `activeHouseholdId` と `schemaName` を取得。
- **スキーマキャッシュ**: `getTenantSchema(schemaName)` により、同一スキーマのテーブル定義オブジェクトをキャッシュして再利用。
- **クエリ実行オーバーヘッド**: スキーマ切り替えによる遅延は `0ms〜0.2ms` であり、接続数の無駄遣いを防止。

---

## 2. 認証・認可 & セキュリティ設計

### 2.1 パスワードハッシュ化 (Argon2id)
- アルゴリズム: `Argon2id` (RFC 9106推奨)
- パラメータ設定:
  - `memoryCost`: 19,456 KiB
  - `timeCost`: 2
  - `parallelism`: 1
  - `outputLen`: 32 bytes

### 2.2 セッション管理 (JWT + HttpOnly Cookie)
- **Cookie属性**:
  - `name`: `komame_session`
  - `httpOnly`: true（JavaScriptからのXSS読取遮断）
  - `secure`: 本番環境時 true
  - `sameSite`: 'lax'（CSRF対策）
  - `maxAge`: 7日間（60 * 60 * 24 * 7 秒）
- **ペイロード構造**:
  ```typescript
  interface SessionPayload {
    userId: string;
    email: string;
    activeHouseholdId: string;
    schemaName: string;
    role: "admin" | "member";
  }
  ```

---

## 3. ロギング & パフォーマンス監視

### 3.1 構造化ロガー (Pino)
- ログレベル: 開発環境 `debug`, 本番環境 `info`
- 開発環境では `pino-pretty` によるカラー表示。本番環境では構造化 JSON 出力。

### 3.2 スロークエリ自動検出 (200ms閾値)
- DBクエリの所要時間が `200ms` を超過した場合、自動的に警告ログを出力。
- ログ形式:
  ```json
  {
    "level": "warn",
    "msg": "⚠️ SLOW_QUERY_DETECTED: Query exceeded 200ms",
    "durationMs": 245,
    "schema": "tenant_yamada_001",
    "sql": "SELECT * FROM tenant_yamada_001.transactions WHERE ...",
    "traceId": "..."
  }
  ```
