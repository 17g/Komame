"use client";

import React, { useState, useEffect } from "react";
import { PaymentMethodItem, AccountItem } from "@/types";
import { X, Check, Trash2, CreditCard } from "lucide-react";
import { HelpTooltip } from "./HelpTooltip";

interface EditPaymentMethodModalProps {
  paymentMethod: PaymentMethodItem | null;
  accounts: AccountItem[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

export function EditPaymentMethodModal({
  paymentMethod,
  accounts,
  isOpen,
  onClose,
  onSuccess,
}: EditPaymentMethodModalProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"credit_card" | "qr_code" | "debit_card" | "cash" | "direct_debit">("credit_card");
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [closingDay, setClosingDay] = useState("99");
  const [withdrawalDay, setWithdrawalDay] = useState("27");
  const [withdrawalMonthOffset, setWithdrawalMonthOffset] = useState("1");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (paymentMethod) {
      setName(paymentMethod.name || "");
      setType(paymentMethod.type || "credit_card");
      setSourceAccountId(paymentMethod.sourceAccountId || accounts[0]?.id || "");
      setClosingDay(paymentMethod.closingDay ? String(paymentMethod.closingDay) : "99");
      setWithdrawalDay(paymentMethod.withdrawalDay ? String(paymentMethod.withdrawalDay) : "27");
      setWithdrawalMonthOffset(paymentMethod.withdrawalMonthOffset !== undefined ? String(paymentMethod.withdrawalMonthOffset) : "1");
    }
  }, [paymentMethod, accounts]);

  if (!isOpen || !paymentMethod) return null;

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/accounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "payment_method",
          id: paymentMethod.id,
          name,
          type,
          sourceAccountId,
          closingDay: parseInt(closingDay, 10),
          withdrawalDay: parseInt(withdrawalDay, 10),
          withdrawalMonthOffset: parseInt(withdrawalMonthOffset, 10),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        onSuccess(data.message || "✓ 決済手段を更新しました！");
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

  const handleDelete = async () => {
    if (!confirm(`決済手段「${paymentMethod.name}」を削除しますか？\n（過去の利用明細は保持されますが、新規登録の選択肢から除外されます）`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/accounts?id=${paymentMethod.id}&actionType=payment_method`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        onSuccess("🗑️ 決済手段を削除しました。");
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
      <div className="fixed inset-0" onClick={onClose} />
      <div className="relative z-10 bg-app-surface border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
          <div className="flex items-center gap-2 font-bold text-base text-content-main">
            <CreditCard className="w-5 h-5 text-primary" />
            <span>決済手段の編集</span>
          </div>
          <button onClick={onClose} className="text-content-muted hover:text-content-main p-1 rounded-lg hover:bg-app-subtle cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleUpdate} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-content-muted mb-1 flex items-center gap-1">
              <span>決済手段名</span>
              <HelpTooltip text="クレジットカード名、コード決済名などを入力します。" />
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-xs font-medium focus:border-primary outline-none text-content-main"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-content-muted mb-1">種別</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-xs font-medium focus:border-primary outline-none text-content-main cursor-pointer"
              >
                <option value="credit_card">クレジットカード</option>
                <option value="qr_code">QR・バーコード決済</option>
                <option value="debit_card">デビットカード</option>
                <option value="cash">現金</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-content-muted mb-1 flex items-center gap-1">
                <span>引き落とし元口座</span>
                <HelpTooltip text="この決済手段の利用時に資金が引き落とされる銀行または現金口座を選択します。" />
              </label>
              <select
                value={sourceAccountId}
                onChange={(e) => setSourceAccountId(e.target.value)}
                className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-xs font-medium focus:border-primary outline-none text-content-main cursor-pointer"
              >
                {accounts.map((a) => {
                  let isDisabled = false;
                  let hint = "";

                  if (type === "cash") {
                    isDisabled = a.type !== "cash";
                    if (isDisabled) hint = "(手元現金のみ選択可)";
                  } else if (type === "qr_code") {
                    isDisabled = a.type !== "bank" && a.type !== "prepaid_wallet";
                    if (isDisabled) hint = "(銀行/Pay残高のみ選択可)";
                  } else if (type === "credit_card" || type === "debit_card") {
                    isDisabled = a.type !== "bank";
                    if (isDisabled) hint = "(銀行口座のみ選択可)";
                  }

                  return (
                    <option
                      key={a.id}
                      value={a.id}
                      disabled={isDisabled}
                      className={isDisabled ? "text-zinc-400 bg-zinc-100 dark:bg-zinc-800" : ""}
                    >
                      {a.icon || "🏦"} {a.name} {hint}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {type === "credit_card" && (
            <div className="p-3 bg-app-subtle rounded-xl space-y-2.5 border border-border">
              <div className="text-[11px] font-bold text-primary flex items-center gap-1">
                <span>💳 クレジットカード決済日設定</span>
                <HelpTooltip text="毎月の締め日と引き落とし日を設定すると、利用明細の引き落とし予定日が自動計算されます。" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-content-muted mb-1">締め日</label>
                  <select
                    value={closingDay}
                    onChange={(e) => setClosingDay(e.target.value)}
                    className="w-full px-2 py-1.5 bg-app-surface border border-border rounded text-xs text-content-main cursor-pointer"
                  >
                    <option value="99">月末</option>
                    <option value="10">10日</option>
                    <option value="15">15日</option>
                    <option value="20">20日</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-content-muted mb-1">引き落とし月</label>
                  <select
                    value={withdrawalMonthOffset}
                    onChange={(e) => setWithdrawalMonthOffset(e.target.value)}
                    className="w-full px-2 py-1.5 bg-app-surface border border-border rounded text-xs text-content-main cursor-pointer"
                  >
                    <option value="1">翌月</option>
                    <option value="2">翌々月</option>
                    <option value="0">当月</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-content-muted mb-1">引き落とし日</label>
                  <select
                    value={withdrawalDay}
                    onChange={(e) => setWithdrawalDay(e.target.value)}
                    className="w-full px-2 py-1.5 bg-app-surface border border-border rounded text-xs text-content-main cursor-pointer"
                  >
                    <option value="27">27日</option>
                    <option value="10">10日</option>
                    <option value="4">4日</option>
                    <option value="99">月末</option>
                  </select>
                </div>
              </div>
            </div>
          )}

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
