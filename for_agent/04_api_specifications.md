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
- **クエリパラメータ**: `categoryId`, `paymentMethodId`, `startDate`, `endDate`, `keyword`
- **レスポンス**: 論理削除されていない明細一覧（費目名・決済手段名をJOIN）。

### 3.2 `POST /api/transactions`
- **概要**: 支出・収入・振替明細の新規登録。
- **リクエストボディ**: 単一オブジェクトまたはオブジェクトの配列 `TransactionCreateInput[]`
- **ビジネスロジック**:
  1. 24時間リバート用チェックポイント (`checkpoints`) の自動生成。
  2. 決済手段がクレジットカードの場合、締め日・引き落とし日・月オフセットから引き落とし予定日 (`scheduledWithdrawalDate`) を算出（即時残高減額は行わない）。
  3. 現金・デビット・QR等の即時決済の場合、引き落とし元口座から即時減額 (`balance = balance - amount`)。
  4. 資金移動 (`type === "transfer"`) の場合、`fromAccountId` を減額し、`toAccountId` を増額。
  5. 貯蓄・投資等の振替（`type === "expense"` かつ `toAccountId` 指定）の場合、出金元から引かれ、`toAccountId` へ残高加算されると同時に受入振替明細が自動生成される。
  6. 監査ログ (`audit_logs`) の自動記録。

### 3.3 `PUT /api/transactions`
- **概要**: 明細の更新。支払手段の変更や金額変更時、旧口座と新口座の残高を双方向で完全同期。
- **ビジネスロジック**:
  1. 旧出金元口座の残高ロールバック (即時決済されていた場合 `balance + oldAmount`)。
  2. 旧受入先口座の残高ロールバック (投資・積立支出だった場合 `balance - oldAmount`)。
  3. 新出金元口座の残高減額 (即時決済の場合 `balance - newAmount`)。クレジットカードは予定日再計算。
  4. 新受入先口座の残高加算 (`balance + newAmount`)。
  5. ペア受入明細 (`parentTransactionId` またはフォールバック検索) の連動更新 (金額・日付・受入口座・店名)。受入先が解除された場合は連動論理削除。
  6. 親明細の更新および監査ログの自動記録。

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

### 6.5 `GET /api/admin/logs`
- 直近の世帯内監査ログ（最大100件）を取得。

---

## 改訂履歴
- **2026-10-17**: `POST /api/admin/csv` の仕様を追加（CSVパース、自動カラムマッピング、重複候補検知、チェックポイント付き一括インポート登録）。
- **2026-10-17**: `GET /api/transactions/suggest` の仕様を追加（過去明細履歴からの店舗名補完・最多利用費目/支払元動的サジェスト）。

