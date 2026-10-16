# 『Komame』開発・運用ガードレール (Guardrails)

本ドキュメントは、エージェントが本プロジェクトで作業を行う際のミスやトラブルに対する**問題解決および注意を促すための手順書**です。

---

## 1. 環境・シェル・実行ルールの鉄則

### 1.1 OS・シェル環境確認 CoT の徹底
エージェントは `run_command` を呼び出す直前に、必ず以下の思考プロセスを評価すること：
1. **ホストOSの確認**: Windows
2. **使用シェルの確認**: PowerShell
3. **Cwd（作業ディレクトリ）の整合性確認**: `c:\Users\ina90\Documents\Workspace\Komame`
4. **構文の安全性確認**:
   - `&&` や `||` による複数コマンド連結は行わない（単一コマンドに分割するかスクリプト化）。
   - POSIX 固有コマンド（`rm -rf`, `cat`, `ls`, `mkdir -p`）を使わない。
   - インラインワンライナー（`powershell -Command "..."` や `node -e "..."`）はエスケープ事故を防ぐため禁止。
   - シェルリダイレクト（`>` / `>>`）は文字コード（UTF-16LE）化するため厳禁。`write_to_file` を使用する。

### 1.2 技術スタックの認識
- 本プロジェクトは **Next.js 15 (React 19, TypeScript) + Drizzle ORM + PostgreSQL 16** です。
- `AGENTS.md` の初期テンプレートに誤記（Python/Streamlit）がある場合でも、実プロジェクトの Next.js 構成に基づいて検証コマンド（`npm run build`, `npx tsc --noEmit` 等）を実行すること。

---

## 2. データベース・マルチテナントのガードレール

### 2.1 マスタスキーマとテナントスキーマの混同禁止
- `public` スキーマにはシステム全体で共有するデータ（`users`, `households`, `household_memberships`, `system_settings`）のみを配置すること。
- 家計簿の実データ（口座、決済手段、費目、明細、下書き、目標、監査ログ）は**必ず世帯専用スキーマ（`tenant_{household_id}`）内に配置・アクセス**すること。
- テナントDBへのアクセスは `getTenantDb(session.schemaName)` を経由し、直接 `public` にクエリを発行しないこと。

### 2.2 ID の採番規則
- ランダムIDは重複を防ぐため `crypto.randomUUID().replace(/-/g, "")` を用い、プレフィックスを付与すること：
  - 口座: `acc_xxx`
  - 決済手段: `pm_xxx`
  - 費目: `cat_xxx`
  - 明細: `tx_xxx`
  - 一時保存: `draft_xxx`
  - チェックポイント: `cp_xxx`
  - 監査ログ: `log_xxx`

---

## 3. 会計・残高整合性のガードレール（過去のミスと再発防止）

### 3.1 資金移動 (transfer) における出金・入金双方向連動の漏れ防止
- **原因となった過去の事象**:
  `src/app/api/transactions/route.ts` の POST 処理において、`if (item.toAccountId)` が最初に評価されていたため、`item.type === "transfer"` であっても後続の `else if (item.type === "transfer" && item.fromAccountId && item.toAccountId)` が実行されず、移動元口座（`fromAccountId`）の減額がスキップされ、移動先のみ増額されて残高が不正に増殖するバグが発生した。
- **再発防止策**:
  残高更新ロジックは必ず取引種別（`item.type`）を最優先で分岐させること。
  ```typescript
  if (item.type === "transfer") {
    // 1. fromAccountId の減額
    // 2. toAccountId の増額
  } else if (item.type === "income") {
    // toAccountId の増額
  } else if (item.type === "expense") {
    // 決済手段に応じた減額
    // もし toAccountId が指定されていれば投資・積立先への増額 & 振替受入明細生成
  }
  ```

### 3.2 24時間リバート時の現金・QR口座逆算漏れの防止
- **原因となった過去の事象**:
  リバート処理（`admin/revert/route.ts`）で、`pm.sourceAccountId` が明示的に設定されている口座のみを `balance + amount` しており、現金（`type === 'cash'`）やQR（`type === 'qr_code'`）で手元現金口座やウォレットから自動特定・減額された取引の逆算復元が漏れていた。
- **再発防止策**:
  残高の逆算復元時は、登録時（`POST /api/transactions`）と100%同一の口座特定フォールバック（現金口座特定、ウォレット特定）を行い、確実に同額を戻すこと。
  また、投資・積立支出（`expense` かつ `toAccountId`）で加算された受入残高も同時に逆算減額すること。

### 3.3 一時保存データの下書き上書き・リバート時初期化
- リバート実行時は、要件定義書に従い `drafts` レコードを全件物理削除して空に初期化すること。
- 手動保存データが存在する状態で未復元のまま新規登録を完了しようとする場合、手動下書きデータが破棄される旨の警告確認モーダルを必ず表示すること。

---

## 4. コード編集・ファイル更新時の鉄則
- 編集時は `view_file` で事前に内容を確認し、既存ロジックやコメント・docstringを破壊しないこと。
- `Plan.md` を更新する際は既存の完了済みタスク（`- [x]`）を絶対に消去せず、差分をマージすること。
