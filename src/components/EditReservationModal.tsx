"use client";

import React, { useState, useEffect } from "react";
import { AccountReservationItem, AccountItem } from "@/types";
import { X, Check, Trash2, Tag } from "lucide-react";
import { HelpTooltip } from "./HelpTooltip";

interface EditReservationModalProps {
  reservation: AccountReservationItem | null;
  accounts: AccountItem[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

export function EditReservationModal({
  reservation,
  accounts,
  isOpen,
  onClose,
  onSuccess,
}: EditReservationModalProps) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [color, setColor] = useState("#E6A15C");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (reservation) {
      setName(reservation.name || "");
      setAmount(reservation.amount !== undefined ? String(reservation.amount) : "0");
      setAccountId(reservation.accountId || accounts[0]?.id || "");
      setColor(reservation.color || "#E6A15C");
      setNote(reservation.note || "");
    }
  }, [reservation, accounts]);

  if (!isOpen || !reservation) return null;

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/accounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "reservation",
          id: reservation.id,
          name,
          amount: parseInt(amount || "0", 10),
          accountId,
          color,
          note,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        onSuccess(data.message || "✓ 資金色分け設定を更新しました！");
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
    if (!confirm(`資金色分け「${reservation.name}」を解除・削除しますか？\n（ロックされていた資金は口座の利用可能残高に復帰します）`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/accounts?id=${reservation.id}&actionType=reservation`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        onSuccess("🗑️ 資金色分けを解除・削除しました。");
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
            <Tag className="w-5 h-5 text-accent" />
            <span>資金色分け（バーチャル貯蓄）の編集</span>
          </div>
          <button onClick={onClose} className="text-content-muted hover:text-content-main p-1 rounded-lg hover:bg-app-subtle cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleUpdate} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-content-muted mb-1 flex items-center gap-1">
              <span>対象口座</span>
              <HelpTooltip text="資金をロック・色分けする銀行口座を選択します。" />
            </label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-xs font-medium focus:border-primary outline-none text-content-main cursor-pointer"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.icon || "🏛️"} {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-content-muted mb-1">目的名</label>
            <input
              type="text"
              placeholder="例: 車検費用, 生活防衛資金"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-xs font-medium focus:border-primary outline-none text-content-main"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-content-muted mb-1">確保金額 (円)</label>
              <input
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-xs font-bold focus:border-primary outline-none text-content-main"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-content-muted mb-1">カラータグ</label>
              <div className="flex items-center gap-2 h-9">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-10 h-8 rounded border border-border cursor-pointer bg-transparent"
                />
                <span className="text-xs text-content-muted">{color}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-content-muted mb-1">メモ</label>
            <input
              type="text"
              placeholder="例: 次回5月支払い用"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-xs font-medium focus:border-primary outline-none text-content-main"
            />
          </div>

          <div className="flex items-center justify-between gap-2 pt-3 border-t border-border mt-4">
            <button
              type="button"
              disabled={isDeleting || isSubmitting}
              onClick={handleDelete}
              className="py-2.5 px-3 bg-danger-light text-danger border border-danger/20 rounded-xl text-xs font-bold hover:bg-danger/20 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>解除・削除</span>
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
