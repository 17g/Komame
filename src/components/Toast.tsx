"use client";

import React, { useEffect } from "react";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";

export interface ToastProps {
  message: string;
  type?: "success" | "error" | "info";
  isOpen: boolean;
  onClose: () => void;
}

export function Toast({ message, type = "success", isOpen, onClose }: ToastProps) {
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        onClose();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const icons = {
    success: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
    error: <AlertCircle className="w-4 h-4 text-rose-400" />,
    info: <Info className="w-4 h-4 text-sky-400" />,
  };

  return (
    <div className="fixed bottom-20 right-4 z-50 flex items-center gap-2 px-4 py-2.5 bg-zinc-900/95 text-zinc-100 text-xs font-medium rounded-xl shadow-xl backdrop-blur-md border border-zinc-800 animate-in fade-in slide-in-from-bottom-2 duration-200">
      {icons[type]}
      <span>{message}</span>
    </div>
  );
}
