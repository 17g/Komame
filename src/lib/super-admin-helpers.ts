import { HouseholdStatus, ManagedHouseholdCounts } from "@/types";

export const VALID_HOUSEHOLD_STATUS_FILTERS = [
  "all",
  "pending",
  "approved",
  "rejected",
  "suspended",
] as const;

export type HouseholdStatusFilter = (typeof VALID_HOUSEHOLD_STATUS_FILTERS)[number];

export const SUPER_ADMIN_ACTIONS = [
  "approve",
  "reject",
  "suspend",
  "reactivate",
] as const;

export type SuperAdminHouseholdAction = (typeof SUPER_ADMIN_ACTIONS)[number];

export const MAX_REJECTION_REASON_LENGTH = 1000;

export interface StandardCategoryTemplate {
  key: string;
  name: string;
  icon: string;
  color: string;
  sortOrder: number;
}

/**
 * 新規世帯承認時に投入する日本の標準12費目プリセット
 */
export const STANDARD_CATEGORY_TEMPLATES: readonly StandardCategoryTemplate[] = [
  { key: "food", name: "食費 (食材・自炊)", icon: "🥦", color: "#2E7D32", sortOrder: 1 },
  { key: "dining", name: "外食・カフェ", icon: "☕", color: "#D97706", sortOrder: 2 },
  { key: "daily", name: "日用品・生活雑貨", icon: "🧻", color: "#059669", sortOrder: 3 },
  { key: "house", name: "住居費 (家賃・住宅ローン)", icon: "🏠", color: "#4F46E5", sortOrder: 4 },
  { key: "util", name: "水道光熱費", icon: "⚡", color: "#0284C7", sortOrder: 5 },
  { key: "comm", name: "通信費 (スマホ・ネット)", icon: "📱", color: "#7C3AED", sortOrder: 6 },
  { key: "trans", name: "交通費 (電車・ガソリン)", icon: "🚆", color: "#2563EB", sortOrder: 7 },
  { key: "fun", name: "教養・娯楽・趣味", icon: "🎮", color: "#DB2777", sortOrder: 8 },
  { key: "med", name: "医療・保険", icon: "💊", color: "#DC2626", sortOrder: 9 },
  { key: "cloth", name: "衣服・美容", icon: "👕", color: "#EA580C", sortOrder: 10 },
  { key: "spec", name: "特別費 (旅行・冠婚葬祭)", icon: "🎁", color: "#9333EA", sortOrder: 11 },
  { key: "invest", name: "貯蓄・投資 (NISA等)", icon: "🌱", color: "#16A34A", sortOrder: 12 },
];

export const DEFAULT_HOUSEHOLD_SETTINGS: Array<{
  key: string;
  valueJson: Record<string, unknown>;
}> = [
  { key: "currency_symbol", valueJson: { value: "¥" } },
  { key: "date_format", valueJson: { value: "YYYY/MM/DD" } },
  {
    key: "password_policy",
    valueJson: {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: false,
    },
  },
];

export function isValidStatusFilter(status: unknown): status is HouseholdStatusFilter {
  return (
    typeof status === "string" &&
    (VALID_HOUSEHOLD_STATUS_FILTERS as readonly string[]).includes(status)
  );
}

export function isValidSuperAdminAction(action: unknown): action is SuperAdminHouseholdAction {
  return (
    typeof action === "string" &&
    (SUPER_ADMIN_ACTIONS as readonly string[]).includes(action)
  );
}

/**
 * 却下理由・メモ文字列を正規化する
 */
export function normalizeReasonInput(
  reason: unknown
): { ok: true; value: string | null | undefined } | { ok: false; error: string } {
  if (reason === undefined) {
    return { ok: true, value: undefined };
  }
  if (reason === null) {
    return { ok: true, value: null };
  }
  if (typeof reason !== "string") {
    return { ok: false, error: "理由・メモは文字列で指定してください。" };
  }
  const trimmed = reason.trim();
  if (trimmed.length > MAX_REJECTION_REASON_LENGTH) {
    return {
      ok: false,
      error: `理由・メモは${MAX_REJECTION_REASON_LENGTH}文字以内で入力してください。`,
    };
  }
  return { ok: true, value: trimmed.length > 0 ? trimmed : null };
}

