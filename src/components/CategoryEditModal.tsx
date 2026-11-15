"use client";

import React, { useState, useEffect } from "react";
import { CategoryItem } from "@/types";
import { X, Tag, Check } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

const PRESET_ICONS = [
  "📁", "🐾", "📚", "🎵", "🎬", "🏋️", "💄", "✈️",
  "🧸", "🪴", "💻", "🎁", "🚗", "🏥", "🍰", "🍺",
];

const PRESET_COLORS = [
  "#2E7D32", "#059669", "#0284C7", "#2563EB",
  "#4F46E5", "#7C3AED", "#9333EA", "#DB2777",
  "#DC2626", "#EA580C", "#D97706", "#475569",
];

interface CategoryEditModalProps {
  isOpen: boolean;
  editingCategory: CategoryItem | null;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export function CategoryEditModal({
  isOpen,
  editingCategory,
  onClose,
  onSuccess,
  onError,
}: CategoryEditModalProps) {
  const { t } = useTranslation();

  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📁");
  const [color, setColor] = useState("#2E7D32");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (editingCategory) {
        setName(editingCategory.name);
        setIcon(editingCategory.icon || "📁");
        setColor(editingCategory.color || "#2E7D32");
      } else {
        setName("");
        setIcon("📁");
        setColor("#2E7D32");
      }
    }
  }, [isOpen, editingCategory]);

  if (!isOpen) return null;

  const isEdit = Boolean(editingCategory);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      onError("費目名を入力してください。");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/categories", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isEdit
            ? {
                action: "update",
                id: editingCategory!.id,
                name: trimmedName,
                icon: icon.trim() || "📁",
                color,
              }
            : {
                name: trimmedName,
                icon: icon.trim() || "📁",
                color,
              }
        ),
      });

      const data = await res.json();
      if (res.ok) {
        onSuccess(data.message || (isEdit ? "費目を更新しました。" : "費目を追加しました。"));
        onClose();
      } else {
        onError(data.error || "費目の保存に失敗しました。");
      }
    } catch {
      onError("通信エラーが発生しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-app-surface border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 font-bold text-base text-content-main">
            <Tag className="w-5 h-5 text-primary" />
            <span>{isEdit ? t.admin.categoryEditTitle : t.admin.categoryCreateTitle}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-content-muted hover:text-content-main p-1 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* プレビュー */}
          <div className="p-3 bg-app-subtle border border-border rounded-xl flex items-center justify-between">
            <span className="text-[11px] font-bold text-content-muted">
              {t.admin.categoryPreviewLabel}
            </span>
            <div className="flex items-center gap-2">
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shadow-2xs"
                style={{ backgroundColor: `${color}20`, border: `1px solid ${color}50` }}
              >
                {icon || "📁"}
              </span>
              <span className="text-xs font-bold text-content-main">
                {name.trim() || t.admin.categoryNamePlaceholder}
              </span>
              <span
                className="w-3 h-3 rounded-full border border-white/50"
                style={{ backgroundColor: color }}
              />
            </div>
          </div>

          {/* 費目名 */}
          <div>
            <label className="block text-xs font-bold text-content-main mb-1">
              {t.admin.categoryNameLabel}
            </label>
            <input
              type="text"
              maxLength={100}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.admin.categoryNamePlaceholder}
              className="w-full px-3 py-2 text-xs border border-border rounded-lg bg-app-subtle text-content-main focus:outline-none focus:border-primary"
            />
          </div>

          {/* アイコン */}
          <div>
            <label className="block text-xs font-bold text-content-main mb-1.5">
              {t.admin.categoryIconLabel}
            </label>
            <div className="grid grid-cols-8 gap-1.5 mb-2">
              {PRESET_ICONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  className={`h-8 rounded-lg border text-base flex items-center justify-center transition-all cursor-pointer ${
                    icon === emoji
                      ? "bg-primary-light border-primary shadow-2xs scale-105"
                      : "bg-app-subtle border-border hover:bg-border/60"
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <input
              type="text"
              maxLength={50}
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="絵文字を入力"
              className="w-28 px-2.5 py-1.5 text-xs border border-border rounded-lg bg-app-subtle text-content-main focus:outline-none focus:border-primary text-center"
            />
          </div>

          {/* カラー */}
          <div>
            <label className="block text-xs font-bold text-content-main mb-1.5">
              {t.admin.categoryColorLabel}
            </label>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {PRESET_COLORS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setColor(hex)}
                  aria-label={hex}
                  className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-transform cursor-pointer ${
                    color.toUpperCase() === hex.toUpperCase()
                      ? "border-content-main scale-110 shadow-xs"
                      : "border-transparent hover:scale-105"
                  }`}
                  style={{ backgroundColor: hex }}
                >
                  {color.toUpperCase() === hex.toUpperCase() && (
                    <Check className="w-3.5 h-3.5 text-white drop-shadow-xs" />
                  )}
                </button>
              ))}
              <input
                type="color"
                value={/^#[0-9A-Fa-f]{6}$/.test(color) ? color : "#2E7D32"}
                onChange={(e) => setColor(e.target.value.toUpperCase())}
                className="w-8 h-7 rounded cursor-pointer border border-border bg-transparent p-0"
              />
            </div>
          </div>

          {/* ボタン群 */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold rounded-lg border border-border bg-app-subtle text-content-main hover:bg-border transition-colors cursor-pointer"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="px-4 py-2 text-xs font-bold rounded-lg bg-primary text-white hover:bg-primary-hover disabled:opacity-50 transition-colors cursor-pointer"
            >
              {isSubmitting
                ? t.common.updating
                : isEdit
                ? t.admin.categoryEditSubmit
                : t.admin.categoryCreateSubmit}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
