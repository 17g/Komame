/**
 * 費目マスター管理 バリデーション・標準12費目保護ロジック 単体テスト
 * 実行方法: npx tsx scripts/test-categories-unit.ts
 */

import {
  isSystemProtectedCategory,
  validateCategoryInput,
  validateReorderIds,
  DEFAULT_CATEGORY_ICON,
  DEFAULT_CATEGORY_COLOR,
} from "../src/lib/category-helpers";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [ASSERTION FAILED]: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ [PASS]: ${message}`);
}

console.log("=================================================");
console.log("🏷️ Komame Category Master Unit Tests");
console.log("=================================================\n");

// 1. 標準12費目の保護判定
console.log("--- 1. System Category Protection ---");
assert(isSystemProtectedCategory({ id: "cat-food", isSystem: false }), "Seed ID cat-food is protected");
assert(isSystemProtectedCategory({ id: "cat-invest", isSystem: null }), "Seed ID cat-invest is protected");
assert(
  isSystemProtectedCategory({ id: "cat_food_hh_12345", isSystem: false }),
  "Signup ID cat_food_hh_12345 is protected"
);
assert(
  isSystemProtectedCategory({ id: "cat_invest_hh-abc_1", isSystem: undefined }),
  "Signup ID cat_invest_hh-abc_1 is protected"
);
assert(
  isSystemProtectedCategory({ id: "cat_custom_xyz", isSystem: true }),
  "Explicit isSystem=true is protected"
);
assert(
  !isSystemProtectedCategory({ id: "cat_9f8e7d6c5b4a3210", isSystem: false }),
  "Custom UUID category is NOT protected"
);
assert(
  !isSystemProtectedCategory({ id: "cat_food_custom", isSystem: false }) === false,
  "Pattern cat_food_* matches standard signup pattern"
);

// 2. 費目入力バリデーション
console.log("\n--- 2. Category Input Validation ---");
const v1 = validateCategoryInput({ name: "  ペット費  ", icon: "🐾", color: "#ea580c" });
assert(v1.ok && v1.data.name === "ペット費" && v1.data.color === "#EA580C", "Valid input trimmed & normalized");

const v2 = validateCategoryInput({ name: "サブスク" });
assert(
  v2.ok && v2.data.icon === DEFAULT_CATEGORY_ICON && v2.data.color === DEFAULT_CATEGORY_COLOR,
  "Defaults applied for omitted icon and color"
);

const vEmpty = validateCategoryInput({ name: "   " });
assert(!vEmpty.ok, "Blank name rejected");

const vTooLong = validateCategoryInput({ name: "あ".repeat(101) });
assert(!vTooLong.ok, "Name exceeding 100 chars rejected");

const vBadColor = validateCategoryInput({ name: "習い事", color: "red" });
assert(!vBadColor.ok, "Invalid color format rejected");

const vBadIcon = validateCategoryInput({ name: "習い事", icon: "x".repeat(51) });
assert(!vBadIcon.ok, "Icon exceeding 50 chars rejected");

// 3. 並び替えID配列バリデーション
console.log("\n--- 3. Reorder IDs Validation ---");
const rValid = validateReorderIds(["cat-food", "cat-dining", "cat_custom_1"]);
assert(rValid.ok && rValid.ids.length === 3, "Valid orderedIds accepted");

const rEmpty = validateReorderIds([]);
assert(!rEmpty.ok, "Empty orderedIds rejected");

const rDup = validateReorderIds(["cat-food", "cat-food"]);
assert(!rDup.ok, "Duplicate orderedIds rejected");

const rInvalidItem = validateReorderIds(["cat-food", ""]);
assert(!rInvalidItem.ok, "Blank ID inside orderedIds rejected");

console.log("\n=================================================");
console.log("🎉 ALL CATEGORY MASTER UNIT TESTS PASSED!");
console.log("=================================================");
