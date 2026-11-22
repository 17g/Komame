/**
 * Komame 決済手段種別表示ラベル・正規化ヘルパー 単体テスト & 静的検査スクリプト (Phase 16)
 *
 * 実行方法: npx tsx scripts/test-payment-method-unit.ts
 * 検証対象:
 *   1. getPaymentMethodTypeLabel (credit_card / qr_code / debit_card / direct_debit / cash / フォールバック)
 *   2. normalizePaymentMethodType (既存互換 direct_debit -> debit_card 統一含む)
 *   3. PAYMENT_METHOD_TYPE_OPTIONS の4種定義とラベル整合性
 *   4. AccountsTab / AddAccountModal / EditPaymentMethodModal の静的コード検査
 */

import fs from "fs";
import path from "path";
import {
  getPaymentMethodTypeLabel,
  normalizePaymentMethodType,
  PAYMENT_METHOD_TYPE_OPTIONS,
} from "../src/lib/utils";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [ASSERTION FAILED]: ${message}`);
    throw new Error(message);
  } else {
    console.log(`✅ [PASS]: ${message}`);
  }
}

console.log("=================================================");
console.log("💳 Komame Payment Method Type Unit Tests");
console.log("=================================================\n");

// =========================================================
// 1. getPaymentMethodTypeLabel の検証
// =========================================================
console.log("--- 1. getPaymentMethodTypeLabel Mapping ---");

assert(
  getPaymentMethodTypeLabel("credit_card") === "クレジットカード",
  'credit_card -> "クレジットカード"'
);
assert(
  getPaymentMethodTypeLabel("qr_code") === "QR・バーコード決済",
  'qr_code -> "QR・バーコード決済"'
);
assert(
  getPaymentMethodTypeLabel("debit_card") === "引落・デビットカード",
  'debit_card -> "引落・デビットカード"'
);
assert(
  getPaymentMethodTypeLabel("direct_debit") === "引落・デビットカード",
  'direct_debit (legacy) -> "引落・デビットカード"'
);
assert(getPaymentMethodTypeLabel("cash") === "現金", 'cash -> "現金"');
assert(getPaymentMethodTypeLabel(undefined) === "現金", 'undefined fallback -> "現金"');
assert(getPaymentMethodTypeLabel(null) === "現金", 'null fallback -> "現金"');
assert(getPaymentMethodTypeLabel("unknown_type") === "現金", 'unknown fallback -> "現金"');

// =========================================================
// 2. normalizePaymentMethodType の検証
// =========================================================
console.log("\n--- 2. normalizePaymentMethodType Normalization ---");

assert(
  normalizePaymentMethodType("credit_card") === "credit_card",
  'normalize("credit_card") === "credit_card"'
);
assert(
  normalizePaymentMethodType("qr_code") === "qr_code",
  'normalize("qr_code") === "qr_code"'
);
assert(
  normalizePaymentMethodType("debit_card") === "debit_card",
  'normalize("debit_card") === "debit_card"'
);
assert(
  normalizePaymentMethodType("direct_debit") === "debit_card",
  'normalize("direct_debit") === "debit_card" (既存互換統一)'
);
assert(
  normalizePaymentMethodType("cash") === "cash",
  'normalize("cash") === "cash"'
);
assert(
  normalizePaymentMethodType(undefined) === "credit_card",
  'normalize(undefined) === "credit_card"'
);
assert(
  normalizePaymentMethodType("invalid") === "credit_card",
  'normalize("invalid") === "credit_card"'
);

// =========================================================
// 3. PAYMENT_METHOD_TYPE_OPTIONS の4種定義検証
// =========================================================
console.log("\n--- 3. PAYMENT_METHOD_TYPE_OPTIONS Consistency ---");

assert(PAYMENT_METHOD_TYPE_OPTIONS.length === 4, "選択肢はちょうど4種であること");
assert(
  PAYMENT_METHOD_TYPE_OPTIONS.map((o) => o.value).join(",") ===
    "credit_card,qr_code,debit_card,cash",
  "選択肢のDB内部値順序が credit_card, qr_code, debit_card, cash であること"
);
for (const opt of PAYMENT_METHOD_TYPE_OPTIONS) {
  assert(
    opt.label === getPaymentMethodTypeLabel(opt.value),
    `Option ${opt.value} label ("${opt.label}") matches getPaymentMethodTypeLabel`
  );
}
assert(
  !PAYMENT_METHOD_TYPE_OPTIONS.some((o) => (o.value as string) === "direct_debit"),
  "新規・編集セレクト選択肢に direct_debit が含まれないこと"
);

// =========================================================
// 4. UIコンポーネントの静的コード検査 (LF正規化)
// =========================================================
console.log("\n--- 4. Static Code Checks on Account/Payment Method UI ---");

const readNormalized = (relPath: string): string =>
  fs.readFileSync(path.resolve(process.cwd(), relPath), "utf-8").replace(/\r\n/g, "\n");

const accountsTabSrc = readNormalized("src/components/AccountsTab.tsx");
assert(
  accountsTabSrc.includes("getPaymentMethodTypeLabel(pm.type)"),
  "AccountsTab.tsx uses getPaymentMethodTypeLabel(pm.type)"
);
assert(
  !accountsTabSrc.includes('"デビットカード"'),
  'AccountsTab.tsx has no legacy standalone "デビットカード" label'
);

const addModalSrc = readNormalized("src/components/AddAccountModal.tsx");
assert(
  addModalSrc.includes("PAYMENT_METHOD_TYPE_OPTIONS"),
  "AddAccountModal.tsx renders PAYMENT_METHOD_TYPE_OPTIONS"
);
assert(
  addModalSrc.includes('pmType === "credit_card" || pmType === "debit_card"'),
  "AddAccountModal.tsx preserves bank-only source account constraint for debit_card"
);
assert(
  !addModalSrc.includes(">デビットカード<"),
  'AddAccountModal.tsx has no legacy ">デビットカード<" option'
);

const editModalSrc = readNormalized("src/components/EditPaymentMethodModal.tsx");
assert(
  editModalSrc.includes("normalizePaymentMethodType(paymentMethod.type)"),
  "EditPaymentMethodModal.tsx normalizes existing paymentMethod.type (including direct_debit)"
);
assert(
  editModalSrc.includes("PAYMENT_METHOD_TYPE_OPTIONS"),
  "EditPaymentMethodModal.tsx renders PAYMENT_METHOD_TYPE_OPTIONS"
);
assert(
  editModalSrc.includes('type === "credit_card" || type === "debit_card"'),
  "EditPaymentMethodModal.tsx preserves bank-only source account constraint for debit_card"
);
assert(
  !editModalSrc.includes(">デビットカード<"),
  'EditPaymentMethodModal.tsx has no legacy ">デビットカード<" option'
);

console.log("\n=================================================");
console.log("🎉 ALL PAYMENT METHOD TYPE UNIT TESTS PASSED!");
console.log("=================================================");
