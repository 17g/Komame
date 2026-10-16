"use client";

import React, { useState, useMemo } from "react";
import { formatCurrency, calculateWithdrawalDate } from "@/lib/utils";
import { AccountItem, TransactionItem, PaymentMethodItem } from "@/types";
import {
  Lock,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Flame,
  ArrowRight,
  ShieldCheck,
  PieChart,
  Wallet,
  CreditCard,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface DashboardTabProps {
  accounts: AccountItem[];
  transactions: TransactionItem[];
  paymentMethods?: PaymentMethodItem[];
  onOpenRegister: () => void;
  onOpenAllTransactions: () => void;
}

export function DashboardTab({
  accounts,
  transactions,
  paymentMethods = [],
  onOpenRegister,
  onOpenAllTransactions,
}: DashboardTabProps) {
  const { t, language } = useTranslation();
  const [selectedCardIdx, setSelectedCardIdx] = useState(0);

  // 1. 総資産と実質利用可能額の集計
  const totalAssets = accounts.reduce((sum, a) => sum + a.balance, 0);
  const totalReserved = accounts.reduce((sum, a) => sum + (a.reservedAmount || 0), 0);
  const availableBalance = totalAssets - totalReserved;

  // 2. クレジットカード決済手段の抽出
  const creditCards = (paymentMethods || []).filter(
    (pm) => pm.type === "credit_card" && pm.isActive
  );

  // 3. 各クレジットカードの未精算明細と次回引き落とし予定額の動的集計
  const cardSummaries = creditCards.map((pm) => {
    const cardUnsettledTxs = transactions.filter(
      (t) =>
        !t.isSettled &&
        t.type === "expense" &&
        (t.paymentMethodId === pm.id || (!t.paymentMethodId && t.paymentMethodName === pm.name))
    );

    const totalAmount = cardUnsettledTxs.reduce((sum, t) => sum + t.amount, 0);

    // 引き落とし日特定
    const validDates = cardUnsettledTxs
      .map((t) => t.scheduledWithdrawalDate)
      .filter((d): d is string => !!d)
      .sort();

    let nextWithdrawalDate = validDates[0] || null;

    if (!nextWithdrawalDate) {
      const todayStr = new Date().toISOString().split("T")[0];
      nextWithdrawalDate = calculateWithdrawalDate(
        todayStr,
        pm.closingDay ?? 99,
        pm.withdrawalDay ?? 27,
        pm.withdrawalMonthOffset ?? 1
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(nextWithdrawalDate);
    targetDate.setHours(0, 0, 0, 0);
    const diffDays = Math.round((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // 引き落とし元口座の特定
    const sourceAccount = accounts.find((a) => a.id === pm.sourceAccountId);
    const accountBalance = sourceAccount?.balance ?? 0;
    const accountReserved = sourceAccount?.reservedAmount ?? 0;
    const accountAvailable = accountBalance - accountReserved;

    // 3段階シグナル判定
    // sufficient (充足): 引き落とし元口座の実質利用可能残高 >= 予定額
    // warning (注意): 引き落とし元口座の総残高 >= 予定額 だが 実質利用可能残高 < 予定額 (貯蓄ロック取崩しが必要)
    // shortage (不足): 引き落とし元口座の総残高 < 予定額 (口座資金自体が不足)
    let signal: "sufficient" | "warning" | "shortage" = "sufficient";
    let shortageAmount = 0;

    if (totalAmount > 0) {
      if (sourceAccount) {
        if (accountAvailable >= totalAmount) {
          signal = "sufficient";
        } else if (accountBalance >= totalAmount) {
          signal = "warning";
          shortageAmount = totalAmount - accountAvailable;
        } else {
          signal = "shortage";
          shortageAmount = totalAmount - accountBalance;
        }
      } else {
        // 口座未設定時は全体の availableBalance で判定
        if (availableBalance >= totalAmount) {
          signal = "sufficient";
        } else if (totalAssets >= totalAmount) {
          signal = "warning";
          shortageAmount = totalAmount - availableBalance;
        } else {
          signal = "shortage";
          shortageAmount = totalAmount - totalAssets;
        }
      }
    }

    return {
      paymentMethod: pm,
      unsettledCount: cardUnsettledTxs.length,
      totalAmount,
      nextWithdrawalDate,
      diffDays,
      sourceAccount,
      accountBalance,
      accountAvailable,
      signal,
      shortageAmount,
    };
  });

  // クレカ全体の未精算総額
  const totalCardSettlements = cardSummaries.reduce((sum, c) => sum + c.totalAmount, 0);

  // 全体シグナル (最も危険度の高いシグナルを採用)
  const overallSignal: "sufficient" | "warning" | "shortage" = cardSummaries.some(
    (c) => c.signal === "shortage"
  )
    ? "shortage"
    : cardSummaries.some((c) => c.signal === "warning")
    ? "warning"
    : "sufficient";

  // 現在表示対象のカード情報
  const activeCardIdx = Math.min(selectedCardIdx, Math.max(0, cardSummaries.length - 1));
  const activeCardSummary = cardSummaries[activeCardIdx] || null;

  // 4. 費目別の支出比率の集計
  const expenseByCategory = transactions
    .filter((t) => t.type === "expense")
    .reduce((acc, t) => {
      const cat = t.categoryName || "その他";
      acc[cat] = (acc[cat] || 0) + t.amount;
      return acc;
    }, {} as Record<string, number>);

  const totalExpense = Object.values(expenseByCategory).reduce((sum, val) => sum + val, 0) || 1;

  // 5. こまめ活動 (Activity Heatmap) & 連続記録ストリークの動的集計
  const { streakDays, heatmapRows, totalPast4WeeksTx } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const formatDateStr = (d: Date) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };

    const todayStr = formatDateStr(today);

    // 日付ごとの明細件数マップ
    const txCountByDate = (transactions || []).reduce((acc, t) => {
      const d = t.date ? t.date.split("T")[0] : t.createdAt ? t.createdAt.split("T")[0] : null;
      if (d) {
        acc[d] = (acc[d] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    // 連続記録ストリーク計算（今日記録があれば今日から、なければ昨日から遡って連続記録日数をカウント）
    const hasTodayTx = (txCountByDate[todayStr] || 0) > 0;
    let streak = 0;
    const checkDate = new Date(today);
    if (!hasTodayTx) {
      checkDate.setDate(checkDate.getDate() - 1);
    }
    while (true) {
      const checkStr = formatDateStr(checkDate);
      if ((txCountByDate[checkStr] || 0) > 0) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    // 4週間のマトリックス計算（月曜始まり: 月=0, ..., 日=6）
    const dayOfWeek = (today.getDay() + 6) % 7;
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() - dayOfWeek);

    const startMonday = new Date(thisMonday);
    startMonday.setDate(thisMonday.getDate() - 21); // 3週間前の月曜日

    const dayLabels = [
      t.common.mon,
      t.common.tue,
      t.common.wed,
      t.common.thu,
      t.common.fri,
      t.common.sat,
      t.common.sun,
    ];

    let total4Weeks = 0;

    const rows = dayLabels.map((dayLabel, dayIdx) => {
      const weekCells = [0, 1, 2, 3].map((weekIdx) => {
        const cellDate = new Date(startMonday);
        cellDate.setDate(startMonday.getDate() + weekIdx * 7 + dayIdx);
        const dateStr = formatDateStr(cellDate);
        const count = txCountByDate[dateStr] || 0;
        const isToday = dateStr === todayStr;
        const isFuture = cellDate.getTime() > today.getTime();

        total4Weeks += count;

        return {
          dateStr,
          displayDate: `${cellDate.getMonth() + 1}/${cellDate.getDate()}`,
          count,
          isToday,
          isFuture,
        };
      });

      return {
        day: dayLabel,
        cells: weekCells,
      };
    });

    return {
      streakDays: streak,
      heatmapRows: rows,
      totalPast4WeeksTx: total4Weeks,
    };
  }, [transactions, t]);

  return (
    <div className="flex flex-col gap-6 pb-20">
      {/* 資産サマリー 3カラムグリッド (PCで横並び、スマホで2〜3分割) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* 総資産カード */}
        <div className="p-5 bg-app-surface border border-border rounded-2xl shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-bold text-content-muted">
            <span>💰 {t.dashboard.totalAssets}</span>
            <TrendingUp className="w-4 h-4 text-primary" />
          </div>
          <div className="my-2 font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-content-main">
            {formatCurrency(totalAssets)}
          </div>
          <div className="flex items-center gap-1 text-xs font-bold text-primary">
            <span>+0.5%</span>
          </div>
        </div>

        {/* 実質利用可能額カード */}
        <div className="p-5 bg-app-surface border border-border rounded-2xl shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-bold text-content-muted">
            <span>💳 {t.dashboard.availableBalance}</span>
            <Lock className="w-4 h-4 text-accent" />
          </div>
          <div className="my-2 font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-content-main">
            {formatCurrency(availableBalance)}
          </div>
          <div className="text-xs font-semibold text-accent bg-accent-light px-2 py-0.5 rounded-md w-fit">
            <span>🔒 {t.dashboard.savingsLock} {formatCurrency(totalReserved)}</span>
          </div>
        </div>

        {/* クレジットカード引き落とし予定 アラートカード */}
        <div
          className={`p-5 bg-gradient-to-br from-app-surface to-app-subtle border border-l-4 rounded-2xl shadow-sm flex flex-col justify-between sm:col-span-2 lg:col-span-1 ${
            overallSignal === "shortage"
              ? "border-rose-300 dark:border-rose-900/60 border-l-rose-500"
              : overallSignal === "warning"
              ? "border-amber-300 dark:border-amber-900/60 border-l-amber-500"
              : "border-primary-border border-l-primary"
          }`}
        >
          {/* 上部ヘッダー & シグナルバッジ */}
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-bold text-primary flex items-center gap-1.5 truncate">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span className="truncate">{t.dashboard.upcomingCardSettlement}</span>
            </div>

            {/* 3段階シグナルバッジ */}
            {overallSignal === "sufficient" ? (
              <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 px-2 py-0.5 rounded-full shrink-0">
                <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                {t.dashboard.fundsReady}
              </span>
            ) : overallSignal === "warning" ? (
              <span
                className="flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300 px-2 py-0.5 rounded-full shrink-0"
                title="貯蓄ロック枠の取崩しが必要です"
              >
                <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                注意 (貯蓄枠取崩)
              </span>
            ) : (
              <span
                className="flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-100 dark:bg-rose-950/50 dark:text-rose-300 px-2 py-0.5 rounded-full shrink-0"
                title="口座残高が不足しています"
              >
                <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
                {t.dashboard.fundsShortage}
              </span>
            )}
          </div>

          {/* メイン詳細部 */}
          {activeCardSummary ? (
            <div className="my-2">
              <div className="flex items-center justify-between text-xs text-content-muted">
                <span className="font-semibold truncate">
                  {activeCardSummary.paymentMethod.name}
                  {activeCardSummary.sourceAccount
                    ? ` (${activeCardSummary.sourceAccount.name})`
                    : " (引落口座未設定)"}
                </span>
                {cardSummaries.length > 1 && (
                  <span className="text-[10px] text-content-subtle shrink-0">
                    {activeCardIdx + 1}/{cardSummaries.length}
                  </span>
                )}
              </div>

              <div className="font-display text-2xl font-extrabold text-content-main mt-0.5 flex items-baseline gap-2">
                <span>{formatCurrency(activeCardSummary.totalAmount)}</span>
                {cardSummaries.length > 1 &&
                  totalCardSettlements !== activeCardSummary.totalAmount && (
                    <span className="text-[11px] font-medium text-content-muted">
                      (全カード計: {formatCurrency(totalCardSettlements)})
                    </span>
                  )}
              </div>

              {/* 口座突合状態の補助テキスト */}
              {activeCardSummary.totalAmount > 0 && activeCardSummary.sourceAccount && (
                <div className="text-[11px] mt-1">
                  {activeCardSummary.signal === "sufficient" ? (
                    <span className="text-emerald-700 dark:text-emerald-400">
                      利用可能残高 {formatCurrency(activeCardSummary.accountAvailable)} (原資充足)
                    </span>
                  ) : activeCardSummary.signal === "warning" ? (
                    <span className="text-amber-700 dark:text-amber-400">
                      総残高は充足。貯蓄ロック枠からあと <b>{formatCurrency(activeCardSummary.shortageAmount)}</b> の充当が必要
                    </span>
                  ) : (
                    <span className="text-rose-600 dark:text-rose-400 font-semibold">
                      口座残高があと <b>{formatCurrency(activeCardSummary.shortageAmount)}</b> 不足しています
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="my-2 py-1 text-center">
              <div className="font-display text-2xl font-extrabold text-content-main">
                {formatCurrency(0)}
              </div>
              <p className="text-xs text-content-muted mt-1">
                {creditCards.length === 0
                  ? "クレジットカード未登録"
                  : "未精算のカード利用はありません"}
              </p>
            </div>
          )}

          {/* 下部: カウントダウン & 複数カード切替ピル */}
          <div className="pt-2 border-t border-border/50 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[11px] text-content-subtle">
              {activeCardSummary ? (
                <>
                  <span>
                    {activeCardSummary.diffDays === 0 ? (
                      <b className="text-primary">本日引き落とし日</b>
                    ) : activeCardSummary.diffDays > 0 ? (
                      <>
                        口座引落まであと <b>{activeCardSummary.diffDays}日</b> (
                        {activeCardSummary.nextWithdrawalDate})
                      </>
                    ) : (
                      <span className="text-rose-600 font-semibold">
                        引落予定日経過 ({Math.abs(activeCardSummary.diffDays)}日前:{" "}
                        {activeCardSummary.nextWithdrawalDate})
                      </span>
                    )}
                  </span>
                  <span>未精算 {activeCardSummary.unsettledCount}件</span>
                </>
              ) : (
                <span>引き落とし予定なし</span>
              )}
            </div>

            {/* 複数クレジットカード登録時のセレクターピル */}
            {cardSummaries.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pt-1 no-scrollbar">
                {cardSummaries.map((c, idx) => (
                  <button
                    key={c.paymentMethod.id}
                    onClick={() => setSelectedCardIdx(idx)}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold shrink-0 transition-all flex items-center gap-1 cursor-pointer ${
                      activeCardIdx === idx
                        ? "bg-primary text-white shadow-2xs"
                        : "bg-app-surface text-content-muted border border-border hover:text-content-main"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        c.signal === "shortage"
                          ? "bg-rose-500"
                          : c.signal === "warning"
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                      }`}
                    />
                    <span>{c.paymentMethod.name}</span>
                    <span className="opacity-80">({formatCurrency(c.totalAmount)})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* こまめ活動 (草生やしストリーク) & こまめちゃん成長ウィジェット */}
      <div className="p-5 bg-app-surface border border-border rounded-2xl shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-accent" />
              <span className="text-sm font-bold text-content-main">
                {t.dashboard.streakTitle}
              </span>
            </div>
            <p className="text-[11px] text-content-muted mt-0.5">
              {t.dashboard.streakDesc}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-primary bg-primary-light px-3 py-1 rounded-full border border-primary-border flex items-center gap-1">
              <span>🔥</span>
              <span>
                {streakDays > 0
                  ? language === "ja"
                    ? `${streakDays}日連続こまめ記録中`
                    : `${streakDays}-day recording streak`
                  : language === "ja"
                  ? "今日からこまめに記録！"
                  : "Start your streak today!"}
              </span>
            </span>
          </div>
        </div>

        {/* 4週間のカレンダー風ストリークグリッド */}
        <div className="p-3 bg-app-subtle border border-border rounded-xl">
          {/* 週ヘッダー (曜日列 + 3週前, 2週前, 先週, 今週) */}
          <div className="grid grid-cols-5 gap-2 mb-2 text-center text-[10px] font-bold text-content-muted border-b border-border/60 pb-1">
            <span className="text-content-subtle">曜日</span>
            <span>{t.common.threeWeeksAgo}</span>
            <span>{t.common.twoWeeksAgo}</span>
            <span>{t.common.lastWeek}</span>
            <span className="text-primary">{t.common.thisWeek}</span>
          </div>

          {/* 曜日ラベル + 4週 × 7日のマトリックス */}
          <div className="space-y-1.5">
            {heatmapRows.map((row, rIdx) => (
              <div key={rIdx} className="grid grid-cols-5 items-center gap-2">
                {/* 曜日ラベル */}
                <span className="text-[10px] font-bold text-content-muted text-center">
                  {row.day}
                </span>

                {/* 4週分のセル */}
                {row.cells.map((cell, cIdx) => {
                  let bgClass = "bg-app-surface border-border";
                  let textClass = "text-content-subtle";

                  if (cell.isFuture) {
                    bgClass = "bg-app-surface/30 border-border/40";
                    textClass = "text-transparent";
                  } else if (cell.count === 1) {
                    bgClass = "bg-primary/25 border-primary/40";
                    textClass = "text-primary font-semibold";
                  } else if (cell.count === 2) {
                    bgClass = "bg-primary/50 border-primary/60";
                    textClass = "text-white font-bold";
                  } else if (cell.count >= 3) {
                    bgClass = "bg-primary text-white border-primary";
                    textClass = "text-white font-extrabold";
                  }

                  const todayRing = cell.isToday
                    ? "ring-2 ring-primary ring-offset-1 font-bold"
                    : "";

                  return (
                    <div
                      key={cIdx}
                      className={`h-7 rounded-md border flex items-center justify-center text-[10px] transition-transform hover:scale-105 cursor-pointer shadow-2xs ${bgClass} ${textClass} ${todayRing}`}
                      title={`${cell.dateStr} (${row.day}): ${cell.count}件の記録${
                        cell.isToday ? " [今日]" : ""
                      }`}
                    >
                      {cell.count > 0 ? cell.count : cell.isToday ? "・" : ""}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* 凡例 (Less -> More) */}
          <div className="flex items-center justify-between gap-1.5 mt-3 pt-2 border-t border-border/60 text-[10px] text-content-muted font-medium">
            <span className="text-content-subtle">
              {language === "ja"
                ? `直近4週間: 合計 ${totalPast4WeeksTx}件記録`
                : `4-Week Total: ${totalPast4WeeksTx} entries`}
            </span>
            <div className="flex items-center gap-1.5">
              <span>{t.common.less}</span>
              <div className="w-3 h-3 rounded-xs bg-app-surface border border-border" />
              <div className="w-3 h-3 rounded-xs bg-primary/25 border border-primary/40" />
              <div className="w-3 h-3 rounded-xs bg-primary/50 border border-primary/60" />
              <div className="w-3 h-3 rounded-xs bg-primary" />
              <span>{t.common.more}</span>
            </div>
          </div>
        </div>

        <div className="mt-3 text-right">
          <span className="text-xs text-content-muted font-medium">
            {t.dashboard.sproutGrowing}
          </span>
        </div>
      </div>

      {/* 2カラム分割: 費目別支出比率 ＆ 最近の明細リスト */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* 費目別の支出比率 (プロポーショナルバー) */}
        <div className="p-5 bg-app-surface border border-border rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <PieChart className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold text-content-main">
                {t.dashboard.expenseCategoryRatio}
              </span>
            </div>
            <span className="text-xs font-bold text-content-muted">
              合計 {formatCurrency(totalExpense)}
            </span>
          </div>

          {/* プロポーショナルバー */}
          <div className="w-full h-4 rounded-full overflow-hidden flex bg-app-subtle mb-4">
            {Object.entries(expenseByCategory).map(([category, amount], idx) => {
              const ratio = (amount / totalExpense) * 100;
              const colors = ["#2E7D32", "#E6A15C", "#2563EB", "#7C3AED", "#DB2777", "#059669"];
              return (
                <div
                  key={idx}
                  style={{ width: `${ratio}%`, backgroundColor: colors[idx % colors.length] }}
                  title={`${category}: ${formatCurrency(amount)} (${ratio.toFixed(1)}%)`}
                />
              );
            })}
          </div>

          {/* 費目別内訳リスト */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {Object.entries(expenseByCategory).map(([category, amount], idx) => {
              const ratio = ((amount / totalExpense) * 100).toFixed(1);
              const colors = ["#2E7D32", "#E6A15C", "#2563EB", "#7C3AED", "#DB2777", "#059669"];
              return (
                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-app-subtle">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: colors[idx % colors.length] }}
                    />
                    <span className="font-medium text-content-main truncate">{category}</span>
                  </div>
                  <span className="font-bold text-content-muted">{ratio}%</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 最近の明細リスト ＆ クイック記帳 */}
        <div className="p-5 bg-app-surface border border-border rounded-2xl shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-primary" />
                <span className="text-sm font-bold text-content-main">
                  {t.dashboard.recentTransactions}
                </span>
              </div>
              <button
                onClick={onOpenRegister}
                className="text-xs font-bold text-primary hover:underline cursor-pointer"
              >
                + 記帳する
              </button>
            </div>

            <div className="divide-y divide-border">
              {transactions.slice(0, 4).map((tx) => (
                <div key={tx.id} className="py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-xs shadow-2xs shrink-0"
                      style={{
                        backgroundColor:
                          tx.type === "income"
                            ? "#10B98120"
                            : tx.type === "transfer"
                            ? "#6366F120"
                            : `${tx.categoryColor || "#2E7D32"}20`,
                      }}
                    >
                      {tx.type === "income" ? "💰" : tx.type === "transfer" ? "🔄" : tx.categoryIcon || "🥦"}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-content-main">
                        {tx.shopName || (tx.type === "income" ? "給与・収入" : "明細")}
                      </div>
                      <div className="text-[10px] text-content-subtle">
                        {tx.date} • {tx.paymentMethodName || "現金"}
                      </div>
                    </div>
                  </div>
                  <div
                    className={`font-display text-xs font-extrabold ${
                      tx.type === "income"
                        ? "text-emerald-600"
                        : tx.type === "transfer"
                        ? "text-indigo-600"
                        : "text-content-main"
                    }`}
                  >
                    {tx.type === "income" ? "+" : tx.type === "transfer" ? "↔" : "-"}
                    {formatCurrency(tx.amount)}
                  </div>
                </div>
              ))}
              {transactions.length === 0 && (
                <div className="text-xs text-content-subtle text-center py-6">
                  {t.dashboard.noTransactions}
                </div>
              )}
            </div>
          </div>

          <button
            onClick={onOpenAllTransactions}
            className="w-full mt-4 py-2 bg-app-subtle hover:bg-border/60 text-content-main text-xs font-bold rounded-xl flex items-center justify-center gap-1 transition-colors cursor-pointer"
          >
            <span>{t.dashboard.viewAllTransactions}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>
    </div>
  );
}
