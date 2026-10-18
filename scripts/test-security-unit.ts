/**
 * Komame セキュリティ単体テスト & 静的コード検査スクリプト
 * 
 * 実行方法: npx tsx scripts/test-security-unit.ts
 * 検証対象:
 *   1. 動的テナントスキーマ名バリデーション (assertValidSchemaName)
 *   2. CSV 数式インジェクション (Formula Injection) 防御 & RFC 4180 エスケープ (escapeCsvCell, generateCsv)
 *   3. 金額・残高の境界値バリデーション (isValidAmount, isValidBalance, parseValidAmount, parseValidBalance)
 *   4. スライディングウィンドウ方式レートリミッター動作 (checkRateLimit, resetRateLimitStore)
 *   5. raw.unsafe 不使用の静的コード走査検査 (SQLインジェクション脆弱性の再発防止)
 */

import fs from "fs";
import path from "path";
import { assertValidSchemaName } from "../src/db";
import { escapeCsvCell, generateCsv } from "../src/lib/csv";
import {
  isValidAmount,
  isValidBalance,
  parseValidAmount,
  parseValidBalance,
  MIN_AMOUNT,
  MAX_AMOUNT,
  MIN_BALANCE,
  MAX_BALANCE,
} from "../src/lib/utils";
import { checkRateLimit, resetRateLimitStore } from "../src/lib/rate-limit";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [ASSERTION FAILED]: ${message}`);
    throw new Error(message);
  } else {
    console.log(`✅ [PASS]: ${message}`);
  }
}

function assertThrows(fn: () => void, message: string) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) {
    console.error(`❌ [ASSERTION FAILED (Expected throw)]: ${message}`);
    throw new Error(`Expected function to throw, but it did not: ${message}`);
  } else {
    console.log(`✅ [PASS (Exception Thrown)]: ${message}`);
  }
}

console.log("=================================================");
console.log("🛡️ Komame Security & Vulnerability Unit Tests");
console.log("=================================================\n");

// =========================================================
// 1. 動的テナントスキーマ名バリデーション (assertValidSchemaName)
// =========================================================
console.log("--- 1. Tenant Schema Name Whitelist Validation ---");

// 正常系
assertValidSchemaName("tenant_demo");
assertValidSchemaName("tenant_household-1");
assertValidSchemaName("tenant_yamada_2026");
assertValidSchemaName("tenant_a");
assert(true, "Valid tenant schema names accepted");

// 異常系: SQL インジェクション、特殊文字、長すぎる名前、形式違反
assertThrows(() => assertValidSchemaName("tenant_'; DROP TABLE users; --"), "SQL injection string rejected");
assertThrows(() => assertValidSchemaName("public"), "Non-tenant schema rejected");
assertThrows(() => assertValidSchemaName(""), "Empty string rejected");
assertThrows(() => assertValidSchemaName("tenant_"), "Empty tenant suffix rejected");
assertThrows(() => assertValidSchemaName("tenant_abc; SELECT 1"), "Stacked query injection rejected");
assertThrows(() => assertValidSchemaName("tenant_abc.table"), "Dot separator rejected");
assertThrows(() => assertValidSchemaName("tenant_abc/def"), "Slash rejected");
assertThrows(() => assertValidSchemaName("tenant_abc$def"), "Dollar sign rejected");
assertThrows(
  () => assertValidSchemaName(`tenant_${"a".repeat(60)}`),
  "Schema name exceeding maximum length (55 chars) rejected"
);

// =========================================================
// 2. CSV 数式インジェクション防御 & エスケープ
// =========================================================
console.log("\n--- 2. CSV Formula Injection Defense & Escaping ---");

// 数式トリガー文字 (=, +, -, @, \t, \r) の無害化
assert(escapeCsvCell("=1+1") === '"\'=1+1"', "Formula trigger = neutralized");
assert(escapeCsvCell("=cmd|' /C calc'!A0") === '"\'=cmd|\' /C calc\'!A0"', "Formula trigger =cmd neutralized");
assert(escapeCsvCell("+SUM(A1:A10)") === '"\'+SUM(A1:A10)"', "Formula trigger + neutralized");
assert(escapeCsvCell("-10%割引") === '"\'-10%割引"', "Formula trigger - in text neutralized");
assert(escapeCsvCell("@admin") === '"\'@admin"', "Formula trigger @ neutralized");
assert(escapeCsvCell("\tmalicious") === '"\'\tmalicious"', "Formula trigger tab neutralized");
assert(escapeCsvCell("\rpayload") === '"\'\rpayload"', "Formula trigger carriage return neutralized");

// 純粋な数値型（負の数を含む）はシングルクォートを付与せずそのまま数値を保持
assert(escapeCsvCell(-500) === '"-500"', "Pure negative number preserved without prefix");
assert(escapeCsvCell(12345) === '"12345"', "Pure positive number preserved without prefix");
assert(escapeCsvCell(0) === '"0"', "Zero number preserved without prefix");

// 特殊文字・ダブルクォートのエスケープ
assert(escapeCsvCell('セブン "新宿店"') === '"セブン ""新宿店"""', "Quotes escaped per RFC 4180");
assert(escapeCsvCell(null) === '""', "Null escaped to empty cell");
assert(escapeCsvCell(undefined) === '""', "Undefined escaped to empty cell");

// generateCsv 出力検証 (BOM + RFC 4180)
const csvOutput = generateCsv(
  ["タイトル", "金額"],
  [
    ["=2*3", 1000],
    ['カフェ "銀座"', -500],
  ]
);
assert(csvOutput.startsWith("\uFEFF"), "UTF-8 BOM header included");
assert(csvOutput.includes('"\'=2*3"'), "Neutralized formula present in CSV");
assert(csvOutput.includes('"-500"'), "Numeric negative value present without neutralization");
assert(csvOutput.includes('"カフェ ""銀座"""'), "Quoted value properly doubled in CSV");

// =========================================================
// 3. 金額・残高の境界値バリデーション
// =========================================================
console.log("\n--- 3. Boundary & Type Validation for Amounts & Balances ---");

// isValidAmount (1 <= amount <= 9,999,999,999)
assert(isValidAmount(MIN_AMOUNT), "MIN_AMOUNT is valid");
assert(isValidAmount(MAX_AMOUNT), "MAX_AMOUNT is valid");
assert(isValidAmount(1500), "Normal integer amount is valid");
assert(isValidAmount("2500"), "String integer amount is valid");
assert(!isValidAmount(0), "Amount 0 is invalid");
assert(!isValidAmount(-1), "Negative amount is invalid");
assert(!isValidAmount(MAX_AMOUNT + 1), "Amount exceeding MAX_AMOUNT is invalid");
assert(!isValidAmount(100.5), "Floating point amount is invalid");
assert(!isValidAmount("abc"), "Alphabet amount is invalid");
assert(!isValidAmount(null), "Null amount is invalid");
assert(!isValidAmount(undefined), "Undefined amount is invalid");
assert(!isValidAmount(NaN), "NaN amount is invalid");
assert(!isValidAmount(Infinity), "Infinity amount is invalid");

// isValidBalance (0 <= balance <= 9,999,999,999)
assert(isValidBalance(MIN_BALANCE), "MIN_BALANCE (0) is valid");
assert(isValidBalance(MAX_BALANCE), "MAX_BALANCE is valid");
assert(isValidBalance(500000), "Normal balance is valid");
assert(isValidBalance("0"), "String '0' balance is valid");
assert(!isValidBalance(-1), "Negative balance is invalid");
assert(!isValidBalance(MAX_BALANCE + 1), "Balance exceeding MAX_BALANCE is invalid");
assert(!isValidBalance(1000.25), "Floating point balance is invalid");

// parseValidAmount & parseValidBalance
assert(parseValidAmount(1000) === 1000, "parseValidAmount parses valid number");
assert(parseValidAmount(" 2000 ") === 2000, "parseValidAmount parses valid string");
assert(parseValidAmount(0) === null, "parseValidAmount returns null for 0");
assert(parseValidAmount("invalid") === null, "parseValidAmount returns null for invalid");
assert(parseValidBalance(0) === 0, "parseValidBalance parses 0");
assert(parseValidBalance("-1") === null, "parseValidBalance returns null for negative");

// =========================================================
// 4. スライディングウィンドウ方式レートリミッター動作
// =========================================================
console.log("\n--- 4. Sliding Window Rate Limiter Verification ---");

const testKey = "test_rate_limit_ip_192_168_1_100";
resetRateLimitStore(testKey);

const config = { limit: 3, windowMs: 5000 };

const res1 = checkRateLimit(testKey, config);
assert(res1.success === true && res1.remaining === 2, "1st request allowed, remaining=2");

const res2 = checkRateLimit(testKey, config);
assert(res2.success === true && res2.remaining === 1, "2nd request allowed, remaining=1");

const res3 = checkRateLimit(testKey, config);
assert(res3.success === true && res3.remaining === 0, "3rd request allowed, remaining=0");

const res4 = checkRateLimit(testKey, config);
assert(res4.success === false, "4th request blocked by rate limiter");
assert(res4.retryAfterSeconds >= 1, "retryAfterSeconds returned when blocked");
assert(res4.remaining === 0, "remaining is 0 when blocked");

// リセット動作
resetRateLimitStore(testKey);
const resAfterReset = checkRateLimit(testKey, config);
assert(resAfterReset.success === true && resAfterReset.remaining === 2, "Request allowed after resetRateLimitStore");
resetRateLimitStore(testKey);

// =========================================================
// 5. raw.unsafe 不使用の静的コード検査 (SQLインジェクション完全根絶)
// =========================================================
console.log("\n--- 5. Static Code Analysis: Verify Zero Usages of raw.unsafe ---");

function scanDirectory(dir: string, fileList: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".next" && entry.name !== ".git") {
        scanDirectory(fullPath, fileList);
      }
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const srcDir = path.resolve(process.cwd(), "src");
const allSourceFiles = scanDirectory(srcDir);
assert(allSourceFiles.length > 0, `Scanned ${allSourceFiles.length} source files under src/`);

const violations: { file: string; line: number; text: string }[] = [];

for (const filePath of allSourceFiles) {
  // LF 正規化の徹底 (Windows / CRLF 非依存)
  const content = fs.readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");
  const lines = content.split("\n");

  lines.forEach((lineText, idx) => {
    // raw.unsafe( または .raw.unsafe などの直接実行パターンを検出
    // コメント行や型定義を除外
    const trimmed = lineText.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;

    if (/\braw\.unsafe\s*\(/.test(lineText) || /\.raw\.unsafe\b/.test(lineText)) {
      violations.push({
        file: path.relative(process.cwd(), filePath).replace(/\\/g, "/"),
        line: idx + 1,
        text: trimmed,
      });
    }
  });
}

if (violations.length > 0) {
  console.error("❌ Detected raw.unsafe usages in src/:");
  violations.forEach((v) => {
    console.error(`   - ${v.file}:${v.line} -> ${v.text}`);
  });
}

assert(
  violations.length === 0,
  `Zero occurrences of raw.unsafe in production source code (Found: ${violations.length})`
);

console.log("\n=================================================");
console.log("🎉 ALL SECURITY UNIT TESTS & STATIC CHECKS PASSED!");
console.log("=================================================");
