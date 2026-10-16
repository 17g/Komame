"use client";

import React, { useState, useEffect } from "react";
import { CheckpointItem } from "@/types";
import { AlertTriangle, X, Check, ShieldAlert, RefreshCw } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface RevertModalProps {
  checkpoint: CheckpointItem | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmRevert: (checkpointId: string) => Promise<void>;
}

// ランダムな英数字（大文字・小文字・数字混在）7文字を生成
function generateRandomCode(length = 7): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function RevertModal({
  checkpoint,
  isOpen,
  onClose,
  onConfirmRevert,
}: RevertModalProps) {
  const { t } = useTranslation();

  const [targetCode, setTargetCode] = useState("");
  const [inputCode, setInputCode] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // モーダルオープン時にランダムな英数字7文字を生成
  useEffect(() => {
    if (isOpen) {
      setTargetCode(generateRandomCode(7));
      setInputCode("");
      setIsProcessing(false);
    }
  }, [isOpen]);

  if (!isOpen || !checkpoint) return null;

  const isConfirmed = inputCode.trim() === targetCode && targetCode.length === 7;

  const handleConfirm = async () => {
    if (!isConfirmed || isProcessing) return;
    setIsProcessing(true);
    try {
      await onConfirmRevert(checkpoint.id);
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRegenerateCode = () => {
    setTargetCode(generateRandomCode(7));
    setInputCode("");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      {/* 外部クリックで閉じるバックドロップ */}
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative z-10 bg-app-surface border border-border rounded-2xl max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* 固定ヘッダー */}
        <div className="p-5 pb-3 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-danger font-bold text-base">
            <ShieldAlert className="w-5 h-5 text-red-600" />
            <span>{t.revertModal.title}</span>
          </div>
          <button
            onClick={onClose}
            className="text-content-muted hover:text-content-main p-1 rounded-lg hover:bg-app-subtle cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* スクロール可能コンテンツ領域 */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          <p className="text-xs text-content-muted leading-relaxed">
            {t.revertModal.warningNotice}
          </p>

          {/* 対象チェックポイント情報 */}
          <div className="p-3 bg-app-subtle rounded-xl text-xs flex flex-col gap-1 border border-border">
            <div className="font-bold text-content-main">
              📍 {checkpoint.description || "操作前チェックポイント"}
            </div>
            <div className="text-[11px] text-content-subtle">
              {new Date(checkpoint.createdAt).toLocaleString()}
            </div>
          </div>

          {/* 家族データへの影響サマリー */}
          <div className="p-3 bg-danger-light border border-danger/20 rounded-xl space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-danger">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{t.revertModal.impactSummary}</span>
            </div>
            <ul className="text-[11px] text-danger space-y-1 list-disc pl-4">
              <li>このチェックポイント以降の明細データ（{checkpoint.impactSummary?.txCount || 0}件）が取り消されます</li>
              <li>影響を受けた口座残高もすべてロールバックされます</li>
            </ul>
          </div>

          {/* 安全確認: 7文字のランダム英数字入力 */}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-content-main">
                {t.revertModal.confirmKeywordLabel}
              </label>
              <button
                type="button"
                onClick={handleRegenerateCode}
                className="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>{t.revertModal.regenerateCode}</span>
              </button>
            </div>

            <p className="text-[11px] text-content-muted">
              {t.revertModal.confirmKeywordHint}
            </p>

            <div className="flex items-center gap-2">
              <input
                type="text"
                autoComplete="off"
                placeholder={targetCode}
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                className="flex-1 px-3 py-2 bg-app-subtle border-2 border-border focus:border-danger rounded-xl text-sm font-mono font-bold tracking-wider outline-none text-content-main transition-colors"
              />
              <div className="px-3 py-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded-xl text-sm font-mono font-extrabold text-amber-900 dark:text-amber-200 select-all tracking-widest shadow-2xs">
                {targetCode}
              </div>
            </div>

            {inputCode && !isConfirmed && (
              <p className="text-[10px] text-danger font-medium">
                ※ コードが一致していません（大文字・小文字を区別します）
              </p>
            )}
          </div>
        </div>

        {/* 固定フッター (アクションボタン) */}
        <div className="p-4 bg-app-surface border-t border-border flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-4 bg-app-subtle border border-border text-content-muted text-xs font-bold rounded-xl hover:bg-border/50 transition-colors cursor-pointer"
          >
            {t.common.cancel}
          </button>
          
          <button
            type="button"
            disabled={!isConfirmed || isProcessing}
            onClick={handleConfirm}
            className={`py-2.5 px-5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md transition-all cursor-pointer ${
              isConfirmed && !isProcessing
                ? "bg-red-600 hover:bg-red-700 text-white font-extrabold active:scale-98"
                : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed opacity-70"
            }`}
          >
            <Check className="w-4 h-4" />
            <span>{isProcessing ? "リバート実行中..." : t.revertModal.executeBtn}</span>
          </button>
        </div>

      </div>
    </div>
  );
}
