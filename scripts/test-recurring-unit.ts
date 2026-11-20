/**
 * 定例支払い（月次固定費・振替）テンプレート管理 & 自動支払い予定明細追加 単体テスト
 *
 * 実行方法: npx tsx scripts/test-recurring-unit.ts
 * 検証対象:
 *   1. 支払基準日 & テンプレート入力バリデーション (parseValidDayOfMonth, validateRecurringTemplateInput)
 *   2. クレジットカード規定引き落とし日の自動連動 (resolveEffectiveDayOfMonth)
 *   3. 「規定支払日の翌日」からの月次サイクル年月・支払予定日算出 (resolveTargetCycleAndDates, getTodayJstIsoDate)
 *   4. 二重生成防止・冪等性判定 (shouldGenerateRecurringCycle)
 *   5. 支払予定日到来時の自動精算対象判定 (isDueForAutoSettlement)
 *   6. API・UI におけるヘルパー利用・残高整合性ガード・自動同期の静的コード検査
 */

import fs from "fs";
import path from "path";
import {
  DEFAULT_CREDIT_CARD_WITHDRAWAL_DAY,
  END_OF_MONTH_DAY,
  MAX_RECURRING_NOTE_LENGTH,
  MAX_RECURRING_TITLE_LENGTH,
  getDaysInMonth,
  getTodayJstIsoDate,
  isDueForAutoSettlement,
  isValidDayOfMonth,
  parseValidDayOfMonth,
  resolveDayInMonth,
  resolveEffectiveDayOfMonth,
  resolveTargetCycleAndDates,
  shouldGenerateRecurringCycle,
  validateRecurringTemplateInput,
} from "../src/lib/recurring-helpers";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [ASSERTION FAILED]: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ [PASS]: ${message}`);
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
    throw new Error(`Expected exception: ${message}`);
  }
  console.log(`✅ [PASS (Exception Thrown)]: ${message}`);
}

console.log("=================================================");
console.log("🔁 Komame Recurring Templates Unit Tests");
console.log("=================================================\n");

// =========================================================
// 1. 支払基準日 & テンプレート入力バリデーション
// =========================================================
console.log("--- 1. Day of Month & Template Input Validation ---");

assert(parseValidDayOfMonth(1) === 1, "支払日下限 1日を受理する");
assert(parseValidDayOfMonth(28) === 28, "支払日上限 28日を受理する");
assert(parseValidDayOfMonth("15") === 15, "文字列の整数 '15' を受理する");
assert(parseValidDayOfMonth(END_OF_MONTH_DAY) === 99, "月末コード 99 を受理する");
assert(isValidDayOfMonth(27), "isValidDayOfMonth(27) が true");

assert(parseValidDayOfMonth(0) === null, "0日を拒否する");
assert(parseValidDayOfMonth(29) === null, "29日を拒否する（1〜28または99のみ許可）");
assert(parseValidDayOfMonth(31) === null, "31日を拒否する");
assert(parseValidDayOfMonth(-5) === null, "負の日付を拒否する");
assert(parseValidDayOfMonth(15.5) === null, "小数の日付を拒否する");
assert(parseValidDayOfMonth("abc") === null, "非数字文字列の日付を拒否する");

const validExpense = validateRecurringTemplateInput({
  type: "expense",
  title: "  マンション家賃  ",
  amount: 85000,
  categoryId: "cat_housing",
  paymentMethodId: "pm_bank",
  dayOfMonth: 27,
  note: "  毎月27日引き落とし  ",
});
assert(
  validExpense.ok &&
    validExpense.data.type === "expense" &&
    validExpense.data.title === "マンション家賃" &&
    validExpense.data.amount === 85000 &&
    validExpense.data.dayOfMonth === 27 &&
    validExpense.data.note === "毎月27日引き落とし" &&
    validExpense.data.isActive === true,
  "定例支出テンプレートの正常入力でトリムと既定値 isActive=true が適用される"
);

const validTransfer = validateRecurringTemplateInput({
  type: "transfer",
  title: "生活費口座へ定期振替",
  amount: 50000,
  categoryId: "cat_should_be_cleared",
  paymentMethodId: "pm_should_be_cleared",
  fromAccountId: "acc_main",
  toAccountId: "acc_sub",
  dayOfMonth: END_OF_MONTH_DAY,
  isActive: false,
});
assert(
  validTransfer.ok &&
    validTransfer.data.type === "transfer" &&
    validTransfer.data.fromAccountId === "acc_main" &&
    validTransfer.data.toAccountId === "acc_sub" &&
    validTransfer.data.categoryId === null &&
    validTransfer.data.paymentMethodId === null &&
    validTransfer.data.dayOfMonth === 99 &&
    validTransfer.data.isActive === false,
  "定例振替テンプレートでは categoryId / paymentMethodId が null 正規化され月末 99 を受理する"
);

assert(
  !validateRecurringTemplateInput({
    type: "transfer",
    title: "不正な同一口座振替",
    amount: 10000,
    fromAccountId: "acc_main",
    toAccountId: "acc_main",
    dayOfMonth: 10,
  }).ok,
  "振替時に出金元と入金先が同一口座の場合は拒否する"
);

assert(
  !validateRecurringTemplateInput({
    type: "transfer",
    title: "入金先欠落",
    amount: 10000,
    fromAccountId: "acc_main",
    dayOfMonth: 10,
  }).ok,
  "振替時に入金先口座が未指定の場合は拒否する"
);

assert(
  !validateRecurringTemplateInput({
    type: "income",
    title: "無効種別",
    amount: 10000,
    dayOfMonth: 10,
  }).ok,
  "expense / transfer 以外の取引種別を拒否する"
);

assert(
  !validateRecurringTemplateInput({
    type: "expense",
    title: "   ",
    amount: 1000,
    dayOfMonth: 10,
  }).ok,
  "空白のみのテンプレート名を拒否する"
);

assert(
  !validateRecurringTemplateInput({
    type: "expense",
    title: "あ".repeat(MAX_RECURRING_TITLE_LENGTH + 1),
    amount: 1000,
    dayOfMonth: 10,
  }).ok,
  `${MAX_RECURRING_TITLE_LENGTH}文字超過のテンプレート名を拒否する`
);

assert(
  !validateRecurringTemplateInput({
    type: "expense",
    title: "スマホ代",
    amount: 0,
    dayOfMonth: 10,
  }).ok,
  "金額 0円を拒否する"
);

assert(
  !validateRecurringTemplateInput({
    type: "expense",
    title: "スマホ代",
    amount: 10_000_000_000,
    dayOfMonth: 10,
  }).ok,
  "上限超過の金額 (100億円) を拒否する"
);

assert(
  !validateRecurringTemplateInput({
    type: "expense",
    title: "スマホ代",
    amount: 3000,
    dayOfMonth: 10,
    note: "a".repeat(MAX_RECURRING_NOTE_LENGTH + 1),
  }).ok,
  `${MAX_RECURRING_NOTE_LENGTH}文字超過のメモを拒否する`
);

assert(
  !validateRecurringTemplateInput({
    type: "expense",
    title: "スマホ代",
    amount: 3000,
    dayOfMonth: 10,
    isActive: "true",
  }).ok,
  "真偽値以外の isActive を拒否する"
);

// =========================================================
// 2. クレジットカード規定引き落とし日の自動連動
// =========================================================
console.log("\n--- 2. Credit Card Withdrawal Day Auto-Resolution ---");

assert(
  resolveEffectiveDayOfMonth({
    type: "expense",
    dayOfMonth: 5,
    paymentMethod: { type: "credit_card", withdrawalDay: 10 },
  }) === 10,
  "クレカ選択時は指定日(5日)に関わらずカードの規定引き落とし日(10日)を自動適用する"
);

assert(
  resolveEffectiveDayOfMonth({
    type: "expense",
    dayOfMonth: 5,
    paymentMethod: { type: "credit_card", withdrawalDay: null },
  }) === DEFAULT_CREDIT_CARD_WITHDRAWAL_DAY,
  `クレカの引き落とし日未設定時はデフォルト ${DEFAULT_CREDIT_CARD_WITHDRAWAL_DAY}日 を適用する`
);

assert(
  resolveEffectiveDayOfMonth({
    type: "expense",
    dayOfMonth: undefined,
    paymentMethod: { type: "credit_card", withdrawalDay: 99 },
  }) === 99,
  "クレカの引き落とし日が月末(99)の場合は 99 を適用する"
);

assert(
  resolveEffectiveDayOfMonth({
    type: "expense",
    dayOfMonth: 15,
    paymentMethod: { type: "debit_card", withdrawalDay: 27 },
  }) === 15,
  "非クレカ決済時は入力された支払基準日(15日)を適用する"
);

assert(
  resolveEffectiveDayOfMonth({
    type: "transfer",
    dayOfMonth: 25,
    paymentMethod: { type: "credit_card", withdrawalDay: 10 },
  }) === 25,
  "振替種別時はクレカ情報に影響されず指定日(25日)を適用する"
);

const validatedCardExpense = validateRecurringTemplateInput(
  {
    type: "expense",
    title: "インターネット回線",
    amount: 5500,
    categoryId: "cat_comm",
    paymentMethodId: "pm_rakuten_card",
    // dayOfMonth を省略してもクレカ規定日が自動解決されること
  },
  { type: "credit_card", withdrawalDay: 27 }
);
assert(
  validatedCardExpense.ok && validatedCardExpense.data.dayOfMonth === 27,
  "クレカ定例支出のバリデーションで dayOfMonth 省略時でもカード規定日(27日)が自動適用される"
);

// =========================================================
// 3. 「規定支払日の翌日」からの月次サイクル・支払予定日算出
// =========================================================
console.log("\n--- 3. Target Cycle & Scheduled Withdrawal Date Calculation ---");

assert(getDaysInMonth(2026, 2) === 28, "2026年2月の末日は 28日");
assert(getDaysInMonth(2024, 2) === 29, "閏年 2024年2月の末日は 29日");
assert(resolveDayInMonth(2026, 2, END_OF_MONTH_DAY) === 28, "2026年2月の月末コード(99)は 28日");
assert(resolveDayInMonth(2024, 2, END_OF_MONTH_DAY) === 29, "閏年 2024年2月の月末コード(99)は 29日");
assert(resolveDayInMonth(2026, 4, 31) === 30, "4月に対する31日指定は 30日に丸められる");

// 当日までは当月サイクル
const onPaymentDay = resolveTargetCycleAndDates("2026-11-27", 27);
assert(
  onPaymentDay.targetCycleMonth === "2026-11" &&
    onPaymentDay.scheduledWithdrawalDate === "2026-11-27" &&
    onPaymentDay.date === "2026-11-27",
  "支払基準日当日 (2026-11-27, 支払日27) は当月サイクル 2026-11 を返す"
);

// 規定支払日の翌日から翌月サイクル
const nextDayAfterPayment = resolveTargetCycleAndDates("2026-11-28", 27);
assert(
  nextDayAfterPayment.targetCycleMonth === "2026-12" &&
    nextDayAfterPayment.scheduledWithdrawalDate === "2026-12-27" &&
    nextDayAfterPayment.date === "2026-12-27",
  "支払基準日の翌日 (2026-11-28, 支払日27) は翌月サイクル 2026-12 (2026-12-27) を返す"
);

// 年末跨ぎ (12月28日 -> 翌年1月サイクル)
const yearRollover = resolveTargetCycleAndDates("2026-12-28", 27);
assert(
  yearRollover.targetCycleMonth === "2027-01" &&
    yearRollover.scheduledWithdrawalDate === "2027-01-27",
  "12月の支払日翌日 (2026-12-28, 支払日27) は翌年1月サイクル 2027-01 (2027-01-27) を返す"
);

// 月末指定 (99) の挙動: 当月末日は当月、翌月1日以降は翌月末日
const onEndOfMonth = resolveTargetCycleAndDates("2026-01-31", END_OF_MONTH_DAY);
assert(
  onEndOfMonth.targetCycleMonth === "2026-01" &&
    onEndOfMonth.scheduledWithdrawalDate === "2026-01-31",
  "月末当日 (2026-01-31, 支払日99) は当月サイクル 2026-01-31 を返す"
);

const afterEndOfMonth = resolveTargetCycleAndDates("2026-02-01", END_OF_MONTH_DAY);
assert(
  afterEndOfMonth.targetCycleMonth === "2026-02" &&
    afterEndOfMonth.scheduledWithdrawalDate === "2026-02-28",
  "2月1日 (支払日99) は 2026-02-28 を返す"
);

const leapAfterEndOfMonth = resolveTargetCycleAndDates("2024-02-01", END_OF_MONTH_DAY);
assert(
  leapAfterEndOfMonth.targetCycleMonth === "2024-02" &&
    leapAfterEndOfMonth.scheduledWithdrawalDate === "2024-02-29",
  "閏年 2024年2月1日 (支払日99) は 2024-02-29 を返す"
);

// JST 日付変換検証 (UTC 2026-11-20T15:30:00Z = JST 2026-11-21T00:30:00+09:00)
const jstDate = getTodayJstIsoDate(new Date("2026-11-20T15:30:00.000Z"));
assert(jstDate === "2026-11-21", "getTodayJstIsoDate が UTC+9 基準で日付境界を正しく算出する");

assertThrows(
  () => resolveTargetCycleAndDates("2026-02-30", 15),
  "存在しない基準日 (2026-02-30) で例外をスローする"
);
assertThrows(
  () => resolveTargetCycleAndDates("2026-11-20", 35),
  "範囲外の支払日 (35) で例外をスローする"
);

// =========================================================
// 4. 二重生成防止・冪等性判定 (shouldGenerateRecurringCycle)
// =========================================================
console.log("\n--- 4. Idempotency & Duplicate Prevention ---");

assert(
  shouldGenerateRecurringCycle({
    isActive: true,
    lastGeneratedMonth: null,
    targetCycleMonth: "2026-11",
  }),
  "有効テンプレートの初回 (lastGeneratedMonth=null) は生成対象 (true)"
);

assert(
  !shouldGenerateRecurringCycle({
    isActive: false,
    lastGeneratedMonth: null,
    targetCycleMonth: "2026-11",
  }),
  "一時停止中 (isActive=false) のテンプレートは生成対象外 (false)"
);

assert(
  !shouldGenerateRecurringCycle({
    isActive: true,
    lastGeneratedMonth: "2026-11",
    targetCycleMonth: "2026-11",
  }),
  "同一サイクル月が既に生成済み (lastGeneratedMonth === targetCycleMonth) の場合は二重生成しない (false)"
);

assert(
  shouldGenerateRecurringCycle({
    isActive: true,
    lastGeneratedMonth: "2026-11",
    targetCycleMonth: "2026-12",
  }),
  "翌月サイクルへ遷移した (2026-11 -> 2026-12) 場合は新規生成対象 (true)"
);

assert(
  !shouldGenerateRecurringCycle({
    isActive: true,
    lastGeneratedMonth: "2026-12",
    targetCycleMonth: "2026-11",
  }),
  "過去サイクル月に対して逆行生成しない (false)"
);

// =========================================================
// 5. 支払予定日到来時の自動精算判定 (isDueForAutoSettlement)
// =========================================================
console.log("\n--- 5. Auto-Settlement Eligibility Check ---");

assert(
  isDueForAutoSettlement(
    {
      isSettled: false,
      scheduledWithdrawalDate: "2026-11-20",
      deletedAt: null,
      recurringTemplateId: "tpl_001",
    },
    "debit_card",
    "2026-11-20"
  ),
  "非クレカ・未精算・支払予定日当日 (2026-11-20 <= 2026-11-20) は自動精算対象 (true)"
);

assert(
  isDueForAutoSettlement(
    {
      isSettled: false,
      scheduledWithdrawalDate: "2026-11-18",
      deletedAt: null,
      recurringTemplateId: "tpl_002",
    },
    null, // 口座間振替など決済手段なし
    "2026-11-20"
  ),
  "口座間振替 (paymentMethodType=null) の支払日過去分も自動精算対象 (true)"
);

assert(
  !isDueForAutoSettlement(
    {
      isSettled: false,
      scheduledWithdrawalDate: "2026-11-21",
      deletedAt: null,
      recurringTemplateId: "tpl_001",
    },
    "debit_card",
    "2026-11-20"
  ),
  "支払予定日が未来 (2026-11-21 > 2026-11-20) の場合は未精算のまま維持 (false)"
);

assert(
  !isDueForAutoSettlement(
    {
      isSettled: false,
      scheduledWithdrawalDate: "2026-11-15",
      deletedAt: null,
      recurringTemplateId: "tpl_cc",
    },
    "credit_card",
    "2026-11-20"
  ),
  "クレジットカード決済は自動個別残高精算の対象外 (false)"
);

assert(
  !isDueForAutoSettlement(
    {
      isSettled: true,
      scheduledWithdrawalDate: "2026-11-15",
      deletedAt: null,
      recurringTemplateId: "tpl_001",
    },
    "debit_card",
    "2026-11-20"
  ),
  "既に精算済み (isSettled=true) の明細は二重精算しない (false)"
);

assert(
  !isDueForAutoSettlement(
    {
      isSettled: false,
      scheduledWithdrawalDate: "2026-11-15",
      deletedAt: new Date(),
      recurringTemplateId: "tpl_001",
    },
    "debit_card",
    "2026-11-20"
  ),
  "論理削除済み明細 (deletedAt != null) は自動精算対象外 (false)"
);

assert(
  !isDueForAutoSettlement(
    {
      isSettled: false,
      scheduledWithdrawalDate: "2026-11-15",
      deletedAt: null,
      recurringTemplateId: null,
    },
    "debit_card",
    "2026-11-20"
  ),
  "定例テンプレート由来でない明細 (recurringTemplateId=null) は対象外 (false)"
);

// =========================================================
// 6. API・UI 静的コード検査 (CRLF -> LF 正規化)
// =========================================================
console.log("\n--- 6. Static Code Inspection (API, Balance Guards & UI) ---");
const projectRoot = path.resolve(__dirname, "..");

const recurringApiSource = fs
  .readFileSync(path.join(projectRoot, "src/app/api/recurring-templates/route.ts"), "utf-8")
  .replace(/\r\n/g, "\n");
assert(
  recurringApiSource.includes("validateRecurringTemplateInput") &&
    recurringApiSource.includes("resolveEffectiveDayOfMonth") &&
    recurringApiSource.includes("resolveTargetCycleAndDates") &&
    recurringApiSource.includes("shouldGenerateRecurringCycle") &&
    recurringApiSource.includes("isDueForAutoSettlement"),
  "/api/recurring-templates が recurring-helpers の検証・サイクル計算・冪等性・自動精算判定をすべて使用している"
);
assert(
  recurringApiSource.includes("db.transaction(") &&
    recurringApiSource.includes("auditLogs") &&
    recurringApiSource.includes("existingCycleTx"),
  "/api/recurring-templates が db.transaction 内で監査ログ記録と同一サイクル重複生成ガードを実施している"
);

const transactionsApiSource = fs
  .readFileSync(path.join(projectRoot, "src/app/api/transactions/route.ts"), "utf-8")
  .replace(/\r\n/g, "\n");
assert(
  transactionsApiSource.includes("isUnsettledRecurring") &&
    transactionsApiSource.includes("recurringTemplateId"),
  "/api/transactions が未精算の定例支払い予定明細に対する残高整合性ガードを実装している"
);

const revertApiSource = fs
  .readFileSync(path.join(projectRoot, "src/app/api/admin/revert/route.ts"), "utf-8")
  .replace(/\r\n/g, "\n");
assert(
  revertApiSource.includes("recurringTemplateId") && revertApiSource.includes("!t.isSettled"),
  "/api/admin/revert が未精算の定例支払い予定明細リバート時の誤った残高逆算を防止している"
);

const recurringUiSource = fs
  .readFileSync(path.join(projectRoot, "src/components/RecurringTemplatesSection.tsx"), "utf-8")
  .replace(/\r\n/g, "\n");
assert(
  recurringUiSource.includes("validateRecurringTemplateInput") &&
    recurringUiSource.includes("/api/recurring-templates"),
  "RecurringTemplatesSection.tsx が共通バリデーションと API 連携を使用している"
);

const mainPageSource = fs
  .readFileSync(path.join(projectRoot, "src/app/page.tsx"), "utf-8")
  .replace(/\r\n/g, "\n");
assert(
  mainPageSource.includes("/api/recurring-templates?autoSync=true"),
  "src/app/page.tsx が起動・データ取得時に月次自動同期 (/api/recurring-templates?autoSync=true) を呼び出している"
);

console.log("\n=================================================");
console.log("🎉 ALL RECURRING TEMPLATES UNIT TESTS PASSED!");
console.log("=================================================");
