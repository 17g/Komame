import {
  parseCsv,
  detectColumnMapping,
  normalizeDate,
  normalizeAmount,
  normalizeType,
  generateCsv,
  escapeCsvCell,
} from "../src/lib/csv";


function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [ASSERTION FAILED]: ${message}`);
    throw new Error(message);
  } else {
    console.log(`✅ [PASS]: ${message}`);
  }
}

console.log("=========================================");
console.log("🧪 CSV Parser & Normalizer Unit Tests");
console.log("=========================================");

// Test 1: Basic parsing & RFC 4180 quotes
const csvSample1 = `日付,店舗・取引先,金額,費目,支払手段,メモ
2026-10-15,"セブン-イレブン, 新宿店",1200,食費,三井住友カード,"お弁当, お茶"
2026/10/16,"スターバックス ""渋谷店""",650,カフェ,PayPay,ラテ
`;

const res1 = parseCsv(csvSample1);
assert(res1.headers.length === 6, "Headers count is 6");
assert(res1.rows.length === 2, "Rows count is 2");
assert(res1.rows[0][1] === "セブン-イレブン, 新宿店", "Quotes with comma parsed correctly");
assert(res1.rows[1][1] === 'スターバックス "渋谷店"', 'Escaped quotes parsed correctly');

// Test 2: UTF-8 BOM
const csvWithBom = `\uFEFF日付,金額,店舗
2026-10-17,500,スーパー
`;
const res2 = parseCsv(csvWithBom);
assert(res2.headers[0] === "日付", "BOM removed from first header");

// Test 3: detectColumnMapping
const mapping = detectColumnMapping(res1.headers);
assert(mapping.dateCol === 0, "dateCol detected at 0");
assert(mapping.shopNameCol === 1, "shopNameCol detected at 1");
assert(mapping.amountCol === 2, "amountCol detected at 2");
assert(mapping.categoryCol === 3, "categoryCol detected at 3");
assert(mapping.paymentMethodCol === 4, "paymentMethodCol detected at 4");
assert(mapping.noteCol === 5, "noteCol detected at 5");

// Test 4: normalizeDate
assert(normalizeDate("2026-10-17") === "2026-10-17", "Standard YYYY-MM-DD");
assert(normalizeDate("2026/10/17") === "2026-10-17", "Slash YYYY/MM/DD");
assert(normalizeDate("2026年10月17日") === "2026-10-17", "Japanese date format");
assert(normalizeDate("invalid") === null, "Invalid date returns null");

// Test 5: normalizeAmount
assert(normalizeAmount("1,200") === 1200, "Amount with comma");
assert(normalizeAmount("¥3,500") === 3500, "Amount with yen sign");
assert(normalizeAmount(500) === 500, "Numeric amount");
assert(normalizeAmount("-100") === 100, "Negative string amount normalized to positive");
assert(normalizeAmount("0") === null, "Zero amount returns null");
assert(normalizeAmount("abc") === null, "Non-numeric amount returns null");

// Test 6: normalizeType
assert(normalizeType("支出") === "expense", "Type 支出");
assert(normalizeType("収入") === "income", "Type 収入");
assert(normalizeType("振替") === "transfer", "Type 振替");
assert(normalizeType(undefined) === "expense", "Default type expense");

// Test 7: escapeCsvCell
assert(escapeCsvCell("simple") === '"simple"', "Simple string cell escaped");
assert(escapeCsvCell('with "quote"') === '"with ""quote"""', "Quote cell escaped");
assert(escapeCsvCell(null) === '""', "Null cell escaped to empty quotes");
assert(escapeCsvCell(1234) === '"1234"', "Number cell escaped");

// Test 8: generateCsv (BOM + RFC 4180)
const genCsv = generateCsv(
  ["ログID", "操作種別", "概要"],
  [
    ["log_1", "CREATE", 'セブン-イレブン, 新宿店 "お弁当"'],
    ["log_2", "DELETE", "明細の削除"],
  ]
);
assert(genCsv.startsWith("\uFEFF"), "Generated CSV starts with UTF-8 BOM");
const parsedBack = parseCsv(genCsv);
assert(parsedBack.headers.length === 3, "Parsed headers count is 3");
assert(parsedBack.rows.length === 2, "Parsed rows count is 2");
assert(parsedBack.rows[0][2] === 'セブン-イレブン, 新宿店 "お弁当"', "Generated and parsed round-trip matches");

console.log("=========================================");
console.log("🎉 All CSV Unit Tests Passed!");
console.log("=========================================");

