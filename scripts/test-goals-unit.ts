/**
 * 貯蓄目標管理（編集・未達成目標削除・達成済みアーカイブ/復元・合算進捗集計）単体テスト
 *
 * 実行方法: npx tsx scripts/test-goals-unit.ts
 * 検証対象:
 *   1. 日付検証・目標入力バリデーション (isValidIsoDateString, validateGoalInput)
 *   2. 積立額合算・達成率・達成判定 (calculateGoalCurrentAmount, calculateGoalProgressRate, isGoalAchieved)
 *   3. 未達成のみ削除可・達成済み/アーカイブ済み削除拒否ガード (canDeleteGoal)
 *   4. 達成済みのみアーカイブ可・復元可否判定 (canArchiveGoal, canRestoreGoal)
 *   5. 進行中目標のみの合算進捗集計・アーカイブ除外ロジック (calculateActiveGoalsSummary)
 *   6. API・UI におけるヘルパー利用および削除保護ガードの静的コード検査
 */

import fs from "fs";
import path from "path";
import {
  DEFAULT_GOAL_COLOR,
  MAX_GOAL_TITLE_LENGTH,
  isValidIsoDateString,
  validateGoalInput,
  calculateGoalCurrentAmount,
  calculateGoalProgressRate,
  isGoalAchieved,
  canDeleteGoal,
  canArchiveGoal,
  canRestoreGoal,
  calculateActiveGoalsSummary,
} from "../src/lib/goal-helpers";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [ASSERTION FAILED]: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ [PASS]: ${message}`);
}

console.log("=================================================");
console.log("🎯 Komame Savings Goals Unit Tests");
console.log("=================================================\n");

// =========================================================
// 1. 日付検証 & 目標入力バリデーション
// =========================================================
console.log("--- 1. ISO Date & Goal Input Validation ---");

assert(isValidIsoDateString("2026-12-31"), "有効な日付 2026-12-31 を受理する");
assert(isValidIsoDateString("2024-02-29"), "閏年 2024-02-29 を受理する");
assert(!isValidIsoDateString("2025-02-29"), "非閏年 2025-02-29 を拒否する");
assert(!isValidIsoDateString("2026-04-31"), "実在しない日付 2026-04-31 を拒否する");
assert(!isValidIsoDateString("2026/12/31"), "スラッシュ区切り 2026/12/31 を拒否する");

const validMinimal = validateGoalInput({
  title: "  マイホーム頭金  ",
  targetAmount: 3000000,
});
assert(
  validMinimal.ok &&
    validMinimal.data.title === "マイホーム頭金" &&
    validMinimal.data.targetAmount === 3000000 &&
    validMinimal.data.targetDate === null &&
    validMinimal.data.accountIds.length === 0 &&
    validMinimal.data.color === DEFAULT_GOAL_COLOR,
  "最小入力で前後トリム・デフォルトカラー・null予定日・空口座配列が適用される"
);

const validFull = validateGoalInput({
  title: "沖縄家族旅行",
  targetAmount: 250000,
  targetDate: " 2027-08-15 ",
  accountIds: ["acc_bank_1", " acc_bank_2 ", "acc_bank_1"],
  color: " #2563eb ",
});
assert(
  validFull.ok &&
    validFull.data.targetDate === "2027-08-15" &&
    validFull.data.accountIds.length === 2 &&
    validFull.data.accountIds[0] === "acc_bank_1" &&
    validFull.data.accountIds[1] === "acc_bank_2" &&
    validFull.data.color === "#2563EB",
  "完全入力で日付トリム・口座ID重複排除・カラー大文字正規化が適用される"
);

const minBoundary = validateGoalInput({ title: "最小目標", targetAmount: 1 });
assert(minBoundary.ok && minBoundary.data.targetAmount === 1, "目標金額下限 1円を受理する");

const maxBoundary = validateGoalInput({
  title: "あ".repeat(MAX_GOAL_TITLE_LENGTH),
  targetAmount: 9_999_999_999,
});
assert(
  maxBoundary.ok && maxBoundary.data.targetAmount === 9_999_999_999,
  `タイトル上限 (${MAX_GOAL_TITLE_LENGTH}文字) および目標金額上限 9,999,999,999円を受理する`
);

assert(!validateGoalInput({ title: "   ", targetAmount: 10000 }).ok, "空白のみのタイトルを拒否する");
assert(!validateGoalInput({ title: 123, targetAmount: 10000 }).ok, "文字列以外のタイトルを拒否する");
assert(
  !validateGoalInput({ title: "あ".repeat(MAX_GOAL_TITLE_LENGTH + 1), targetAmount: 10000 }).ok,
  `${MAX_GOAL_TITLE_LENGTH}文字超過のタイトルを拒否する`
);

assert(!validateGoalInput({ title: "目標", targetAmount: 0 }).ok, "目標金額 0円を拒否する");
assert(!validateGoalInput({ title: "目標", targetAmount: -5000 }).ok, "負の目標金額を拒否する");
assert(!validateGoalInput({ title: "目標", targetAmount: 1234.5 }).ok, "小数の目標金額を拒否する");
assert(!validateGoalInput({ title: "目標", targetAmount: 10_000_000_000 }).ok, "上限超過の目標金額を拒否する");
assert(!validateGoalInput({ title: "目標", targetAmount: "abc" }).ok, "非数値の目標金額を拒否する");

assert(
  !validateGoalInput({ title: "目標", targetAmount: 10000, targetDate: "2026-02-30" }).ok,
  "無効な達成予定日 2026-02-30 を拒否する"
);
assert(
  !validateGoalInput({ title: "目標", targetAmount: 10000, targetDate: 20261231 }).ok,
  "文字列以外の達成予定日を拒否する"
);
assert(
  !validateGoalInput({ title: "目標", targetAmount: 10000, accountIds: "acc_1" }).ok,
  "配列以外の accountIds を拒否する"
);
assert(
  !validateGoalInput({ title: "目標", targetAmount: 10000, accountIds: ["acc_1", ""] }).ok,
  "空文字を含む accountIds を拒否する"
);
assert(
  !validateGoalInput({ title: "目標", targetAmount: 10000, color: "green" }).ok,
  "#RRGGBB 形式外のカラーを拒否する"
);

// =========================================================
// 2. 積立額合算・達成率・達成状態判定
// =========================================================
console.log("\n--- 2. Current Amount, Progress Rate & Achievement Check ---");

const sampleAccounts = [
  { id: "acc_1", balance: 150000 },
  { id: "acc_2", balance: 350000 },
  { id: "acc_3", balance: 50000 },
];

assert(
  calculateGoalCurrentAmount(["acc_1", "acc_2", "acc_missing"], sampleAccounts) === 500000,
  "対象口座残高が正しく合算され存在しない口座IDは無視される"
);
assert(calculateGoalCurrentAmount([], sampleAccounts) === 0, "対象口座が空配列の場合は 0円");
assert(calculateGoalCurrentAmount(null, sampleAccounts) === 0, "対象口座が null の場合は 0円");

assert(calculateGoalProgressRate(0, 100000) === 0, "積立額 0 の達成率は 0%");
assert(calculateGoalProgressRate(50000, 100000) === 50, "積立額 50,000 / 100,000 の達成率は 50%");
assert(calculateGoalProgressRate(150000, 100000) === 100, "目標額超過時も達成率は 100% 上限");
assert(calculateGoalProgressRate(-5000, 100000) === 0, "負の残高時は達成率 0%");
assert(calculateGoalProgressRate(50000, 0) === 0, "目標金額 0 以下の場合は安全に 0%");

assert(isGoalAchieved(100000, 100000, false), "現在額 == 目標額 で達成済み判定 (true)");
assert(isGoalAchieved(120000, 100000, false), "現在額 > 目標額 で達成済み判定 (true)");
assert(isGoalAchieved(10000, 100000, true), "金額未満でも isCompleted === true なら達成済み判定 (true)");
assert(!isGoalAchieved(99999, 100000, false), "現在額 < 目標額 かつ isCompleted=false は未達成判定 (false)");

// =========================================================
// 3. 未達成のみ削除可・達成済み削除拒否ガード
// =========================================================
console.log("\n--- 3. Delete Protection Guard (canDeleteGoal) ---");

const deleteUnachieved = canDeleteGoal({
  currentAmount: 50000,
  targetAmount: 100000,
  isCompleted: false,
  isArchived: false,
});
assert(deleteUnachieved.allowed, "未達成かつ未アーカイブの目標は削除許可 (allowed: true)");

const deleteAchievedByAmount = canDeleteGoal({
  currentAmount: 100000,
  targetAmount: 100000,
  isCompleted: false,
  isArchived: false,
});
assert(
  !deleteAchievedByAmount.allowed && typeof deleteAchievedByAmount.reason === "string",
  "残高達成済み (100%到達) の目標は削除拒否 (allowed: false)"
);

const deleteAchievedByFlag = canDeleteGoal({
  currentAmount: 30000,
  targetAmount: 100000,
  isCompleted: true,
  isArchived: false,
});
assert(!deleteAchievedByFlag.allowed, "isCompleted === true の達成済み目標は削除拒否 (allowed: false)");

const deleteArchived = canDeleteGoal({
  currentAmount: 30000,
  targetAmount: 100000,
  isCompleted: false,
  isArchived: true,
});
assert(!deleteArchived.allowed, "アーカイブ済み (isArchived === true) の目標は削除拒否 (allowed: false)");

// =========================================================
// 4. 達成済みのみアーカイブ可・復元可否判定
// =========================================================
console.log("\n--- 4. Archive & Restore Guard (canArchiveGoal, canRestoreGoal) ---");

const archiveAchieved = canArchiveGoal({
  currentAmount: 300000,
  targetAmount: 250000,
  isCompleted: false,
  isArchived: false,
});
assert(archiveAchieved.allowed, "達成済みかつ未アーカイブの目標はアーカイブ許可 (allowed: true)");

const archiveCompletedFlag = canArchiveGoal({
  currentAmount: 0,
  targetAmount: 100000,
  isCompleted: true,
  isArchived: false,
});
assert(archiveCompletedFlag.allowed, "isCompleted === true の目標はアーカイブ許可 (allowed: true)");

const archiveUnachieved = canArchiveGoal({
  currentAmount: 80000,
  targetAmount: 100000,
  isCompleted: false,
  isArchived: false,
});
assert(!archiveUnachieved.allowed, "未達成の目標のアーカイブは拒否 (allowed: false)");

const archiveAlready = canArchiveGoal({
  currentAmount: 100000,
  targetAmount: 100000,
  isCompleted: true,
  isArchived: true,
});
assert(!archiveAlready.allowed, "すでにアーカイブ済みの目標の再アーカイブは拒否 (allowed: false)");

assert(canRestoreGoal({ isArchived: true }).allowed, "アーカイブ済み目標の復元は許可 (allowed: true)");
assert(!canRestoreGoal({ isArchived: false }).allowed, "未アーカイブ目標の復元は拒否 (allowed: false)");
assert(!canRestoreGoal({ isArchived: null }).allowed, "isArchived=null の目標の復元は拒否 (allowed: false)");

// =========================================================
// 5. 合算進捗集計からのアーカイブ除外ロジック
// =========================================================
console.log("\n--- 5. Active Goals Summary (Archive Exclusion) ---");

const emptySummary = calculateActiveGoalsSummary([]);
assert(
  emptySummary.activeCount === 0 &&
    emptySummary.archivedCount === 0 &&
    emptySummary.totalTargetAmount === 0 &&
    emptySummary.totalCurrentAmount === 0 &&
    emptySummary.overallProgressRate === 0,
  "空配列の合算進捗サマリーがすべて 0"
);

const mixedSummary = calculateActiveGoalsSummary([
  { targetAmount: 200000, currentAmount: 100000, isArchived: false },
  { targetAmount: 300000, currentAmount: 150000, isArchived: false },
  { targetAmount: 1000000, currentAmount: 1000000, isArchived: true }, // アーカイブ済み（除外対象）
  { targetAmount: 500000, currentAmount: 500000, isArchived: true }, // アーカイブ済み（除外対象）
]);
assert(
  mixedSummary.activeCount === 2 &&
    mixedSummary.archivedCount === 2 &&
    mixedSummary.totalTargetAmount === 500000 &&
    mixedSummary.totalCurrentAmount === 250000 &&
    mixedSummary.overallProgressRate === 50,
  "アーカイブ済み目標が合算目標額・合算積立額・全体達成率から完全に除外される (250,000 / 500,000 = 50%)"
);

const allArchivedSummary = calculateActiveGoalsSummary([
  { targetAmount: 100000, currentAmount: 100000, isArchived: true },
]);
assert(
  allArchivedSummary.activeCount === 0 &&
    allArchivedSummary.archivedCount === 1 &&
    allArchivedSummary.totalTargetAmount === 0 &&
    allArchivedSummary.totalCurrentAmount === 0 &&
    allArchivedSummary.overallProgressRate === 0,
  "全件アーカイブ済みの場合は進行中サマリーが 0 になる"
);

// =========================================================
// 6. API・UI 静的コード検査 (CRLF -> LF 正規化)
// =========================================================
console.log("\n--- 6. Static Inspection (API & UI Guardrails) ---");
const projectRoot = path.resolve(__dirname, "..");

const goalsApiSource = fs
  .readFileSync(path.join(projectRoot, "src/app/api/goals/route.ts"), "utf-8")
  .replace(/\r\n/g, "\n");
assert(
  goalsApiSource.includes("validateGoalInput") &&
    goalsApiSource.includes("canArchiveGoal") &&
    goalsApiSource.includes("canRestoreGoal") &&
    goalsApiSource.includes("canDeleteGoal"),
  "/api/goals が goal-helpers の検証・削除保護・アーカイブ/復元判定をすべて使用している"
);
assert(
  goalsApiSource.includes("db.transaction(") && goalsApiSource.includes("auditLogs"),
  "/api/goals が db.transaction 内で監査ログ (auditLogs) を記録している"
);

const goalsTabSource = fs
  .readFileSync(path.join(projectRoot, "src/components/GoalsTab.tsx"), "utf-8")
  .replace(/\r\n/g, "\n");
assert(
  goalsTabSource.includes("calculateActiveGoalsSummary") &&
    goalsTabSource.includes("canDeleteGoal") &&
    goalsTabSource.includes("canArchiveGoal"),
  "GoalsTab.tsx がアーカイブ除外合算進捗と削除・アーカイブ判定ヘルパーを使用している"
);

console.log("\n=================================================");
console.log("🎉 ALL SAVINGS GOALS UNIT TESTS PASSED!");
console.log("=================================================");
