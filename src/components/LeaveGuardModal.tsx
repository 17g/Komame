"use client";

import React from "react";
import { AlertTriangle, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface LeaveGuardModalProps {
  isOpen: boolean;
  onStay: () => void;
  onDiscardAndLeave: () => void;
}

export function LeaveGuardModal({
  isOpen,
  onStay,
  onDiscardAndLeave,
}: LeaveGuardModalProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-app-surface border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-warning font-bold text-sm">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <span>{t.register.leaveWarningTitle}</span>
          </div>
          <button
            type="button"
            onClick={onStay}
            className="text-content-muted hover:text-content-main p-1 rounded-lg hover:bg-app-subtle cursor-pointer"
            aria-label={t.common.close}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-content-muted leading-relaxed mb-5">
          {t.register.leaveWarningDesc}
        </p>

        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onStay}
            className="flex-1 py-2.5 bg-app-subtle border border-border text-content-main font-bold text-xs rounded-xl hover:bg-border/50 transition-colors cursor-pointer"
          >
            {t.register.stayOnPage}
          </button>
          <button
            type="button"
            onClick={onDiscardAndLeave}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
          >
            {t.register.discardAndLeave}
          </button>
        </div>
      </div>
    </div>
  );
}
