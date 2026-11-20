import { parseValidAmount } from "@/lib/utils";
import { isValidIsoDateString } from "@/lib/goal-helpers";
import type { RecurringTemplateType } from "@/types";

/**
 * 定例支払いテンプレート管理・月次サイクル計算・自動精算判定ヘルパー (要件 2-8)
 */

export const MAX_RECURRING_TITLE_LENGTH = 150;
export const MAX_RECURRING_NOTE_LENGTH = 1000;
export const DEFAULT_CREDIT_CARD_WITHDRAWAL_DAY = 27;
export const END_OF_MONTH_DAY = 99;

export interface RecurringTemplateInputPayload {
  type?: unknown;
  title?: unknown;
  amount?: unknown;
  categoryId?: unknown;
  paymentMethodId?: unknown;
  fromAccountId?: unknown;
  toAccountId?: unknown;
  dayOfMonth?: unknown;
  note?: unknown;
  isActive?: unknown;
}

export interface PaymentMethodWithdrawalInfo {
  type?: string | null;
  withdrawalDay?: number | null;
}

export interface ValidatedRecurringTemplateInput {
  type: RecurringTemplateType;
  title: string;
  amount: number;
  categoryId: string | null;
  paymentMethodId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  dayOfMonth: number;
  note: string | null;
  isActive: boolean;
}

export type RecurringTemplateValidationResult =
  | { ok: true; data: ValidatedRecurringTemplateInput }
  | { ok: false; error: string };

export interface TargetCycleDatesResult {
  targetCycleMonth: string; // 'YYYY-MM'
  scheduledWithdrawalDate: string; // 'YYYY-MM-DD'
  date: string; // 'YYYY-MM-DD'
}

export interface AutoSettlementCandidate {
  isSettled: boolean;
  scheduledWithdrawalDate?: string | null;
  deletedAt?: unknown;
  recurringTemplateId?: string | null;
}

/**
 * 支払基準日 (1〜28 または 99:月末) の妥当性を検証し整数で返す
 */
export function parseValidDayOfMonth(value: unknown): number | null {
  let num: number | null = null;
  if (typeof value === "number") {
    if (Number.isSafeInteger(value)) {
      num = value;
    }
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      const parsed = Number(trimmed);
      if (Number.isSafeInteger(parsed)) {
        num = parsed;
      }
    }
  }
  if (num === null) return null;
  if ((num >= 1 && num <= 28) || num === END_OF_MONTH_DAY) {
    return num;
  }
  return null;
}

export function isValidDayOfMonth(value: unknown): value is number {
  return parseValidDayOfMonth(value) !== null;
}

/**
 * 決済手段と取引種別に応じた実効支払基準日を決定する
 * - 支出かつクレジットカード決済の場合: カードの withdrawalDay (未設定時は 27) を自動適用
 * - それ以外 (口座引き落とし・その他決済・口座間振替): 指定された dayOfMonth (1〜28 / 99) を検証して返却
 */
export function resolveEffectiveDayOfMonth(params: {
  type: RecurringTemplateType;
  dayOfMonth?: unknown;
  paymentMethod?: PaymentMethodWithdrawalInfo | null;
}): number | null {
  if (params.type === "expense" && params.paymentMethod?.type === "credit_card") {
    const cardDay = params.paymentMethod.withdrawalDay;
    if (
      typeof cardDay === "number" &&
      Number.isSafeInteger(cardDay) &&
      ((cardDay >= 1 && cardDay <= 31) || cardDay === END_OF_MONTH_DAY)
    ) {
      return cardDay;
    }
    return DEFAULT_CREDIT_CARD_WITHDRAWAL_DAY;
  }
  return parseValidDayOfMonth(params.dayOfMonth);
}

function normalizeOptionalId(
  value: unknown,
  fieldLabel: string
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }
  if (typeof value !== "string") {
    return { ok: false, error: `${fieldLabel}の指定形式が不正です。` };
  }
  const trimmed = value.trim();
  return { ok: true, value: trimmed.length > 0 ? trimmed : null };
}

/**
 * 定例支払いテンプレート作成・更新時の入力値バリデーション
 */
