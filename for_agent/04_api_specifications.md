# 『Komame』API仕様書

全エンドポイントは `/api/...` 配下に配置され、認証セッション（Cookie: `komame_session`）を検証して動的に世帯スキーマを解決します。

---

## 1. 認証 API (`/api/auth`)

### 1.1 `POST /api/auth/login`
- **概要**: メールアドレス・パスワードによる認証、所属世帯の承認ステータス検証、およびセッションCookie発行。
- **リクエストボディ**:
  ```json
  {
    "email": "admin@komame.local",
    "password": "Password123!"
  }
  ```
- **ビジネスロジック（デモアカウント制限・世帯ステータス検証）**:
  0. 本番環境（`NODE_ENV === "production"`）において、初期デモ管理者アカウント（`email === "admin@komame.local"` または `user.id === "usr-yamada-taro-001"`）でのログイン試行は、DB上の存在有無にかかわらず無条件で拒否し、`401 Unauthorized`（「メールアドレスまたはパスワードが正しくありません。」）を返却する（テスト環境 `NODE_ENV !== "production"` でのみ有効）。
  1. メールアドレスおよびパスワードを検証（不一致・未登録・無効ユーザーは `401 Unauthorized`「メールアドレスまたはパスワードが正しくありません。」を返却しアカウント列挙を防止）。
  2. パスワード検証成功後、所属世帯（`households.status`）を確認：
     - `pending`: `403 Forbidden`（`{ "error": "現在、システム管理者の承認待ちです。許可されるまでログインできません。" }`）
     - `rejected`: `403 Forbidden`（`{ "error": "この新規世帯登録申請は承認されませんでした。" }`）
     - `suspended`: `403 Forbidden`（`{ "error": "この世帯アカウントは現在システム管理者により停止されています。" }`）
     - `approved`: セッションCookie発行。
- **レスポンス (200 OK)**:
  ```json
  {
    "success": true,
    "user": {
      "id": "usr_xxx",
      "email": "admin@komame.local",
      "themePreference": "natural_komame",
      "role": "admin",
      "isSuperAdmin": true,
      "householdId": "hh_xxx"
    }
  }
  ```

### 1.2 `POST /api/auth/logout`
- **概要**: セッションCookieの破棄。
- **レスポンス**: `{ "success": true }`

### 1.3 `GET /api/auth/me`
- **概要**: 現在ログイン中のユーザーおよび世帯情報の取得（`getCurrentSession()` にて `households.status === "approved"` および本番環境時の初期デモ管理者アカウント遮断を含むリアルタイム検証を実施）。
- **レスポンス (200 OK)**:
  ```json
  {
    "user": {
      "id": "usr_xxx",
      "email": "admin@komame.local",
      "themePreference": "natural_komame",
      "householdId": "hh_xxx",
      "householdName": "山田家",
      "role": "admin",
      "isSuperAdmin": true,
      "schemaName": "tenant_xxx"
    }
  }
  ```

### 1.4 `POST /api/auth/signup`
- **概要**: 新規世帯登録の**申請**受付（許可制）。マスタスキーマ（`public`）のみに承認待ち状態でユーザー・世帯・世帯所属レコードを作成し、**この時点ではテナント専用スキーマの作成およびセッションCookieの発行を行わない**。
- **リクエストボディ**:
  ```json
  {
    "email": "user@example.com",
    "password": "SecurePassword123!",
    "householdName": "新規世帯名"
  }
  ```
- **処理**:
  1. レートリミット（IP単位）、入力値、パスワードポリシー、メールアドレス重複を検証。
  2. `public.users`（`isActive: true`, `isSuperAdmin: false`）、`public.households`（`status: "pending"`）、`public.household_memberships`（`role: "admin"`, `status: "active"`）を `masterDb.transaction()` 内で作成。
- **レスポンス (201 Created)**:
  ```json
  {
    "success": true,
    "pendingApproval": true,
    "message": "新規世帯登録の申請を受け付けました。システム管理者の承認後にログインできるようになります。"
  }
  ```

