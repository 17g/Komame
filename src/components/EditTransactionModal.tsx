"use client";

import React, { useState, useEffect } from "react";
import { TransactionItem, CategoryItem, PaymentMethodItem } from "@/types";
import { X, Check, Trash2, Edit3 } from "lucide-react";
import { HelpTooltip } from "./HelpTooltip";

interface EditTransactionModalProps {
  transaction: TransactionItem | null;
  categories: CategoryItem[];
  paymentMethods: PaymentMethodItem[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

export function EditTransactionModal({
  transaction,
  categories,
  paymentMethods,
  isOpen,
  onClose,
  onSuccess,
}: EditTransactionModalProps) {
  const [date, setDate] = useState("");
  const [shopName, setShopName] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (transaction) {
      setDate(transaction.date || "");
      setShopName(transaction.shopName || "");
      setAmount(transaction.amount ? String(transaction.amount) : "");
      setCategoryId(transaction.categoryId || (categories[0]?.id || ""));
      setPaymentMethodId(transaction.paymentMethodId || (paymentMethods[0]?.id || ""));
      setNote(transaction.note || "");
    }
  }, [transaction, categories, paymentMethods]);

  if (!isOpen || !transaction) return null;

  // 更新実行
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/transactions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: transaction.id,
          date,
          shopName,
          amount: parseInt(amount, 10),
          categoryId,
          paymentMethodId,
          note,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        onSuccess("✓ 明細内容を更新しました！");
        onClose();
      } else {
        onSuccess(data.error || "更新に失敗しました。");
      }
    } catch {
      onSuccess("通信エラーが発生しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 削除実行
  const handleDelete = async () => {
    if (!confirm("この明細を削除しますか？\n（即時決済の場合は口座残高が自動的に巻き戻されます）")) {
      return;
    }

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/transactions?id=${transaction.id}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        onSuccess("🗑️ 明細を削除しました。");
        onClose();
      } else {
        onSuccess(data.error || "削除に失敗しました。");
      }
    } catch {
      onSuccess("削除処理中にエラーが発生しました。");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      {/* 外部クリックで閉じる */}
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative z-10 bg-app-surface border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
          <div className="flex items-center gap-2 font-bold text-base text-content-main">
            <Edit3 className="w-5 h-5 text-primary" />
            <span>明細内容の修正・編集</span>
          </div>
          <button
            onClick={onClose}
            className="text-content-muted hover:text-content-main p-1 rounded-lg hover:bg-app-subtle cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleUpdate} className="space-y-3.5">
          {/* 日付 */}
          <div>
            <label className="block text-xs font-bold text-content-muted mb-1 flex items-center gap-1">
              <span>日付</span>
              <HelpTooltip text="支出または収入が発生した日付です。" />
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-xs font-medium text-content-main focus:border-primary outline-none"
              required
            />
          </div>

          {/* 店舗名 */}
          <div>
            <label className="block text-xs font-bold text-content-muted mb-1">店舗・取引先名</label>
            <input
              type="text"
              placeholder="例: セブンイレブン"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-xs font-medium text-content-main focus:border-primary outline-none"
            />
          </div>

          {/* 金額 */}
          <div>
            <label className="block text-xs font-bold text-content-muted mb-1">金額 (円)</label>
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
              className="w-full px-3.5 py-2.5 bg-app-subtle border border-border rounded-xl text-lg font-extrabold font-display text-content-main focus:border-primary outline-none"
              required
            />
          </div>

          {/* 費目 ＆ 支払手段 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-content-muted mb-1">費目</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-xs font-medium text-content-main focus:border-primary outline-none cursor-pointer"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-content-muted mb-1">支払手段</label>
              <select
                value={paymentMethodId}
                onChange={(e) => setPaymentMethodId(e.target.value)}
                className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-xs font-medium text-content-main focus:border-primary outline-none cursor-pointer"
              >
                {paymentMethods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 商品名等 */}
          <div>
            <label className="block text-xs font-bold text-content-muted mb-1 flex items-center gap-1">
              <span>商品名等</span>
              <HelpTooltip text="商品名、レシート表記、個数や特記事項を記録できます" />
            </label>
            <input
              type="text"
              placeholder="例: お茶、おにぎり2個"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-xs font-medium text-content-main focus:border-primary outline-none"
            />
          </div>

          {/* アクションボタン */}
          <div className="flex items-center justify-between gap-2 pt-3 border-t border-border mt-4">
            <button
              type="button"
              disabled={isDeleting || isSubmitting}
              onClick={handleDelete}
              className="py-2.5 px-3 bg-danger-light text-danger border border-danger/20 rounded-xl text-xs font-bold hover:bg-danger/20 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>削除</span>
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="py-2.5 px-4 bg-app-subtle border border-border text-content-muted text-xs font-bold rounded-xl hover:bg-border/50 transition-colors cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={isSubmitting || isDeleting}
                className="py-2.5 px-5 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary-hover shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{isSubmitting ? "更新中..." : "更新する"}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
