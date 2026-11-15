/**
 * 費目マスター管理のバリデーションおよび標準12費目保護ロジック
 */

export const SYSTEM_CATEGORY_EXACT_IDS = new Set([
  "cat-food",
  "cat-dining",
  "cat-daily",
  "cat-house",
  "cat-util",
  "cat-comm",
  "cat-trans",
  "cat-fun",
  "cat-med",
  "cat-cloth",
  "cat-spec",
  "cat-invest",
]);

export const SYSTEM_CATEGORY_ID_PATTERN =
  /^cat_(food|dining|daily|house|util|comm|trans|fun|med|cloth|spec|invest)_[a-zA-Z0-9_-]+$/;

export const DEFAULT_CATEGORY_ICON = "📁";
export const DEFAULT_CATEGORY_COLOR = "#2E7D32";
export const MAX_CATEGORY_NAME_LENGTH = 100;
export const MAX_CATEGORY_ICON_LENGTH = 50;

export interface ValidatedCategoryInput {
  name: string;
  icon: string;
  color: string;
}

export type CategoryValidationResult =
  | { ok: true; data: ValidatedCategoryInput }
  | { ok: false; error: string };

/**
 * 標準12費目（編集・アーカイブ保護対象）かどうかを判定する
 */
export function isSystemProtectedCategory(category: {
  id: string;
  isSystem?: boolean | null;
}): boolean {
  if (category.isSystem === true) return true;
  if (SYSTEM_CATEGORY_EXACT_IDS.has(category.id)) return true;
  return SYSTEM_CATEGORY_ID_PATTERN.test(category.id);
}

/**
 * 費目作成・更新時の入力値バリデーション
 */
export function validateCategoryInput(input: {
  name?: unknown;
  icon?: unknown;
  color?: unknown;
}): CategoryValidationResult {
  if (typeof input.name !== "string") {
    return { ok: false, error: "費目名を入力してください。" };
  }

  const trimmedName = input.name.trim();
  if (trimmedName.length === 0) {
    return { ok: false, error: "費目名を入力してください。" };
  }
  if (trimmedName.length > MAX_CATEGORY_NAME_LENGTH) {
    return { ok: false, error: `費目名は${MAX_CATEGORY_NAME_LENGTH}文字以内で入力してください。` };
  }

  let validatedIcon = DEFAULT_CATEGORY_ICON;
  if (input.icon !== undefined && input.icon !== null) {
    if (typeof input.icon !== "string") {
      return { ok: false, error: "アイコンの形式が不正です。" };
    }
    const trimmedIcon = input.icon.trim();
    if (trimmedIcon.length > MAX_CATEGORY_ICON_LENGTH) {
      return { ok: false, error: `アイコンは${MAX_CATEGORY_ICON_LENGTH}文字以内で入力してください。` };
    }
    if (trimmedIcon.length > 0) {
      validatedIcon = trimmedIcon;
    }
  }

  let validatedColor = DEFAULT_CATEGORY_COLOR;
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
      name: trimmedName,
      icon: validatedIcon,
      color: validatedColor,
    },
  };
}

/**
 * 並び替え用 ID 配列の検証
 */
export function validateReorderIds(
  orderedIds: unknown
): { ok: true; ids: string[] } | { ok: false; error: string } {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: false, error: "並び替え対象の費目ID配列を指定してください。" };
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of orderedIds) {
    if (typeof item !== "string" || item.trim().length === 0) {
      return { ok: false, error: "不正な費目IDが含まれています。" };
    }
    const id = item.trim();
    if (seen.has(id)) {
      return { ok: false, error: "並び替え対象に重複した費目IDが含まれています。" };
    }
    seen.add(id);
    normalized.push(id);
  }

  return { ok: true, ids: normalized };
}