### 1.5 招待参加 API (`/api/auth/invite`)
- **`GET /api/auth/invite?token=...`**: 招待リンク（JWTトークン）の有効性を検証し、世帯名と付与ロールを返却。
- **`POST /api/auth/invite`**: 招待トークンに基づき、ユーザー登録（または既存アカウント認証）を行い、世帯メンバーシップを自動作成してログインセッションを確立。

---

## 2. 口座・決済手段・資金色分け API (`/api/accounts`)

### 2.1 `GET /api/accounts`
- **レスポンス**: `{ "accounts": [...], "reservations": [...], "paymentMethods": [...] }`
- **計算フィールド**: `accounts[].reservedAmount`, `accounts[].availableBalance`

### 2.2 `POST /api/accounts`
- **ボディ**:
  - 口座登録: `{ "actionType": "account", "name": "...", "type": "bank", "balance": 100000, "icon": "🏛️", "color": "#2E7D32" }`
  - 決済手段: `{ "actionType": "payment_method", "name": "...", "type": "credit_card", "sourceAccountId": "acc_xxx", "closingDay": 99, "withdrawalDay": 27, "withdrawalMonthOffset": 1 }`
  - 資金色分け: `{ "actionType": "reservation", "accountId": "acc_xxx", "name": "車検費用", "amount": 50000, "color": "#E6A15C", "note": "..." }`

### 2.3 `PUT /api/accounts`
- 口座、決済手段、資金色分けの更新（`actionType`: `account` | `reservation` | `payment_method`）。

### 2.4 `DELETE /api/accounts?id=...&actionType=...`
- 口座・決済手段: 論理削除 (`isActive = false`)。
- 資金色分け: 物理削除 (ロック解除)。

---

## 3. 明細データ API (`/api/transactions`)

### 3.1 `GET /api/transactions`
- **クエリパラメータ**: `categoryId`, `paymentMethodId`, `startDate`, `endDate`, `keyword`, `tagId`
- **レスポンス**: 論理削除されていない明細一覧（費目名・決済手段名・紐づくタグ情報 `tags: TagItem[]` を取得・結合返却）。`tagId` 指定時は該当タグが付与された明細のみを抽出。

### 3.2 `POST /api/transactions`
- **概要**: 支出・収入・振替明細の新規登録。
- **リクエストボディ**: 単一オブジェクトまたはオブジェクトの配列 `TransactionCreateInput[]`
  - 追加可能フィールド: `tagIds?: string[]`, `tags?: string[]` (タグ名指定時は自動検索または新規作成)
- **ビジネスロジック**:
  1. 24時間リバート用チェックポイント (`checkpoints`) の自動生成。
  2. 決済手段がクレジットカードの場合、締め日・引き落とし日・月オフセットから引き落とし予定日 (`scheduledWithdrawalDate`) を算出（即時残高減額は行わない）。
  3. 現金・デビット・QR等の即時決済の場合、引き落とし元口座から即時減額 (`balance = balance - amount`)。
  4. 資金移動 (`type === "transfer"`) の場合、`fromAccountId` を減額し、`toAccountId` を増額。
  5. 貯蓄・投資等の振替（`type === "expense"` かつ `toAccountId` 指定）の場合、出金元から引かれ、`toAccountId` へ残高加算されると同時に受入振替明細が自動生成される。
  6. 明細とタグの紐付け (`transaction_tags`) を登録。
  7. 監査ログ (`audit_logs`) の自動記録。

### 3.3 `PUT /api/transactions`
- **概要**: 明細の更新。支払手段の変更や金額変更時、旧口座と新口座の残高を双方向で完全同期。タグ紐付けの完全同期更新。
- **ビジネスロジック**:
  1. 旧出金元口座の残高ロールバック (即時決済されていた場合 `balance + oldAmount`)。
  2. 旧受入先口座の残高ロールバック (投資・積立支出だった場合 `balance - oldAmount`)。
  3. 新出金元口座の残高減額 (即時決済の場合 `balance - newAmount`)。クレジットカードは予定日再計算。
  4. 新受入先口座の残高加算 (`balance + newAmount`)。
  5. ペア受入明細 (`parentTransactionId` またはフォールバック検索) の連動更新 (金額・日付・受入口座・店名)。受入先が解除された場合は連動論理削除。
  6. タグ紐付け (`tagIds`) が渡された場合、旧タグを全解除して新規タグを再登録。
  7. 親明細の更新および監査ログの自動記録。

