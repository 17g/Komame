import { parseValidAmount } from "@/lib/utils";

/**
 * 貯蓄目標管理のバリデーション・達成判定・削除/アーカイブ可否判定・合算進捗算出ヘルパー (要件 17-2)
 */

export const DEFAULT_GOAL_COLOR = "#2E7D32";
export const MAX_GOAL_TITLE_LENGTH = 100;

export const GOAL_COLOR_PRESETS = [
  "#2E7D32",
  "#E6A15C",
  "#2563EB",
  "#9333EA",
  "#0D9488",
  "#DC2626",
] as const;

export interface GoalInputPayload {
  title?: unknown;
  targetAmount?: unknown;
  targetDate?: unknown;
  accountIds?: unknown;
  color?: unknown;
}

export interface ValidatedGoalInput {
  title: string;
  targetAmount: number;
  targetDate: string | null;
  accountIds: string[];
  color: string;
}

export type GoalValidationResult =
  | { ok: true; data: ValidatedGoalInput }
  | { ok: false; error: string };

export interface GoalActionCheckResult {
  allowed: boolean;
  reason?: string;
}

export interface GoalStatusLike {
  currentAmount: number;
  targetAmount: number;
  isCompleted?: boolean | null;
  isArchived?: boolean | null;
}

export interface GoalProgressLike {
  targetAmount: number;
  currentAmount?: number | null;
  isArchived?: boolean | null;
}

export interface ActiveGoalsSummary {
  activeCount: number;
  archivedCount: number;
  totalTargetAmount: number;
  totalCurrentAmount: number;
  overallProgressRate: number;
}

/**
 * YYYY-MM-DD 形式かつ実在する暦日かどうかを検証する
 */
export function isValidIsoDateString(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * 貯蓄目標の作成・編集時の入力値バリデーション
 */
export function validateGoalInput(input: GoalInputPayload): GoalValidationResult {
  // 1. タイトル検証
  if (typeof input.title !== "string") {
    return { ok: false, error: "目標タイトルを入力してください。" };
  }
  const trimmedTitle = input.title.trim();
  if (trimmedTitle.length === 0) {
    return { ok: false, error: "目標タイトルを入力してください。" };
  }
  if (trimmedTitle.length > MAX_GOAL_TITLE_LENGTH) {
    return {
      ok: false,
      error: `目標タイトルは${MAX_GOAL_TITLE_LENGTH}文字以内で入力してください。`,
    };
  }

  // 2. 目標金額検証 (1 <= targetAmount <= 9,999,999,999 の整数)
  const parsedAmount = parseValidAmount(input.targetAmount);
  if (parsedAmount === null) {
    return {
      ok: false,
      error: "目標金額は1〜9,999,999,999円の整数で入力してください。",
    };
  }

  // 3. 目標達成予定日検証 (任意)
  let validatedTargetDate: string | null = null;
  if (input.targetDate !== undefined && input.targetDate !== null) {
    if (typeof input.targetDate !== "string") {
      return {
        ok: false,
        error: "目標達成予定日は YYYY-MM-DD 形式で入力してください。",
      };
    }
    const trimmedDate = input.targetDate.trim();
    if (trimmedDate.length > 0) {
      if (!isValidIsoDateString(trimmedDate)) {
        return {
          ok: false,
          error: "目標達成予定日は YYYY-MM-DD 形式で有効な日付を入力してください。",
        };
      }
      validatedTargetDate = trimmedDate;
    }
  }

  // 4. 集計対象口座ID配列検証 (任意・重複排除)
  const validatedAccountIds: string[] = [];
  if (input.accountIds !== undefined && input.accountIds !== null) {
    if (!Array.isArray(input.accountIds)) {
      return { ok: false, error: "対象口座の指定形式が不正です。" };
    }
    const seen = new Set<string>();
    for (const item of input.accountIds) {
      if (typeof item !== "string" || item.trim().length === 0) {
        return { ok: false, error: "不正な口座IDが含まれています。" };
      }
      const id = item.trim();
      if (!seen.has(id)) {
        seen.add(id);
        validatedAccountIds.push(id);
      }
    }
  }

  // 5. テーマカラー検証 (#RRGGBB)
  let validatedColor = DEFAULT_GOAL_COLOR;
  if (input.color !== undefined && input.color !== null) {
    if (typeof input.color !== "string") {
      return { ok: false, error: "カラーコードの形式が不正です。" };
    }
    const trimmedColor = input.color.trim();
    if (trimmedColor.length > 0) {
      if (!/^#[0-9A-Fa-f]{6}$/.test(trimmedColor)) {
        return { ok: false, error: "カラーは #RRGGBB 形式で指定してください。" };
      }
      validatedColor = trimmedColor.toUpperCase();
    }
  }

  return {
    ok: true,
    data: {
      title: trimmedTitle,
      targetAmount: parsedAmount,
      targetDate: validatedTargetDate,
      accountIds: validatedAccountIds,
      color: validatedColor,
    },
  };
}

/**
 * 対象口座ID配列から現在の合算積立額を算出する
 */
export function calculateGoalCurrentAmount(
  accountIds: ReadonlyArray<string> | null | undefined,
  accounts: ReadonlyArray<{ id: string; balance: number }>
): number {
  if (!accountIds || accountIds.length === 0 || accounts.length === 0) {
    return 0;
  }
  const idSet = new Set(accountIds);
  return accounts
    .filter((acc) => idSet.has(acc.id))
    .reduce((sum, acc) => sum + (acc.balance || 0), 0);
}

/**
 * 貯蓄目標の達成率（0〜100%）を算出する
 */
export function calculateGoalProgressRate(currentAmount: number, targetAmount: number): number {
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
    return 0;
  }
  if (!Number.isFinite(currentAmount) || currentAmount <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round((currentAmount / targetAmount) * 100)));
}

