"use client";

import React from "react";
import { X, CheckCheck, Bell, AlertTriangle, Info, ShieldCheck } from "lucide-react";

export interface NotificationItem {
  id: string;
  type: "alert" | "warning" | "info" | "success";
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
}

interface NotificationBoxProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  onMarkAllAsRead: () => void;
}

export function NotificationBox({
  isOpen,
  onClose,
  notifications,
  onMarkAllAsRead,
}: NotificationBoxProps) {
  if (!isOpen) return null;

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const getIcon = (type: NotificationItem["type"]) => {
    switch (type) {
      case "warning":
        return <AlertTriangle className="w-4 h-4 text-warning" />;
      case "alert":
        return <AlertTriangle className="w-4 h-4 text-danger" />;
      case "success":
        return <ShieldCheck className="w-4 h-4 text-primary" />;
      default:
        return <Info className="w-4 h-4 text-sky-500" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-start justify-end p-4 sm:p-6 animate-in fade-in duration-150">
      {/* 外部クリックで閉じるためのバックドロップ */}
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative z-10 w-full max-w-sm bg-app-surface border border-border rounded-2xl shadow-2xl p-4 sm:p-5 flex flex-col gap-3 mt-12 animate-in slide-in-from-top-2 duration-200">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-content-main">アプリ内通知ボックス</span>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.2 bg-danger text-white text-[10px] font-bold rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={onMarkAllAsRead}
                className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>すべて既読</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-content-muted hover:text-content-main hover:bg-app-subtle transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 通知リスト */}
        <div className="max-h-96 overflow-y-auto space-y-2.5 divide-y divide-border/60">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-xs text-content-muted">
              新しい通知はありません。
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`pt-2.5 first:pt-0 flex items-start gap-3 transition-colors ${
                  !n.isRead ? "bg-primary-light/10 p-2 rounded-xl" : ""
                }`}
              >
                <div className="mt-0.5 shrink-0">{getIcon(n.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-content-main truncate">{n.title}</span>
                    <span className="text-[10px] text-content-subtle shrink-0">
                      {new Date(n.createdAt).toLocaleDateString("ja-JP")}
                    </span>
                  </div>
                  <p className="text-[11px] text-content-muted mt-0.5 leading-relaxed">
                    {n.message}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
