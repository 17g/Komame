/**
 * 新規世帯登録の申請・許可制および Super Admin 操作バリデーション 単体テスト
 *
 * 実行方法: npx tsx scripts/test-household-approval-unit.ts
 * 検証対象:
 *   1. 世帯ステータスに基づくアクセス可否判定 (getHouseholdAccessError)
 *   2. Super Admin フィルター・アクション・却下理由バリデーション (super-admin-helpers)
 *   3. 世帯ステータス別件数集計 (buildHouseholdCounts)
 *   4. Super Admin 状態遷移・自己ロックアウト防止・削除ガード (validateSuperAdminHouseholdTransition / Deletion)
 *   5. 承認時初期シードプリセット整合性 (STANDARD_CATEGORY_TEMPLATES / DEFAULT_HOUSEHOLD_SETTINGS)
 *   6. 承認制ガードレール静的コード検査 (signup スキーマ未作成・getCurrentSession 承認検証・Super Admin 認可)
 */

import fs from "fs";
import path from "path";
import { getHouseholdAccessError } from "../src/lib/auth";
import {
  VALID_HOUSEHOLD_STATUS_FILTERS,
  SUPER_ADMIN_ACTIONS,
  MAX_REJECTION_REASON_LENGTH,
  STANDARD_CATEGORY_TEMPLATES,
  DEFAULT_HOUSEHOLD_SETTINGS,
  isValidStatusFilter,
  isValidSuperAdminAction,
  normalizeReasonInput,
  buildHouseholdCounts,
  validateSuperAdminHouseholdTransition,
  validateSuperAdminHouseholdDeletion,
} from "../src/lib/super-admin-helpers";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [ASSERTION FAILED]: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ [PASS]: ${message}`);
}

console.log("=================================================");
console.log("🏠 Komame Household Approval & Super Admin Unit Tests");
console.log("=================================================\n");

// =========================================================
// 1. 世帯ステータスに基づくログイン/アクセス可否判定
// =========================================================
console.log("--- 1. Household Status Access Check (getHouseholdAccessError) ---");
assert(getHouseholdAccessError("approved") === null, "approved 世帯はアクセス許可 (null)");

const pendingErr = getHouseholdAccessError("pending");
assert(
  typeof pendingErr === "string" && pendingErr.includes("承認待ち"),
  "pending 世帯は承認待ちエラーメッセージを返す"
);

const rejectedErr = getHouseholdAccessError("rejected");
assert(
  typeof rejectedErr === "string" && rejectedErr.includes("承認されませんでした"),
  "rejected 世帯は却下エラーメッセージを返す"
);

const suspendedErr = getHouseholdAccessError("suspended");
assert(
  typeof suspendedErr === "string" && suspendedErr.includes("停止"),
  "suspended 世帯は停止エラーメッセージを返す"
);

const unknownErr = getHouseholdAccessError("unknown_status");
assert(
  typeof unknownErr === "string" && unknownErr.length > 0,
  "未知のステータスも非nullエラーで安全に拒否する"
);

// =========================================================
// 2. フィルター・アクション・却下理由バリデーション
// =========================================================
console.log("\n--- 2. Filter, Action & Reason Input Validation ---");
for (const filter of VALID_HOUSEHOLD_STATUS_FILTERS) {
  assert(isValidStatusFilter(filter), `有効フィルター "${filter}" が受理される`);
}
assert(!isValidStatusFilter("invalid"), "無効フィルター \"invalid\" が拒否される");
assert(!isValidStatusFilter(""), "空文字フィルターが拒否される");
assert(!isValidStatusFilter(null), "null フィルターが拒否される");
assert(!isValidStatusFilter(123), "数値フィルターが拒否される");

for (const action of SUPER_ADMIN_ACTIONS) {
  assert(isValidSuperAdminAction(action), `有効アクション "${action}" が受理される`);
}
assert(!isValidSuperAdminAction("delete"), "未定義アクション \"delete\" が拒否される");
assert(!isValidSuperAdminAction(undefined), "undefined アクションが拒否される");

const rUndef = normalizeReasonInput(undefined);
assert(rUndef.ok && rUndef.value === undefined, "reason=undefined はそのまま undefined");

const rNull = normalizeReasonInput(null);
assert(rNull.ok && rNull.value === null, "reason=null は null");

const rBlank = normalizeReasonInput("   ");
assert(rBlank.ok && rBlank.value === null, "空白のみの reason は null に正規化");

const rTrimmed = normalizeReasonInput("  重複アカウントのため却下  ");
assert(
  rTrimmed.ok && rTrimmed.value === "重複アカウントのため却下",
  "reason の前後空白がトリムされる"
);

const rMaxLen = normalizeReasonInput("あ".repeat(MAX_REJECTION_REASON_LENGTH));
assert(rMaxLen.ok, `最大長 (${MAX_REJECTION_REASON_LENGTH}文字) の reason が受理される`);

const rTooLong = normalizeReasonInput("あ".repeat(MAX_REJECTION_REASON_LENGTH + 1));
assert(!rTooLong.ok, `${MAX_REJECTION_REASON_LENGTH}文字超過の reason が拒否される`);

const rNonString = normalizeReasonInput({ text: "bad" });
assert(!rNonString.ok, "文字列以外の reason が拒否される");

// =========================================================
// 3. 世帯ステータス別件数集計
// =========================================================
console.log("\n--- 3. Household Status Counts Aggregation ---");
const emptyCounts = buildHouseholdCounts([]);
assert(
  emptyCounts.all === 0 &&
    emptyCounts.pending === 0 &&
    emptyCounts.approved === 0 &&
    emptyCounts.rejected === 0 &&
    emptyCounts.suspended === 0,
  "空配列の件数集計がすべて 0"
);

const mixedCounts = buildHouseholdCounts([
  { status: "pending" },
  { status: "pending" },
  { status: "approved" },
  { status: "rejected" },
  { status: "suspended" },
  { status: "approved" },
]);
assert(
  mixedCounts.all === 6 &&
    mixedCounts.pending === 2 &&
    mixedCounts.approved === 2 &&
    mixedCounts.rejected === 1 &&
    mixedCounts.suspended === 1,
  "ステータス混在配列の件数集計が正確 (all:6, pending:2, approved:2, rejected:1, suspended:1)"
);

// =========================================================
// 4. Super Admin ステータス遷移・自己ロックアウト防止検証
// =========================================================
console.log("\n--- 4. Super Admin Transition & Self-Lockout Guard ---");

// 4.1 approve
const approvePending = validateSuperAdminHouseholdTransition({
  action: "approve",
  currentStatus: "pending",
  targetHouseholdId: "hh_other",
  actorHouseholdId: "hh_admin",
});
assert(
  approvePending.ok &&
    approvePending.nextStatus === "approved" &&
    approvePending.nextRejectionReason === null,
  "pending -> approve で approved に遷移し rejectionReason がクリアされる"
);

const approveRejected = validateSuperAdminHouseholdTransition({
  action: "approve",
  currentStatus: "rejected",
  targetHouseholdId: "hh_other",
  actorHouseholdId: "hh_admin",
});
assert(
  approveRejected.ok &&
    approveRejected.nextStatus === "approved" &&
    approveRejected.nextRejectionReason === null,
  "rejected -> approve（再承認）が許可され rejectionReason がクリアされる"
);

const approveAlready = validateSuperAdminHouseholdTransition({
  action: "approve",
  currentStatus: "approved",
  targetHouseholdId: "hh_other",
  actorHouseholdId: "hh_admin",
});
assert(!approveAlready.ok && approveAlready.statusCode === 400, "既承認世帯への approve は 400 で拒否");

const approveSuspended = validateSuperAdminHouseholdTransition({
  action: "approve",
  currentStatus: "suspended",
  targetHouseholdId: "hh_other",
  actorHouseholdId: "hh_admin",
});
assert(
  !approveSuspended.ok && approveSuspended.statusCode === 400,
  "suspended 世帯への approve は 400 で拒否（利用再開を案内）"
);

// 4.2 reject
const rejectPending = validateSuperAdminHouseholdTransition({
  action: "reject",
  currentStatus: "pending",
  targetHouseholdId: "hh_other",
  actorHouseholdId: "hh_admin",
  reason: "本人確認不可",
});
assert(
  rejectPending.ok &&
    rejectPending.nextStatus === "rejected" &&
    rejectPending.nextRejectionReason === "本人確認不可",
  "pending -> reject で rejected に遷移し理由が保持される"
);

const rejectSelf = validateSuperAdminHouseholdTransition({
  action: "reject",
  currentStatus: "pending",
  targetHouseholdId: "hh_admin",
  actorHouseholdId: "hh_admin",
});
assert(!rejectSelf.ok && rejectSelf.statusCode === 400, "自世帯に対する reject は 400 で拒否");

const rejectApproved = validateSuperAdminHouseholdTransition({
  action: "reject",
  currentStatus: "approved",
  targetHouseholdId: "hh_other",
  actorHouseholdId: "hh_admin",
});
assert(!rejectApproved.ok && rejectApproved.statusCode === 400, "承認済み世帯への reject は 400 で拒否");

// 4.3 suspend & reactivate
const suspendOther = validateSuperAdminHouseholdTransition({
  action: "suspend",
  currentStatus: "approved",
  targetHouseholdId: "hh_other",
  actorHouseholdId: "hh_admin",
  reason: "規約違反による一時停止",
});
assert(
  suspendOther.ok &&
    suspendOther.nextStatus === "suspended" &&
    suspendOther.nextRejectionReason === "規約違反による一時停止",
  "他世帯 (approved) の suspend が許可される"
);

const suspendSelf = validateSuperAdminHouseholdTransition({
  action: "suspend",
  currentStatus: "approved",
  targetHouseholdId: "hh_admin",
  actorHouseholdId: "hh_admin",
});
assert(
  !suspendSelf.ok && suspendSelf.statusCode === 400,
  "操作中 Super Admin 自身の所属世帯の suspend は 400 で拒否（自己ロックアウト防止）"
);

const suspendPending = validateSuperAdminHouseholdTransition({
  action: "suspend",
  currentStatus: "pending",
  targetHouseholdId: "hh_other",
  actorHouseholdId: "hh_admin",
});
assert(!suspendPending.ok && suspendPending.statusCode === 400, "pending 世帯への suspend は 400 で拒否");

const reactivateSuspended = validateSuperAdminHouseholdTransition({
  action: "reactivate",
  currentStatus: "suspended",
  targetHouseholdId: "hh_other",
  actorHouseholdId: "hh_admin",
});
assert(
  reactivateSuspended.ok &&
    reactivateSuspended.nextStatus === "approved" &&
    reactivateSuspended.nextRejectionReason === null,
  "suspended -> reactivate で approved に復帰し rejectionReason がクリアされる"
);

const reactivateApproved = validateSuperAdminHouseholdTransition({
  action: "reactivate",
  currentStatus: "approved",
  targetHouseholdId: "hh_other",
  actorHouseholdId: "hh_admin",
});
assert(
  !reactivateApproved.ok && reactivateApproved.statusCode === 400,
  "approved 世帯への reactivate は 400 で拒否"
);

// =========================================================
// 5. Super Admin 削除（抹消）ガード検証
// =========================================================
console.log("\n--- 5. Super Admin Deletion Guard Validation ---");
assert(
  validateSuperAdminHouseholdDeletion({
    currentStatus: "pending",
    targetHouseholdId: "hh_other",
    actorHouseholdId: "hh_admin",
  }).ok,
  "他世帯 (pending) の削除が許可される"
);

assert(
  validateSuperAdminHouseholdDeletion({
    currentStatus: "rejected",
    targetHouseholdId: "hh_other",
    actorHouseholdId: "hh_admin",
  }).ok,
  "他世帯 (rejected) の削除が許可される"
);

const delSelf = validateSuperAdminHouseholdDeletion({
  currentStatus: "rejected",
  targetHouseholdId: "hh_admin",
  actorHouseholdId: "hh_admin",
});
assert(!delSelf.ok && delSelf.statusCode === 400, "自世帯の削除は 400 で拒否");

const delApproved = validateSuperAdminHouseholdDeletion({
  currentStatus: "approved",
  targetHouseholdId: "hh_other",
  actorHouseholdId: "hh_admin",
});
assert(!delApproved.ok && delApproved.statusCode === 400, "approved 世帯の削除は 400 で拒否");

const delSuspended = validateSuperAdminHouseholdDeletion({
  currentStatus: "suspended",
  targetHouseholdId: "hh_other",
  actorHouseholdId: "hh_admin",
});
assert(!delSuspended.ok && delSuspended.statusCode === 400, "suspended 世帯の削除は 400 で拒否");

// =========================================================
// 6. 承認時初期シードプリセット整合性検証
// =========================================================
console.log("\n--- 6. Approved Household Default Seed Presets ---");
assert(
  STANDARD_CATEGORY_TEMPLATES.length === 12,
  "標準12費目テンプレートが12件定義されている"
);
const categoryKeys = new Set(STANDARD_CATEGORY_TEMPLATES.map((c) => c.key));
assert(categoryKeys.size === 12, "標準12費目テンプレートのキーに重複がない");
assert(
  STANDARD_CATEGORY_TEMPLATES.every((c, idx) => c.sortOrder === idx + 1),
  "標準12費目の sortOrder が 1..12 の連番である"
);

const settingKeys = new Set(DEFAULT_HOUSEHOLD_SETTINGS.map((s) => s.key));
assert(
  settingKeys.has("currency_symbol") &&
    settingKeys.has("date_format") &&
    settingKeys.has("password_policy"),
  "初期システム設定テンプレートに必須3キーが揃っている"
);

// =========================================================
// 7. 承認制ガードレール 静的コード検査 (CRLF -> LF 正規化)
// =========================================================
console.log("\n--- 7. Static Guardrail Inspection ---");
const projectRoot = path.resolve(__dirname, "..");

const signupSource = fs
  .readFileSync(path.join(projectRoot, "src/app/api/auth/signup/route.ts"), "utf-8")
  .replace(/\r\n/g, "\n");
assert(
  !signupSource.includes("createTenantTables"),
  "signup API で承認前のテナントスキーマ作成 (createTenantTables) を行っていない"
);
assert(
  !signupSource.includes("setSessionCookie"),
  "signup API で承認前のセッション Cookie 発行 (setSessionCookie) を行っていない"
);
assert(
  signupSource.includes('status: "pending"'),
  "signup API が新規世帯を status: \"pending\" で登録している"
);

const authSource = fs
  .readFileSync(path.join(projectRoot, "src/lib/auth.ts"), "utf-8")
  .replace(/\r\n/g, "\n");
assert(
  authSource.includes('record.householdStatus !== "approved"'),
  "getCurrentSession() で householdStatus !== \"approved\" の遮断検証を行っている"
);

const superAdminApiSource = fs
  .readFileSync(path.join(projectRoot, "src/app/api/super-admin/households/route.ts"), "utf-8")
  .replace(/\r\n/g, "\n");
assert(
  superAdminApiSource.includes("!dbUser.isSuperAdmin"),
  "Super Admin API が DB 上の isSuperAdmin フラグをリアルタイム検証している"
);
assert(
  superAdminApiSource.includes("assertValidSchemaName"),
  "Super Admin API がスキーマ生成前に assertValidSchemaName を実行している"
);

console.log("\n=================================================");
console.log("🎉 ALL HOUSEHOLD APPROVAL & SUPER ADMIN UNIT TESTS PASSED!");
console.log("=================================================");