### 3.4 `DELETE /api/transactions?id=...`
- **概要**: 明細の論理削除 (`deletedAt = NOW()`)。即時決済済みだった場合は残高を元に戻す。
- **ビジネスロジック**:
  1. 出金元口座の残高ロールバック (即時決済されていた場合 `balance + amount`)。
  2. 受入先口座の残高ロールバック (投資・積立支出だった場合 `balance - amount`)。
  3. ペア受入明細 (`parentTransactionId` またはフォールバック検索) の連動論理削除 (`deletedAt = NOW()`)。
  4. 親明細の論理削除および監査ログの自動記録。
  5. 受入明細が直接削除された場合、受入先口座から減額し、親明細の `toAccountId` を解除。

### 3.5 `GET /api/transactions/suggest`
- **概要**: 過去の明細データから入力店舗名に合致する店舗候補の補完、および最多利用の「費目」「支払元」を動的集計・自動サジェスト。
- **クエリパラメータ**: `q` (店舗名検索クエリ)
- **処理**:
  1. 論理削除されていない過去明細のうち、店舗名が存在するレコードを抽出（`ilike %q%`）。
  2. 店舗名候補（`candidates`）を完全一致 > 前方一致 > 利用頻度 > 新しさ順にソートし上位5件を抽出。
  3. 最上位候補店舗（または入力店舗名）の過去利用履歴から最多使用の「費目（ID・名称・アイコン・色）」および「決済手段（ID・名称）」を集計。
- **レスポンス (200 OK)**:
  ```json
  {
    "candidates": ["セブン-イレブン 渋谷店", "セブン銀行"],
    "suggestion": {
      "shopName": "セブン-イレブン 渋谷店",
      "categoryId": "cat_food",
      "categoryName": "食費",
      "categoryIcon": "🍙",
      "categoryColor": "#4CAF50",
      "paymentMethodId": "pm_paypay",
      "paymentMethodName": "PayPay",
      "count": 14
    }
  }
  ```

---

## 4. 2段階一時保存 API (`/api/drafts`)

### 4.1 `GET /api/drafts`
- **レスポンス**: `{ "manualDraft": {...} | null, "autoDraft": {...} | null }`

### 4.2 `POST /api/drafts`
- **ボディ**: `{ "draftType": "manual" | "auto", "formType": "single", "payloadJson": {...}, "itemCount": 1 }`
- 同一種別の既存下書きを上書き（1スロット制約）。

### 4.3 `DELETE /api/drafts?draftType=...`
- 手動または自動（パラメータなしで全件）の下書き物理削除。

---

## 5. 貯蓄目標 API (`/api/goals`)

### 5.1 `GET /api/goals`
- 各目標の対象口座の現在残高を合算し、`currentAmount` と `progressRate` (%) を動的集計して返却。

### 5.2 `POST /api/goals`
- 新規目標の登録。

---

## 6. 管理者 API (`/api/admin`) ※家庭管理者 (admin) 限定

### 6.1 `GET /api/admin/checkpoints`
- 過去24時間以内で有効なチェックポイント一覧と、各チェックポイント以降の操作件数・影響ユーザーメール一覧を返却。

### 6.2 `POST /api/admin/revert`
- **ボディ**: `{ "checkpointId": "cp_xxx" }`
- **処理**:
  1. 有効期限（24時間）の検証。
  2. チェックポイント以降の明細による残高変動を逆算・復元。
  3. 明細のロールバック。
  4. 一時保存データ (`drafts`) の全件初期化。
  5. 当該チェックポイントおよび以降のチェックポイントの無効化。
  6. リバート監査ログの記録。

### 6.3 `GET /api/admin/csv`
- **クエリ**: `type=full` (全明細), `type=accounts` (口座一覧)
- **文字コード**: UTF-8 BOM付き (`\uFEFF`)。

