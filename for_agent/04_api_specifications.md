# 『Komame』API仕様書

全エンドポイントは `/api/...` 配下に配置され、認証セッション（Cookie: `komame_session`）を検証して動的に世帯スキーマを解決します。

---

## 1. 認証 API (`/api/auth`)

### 1.1 `POST /api/auth/login`
- **概要**: メールアドレス・パスワードによる認証とセッションCookie発行。
- **リクエストボディ**:
  ```json
  {
    "email": "admin@komame.local",
    "password": "Password123!"
  }
  ```
- **レスポンス (200 OK)**:
  ```json
  {
    "success": true,
    "user": {
      "id": "usr_xxx",
      "email": "admin@komame.local",
      "themePreference": "natural_komame",
      "role": "admin",
      "householdId": "hh_xxx"
    }
  }
  ```

### 1.2 `POST /api/auth/logout`
- **概要**: セッションCookieの破棄。
- **レスポンス**: `{ "success": true }`

### 1.3 `GET /api/auth/me`
- **概要**: 現在ログイン中のユーザーおよび世帯情報の取得。
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
      "schemaName": "tenant_xxx"
    }
  }
  ```

### 1.4 `POST /api/auth/signup`
- **概要**: 新規世帯開設および管理者ユーザー作成。テナントスキーマ・標準費目の自動投入。
- **リクエストボディ**:
  ```json
  {
    "email": "user@example.com",
    "password": "SecurePassword123!",
    "householdName": "新規世帯名"
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
    - 新規ユーザー作成、または既存ユーザーの世帯メンバーシップ追加/再有効化。初期パスワードと招待リンクを返却。
  - 招待リンク単体発行: `{ action: "create_invite_link", role: "admin" | "member" }`
    - 7日間有効な署名付きJWT招待リンクを発行。
  - パスワード再設定: `{ action: "reset_password", membershipId, newPassword }`
    - 家族メンバーのパスワードを管理者が再設定。
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

## 改訂履歴
- **2026-10-17**: `GET /api/admin/logs` の仕様を拡張（ユーザー、操作種別、期間の条件付き絞り込み、操作者メールアドレスマッピング、RFC 4180準拠UTF-8 BOM付きCSVおよびJSON形式でのエクスポートダウンロード）。
- **2026-10-17**: `GET/PUT /api/admin/settings` の仕様を追加（通貨記号、日付表示形式、最小文字数・英数記号必須等のパスワード強度ポリシー動的設定・保存・監査ログ・認証検証連動）。


- **2026-10-17**: `GET/POST/PUT/DELETE /api/admin/members` および `GET/POST /api/auth/invite` の仕様を追加（家族メンバー一覧取得、直接追加・招待リンク発行、ロール変更、論理削除無効化、管理者ガードレール、パスワード再設定）。
- **2026-10-17**: `POST /api/admin/csv` の仕様を追加（CSVパース、自動カラムマッピング、重複候補検知、チェックポイント付き一括インポート登録）。
- **2026-10-17**: `GET /api/transactions/suggest` の仕様を追加（過去明細履歴からの店舗名補完・最多利用費目/支払元動的サジェスト）。
- **2026-10-17**: `GET /api/tags` および `POST /api/tags` の仕様を追加。`GET /api/transactions` の `tagId` 絞り込みとタグ結合返却、`POST` / `PUT` でのタグ紐付け仕様を追記。