export function validateRecurringTemplateInput(
  input: RecurringTemplateInputPayload,
  paymentMethod?: PaymentMethodWithdrawalInfo | null
): RecurringTemplateValidationResult {
  // 1. 取引種別検証
  if (input.type !== "expense" && input.type !== "transfer") {
    return {
      ok: false,
      error: "取引種別は支出（expense）または振替（transfer）を指定してください。",
    };
  }
  const type: RecurringTemplateType = input.type;

  // 2. テンプレート名称検証 (1〜150文字)
  if (typeof input.title !== "string") {
    return { ok: false, error: "テンプレート名（店舗・取引先名）を入力してください。" };
  }
  const trimmedTitle = input.title.trim();
  if (trimmedTitle.length === 0) {
    return { ok: false, error: "テンプレート名（店舗・取引先名）を入力してください。" };
  }
  if (trimmedTitle.length > MAX_RECURRING_TITLE_LENGTH) {
    return {
      ok: false,
      error: `テンプレート名は${MAX_RECURRING_TITLE_LENGTH}文字以内で入力してください。`,
    };
  }

  // 3. 金額検証 (1 <= amount <= 9,999,999,999 の整数)
  const parsedAmount = parseValidAmount(input.amount);
  if (parsedAmount === null) {
    return {
      ok: false,
      error: "金額は1〜9,999,999,999円の整数で入力してください。",
    };
  }

  // 4. 関連ID・メモ・有効フラグ正規化
  const catRes = normalizeOptionalId(input.categoryId, "費目ID");
  if (!catRes.ok) return catRes;

  const pmRes = normalizeOptionalId(input.paymentMethodId, "決済手段ID");
  if (!pmRes.ok) return pmRes;

  const fromRes = normalizeOptionalId(input.fromAccountId, "出金元口座ID");
  if (!fromRes.ok) return fromRes;

  const toRes = normalizeOptionalId(input.toAccountId, "入金先口座ID");
  if (!toRes.ok) return toRes;

  let validatedNote: string | null = null;
  if (input.note !== undefined && input.note !== null) {
    if (typeof input.note !== "string") {
      return { ok: false, error: "メモの指定形式が不正です。" };
    }
    const trimmedNote = input.note.trim();
    if (trimmedNote.length > MAX_RECURRING_NOTE_LENGTH) {
      return {
        ok: false,
        error: `メモは${MAX_RECURRING_NOTE_LENGTH}文字以内で入力してください。`,
      };
    }
    if (trimmedNote.length > 0) {
      validatedNote = trimmedNote;
    }
  }

  let validatedIsActive = true;
  if (input.isActive !== undefined && input.isActive !== null) {
    if (typeof input.isActive !== "boolean") {
      return { ok: false, error: "有効フラグの指定形式が不正です。" };
    }
    validatedIsActive = input.isActive;
  }

  // 5. 種別ごとの口座整合性検証
  let categoryId = catRes.value;
  let paymentMethodId = pmRes.value;
  const fromAccountId = fromRes.value;
  const toAccountId = toRes.value;

  if (type === "transfer") {
    if (!fromAccountId) {
      return { ok: false, error: "出金元口座を選択してください。" };
    }
    if (!toAccountId) {
      return { ok: false, error: "入金先口座を選択してください。" };
    }
    if (fromAccountId === toAccountId) {
      return { ok: false, error: "出金元口座と入金先口座には異なる口座を指定してください。" };
    }
    categoryId = null;
    paymentMethodId = null;
  } else if (fromAccountId && toAccountId && fromAccountId === toAccountId) {
    return { ok: false, error: "出金元口座と入金先口座には異なる口座を指定してください。" };
  }

  // 6. 実効支払基準日の解決・検証
  const effectiveDay = resolveEffectiveDayOfMonth({
    type,
    dayOfMonth: input.dayOfMonth,
    paymentMethod,
  });
  if (effectiveDay === null) {
    return {
      ok: false,
      error: "毎月の支払日は1〜28日または月末（99）で指定してください。",
    };
  }

  return {
    ok: true,
    data: {
      type,
      title: trimmedTitle,
      amount: parsedAmount,
      categoryId,
      paymentMethodId,
      fromAccountId,
      toAccountId,
      dayOfMonth: effectiveDay,
      note: validatedNote,
      isActive: validatedIsActive,
    },
  };
}