### 6.4 `POST /api/admin/csv` (管理者限定)
- **概要**: CSVファイルのプレビュー（カラム自動検出・マッピング・重複候補警告）およびインポート一括登録。
- **入力形式**: `multipart/form-data` または `application/json`
- **Action 1: `preview`**:
  - `csvText` を受け取り、RFC 4180準拠でパース。ヘッダー名から `date`, `amount`, `shopName`, `type`, `category`, `paymentMethod`, `note` の各列を自動検出（マッピング指定も可）。
  - 各行の日付・金額を正規化しバリデーション。
  - テナント内の既存明細（未削除）と突き合わせ、同一日・店舗・金額の組み合わせに `isDuplicateCandidate: true` を付与。
  - レスポンス: `{ headers, totalRows, validRows, duplicateCount, mapping, rows }`
- **Action 2: `import`**:
  - `items` 配列を受け取り、24時間リバート用チェックポイント (`description: CSVインポート (X件)`) を自動作成。
  - 各明細を登録し、即時決済手段の場合は口座残高を減額、投資・積立の場合は移動先加算および受入明細を自動生成。
  - 各明細の監査ログ（`action: "CREATE"`）を記録。
  - レスポンス: `{ success: true, importedCount, checkpointId, message }`

### 6.5 `GET /api/admin/logs` (条件付き操作ログ取得 & CSV/JSONエクスポート) ※家庭管理者限定
- **概要**: 世帯内の操作ログ・監査ログ（`audit_logs`）の条件付き検索・取得、およびCSV/JSON形式でのエクスポート。
- **クエリパラメータ**:
  - `userId?: string`: 操作者・ユーザーIDによる絞り込み（`all` で全件）
  - `action?: string`: 操作種別（`CREATE` | `UPDATE` | `DELETE` | `REVERT`、`all` で全種別）
  - `startDate?: string`: 開始日時（`YYYY-MM-DD` または ISO形式）
  - `endDate?: string`: 終了日時（`YYYY-MM-DD` または ISO形式）
  - `format?: 'json' | 'csv'`: 出力形式
  - `download?: 'true' | '1'`: ファイルダウンロード指示（または `format=csv` 時自動適用）
  - `limit?: number`: 取得上限件数（通常表示時は最大200件、ダウンロード時は最大5000件）
- **ビジネスロジック**:
  1. 家庭管理者権限（`session.role === 'admin'`）の検証。
  2. `masterDb` の `household_memberships` と `users` を結合し、操作者IDからメールアドレス（`operatorEmail`）を自動マッピング。
  3. テナントスキーマの `audit_logs` から条件合致レコードを時系列降順（`createdAt DESC`）で抽出。
  4. **CSV形式出力**:
     - 文字コード: UTF-8 (BOM付き `\uFEFF`)
     - ヘッダー: `ログID`, `日時`, `操作者メール`, `操作者ユーザーID`, `操作種別`, `対象種別`, `対象ID`, `概要`, `チェックポイントID`, `変更前データ`, `変更後データ`
     - RFC 4180準拠エスケープ、ファイル名: `komame_audit_logs_{householdId}_{YYYY-MM-DD}.csv`
  5. **JSON形式ダウンロード**:
     - ヘッダー: `Content-Disposition: attachment; filename="komame_audit_logs_{householdId}_{YYYY-MM-DD}.json"`
- **レスポンス (通常JSON 200 OK)**:
  ```json
  {
    "logs": [
      {
        "id": "log_xxx",
        "userId": "usr_xxx",
        "operatorUserId": "usr_xxx",
        "operatorEmail": "admin@komame.local",
        "action": "CREATE",
        "entityType": "transaction",
        "entityId": "tx_xxx",
        "summary": "セブン-イレブン (850円) の登録",
        "beforeDataJson": null,
        "afterDataJson": { "amount": 850, "shopName": "セブン-イレブン" },
        "checkpointId": "cp_xxx",
        "createdAt": "2026-10-17T03:30:00.000Z"
      }
    ],
    "totalCount": 1
  }
  ```


### 6.6 家族メンバー管理 API (`/api/admin/members`) ※家庭管理者限定
- **`GET /api/admin/members`**:
  - 現在の世帯に所属する全家族メンバーの一覧取得（メールアドレス、権限、状態、参加日時、自分自身フラグ）。
