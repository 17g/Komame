import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 通貨フォーマット (¥1,234,567)
export function formatCurrency(amount: number, symbol: string = "¥"): string {
  return `${symbol}${amount.toLocaleString("ja-JP")}`;
}

// 日付フォーマット (YYYY/MM/DD)
export function formatDate(dateStr: string | Date): string {
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

// クレジットカード引き落とし予定日の算出
export function calculateWithdrawalDate(
  txDateStr: string,
  closingDay: number = 99, // 99: 月末
  withdrawalDay: number = 27, // 27日
  monthOffset: number = 1 // 1: 翌月, 2: 翌々月
): string {
  const txDate = new Date(txDateStr);
  const txYear = txDate.getFullYear();
  const txMonth = txDate.getMonth(); // 0-indexed
  const txDay = txDate.getDate();

  // 月末判定
  const lastDayOfTxMonth = new Date(txYear, txMonth + 1, 0).getDate();
  const effectiveClosingDay = closingDay === 99 ? lastDayOfTxMonth : closingDay;

  // 締め日を過ぎていればさらに翌月扱い
  let targetMonthOffset = monthOffset;
  if (txDay > effectiveClosingDay) {
    targetMonthOffset += 1;
  }

  const targetDate = new Date(txYear, txMonth + targetMonthOffset, 1);
  const targetYear = targetDate.getFullYear();
  const targetMonth = targetDate.getMonth();
  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();

  const effectiveWithdrawalDay =
    withdrawalDay === 99 ? lastDayOfTargetMonth : Math.min(withdrawalDay, lastDayOfTargetMonth);

  const resDate = new Date(targetYear, targetMonth, effectiveWithdrawalDay);
  return resDate.toISOString().split("T")[0];
}

// 金額・数値パラメータの境界値定数 (VULN-09)
export const MIN_AMOUNT = 1;
export const MAX_AMOUNT = 9_999_999_999;
export const MIN_BALANCE = 0;
export const MAX_BALANCE = 9_999_999_999;
export const MAX_BATCH_TRANSACTIONS = 500;
export const MAX_CSV_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_CSV_ROWS = 5000;

/**
 * 金額の境界値・整数検証 (1 <= amount <= 9,999,999,999)
 */
export function isValidAmount(value: unknown): boolean {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= MIN_AMOUNT && value <= MAX_AMOUNT;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return false;
    const num = Number(trimmed);
    return Number.isSafeInteger(num) && num >= MIN_AMOUNT && num <= MAX_AMOUNT;
  }
  return false;
}

/**
 * 口座残高の境界値・整数検証 (0 <= balance <= 9,999,999,999)
 */
export function isValidBalance(value: unknown): boolean {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= MIN_BALANCE && value <= MAX_BALANCE;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return false;
    const num = Number(trimmed);
    return Number.isSafeInteger(num) && num >= MIN_BALANCE && num <= MAX_BALANCE;
  }
  return false;
}

/**
 * 安全な金額整数をパースして返す。不正な場合は null
 */
export function parseValidAmount(value: unknown): number | null {
  if (isValidAmount(value)) {
    return typeof value === "number" ? value : parseInt(String(value).trim(), 10);
  }
  return null;
}

/**
 * 安全な残高整数をパースして返す。不正な場合は null
 */
export function parseValidBalance(value: unknown): number | null {
  if (isValidBalance(value)) {
    return typeof value === "number" ? value : parseInt(String(value).trim(), 10);
  }
  return null;
}