/**
 * 貯蓄目標が達成済みかどうかを判定する
 * - 現在残高が目標金額以上、または isCompleted フラグが true の場合に達成済み
 */
export function isGoalAchieved(
  currentAmount: number,
  targetAmount: number,
  isCompleted?: boolean | null
): boolean {
  if (isCompleted === true) {
    return true;
  }
  if (Number.isFinite(targetAmount) && targetAmount > 0 && currentAmount >= targetAmount) {
    return true;
  }
  return false;
}

/**
 * 貯蓄目標が削除可能かどうかを判定する
 * - 未達成かつ未アーカイブの目標のみ物理削除可
 * - 達成済みまたはアーカイブ済みの目標は削除不可として保護
 */
export function canDeleteGoal(goal: GoalStatusLike): GoalActionCheckResult {
  if (goal.isArchived === true || isGoalAchieved(goal.currentAmount, goal.targetAmount, goal.isCompleted)) {
    return {
      allowed: false,
      reason: "達成済みまたはアーカイブ済みの目標は削除できません。アーカイブ機能をご利用ください。",
    };
  }
  return { allowed: true };
}

/**
 * 貯蓄目標がアーカイブ可能かどうかを判定する
 * - 達成済みかつ未アーカイブの目標のみアーカイブ可
 */
export function canArchiveGoal(goal: GoalStatusLike): GoalActionCheckResult {
  if (goal.isArchived === true) {
    return {
      allowed: false,
      reason: "この目標はすでにアーカイブ済みです。",
    };
  }
  if (!isGoalAchieved(goal.currentAmount, goal.targetAmount, goal.isCompleted)) {
    return {
      allowed: false,
      reason: "達成済みの目標のみアーカイブできます。",
    };
  }
  return { allowed: true };
}

/**
 * アーカイブ済み貯蓄目標を進行中一覧へ復元可能かどうかを判定する
 */
export function canRestoreGoal(goal: { isArchived?: boolean | null }): GoalActionCheckResult {
  if (goal.isArchived !== true) {
    return {
      allowed: false,
      reason: "この目標はアーカイブされていません。",
    };
  }
  return { allowed: true };
}

/**
 * 進行中（未アーカイブ）目標のみの合算進捗サマリーを算出する
 * - アーカイブ済み（isArchived === true）の目標は合算進捗・全体達成率から除外する
 */
export function calculateActiveGoalsSummary(
  goals: ReadonlyArray<GoalProgressLike> | null | undefined
): ActiveGoalsSummary {
  if (!goals || goals.length === 0) {
    return {
      activeCount: 0,
      archivedCount: 0,
      totalTargetAmount: 0,
      totalCurrentAmount: 0,
      overallProgressRate: 0,
    };
  }

  let activeCount = 0;
  let archivedCount = 0;
  let totalTargetAmount = 0;
  let totalCurrentAmount = 0;

  for (const goal of goals) {
    if (goal.isArchived === true) {
      archivedCount += 1;
      continue;
    }
    activeCount += 1;
    totalTargetAmount += goal.targetAmount || 0;
    totalCurrentAmount += goal.currentAmount || 0;
  }

  const overallProgressRate = calculateGoalProgressRate(totalCurrentAmount, totalTargetAmount);

  return {
    activeCount,
    archivedCount,
    totalTargetAmount,
    totalCurrentAmount,
    overallProgressRate,
  };
}