- **`POST /api/admin/members`**:
  - メンバー招待または追加: `{ email, password?, role: "admin" | "member" }`
    - 未登録メールアドレスの場合、世帯パスワードポリシー（`getHouseholdPasswordPolicy`）で検証の上で新規ユーザーを作成し、初期パスワードと招待リンクを返却。
    - 同一世帯の非アクティブメンバーの場合はステータスを `active` へ再有効化。
    - 既に別世帯等に所属する既存アカウントの場合は直接追加せず、本人の認証・同意の上で参加するための招待トークンリンク（`/invite?token=...`, `isExistingAccount: true`）を発行（VULN-02 対策）。
  - 招待リンク単体発行: `{ action: "create_invite_link", role: "admin" | "member" }`
    - 7日間有効な署名付きJWT招待リンクを発行。
  - パスワード再設定: `{ action: "reset_password", membershipId, newPassword }`
    - 家族メンバーのパスワードを世帯パスワードポリシー検証のうえ再設定（対象ユーザーが複数世帯に所属している場合は `403 Forbidden` で拒否し、クロス世帯乗っ取りを防止）。
  - 監査ログ（`household_member`）を自動記録。
- **`PUT /api/admin/members`**:
  - ロール変更 (`admin` / `member`) または状態更新 (`active` / `inactive`)。
  - 世帯の最後の有効な管理者の降格・無効化を防止するガードレールを適用。
- **`DELETE /api/admin/members?membershipId=...`**:
  - メンバーの論理削除（ステータスを `inactive` に更新してログイン遮断）。自分自身および最後の管理者の無効化は禁止。

### 6.7 システム設定 & パスワードポリシー API (`/api/admin/settings`) ※家庭管理者限定
- **`GET /api/admin/settings`**:
  - 世帯のシステム設定（通貨記号 `currencySymbol`、日付表示形式 `dateFormat`、パスワード強度ポリシー `passwordPolicy`）を取得。未設定項目は標準デフォルト値で補完。
- **`PUT /api/admin/settings`**:
  - リクエストボディ: `{ currencySymbol?: string, dateFormat?: string, passwordPolicy?: { minLength: number, requireUppercase: boolean, requireLowercase: boolean, requireNumbers: boolean, requireSpecialChars: boolean } }`
  - 入力バリデーション（通貨記号1〜5文字、許可された日付形式、最小文字数4〜32文字）。
  - `public.system_settings` テーブルに世帯単位でUPSERT保存。
  - テナント監査ログ（`action: "UPDATE", entityType: "system_settings"`）を自動記録。
  - 世帯メンバー招待時およびパスワード変更時の動的ポリシー検証（`getHouseholdPasswordPolicy`）と連動。

---

## 7. タグ管理 API (`/api/tags`)

### 7.1 `GET /api/tags`
- **概要**: ログイン中世帯に登録されているタグ一覧の取得。
- **初回フォールバック**: タグが0件の場合、標準プリセット（`#固定費`, `#変動費`, `#自己投資`, `#特別費`, `#ご褒美`）を自動投入して返却。
- **レスポンス (200 OK)**:
  ```json
  {
    "tags": [
      { "id": "tag_fixed", "name": "固定費", "color": "#4F46E5" },
      { "id": "tag_variable", "name": "変動費", "color": "#0284C7" },
      { "id": "tag_invest", "name": "自己投資", "color": "#16A34A" }
    ]
  }
  ```

### 7.2 `POST /api/tags`
- **概要**: 新規タグの作成（名前の `#` 自動正規化、同一世帯内での重複防止）。
- **リクエストボディ**:
  ```json
  {
    "name": "自己投資",
    "color": "#16A34A"
  }
  ```
- **レスポンス (200 OK)**:
  ```json
  {
    "tag": {
      "id": "tag_xxx",
      "name": "自己投資",
      "color": "#16A34A"
    },
    "existed": false
  }
  ```

---

## 8. API セキュリティ & バリデーション仕様 (Security & Input Validation)

### 8.1 金額・数値境界値バリデーション (VULN-09)
- **明細金額 (`amount`)**:
  - `1 <= amount <= 9,999,999,999` の整数（`Number.isSafeInteger`）。
  - 負の金額、0、小数は `400 Bad Request` で拒否。