/**
 * 世帯ステータス別の件数集計を構築する
 */
export function buildHouseholdCounts(
  items: ReadonlyArray<{ status: string }>
): ManagedHouseholdCounts {
  const counts: ManagedHouseholdCounts = {
    all: items.length,
    pending: 0,
    approved: 0,
    rejected: 0,
    suspended: 0,
  };

  for (const item of items) {
    if (item.status === "pending") counts.pending += 1;
    else if (item.status === "approved") counts.approved += 1;
    else if (item.status === "rejected") counts.rejected += 1;
    else if (item.status === "suspended") counts.suspended += 1;
  }

  return counts;
}

export type TransitionValidationResult =
  | {
      ok: true;
      nextStatus: HouseholdStatus;
      nextRejectionReason: string | null | undefined;
    }
  | {
      ok: false;
      statusCode: 400;
      error: string;
    };

/**
 * システム管理者による世帯ステータス変更の可否と遷移先を検証する
 */
export function validateSuperAdminHouseholdTransition(params: {
  action: SuperAdminHouseholdAction;
  currentStatus: string;
  targetHouseholdId: string;
  actorHouseholdId: string;
  reason?: string | null;
}): TransitionValidationResult {
  const { action, currentStatus, targetHouseholdId, actorHouseholdId, reason } = params;

  switch (action) {
    case "approve": {
      if (currentStatus === "approved") {
        return { ok: false, statusCode: 400, error: "この世帯は既に承認済みです。" };
      }
      if (currentStatus === "suspended") {
        return {
          ok: false,
          statusCode: 400,
          error: "停止中の世帯を再開するには「利用再開」を実行してください。",
        };
      }
      if (currentStatus !== "pending" && currentStatus !== "rejected") {
        return {
          ok: false,
          statusCode: 400,
          error: "承認できるのは「承認待ち」または「却下済み」の世帯のみです。",
        };
      }
      return {
        ok: true,
        nextStatus: "approved",
        nextRejectionReason: null,
      };
    }

    case "reject": {
      if (targetHouseholdId === actorHouseholdId) {
        return {
          ok: false,
          statusCode: 400,
          error: "現在操作中のご自身の所属世帯は却下できません。",
        };
      }
      if (currentStatus !== "pending") {
        return {
          ok: false,
          statusCode: 400,
          error: "却下できるのは「承認待ち」の世帯申請のみです。",
        };
      }
      return {
        ok: true,
        nextStatus: "rejected",
        nextRejectionReason: reason ?? null,
      };
    }

    case "suspend": {
      if (targetHouseholdId === actorHouseholdId) {
        return {
          ok: false,
          statusCode: 400,
          error: "現在操作中のご自身の所属世帯は利用停止にできません。",
        };
      }
      if (currentStatus !== "approved") {
        return {
          ok: false,
          statusCode: 400,
          error: "利用停止にできるのは「承認済み」の世帯のみです。",
        };
      }
      return {
        ok: true,
        nextStatus: "suspended",
        nextRejectionReason: reason,
      };
    }

    case "reactivate": {
      if (currentStatus !== "suspended") {
        return {
          ok: false,
          statusCode: 400,
          error: "利用再開できるのは「停止中」の世帯のみです。",
        };
      }
      return {
        ok: true,
        nextStatus: "approved",
        nextRejectionReason: null,
      };
    }
  }
}

export type DeletionValidationResult =
  | { ok: true }
  | { ok: false; statusCode: 400; error: string };

/**
 * システム管理者による世帯申請の物理削除（抹消）可否を検証する
 */
export function validateSuperAdminHouseholdDeletion(params: {
  currentStatus: string;
  targetHouseholdId: string;
  actorHouseholdId: string;
}): DeletionValidationResult {
  const { currentStatus, targetHouseholdId, actorHouseholdId } = params;

  if (targetHouseholdId === actorHouseholdId) {
    return {
      ok: false,
      statusCode: 400,
      error: "現在操作中のご自身の所属世帯は削除できません。",
    };
  }

  if (currentStatus !== "pending" && currentStatus !== "rejected") {
    return {
      ok: false,
      statusCode: 400,
      error: "削除（抹消）できるのは「承認待ち」または「却下済み」の世帯申請のみです。",
    };
  }

  return { ok: true };
}
