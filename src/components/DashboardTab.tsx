"use client";

import React from "react";
import { formatCurrency } from "@/lib/utils";
import { AccountItem, TransactionItem } from "@/types";
import { Lock, TrendingUp, CheckCircle2, Flame, ArrowRight, ShieldCheck, PieChart, Wallet } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface DashboardTabProps {
  accounts: AccountItem[];
  transactions: TransactionItem[];
  onOpenRegister: () => void;
  onOpenAllTransactions: () => void;
}

export function DashboardTab({
  accounts,
  transactions,
  onOpenRegister,
  onOpenAllTransactions,
}: DashboardTabProps) {
  const { t } = useTranslation();

  // 1. 総資産と実質利用可能額の集計
  const totalAssets = accounts.reduce((sum, a) => sum + a.balance, 0);
  const totalReserved = accounts.reduce((sum, a) => sum + (a.reservedAmount || 0), 0);
  const availableBalance = totalAssets - totalReserved;

  // 2. クレカ次回引き落とし予定額の集計 (未精算のクレカ明細)
  const upcomingCardSettlements = transactions
    .filter((t) => !t.isSettled && t.type === "expense" && t.scheduledWithdrawalDate)
    .reduce((sum, t) => sum + t.amount, 0);

  // 3. 原資判定 (メイン口座等の利用可能額と比較)
  const isFundsSufficient = availableBalance >= upcomingCardSettlements;

  // 4. 費目別の支出比率の集計
  const expenseByCategory = transactions
    .filter((t) => t.type === "expense")
    .reduce((acc, t) => {
      const cat = t.categoryName || "その他";
      acc[cat] = (acc[cat] || 0) + t.amount;
      return acc;
    }, {} as Record<string, number>);

  const totalExpense = Object.values(expenseByCategory).reduce((sum, val) => sum + val, 0) || 1;

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
        <div className="p-5 bg-gradient-to-br from-app-surface to-app-subtle border border-primary-border border-l-4 border-l-primary rounded-2xl shadow-sm flex flex-col justify-between sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-primary flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              <span>{t.dashboard.upcomingCardSettlement}</span>
            </div>
            {isFundsSufficient ? (
              <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                {t.dashboard.fundsReady}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] font-bold text-danger bg-danger-light px-2 py-0.5 rounded-full">
                {t.dashboard.fundsShortage}
              </span>
            )}
          </div>

          <div className="my-2">
            <div className="text-xs text-content-muted">楽天カード (三井住友銀行)</div>
            <div className="font-display text-2xl font-extrabold text-content-main mt-0.5">
              {formatCurrency(upcomingCardSettlements > 0 ? upcomingCardSettlements : 85420)}
            </div>
          </div>

          <div className="text-[11px] text-content-subtle">
            口座引落まであと <b>5日</b>
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
            <span className="text-xs font-bold text-primary bg-primary-light px-3 py-1 rounded-full border border-primary-border">
              🔥 {t.dashboard.streakDays}
            </span>
          </div>
        </div>

        {/* 4週間のカレンダー風ストリークグリッド */}
        <div className="p-3 bg-app-subtle border border-border rounded-xl">
          {/* 週ヘッダー (3週前, 2週前, 先週, 今週) */}
          <div className="grid grid-cols-4 gap-2 mb-2 text-center text-[10px] font-bold text-content-muted border-b border-border/60 pb-1">
            <span>{t.common.threeWeeksAgo}</span>
            <span>{t.common.twoWeeksAgo}</span>
            <span>{t.common.lastWeek}</span>
            <span className="text-primary">{t.common.thisWeek}</span>
          </div>

          {/* 曜日ラベル + 4週 × 7日のマトリックス */}
          <div className="space-y-1.5">
            {[
              { day: t.common.mon, records: [1, 2, 0, 3] },
              { day: t.common.tue, records: [0, 1, 2, 2] },
              { day: t.common.wed, records: [3, 0, 1, 4] },
              { day: t.common.thu, records: [2, 3, 2, 1] },
              { day: t.common.fri, records: [1, 2, 4, 3] },
              { day: t.common.sat, records: [4, 5, 3, 2] },
              { day: t.common.sun, records: [2, 1, 2, 1] },
            ].map((row, rIdx) => (
              <div key={rIdx} className="grid grid-cols-5 items-center gap-2">
                {/* 曜日ラベル */}
                <span className="text-[10px] font-bold text-content-muted text-center">
                  {row.day}
                </span>

                {/* 4週分のセル */}
                {row.records.map((count, cIdx) => {
                  let bgClass = "bg-app-surface border-border";
                  let textClass = "text-content-subtle";
                  if (count === 1) {
                    bgClass = "bg-primary/25 border-primary/40";
                    textClass = "text-primary font-semibold";
                  } else if (count === 2) {
                    bgClass = "bg-primary/50 border-primary/60";
                    textClass = "text-white font-bold";
                  } else if (count >= 3) {
                    bgClass = "bg-primary text-white";
                    textClass = "text-white font-extrabold";
                  }

                  return (
                    <div
                      key={cIdx}
                      className={`h-7 rounded-md border flex items-center justify-center text-[10px] transition-transform hover:scale-105 cursor-pointer shadow-2xs ${bgClass} ${textClass}`}
                      title={`${count}件の記録`}
                    >
                      {count > 0 ? count : ""}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* 凡例 (Less -> More) */}
          <div className="flex items-center justify-end gap-1.5 mt-3 pt-2 border-t border-border/60 text-[10px] text-content-muted font-medium">
            <span>{t.common.less}</span>
            <div className="w-3 h-3 rounded-xs bg-app-surface border border-border" />
            <div className="w-3 h-3 rounded-xs bg-primary/25 border border-primary/40" />
            <div className="w-3 h-3 rounded-xs bg-primary/50 border border-primary/60" />
            <div className="w-3 h-3 rounded-xs bg-primary" />
            <span>{t.common.more}</span>
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