- **口座残高 (`balance`)**:
  - `0 <= balance <= 9,999,999,999` の整数。
- **一括登録・CSVインポート制限**:
  - `POST /api/transactions` の一括登録配列: 最大 500 件。
  - `POST /api/admin/csv` のアップロード制限: 最大 5MB、最大 5,000 行。

### 8.2 レートリミッター仕様 (VULN-08)
- 認証エンドポイント（`/api/auth/login`, `/api/auth/signup`, `/api/auth/invite`）にスライディングウィンドウ方式を適用。
- 制限超過時は `429 Too Many Requests` と以下のヘッダーを返却：
  - `Retry-After: <秒数>`
  - `X-RateLimit-Limit: <上限回数>`
  - `X-RateLimit-Remaining: 0`
  - `X-RateLimit-Reset: <UNIXタイムスタンプ>`

### 8.3 DB トランザクション原子性の保証
- 口座残高更新を伴う複数テーブル操作（`transactions` の POST/PUT/DELETE、`admin/csv` の一括インポート、`admin/revert` のリバート）は `db.transaction(async (tx) => { ... })` 内で実行。
- 途中でエラーが発生した場合は自動的に全ロールバックされ、残高や明細の不整合を完全に防止。

### 8.4 CSV 数式インジェクション (Formula Injection) 防御 (VULN-07)
- 全 CSV エクスポート（`GET /api/admin/csv`, `GET /api/admin/logs`）において、文字列セルの先頭が数式トリガー文字（`=`, `+`, `-`, `@`, `\t`, `\r`）の場合、先頭にシングルクォート（`'`）を付与して Excel / Google スプレッドシートでの不正スクリプト実行を無害化。
- 純粋な数値型セル（負の数値を含む）はシングルクォートを付与せず、数値計算互換性を維持。

### 8.5 CSRF Origin / Host 検証 (VULN-11)
- 状態変更リクエスト（POST / PUT / DELETE）において、リクエストヘッダーの `Origin` と `Host` を突合検証し、クロスオリジンからの不正リクエストを遮断。

---

## 9. 費目マスター管理 API (`/api/categories`)

### 9.1 `GET /api/categories`
- **概要**: 費目マスター一覧の取得。`sortOrder ASC` 順で返却。
- **クエリパラメータ**:
  - `includeArchived?: "true"`: `"true"` 指定かつ家庭管理者（`admin`）の場合はアーカイブ済み費目も含めて全件返却（管理画面用）。未指定または一般メンバー時は `isArchived === false` のみ返却。
- **レスポンス (200 OK)**:
  ```json
  {
    "categories": [
      {
        "id": "cat_food_hh_xxx",
        "name": "食費 (食材・自炊)",
        "parentId": null,
        "icon": "🥦",
        "color": "#2E7D32",
        "sortOrder": 1,
        "isArchived": false,
        "isSystem": true
      }
    ]
  }
  ```

### 9.2 `POST /api/categories` ※家庭管理者 (admin) 限定
- **概要**: ユーザーカスタム費目の新規追加（`isSystem: false`）。
- **リクエストボディ**: `{ "name": string, "icon"?: string, "color"?: string }`
- **バリデーション & ロジック**:
  - 家庭管理者権限（`session.role === "admin"`）を検証（一般メンバーは `403 Forbidden`）。
  - `name` の前後空白トリム・必須チェック（1〜100文字）・既存未アーカイブ費目との名称重複チェック。
  - `sortOrder` は既存の最大値 + 1 を設定。
  - 監査ログ（`action: "CREATE", entityType: "category"`）をトランザクション内で記録。

### 9.3 `PUT /api/categories` ※家庭管理者 (admin) 限定
- **概要**: 費目情報の編集、全費目の並び順一括更新、またはアーカイブ済み費目の復元。
- **モード 1: 費目情報編集 (`action: "update"` または省略時)**
  - リクエストボディ: `{ "action"?: "update", "id": string, "name": string, "icon"?: string, "color"?: string }`
  - `isSystem === true`（標準12費目）の場合は編集不可（`403 Forbidden`）。
  - 変更後の費目名・アイコン・カラーは、`transactions` の `categoryId` 結合により過去の明細・グラフにも即時反映される。
  - 監査ログ（`action: "UPDATE", entityType: "category"`）に `beforeDataJson` / `afterDataJson` を記録。
