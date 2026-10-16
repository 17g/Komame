"use client";

import React, { useState, useEffect } from "react";
import { TransactionItem, CategoryItem, PaymentMethodItem, TagItem } from "@/types";
import { X, Check, Trash2, Edit3, Tag, Plus } from "lucide-react";
import { HelpTooltip } from "./HelpTooltip";

interface EditTransactionModalProps {
  transaction: TransactionItem | null;
  categories: CategoryItem[];
  paymentMethods: PaymentMethodItem[];
  tags?: TagItem[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onRefreshTags?: () => void;
}

export function EditTransactionModal({
  transaction,
  categories,
  paymentMethods,
  tags = [],
  isOpen,
  onClose,
  onSuccess,
  onRefreshTags,
}: EditTransactionModalProps) {
  const [date, setDate] = useState("");
  const [shopName, setShopName] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [note, setNote] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<TagItem[]>(tags);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#4F46E5");
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setAvailableTags(tags);
  }, [tags]);

  useEffect(() => {
    if (transaction) {
      setDate(transaction.date || "");
      setShopName(transaction.shopName || "");
      setAmount(transaction.amount ? String(transaction.amount) : "");
      setCategoryId(transaction.categoryId || (categories[0]?.id || ""));
      setPaymentMethodId(transaction.paymentMethodId || (paymentMethods[0]?.id || ""));
      setNote(transaction.note || "");
      setSelectedTagIds(transaction.tags?.map((t) => t.id) || []);
      setIsCreatingTag(false);
      setNewTagName("");
    }
  }, [transaction, categories, paymentMethods]);

  if (!isOpen || !transaction) return null;

  // タグ選択のトグル
  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  // 新規タグ作成
  const handleCreateTag = async () => {
    const clean = newTagName.trim().replace(/^#+/, "");
    if (!clean) return;
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clean, color: newTagColor }),
      });
      if (res.ok) {
        const data = await res.json();
        const tag = data.tag;
        if (!availableTags.some((t) => t.id === tag.id)) {
          setAvailableTags((prev) => [...prev, tag]);
        }
        if (!selectedTagIds.includes(tag.id)) {
          setSelectedTagIds((prev) => [...prev, tag.id]);
        }
        setNewTagName("");
        setIsCreatingTag(false);
        if (onRefreshTags) onRefreshTags();
      }
    } catch {
      // ignore
    }
  };

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
          toAccountId: transaction.toAccountId,
          note,
          tagIds: selectedTagIds,
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

          {/* タグ付け & カラーラベリング */}
          <div>
            <label className="block text-xs font-bold text-content-muted mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-primary" />
                <span>タグ・カラーラベル</span>
                <HelpTooltip text="支出や振替に色付きタグ（#固定費、#自己投資など）を付与できます。" />
              </span>
              <button
                type="button"
                onClick={() => setIsCreatingTag(!isCreatingTag)}
                className="text-[11px] text-primary hover:underline font-bold flex items-center gap-0.5 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>{isCreatingTag ? "閉じる" : "新規タグ"}</span>
              </button>
            </label>

            {isCreatingTag && (
              <div className="mb-2.5 p-2.5 bg-app-subtle border border-border rounded-xl space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="タグ名 (例: 固定費, ご褒美)"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 bg-app-surface border border-border rounded-lg text-xs text-content-main outline-none focus:border-primary"
                  />
                  <div className="flex items-center gap-1">
                    {["#4F46E5", "#0284C7", "#16A34A", "#EA580C", "#9333EA", "#E11D48"].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewTagColor(c)}
                        className={`w-4 h-4 rounded-full transition-transform cursor-pointer ${
                          newTagColor === c ? "ring-2 ring-primary scale-110" : ""
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateTag}
                    className="px-2.5 py-1.5 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary-hover cursor-pointer"
                  >
                    追加
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
              {availableTags.length === 0 ? (
                <span className="text-[11px] text-content-subtle">登録されているタグがありません</span>
              ) : (
                availableTags.map((tag) => {
                  const isSelected = selectedTagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer border ${
                        isSelected
                          ? "border-transparent text-white shadow-2xs"
                          : "bg-app-subtle border-border text-content-muted hover:border-primary/40 hover:text-content-main"
                      }`}
                      style={{
                        backgroundColor: isSelected ? tag.color || "#10B981" : undefined,
                      }}
                    >
                      <span>#{tag.name}</span>
                    </button>
                  );
                })
              )}
            </div>
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
