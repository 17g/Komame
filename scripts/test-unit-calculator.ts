/**
 * 単価×個数 計算補助ロジック 単体テスト (要件 2-7)
 * 実行方法: npx tsx scripts/test-unit-calculator.ts
 *
 * 検証対象:
 *   1. 正常系 (正の整数・数値文字列・前後空白トリミング・先頭ゼロ付き数字文字列)
 *   2. 境界値 (MIN_AMOUNT=1, MAX_AMOUNT=9,999,999,999, 上限超過オーバーフロー)
 *   3. 異常系 (未入力, 0, 負数, 小数, 非数字, NaN/Infinity, 不正型)
 *   4. UI入力サニタイザー (sanitizeUnitCalcInput)
 */

import {
  calculateUnitTotal,
  isValidAmount,
  MIN_AMOUNT,
  MAX_AMOUNT,
} from "../src/lib/utils";
import { sanitizeUnitCalcInput } from "../src/components/UnitPriceCalculator";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [ASSERTION FAILED]: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ [PASS]: ${message}`);
}

console.log("=================================================");
console.log("🧮 Komame Unit Price Calculator Unit Tests");
console.log("=================================================\n");

// =========================================================
// 1. 正常系 (Normal Cases)
// =========================================================
console.log("--- 1. Normal Cases ---");

const n1 = calculateUnitTotal(150, 3);
assert(
  n1.ok && n1.unitPrice === 150 && n1.quantity === 3 && n1.total === 450,
  "Number inputs: 150 * 3 = 450"
);
assert(n1.ok && isValidAmount(n1.total), "Calculated total 450 passes isValidAmount");

const n2 = calculateUnitTotal("298", "4");
assert(
  n2.ok && n2.unitPrice === 298 && n2.quantity === 4 && n2.total === 1192,
  "String inputs: '298' * '4' = 1192"
);

const n3 = calculateUnitTotal("  1200  ", "  2 ");
assert(
  n3.ok && n3.unitPrice === 1200 && n3.quantity === 2 && n3.total === 2400,
  "Whitespace-trimmed string inputs: '  1200  ' * '  2 ' = 2400"
);

const n4 = calculateUnitTotal("05", "03");
assert(
  n4.ok && n4.unitPrice === 5 && n4.quantity === 3 && n4.total === 15,
  "Leading-zero string inputs: '05' * '03' = 15"
);

const n5 = calculateUnitTotal(500, "3");
assert(
  n5.ok && n5.total === 1500,
  "Mixed number and string inputs: 500 * '3' = 1500"
);

// =========================================================
// 2. 境界値 (Boundary Values: 1 ～ 9,999,999,999)
// =========================================================
console.log("\n--- 2. Boundary Values (1 to 9,999,999,999) ---");

const bMin = calculateUnitTotal(1, 1);
assert(
  bMin.ok && bMin.total === MIN_AMOUNT && bMin.total === 1 && isValidAmount(bMin.total),
  "Minimum boundary: 1 * 1 = 1 (MIN_AMOUNT)"
);

const bMax1 = calculateUnitTotal(MAX_AMOUNT, 1);
assert(
  bMax1.ok && bMax1.total === MAX_AMOUNT && isValidAmount(bMax1.total),
  `Maximum boundary: ${MAX_AMOUNT} * 1 = ${MAX_AMOUNT}`
);

const bMax2 = calculateUnitTotal(1, MAX_AMOUNT);
assert(
  bMax2.ok && bMax2.total === MAX_AMOUNT && isValidAmount(bMax2.total),
  `Maximum boundary: 1 * ${MAX_AMOUNT} = ${MAX_AMOUNT}`
);

const bMax3 = calculateUnitTotal(3_333_333_333, 3);
assert(
  bMax3.ok && bMax3.total === 9_999_999_999 && isValidAmount(bMax3.total),
  "Maximum boundary: 3,333,333,333 * 3 = 9,999,999,999"
);

const bMaxStr = calculateUnitTotal("9999999999", "1");
assert(
  bMaxStr.ok && bMaxStr.total === MAX_AMOUNT,
  "Maximum boundary as strings: '9999999999' * '1' = 9,999,999,999"
);

// 上限超過 (MAX_AMOUNT + 1 以上)
const bOverUnit = calculateUnitTotal(MAX_AMOUNT + 1, 1);
assert(
  !bOverUnit.ok && bOverUnit.errorCode === "EXCEEDS_MAX_AMOUNT",
  `Unit price exceeding MAX_AMOUNT (${MAX_AMOUNT + 1} * 1) rejected as EXCEEDS_MAX_AMOUNT`
);

const bOverQty = calculateUnitTotal(1, MAX_AMOUNT + 1);
assert(
  !bOverQty.ok && bOverQty.errorCode === "EXCEEDS_MAX_AMOUNT",
  `Quantity exceeding MAX_AMOUNT (1 * ${MAX_AMOUNT + 1}) rejected as EXCEEDS_MAX_AMOUNT`
);

const bOverProduct1 = calculateUnitTotal(100_000, 100_000);
assert(
  !bOverProduct1.ok && bOverProduct1.errorCode === "EXCEEDS_MAX_AMOUNT",
  "Product exceeding MAX_AMOUNT (100,000 * 100,000 = 10,000,000,000) rejected as EXCEEDS_MAX_AMOUNT"
);

const bOverProduct2 = calculateUnitTotal(5_000_000_000, 2);
assert(
  !bOverProduct2.ok && bOverProduct2.errorCode === "EXCEEDS_MAX_AMOUNT",
  "Product exceeding MAX_AMOUNT by 1 (5,000,000,000 * 2 = 10,000,000,000) rejected as EXCEEDS_MAX_AMOUNT"
);

const bOverSafeInt = calculateUnitTotal("99999999999999999999", "2");
assert(
  !bOverSafeInt.ok && bOverSafeInt.errorCode === "EXCEEDS_MAX_AMOUNT",
  "Huge numeric string beyond MAX_SAFE_INTEGER rejected safely via BigInt as EXCEEDS_MAX_AMOUNT"
);

const bOverNumberSafeInt = calculateUnitTotal(Number.MAX_SAFE_INTEGER, 2);
assert(
  !bOverNumberSafeInt.ok && bOverNumberSafeInt.errorCode === "EXCEEDS_MAX_AMOUNT",
  "Number.MAX_SAFE_INTEGER * 2 rejected as EXCEEDS_MAX_AMOUNT"
);

// =========================================================
// 3. 異常系 (Invalid & Empty Inputs)
// =========================================================
console.log("\n--- 3. Invalid & Empty Inputs ---");

// 3-1. 未入力
const eBothEmpty = calculateUnitTotal("", "");
assert(!eBothEmpty.ok && eBothEmpty.errorCode === "EMPTY_INPUT", "Empty strings rejected as EMPTY_INPUT");

const eUnitEmpty = calculateUnitTotal("   ", "2");
assert(!eUnitEmpty.ok && eUnitEmpty.errorCode === "EMPTY_INPUT", "Blank unitPrice rejected as EMPTY_INPUT");

const eQtyEmpty = calculateUnitTotal(100, "");
assert(!eQtyEmpty.ok && eQtyEmpty.errorCode === "EMPTY_INPUT", "Empty quantity rejected as EMPTY_INPUT");

const eNull = calculateUnitTotal(null, 2);
assert(!eNull.ok && eNull.errorCode === "EMPTY_INPUT", "Null unitPrice rejected as EMPTY_INPUT");

const eUndefined = calculateUnitTotal(100, undefined);
assert(!eUndefined.ok && eUndefined.errorCode === "EMPTY_INPUT", "Undefined quantity rejected as EMPTY_INPUT");

// 3-2. 0 入力
const zUnitNum = calculateUnitTotal(0, 3);
assert(!zUnitNum.ok && zUnitNum.errorCode === "INVALID_UNIT_PRICE", "Zero number unitPrice rejected as INVALID_UNIT_PRICE");

const zUnitStr = calculateUnitTotal("0", "3");
assert(!zUnitStr.ok && zUnitStr.errorCode === "INVALID_UNIT_PRICE", "Zero string '0' unitPrice rejected as INVALID_UNIT_PRICE");

const zUnitZeros = calculateUnitTotal("000", "3");
assert(!zUnitZeros.ok && zUnitZeros.errorCode === "INVALID_UNIT_PRICE", "Multi-zero string '000' unitPrice rejected as INVALID_UNIT_PRICE");

const zQtyNum = calculateUnitTotal(100, 0);
assert(!zQtyNum.ok && zQtyNum.errorCode === "INVALID_QUANTITY", "Zero number quantity rejected as INVALID_QUANTITY");

const zQtyStr = calculateUnitTotal(100, "0");
assert(!zQtyStr.ok && zQtyStr.errorCode === "INVALID_QUANTITY", "Zero string '0' quantity rejected as INVALID_QUANTITY");

// 3-3. 負数
const negUnitNum = calculateUnitTotal(-100, 2);
assert(!negUnitNum.ok && negUnitNum.errorCode === "INVALID_UNIT_PRICE", "Negative number unitPrice (-100) rejected");

const negUnitStr = calculateUnitTotal("-100", "2");
assert(!negUnitStr.ok && negUnitStr.errorCode === "INVALID_UNIT_PRICE", "Negative string unitPrice ('-100') rejected");

const negQtyNum = calculateUnitTotal(100, -1);
assert(!negQtyNum.ok && negQtyNum.errorCode === "INVALID_QUANTITY", "Negative number quantity (-1) rejected");

const negQtyStr = calculateUnitTotal("100", "-5");
assert(!negQtyStr.ok && negQtyStr.errorCode === "INVALID_QUANTITY", "Negative string quantity ('-5') rejected");

// 3-4. 小数
const decUnitNum = calculateUnitTotal(12.5, 2);
assert(!decUnitNum.ok && decUnitNum.errorCode === "INVALID_UNIT_PRICE", "Decimal number unitPrice (12.5) rejected");

const decUnitStr = calculateUnitTotal("12.5", "2");
assert(!decUnitStr.ok && decUnitStr.errorCode === "INVALID_UNIT_PRICE", "Decimal string unitPrice ('12.5') rejected");

const decQtyNum = calculateUnitTotal(100, 1.5);
assert(!decQtyNum.ok && decQtyNum.errorCode === "INVALID_QUANTITY", "Decimal number quantity (1.5) rejected");

const decQtyStr = calculateUnitTotal("100", "1.5");
assert(!decQtyStr.ok && decQtyStr.errorCode === "INVALID_QUANTITY", "Decimal string quantity ('1.5') rejected");

// 3-5. 非数字・特殊数値・不正型
const alphaUnit = calculateUnitTotal("abc", 2);
assert(!alphaUnit.ok && alphaUnit.errorCode === "INVALID_UNIT_PRICE", "Alphabetic unitPrice ('abc') rejected");

const suffixUnit = calculateUnitTotal("100円", 2);
assert(!suffixUnit.ok && suffixUnit.errorCode === "INVALID_UNIT_PRICE", "Currency-suffixed unitPrice ('100円') rejected");

const commaUnit = calculateUnitTotal("1,000", 2);
assert(!commaUnit.ok && commaUnit.errorCode === "INVALID_UNIT_PRICE", "Comma-formatted unitPrice ('1,000') rejected");

const alphaQty = calculateUnitTotal(100, "xyz");
assert(!alphaQty.ok && alphaQty.errorCode === "INVALID_QUANTITY", "Alphabetic quantity ('xyz') rejected");

const nanUnit = calculateUnitTotal(NaN, 2);
assert(!nanUnit.ok && nanUnit.errorCode === "INVALID_UNIT_PRICE", "NaN unitPrice rejected");

const infUnit = calculateUnitTotal(Infinity, 2);
assert(!infUnit.ok && infUnit.errorCode === "INVALID_UNIT_PRICE", "Infinity unitPrice rejected");

const negInfUnit = calculateUnitTotal(-Infinity, 2);
assert(!negInfUnit.ok && negInfUnit.errorCode === "INVALID_UNIT_PRICE", "-Infinity unitPrice rejected");

const nanQty = calculateUnitTotal(100, NaN);
assert(!nanQty.ok && nanQty.errorCode === "INVALID_QUANTITY", "NaN quantity rejected");

const infQty = calculateUnitTotal(100, Infinity);
assert(!infQty.ok && infQty.errorCode === "INVALID_QUANTITY", "Infinity quantity rejected");

const objUnit = calculateUnitTotal({ value: 100 }, 2);
assert(!objUnit.ok && objUnit.errorCode === "INVALID_UNIT_PRICE", "Object unitPrice rejected");

const boolQty = calculateUnitTotal(100, true);
assert(!boolQty.ok && boolQty.errorCode === "INVALID_QUANTITY", "Boolean quantity rejected");

// =========================================================
// 4. UI入力サニタイザー (sanitizeUnitCalcInput)
// =========================================================
console.log("\n--- 4. UI Input Sanitizer (sanitizeUnitCalcInput) ---");

assert(sanitizeUnitCalcInput("１２３４") === "1234", "Full-width digits converted to half-width digits");
assert(sanitizeUnitCalcInput("120円") === "120", "Non-digit suffix stripped");
assert(sanitizeUnitCalcInput("-50.5") === "505", "Minus sign and decimal point stripped");
assert(sanitizeUnitCalcInput("abcあいう") === "", "Non-numeric text stripped to empty string");
assert(sanitizeUnitCalcInput("０") === "0", "Full-width zero converted to '0'");

console.log("\n=================================================");
console.log("🎉 ALL UNIT PRICE CALCULATOR UNIT TESTS PASSED!");
console.log("=================================================");