- **モード 2: 並び順一括更新 (`action: "reorder"`)**
  - リクエストボディ: `{ "action": "reorder", "orderedIds": string[] }`
  - 標準12費目（`isSystem === true`）を含む全費目を対象に、`orderedIds` の配列順に従って `sortOrder` を `db.transaction()` 内で一括更新。
  - 監査ログ（`action: "UPDATE", entityType: "category"`）を記録。
- **モード 3: アーカイブ復元 (`action: "restore"`)**
  - リクエストボディ: `{ "action": "restore", "id": string }`
  - `isSystem === true` は対象外（`403 Forbidden`）。対象費目の `isArchived` を `false` に更新し、監査ログ（`action: "UPDATE", entityType: "category"`）を記録。

### 9.4 `DELETE /api/categories?id=...` ※家庭管理者 (admin) 限定
- **概要**: ユーザー追加費目の論理削除（アーカイブ：`isArchived = true`）。
- **バリデーション & ロジック**:
  - 家庭管理者権限（`session.role === "admin"`）を検証。
  - `isSystem === true`（標準12費目）の場合はアーカイブ不可（`403 Forbidden`）。
  - 論理削除のため過去の `transactions` との `categoryId` 紐付けは維持され、過去の明細・集計グラフの表示はそのまま保持される。新規明細登録の選択肢からは除外される。
  - 監査ログ（`action: "DELETE", entityType: "category"`）を記録。

---

## 10. システム管理者（Super Admin）API (`/api/super-admin/households`)

本エンドポイント群は、`getCurrentSession()` による認証に加え、マスタDB上の `users.isSuperAdmin === true` を満たす最上位管理者のみアクセス可能（それ以外は `403 Forbidden`）。

### 10.1 `GET /api/super-admin/households`
- **概要**: 新規世帯登録申請および登録済み世帯アカウントの一覧取得。
- **クエリパラメータ**:
  - `status?: "all" | "pending" | "approved" | "rejected" | "suspended"`（省略時は `"all"`）
- **レスポンス (200 OK)**:
  ```json
  {
    "households": [
      {
        "id": "hh_xxx",
        "name": "鈴木家",
        "schemaName": "tenant_hh_xxx",
        "status": "pending",
        "applicantEmail": "suzuki@example.com",
        "applicantUserId": "usr_xxx",
        "createdAt": "2026-11-18T11:30:00.000Z",
        "reviewedAt": null,
        "reviewedBy": null,
        "rejectionReason": null
      }
    ],
    "counts": {
      "all": 2,
      "pending": 1,
      "approved": 1,
      "rejected": 0,
      "suspended": 0
    }
  }
  ```

### 10.2 `PUT /api/super-admin/households`
- **概要**: 世帯申請の承認・再承認、却下、または承認済み世帯の停止・再有効化。
- **リクエストボディ**:
  ```json
  {
    "householdId": "hh_xxx",
    "action": "approve" | "reject" | "suspend" | "reactivate",
    "reason": "任意の却下理由またはメモ"
  }
  ```
- **処理詳細**:
  - `action === "approve"`（`pending` または `rejected` から承認）:
    1. `assertValidSchemaName(household.schemaName)` 検証のうえ、`createTenantTables(household.schemaName)` でテナント専用スキーマ・テーブルを作成。
    2. `masterDb` 上の `public.system_settings`（通貨・日付形式・パスワードポリシー）およびテナントDB上の標準12費目マスター・デフォルト現金口座を冪等に初期シード投入。
    3. `public.households` の `status` を `"approved"`、`reviewedBy` を実行管理者ID、`reviewedAt` を現在時刻、`rejectionReason` を `null` に更新。
  - `action === "reject"`（`pending` から却下）:
    - `public.households` の `status` を `"rejected"`、`reviewedBy`、`reviewedAt`、`rejectionReason` を更新（履歴保持・ログイン不可）。
  - `action === "suspend"`（`approved` から利用停止）:
    - 現在操作中のシステム管理者自身の所属世帯（`householdId === session.activeHouseholdId`）の停止は `400 Bad Request` で拒否（自己ロックアウト防止）。
    - `public.households` の `status` を `"suspended"` に更新（`getCurrentSession()` により即座に全セッション遮断）。
  - `action === "reactivate"`（`suspended` から利用再開）:
    - `public.households` の `status` を `"approved"` に更新。

