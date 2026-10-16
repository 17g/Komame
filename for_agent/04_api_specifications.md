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

### 3.4 `DELETE /api/transactions?id=...`
- **概要**: 明細の論理削除 (`deletedAt = NOW()`)。即時決済済みだった場合は残高を元に戻す。

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

### 6.4 `GET /api/admin/logs`
- 直近の世帯内監査ログ（最大100件）を取得。
