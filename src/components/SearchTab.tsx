"use client";

import React, { useState } from "react";
import { TransactionItem, CategoryItem, PaymentMethodItem } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { Search, Filter, Calendar, ArrowUpDown, Tag, DollarSign, Wallet, Store, Edit2, TrendingUp, TrendingDown, ArrowRightLeft, PiggyBank, Sparkles } from "lucide-react";
import { EditTransactionModal } from "./EditTransactionModal";
import { useTranslation } from "@/lib/i18n";

interface SearchTabProps {
  transactions: TransactionItem[];
  categories: CategoryItem[];
  paymentMethods: PaymentMethodItem[];
  onTriggerToast: (msg: string) => void;
  onRefresh: () => void;
}

export function SearchTab({
  transactions,
  categories,
  paymentMethods,
  onTriggerToast,
  onRefresh,
}: SearchTabProps) {
  const { t } = useTranslation();

  // フィルター・ソート状態 (4つのモード: すべて / 支出 / 収入 / 資金移動)
  const [typeFilter, setTypeFilter] = useState<"all" | "expense" | "income" | "transfer">("all");
  const [keyword, setKeyword] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("all");
  const [period, setPeriod] = useState<"all" | "this_month" | "last_month">("all");
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "amount_desc">("date_desc");

  // 編集モーダル状態
  const [selectedTx, setSelectedTx] = useState<TransactionItem | null>(null);

  // フィルタリング処理
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const filteredTransactions = transactions.filter((tx) => {
    // 0. 収支種別フィルター (すべて / 支出のみ / 収入のみ / 資金移動のみ)
    if (typeFilter !== "all" && tx.type !== typeFilter) {
      return false;
    }

    // 1. フリーワード検索 (店舗名・メモ・費目名)
    if (keyword.trim()) {
      const kw = keyword.toLowerCase();
      const matchShop = tx.shopName?.toLowerCase().includes(kw);
      const matchNote = tx.note?.toLowerCase().includes(kw);
      const matchCat = tx.categoryName?.toLowerCase().includes(kw);
      if (!matchShop && !matchNote && !matchCat) return false;
    }

    // 2. 費目フィルター (支出の場合のみ適用)
    if (selectedCategory !== "all" && tx.categoryId !== selectedCategory) {
      return false;
    }

    // 3. 決済手段フィルター
    if (selectedPaymentMethod !== "all" && tx.paymentMethodId !== selectedPaymentMethod) {
      return false;
    }

    // 4. 期間フィルター
    if (period === "this_month") {
      const txDate = new Date(tx.date);
      if (txDate.getFullYear() !== currentYear || txDate.getMonth() !== currentMonth) {
        return false;
      }
    } else if (period === "last_month") {
      const txDate = new Date(tx.date);
      const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      if (txDate.getFullYear() !== lastMonthYear || txDate.getMonth() !== lastMonth) {
        return false;
      }
    }

    return true;
  });

  // ソート処理
  const sortedTransactions = [...filteredTransactions].sort((a, b) => {
    if (sortBy === "date_desc") {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    } else if (sortBy === "date_asc") {
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    } else {
      return b.amount - a.amount;
    }
  });

  // 💡 スマート集計: 実質収入・実質支出・資金移動を厳密に分離集計
  const realIncome = filteredTransactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  const realExpense = filteredTransactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalTransfer = filteredTransactions
    .filter((t) => t.type === "transfer" || (t.type === "expense" && t.toAccountId))
    .reduce((sum, t) => sum + t.amount, 0);

  const netSavings = realIncome - realExpense;

  return (
    <div className="flex flex-col gap-5 pb-20">
      
      {/* 収支種別 切り替えタブ (4モード: 全明細 / 💸 支出 / 💰 収入 / 🔄 資金移動) */}
      <div className="flex p-1 bg-app-surface border border-border rounded-2xl shadow-2xs gap-1">
        <button
          type="button"
          onClick={() => setTypeFilter("all")}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            typeFilter === "all"
              ? "bg-primary text-white shadow-xs"
              : "text-content-muted hover:text-content-main"
          }`}
        >
          {t.search.allTab}
        </button>
        <button
          type="button"
          onClick={() => setTypeFilter("expense")}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            typeFilter === "expense"
              ? "bg-red-600 text-white shadow-xs"
              : "text-content-muted hover:text-content-main"
          }`}
        >
          {t.search.expenseOnlyTab}
        </button>
        <button
          type="button"
          onClick={() => setTypeFilter("income")}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            typeFilter === "income"
              ? "bg-emerald-600 text-white shadow-xs"
              : "text-content-muted hover:text-content-main"
          }`}
        >
          {t.search.incomeOnlyTab}
        </button>
        <button
          type="button"
          onClick={() => setTypeFilter("transfer")}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            typeFilter === "transfer"
              ? "bg-indigo-600 text-white shadow-xs"
              : "text-content-muted hover:text-content-main"
          }`}
        >
          {t.search.transferOnlyTab}
        </button>
      </div>

      {/* 検索 & フィルターコントロールバー */}
      <div className="p-4 bg-app-surface border border-border rounded-xl shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-content-main">
            <Search className="w-4 h-4 text-primary" />
            <span>
              {typeFilter === "income"
                ? t.search.titleIncome
                : typeFilter === "expense"
                ? t.search.titleExpense
                : typeFilter === "transfer"
                ? t.search.titleTransfer
                : t.search.titleAll}
            </span>
          </div>
          <span className="text-[11px] font-bold text-content-muted">
            {t.search.matchingCount} {filteredTransactions.length} {t.search.itemsUnit}
          </span>
        </div>

        {/* キーワード入力 */}
        <div className="relative">
          <input
            type="text"
            placeholder={
              typeFilter === "income"
                ? t.search.placeholderIncome
                : typeFilter === "transfer"
                ? t.search.placeholderTransfer
                : t.search.placeholderAll
            }
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-app-subtle border border-border rounded-lg text-xs font-medium text-content-main focus:border-primary outline-none"
          />
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-content-subtle" />
        </div>

        {/* ドロップダウンフィルター 4種グリッド */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {/* 費目フィルター */}
          <div>
            <select
              value={selectedCategory}
              disabled={typeFilter === "income" || typeFilter === "transfer"}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-app-subtle border border-border rounded-lg text-xs text-content-main cursor-pointer disabled:opacity-40"
            >
              <option value="all">{t.search.allCategories}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* 決済手段フィルター */}
          <div>
            <select
              value={selectedPaymentMethod}
              onChange={(e) => setSelectedPaymentMethod(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-app-subtle border border-border rounded-lg text-xs text-content-main cursor-pointer"
            >
              <option value="all">{t.search.allPaymentMethods}</option>
              {paymentMethods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* 期間フィルター */}
          <div>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as any)}
              className="w-full px-2.5 py-1.5 bg-app-subtle border border-border rounded-lg text-xs text-content-main cursor-pointer"
            >
              <option value="all">{t.search.allPeriods}</option>
              <option value="this_month">{t.search.thisMonth}</option>
              <option value="last_month">{t.search.lastMonth}</option>
            </select>
          </div>

          {/* 並び順ソート */}
          <div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full px-2.5 py-1.5 bg-app-subtle border border-border rounded-lg text-xs text-content-main cursor-pointer"
            >
              <option value="date_desc">{t.search.sortDateDesc}</option>
              <option value="date_asc">{t.search.sortDateAsc}</option>
              <option value="amount_desc">{t.search.sortAmountDesc}</option>
            </select>
          </div>
        </div>
      </div>

      {/* スマート集計サマリーカード */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 実質収入 */}
        <div className="p-3.5 bg-app-surface border border-border rounded-xl shadow-2xs">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold text-content-muted flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
              <span>{t.search.realIncome}</span>
            </div>
            <span className="text-[10px] text-content-subtle">{t.search.realIncomeSub}</span>
          </div>
          <div className="font-display font-bold text-base text-emerald-600 mt-1">
            +{formatCurrency(realIncome)}
          </div>
        </div>

        {/* 実質支出 */}
        <div className="p-3.5 bg-app-surface border border-border rounded-xl shadow-2xs">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold text-content-muted flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5 text-danger" />
              <span>{t.search.realExpense}</span>
            </div>
            <span className="text-[10px] text-content-subtle">{t.search.realExpenseSub}</span>
          </div>
          <div className="font-display font-bold text-base text-danger mt-1">
            -{formatCurrency(realExpense)}
          </div>
        </div>

        {/* 資金移動・積立 */}
        <div className="p-3.5 bg-app-surface border border-border rounded-xl shadow-2xs">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold text-content-muted flex items-center gap-1">
              <PiggyBank className="w-3.5 h-3.5 text-indigo-600" />
              <span>{t.search.transferSavings}</span>
            </div>
            <span className="text-[10px] text-content-subtle">{t.search.transferSavingsSub}</span>
          </div>
          <div className="font-display font-bold text-base text-indigo-600 mt-1">
            {formatCurrency(totalTransfer)}
          </div>
        </div>

        {/* 純貯蓄増減 */}
        <div className="p-3.5 bg-app-surface border border-primary-border/60 bg-primary-light/10 rounded-xl shadow-2xs">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold text-primary flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t.search.netSavings}</span>
            </div>
            <span className="text-[10px] text-content-subtle">{t.search.netSavingsSub}</span>
          </div>
          <div
            className={`font-display font-bold text-base mt-1 ${
              netSavings >= 0 ? "text-primary" : "text-danger"
            }`}
          >
            {netSavings >= 0 ? "+" : ""}
            {formatCurrency(netSavings)}
          </div>
        </div>
      </div>

      {/* 明細リスト表示 */}
      <div className="p-5 bg-app-surface border border-border rounded-2xl shadow-sm">
        <div className="divide-y divide-border">
          {sortedTransactions.length === 0 ? (
            <div className="py-12 text-center text-xs text-content-muted">
              {t.search.noResults}
            </div>
          ) : (
            sortedTransactions.map((tx) => (
              <div
                key={tx.id}
                onClick={() => setSelectedTx(tx)}
                className="py-3.5 flex items-center justify-between group hover:bg-app-subtle/50 px-2 rounded-xl transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-sm shadow-xs shrink-0"
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
                    <div className="text-xs font-bold text-content-main flex items-center gap-2">
                      <span>
                        {tx.shopName ||
                          (tx.type === "income"
                            ? t.search.badgeIncome
                            : tx.type === "transfer"
                            ? t.search.badgeTransfer
                            : "支出明細")}
                      </span>
                      {tx.note && (
                        <span className="text-[10px] text-content-subtle font-normal truncate max-w-[150px] sm:max-w-xs">
                          ({tx.note})
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-content-subtle mt-0.5">
                      {tx.date} • {tx.paymentMethodName || (tx.type === "income" ? "口座入金" : tx.type === "transfer" ? "資産口座振替" : "現金")}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div
                      className={`font-display text-sm font-extrabold ${
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
                    <span
                      className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md mt-0.5 ${
                        tx.type === "income"
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : tx.type === "transfer"
                          ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
                          : ""
                      }`}
                      style={
                        tx.type === "income" || tx.type === "transfer"
                          ? undefined
                          : {
                              backgroundColor: `${tx.categoryColor || "#2E7D32"}15`,
                              color: tx.categoryColor || "#2E7D32",
                            }
                      }
                    >
                      {tx.type === "income"
                        ? t.search.badgeIncome
                        : tx.type === "transfer"
                        ? t.search.badgeTransfer
                        : tx.categoryName || "食費"}
                    </span>
                  </div>

                  {/* 編集アイコンボタン */}
                  <div className="p-1.5 text-content-subtle group-hover:text-primary group-hover:bg-app-surface rounded-lg border border-transparent group-hover:border-border transition-all">
                    <Edit2 className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 明細修正モーダル */}
      <EditTransactionModal
        transaction={selectedTx}
        categories={categories}
        paymentMethods={paymentMethods}
        isOpen={!!selectedTx}
        onClose={() => setSelectedTx(null)}
        onSuccess={(msg) => {
          onTriggerToast(msg);
          onRefresh();
        }}
      />
    </div>
  );
}