### 10.3 `DELETE /api/super-admin/households?householdId=...`
- **概要**: 却下済み（`rejected`）または承認待ち（`pending`）世帯申請の物理削除（抹消）。
- **バリデーション & ロジック**:
  - 対象世帯が `rejected` または `pending` であることを検証（`approved` / `suspended` 世帯や自世帯は `400 Bad Request` で拒否）。
  - トランザクション内で `household_memberships`・`households` を物理削除し、申請ユーザーに他の世帯所属および Super Admin 権限がない場合は `users` レコードも物理削除する（同一メールアドレスでの再申請を可能化）。

---

## 改訂履歴
- **2026-11-18**: `POST /api/auth/login` および `GET /api/auth/me`（`getCurrentSession()`）において、初期デモ管理者アカウント（`admin@komame.local` / `usr-yamada-taro-001`）をテスト環境（`NODE_ENV !== "production"`）でのみ有効とし、本番環境（`NODE_ENV === "production"`）では認証・セッションを拒否する仕様を追記。
- **2026-11-18**: 新規世帯登録の申請・許可制導入に伴い、`POST /api/auth/signup`（`pending` 申請受付・スキーマ未作成・セッション未発行）、`POST /api/auth/login`（世帯ステータス別 `403` 応答・`isSuperAdmin` 返却）、`GET /api/auth/me`（`isSuperAdmin` 返却）を更新し、第10章「システム管理者（Super Admin）API (`/api/super-admin/households`)」を追加。
- **2026-11-15**: 6.6 `POST /api/admin/members` の記述を Phase 7.2 (VULN-02) 実装（既存他世帯アカウントの直接追加廃止・招待リンク発行統一、複数世帯所属ユーザーの管理者パスワード上書き拒否）に合わせて最新化。
- **2026-11-15**: 第9章「費目マスター管理 API (`/api/categories`)」を追加（管理者限定の作成・編集・全費目並び替え・アーカイブ/復元・標準12費目保護・監査ログ記録仕様）。
- **2026-10-18**: 第8章「API セキュリティ & バリデーション仕様」を追加（金額・残高境界値、レートリミット429応答、トランザクション原子性、CSV数式インジェクション防御、CSRF Origin検証）。
- **2026-10-17**: `GET /api/admin/logs` の仕様を拡張（ユーザー、操作種別、期間の条件付き絞り込み、操作者メールアドレスマッピング、RFC 4180準拠UTF-8 BOM付きCSVおよびJSON形式でのエクスポートダウンロード）。
- **2026-10-17**: `GET/PUT /api/admin/settings` の仕様を追加（通貨記号、日付表示形式、最小文字数・英数記号必須等のパスワード強度ポリシー動的設定・保存・監査ログ・認証検証連動）。
- **2026-10-17**: `GET/POST/PUT/DELETE /api/admin/members` および `GET/POST /api/auth/invite` の仕様を追加（家族メンバー一覧取得、直接追加・招待リンク発行、ロール変更、論理削除無効化、管理者ガードレール、パスワード再設定）。
- **2026-10-17**: `POST /api/admin/csv` の仕様を追加（CSVパース、自動カラムマッピング、重複候補検知、チェックポイント付き一括インポート登録）。
- **2026-10-17**: `GET /api/transactions/suggest` の仕様を追加（過去明細履歴からの店舗名補完・最多利用費目/支払元動的サジェスト）。
- **2026-10-17**: `GET /api/tags` および `POST /api/tags` の仕様を追加。`GET /api/transactions` の `tagId` 絞り込みとタグ結合返却、`POST` / `PUT` でのタグ紐付け仕様を追記。