/**
 * 指定年月 (month: 1〜12) の末日を取得する
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * 指定年月における実効支払日 (1〜末日) を算出する
 */
export function resolveDayInMonth(year: number, month: number, effectiveDayOfMonth: number): number {
  const lastDay = getDaysInMonth(year, month);
  if (effectiveDayOfMonth === END_OF_MONTH_DAY) {
    return lastDay;
  }
  return Math.min(Math.max(1, effectiveDayOfMonth), lastDay);
}

/**
 * JST (UTC+9) 基準の本日日付文字列 (YYYY-MM-DD) を返す
 */
export function getTodayJstIsoDate(now: Date = new Date()): string {
  const jstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const jst = new Date(jstMs);
  const year = jst.getUTCFullYear();
  const month = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jst.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 「規定支払日の翌日」からの月次サイクル判定と支払予定日・取引日を算出する純粋関数
 * - 基準日当日 (refDay <= currentMonthEffectiveDay) までは当月サイクル (YYYY-MM)
 * - 基準日の翌日以降 (refDay > currentMonthEffectiveDay) は翌月サイクル (YYYY-(MM+1))
 */
export function resolveTargetCycleAndDates(
  referenceDateStr: string,
  effectiveDayOfMonth: number
): TargetCycleDatesResult {
  if (!isValidIsoDateString(referenceDateStr)) {
    throw new Error(`Invalid referenceDateStr: ${referenceDateStr}`);
  }
  if (
    !Number.isSafeInteger(effectiveDayOfMonth) ||
    effectiveDayOfMonth < 1 ||
    (effectiveDayOfMonth > 31 && effectiveDayOfMonth !== END_OF_MONTH_DAY)
  ) {
    throw new Error(`Invalid effectiveDayOfMonth: ${effectiveDayOfMonth}`);
  }

  const [yearStr, monthStr, dayStr] = referenceDateStr.split("-");
  const refYear = Number(yearStr);
  const refMonth = Number(monthStr); // 1-12
  const refDay = Number(dayStr); // 1-31

  const currentMonthEffectiveDay = resolveDayInMonth(refYear, refMonth, effectiveDayOfMonth);

  let targetYear = refYear;
  let targetMonth = refMonth;
  if (refDay > currentMonthEffectiveDay) {
    if (refMonth === 12) {
      targetYear = refYear + 1;
      targetMonth = 1;
    } else {
      targetMonth = refMonth + 1;
    }
  }

  const targetDay = resolveDayInMonth(targetYear, targetMonth, effectiveDayOfMonth);
  const targetCycleMonth = `${targetYear}-${String(targetMonth).padStart(2, "0")}`;
  const scheduledWithdrawalDate = `${targetCycleMonth}-${String(targetDay).padStart(2, "0")}`;

  return {
    targetCycleMonth,
    scheduledWithdrawalDate,
    date: scheduledWithdrawalDate,
  };
}

/**
 * テンプレートに対して対象サイクル月の支払い予定明細を新規生成すべきかを判定する (二重生成防止)
 */
export function shouldGenerateRecurringCycle(params: {
  isActive: boolean;
  lastGeneratedMonth?: string | null;
  targetCycleMonth: string;
}): boolean {
  if (!params.isActive) return false;
  if (!params.lastGeneratedMonth) return true;
  return params.lastGeneratedMonth < params.targetCycleMonth;
}

/**
 * 支払予定日到来済み (scheduledWithdrawalDate <= todayStr) かつ未精算 (isSettled === false) の
 * 非クレジットカード定例支払い明細が自動精算対象かどうかを判定する
 */
export function isDueForAutoSettlement(
  tx: AutoSettlementCandidate,
  paymentMethodType: string | null | undefined,
  todayStr: string
): boolean {
  if (tx.deletedAt != null) return false;
  if (tx.isSettled !== false) return false;
  if (!tx.recurringTemplateId) return false;
  if (paymentMethodType === "credit_card") return false;
  if (!tx.scheduledWithdrawalDate || !isValidIsoDateString(tx.scheduledWithdrawalDate)) {
    return false;
  }
  if (!isValidIsoDateString(todayStr)) {
    return false;
  }
  return tx.scheduledWithdrawalDate <= todayStr;
}
