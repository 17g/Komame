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
