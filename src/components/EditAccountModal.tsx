"use client";

import React, { useState, useEffect } from "react";
import { AccountItem } from "@/types";
import { X, Check, Trash2, Landmark } from "lucide-react";
import { HelpTooltip } from "./HelpTooltip";

interface EditAccountModalProps {
  account: AccountItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

export function EditAccountModal({
  account,
  isOpen,
  onClose,
  onSuccess,
}: EditAccountModalProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"bank" | "prepaid_wallet" | "cash" | "term_deposit" | "nisa_investment">("bank");
  const [balance, setBalance] = useState("");
  const [icon, setIcon] = useState("🏛️");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (account) {
      setName(account.name || "");
      setType(account.type || "bank");
      setBalance(account.balance !== undefined ? String(account.balance) : "0");
      setIcon(account.icon || "🏛️");
    }
  }, [account]);

  if (!isOpen || !account) return null;

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/accounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "account",
          id: account.id,
          name,
          type,
          balance: parseInt(balance || "0", 10),
          icon,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        onSuccess(data.message || "✓ 口座情報を更新しました！");
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
    if (!confirm(`口座「${account.name}」を削除しますか？\n（この口座に関連する履歴は残りますが、一覧から非表示になります）`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/accounts?id=${account.id}&actionType=account`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        onSuccess("🗑️ 口座を削除しました。");
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
            <Landmark className="w-5 h-5 text-primary" />
            <span>口座・ウォレットの編集</span>
          </div>
          <button onClick={onClose} className="text-content-muted hover:text-content-main p-1 rounded-lg hover:bg-app-subtle cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleUpdate} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-content-muted mb-1 flex items-center gap-1">
              <span>口座・資産名</span>
              <HelpTooltip text="銀行名、ウォレット名、証券口座名などを入力します。" />
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
              <label className="block text-xs font-bold text-content-muted mb-1">口座種別</label>
              <select
                value={type}
                onChange={(e) => {
                  const t = e.target.value as any;
                  setType(t);
                  if (t === "bank") setIcon("🏛️");
                  else if (t === "prepaid_wallet") setIcon("📱");
                  else if (t === "cash") setIcon("💵");
                  else if (t === "nisa_investment") setIcon("📈");
                  else setIcon("🏦");
                }}
                className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-xs font-medium focus:border-primary outline-none text-content-main cursor-pointer"
              >
                <option value="bank">銀行口座 (普通/当座)</option>
                <option value="prepaid_wallet">プリペイド/Pay残高</option>
                <option value="cash">手元現金 (財布)</option>
                <option value="nisa_investment">投資信託 (つみたてNISA)</option>
                <option value="term_deposit">定期預金・積立</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-content-muted mb-1">残高 (円)</label>
              <input
                type="text"
                inputMode="numeric"
                value={balance}
                onChange={(e) => setBalance(e.target.value.replace(/[^0-9]/g, ""))}
                className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-xs font-bold focus:border-primary outline-none text-content-main"
              />
            </div>
          </div>

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
