"use client";

import React from "react";
import { X, History, FileCode } from "lucide-react";
import { AuditLogItem } from "@/types";
import { useTranslation } from "@/lib/i18n";

interface AuditLogDetailModalProps {
  log: AuditLogItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export function AuditLogDetailModal({ log, isOpen, onClose }: AuditLogDetailModalProps) {
  const { t } = useTranslation();

  if (!isOpen || !log) return null;

  const getActionBadgeClass = (action: string) => {
    switch (action) {
      case "CREATE":
        return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
      case "UPDATE":
        return "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30";
      case "DELETE":
        return "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30";
      case "REVERT":
        return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30";
      default:
        return "bg-app-subtle text-content-muted border-border";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-app-surface border border-border rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">
        {/* ヘッダー */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary-light flex items-center justify-center text-primary">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-content-main">
                {t.admin.auditLogsDetailTitle}
              </h3>
              <p className="text-[11px] text-content-muted font-mono">{log.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-app-subtle text-content-muted transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* コンテンツ */}
        <div className="p-5 space-y-4 overflow-y-auto text-xs">
          {/* 基本メタデータ グリッド */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-app-subtle rounded-xl border border-border/60">
            <div>
              <span className="text-content-muted text-[11px] block">操作種別</span>
              <span
                className={`inline-block px-2 py-0.5 mt-0.5 rounded text-[11px] font-bold border ${getActionBadgeClass(
                  log.action
                )}`}
              >
                {log.action}
              </span>
            </div>
            <div>
              <span className="text-content-muted text-[11px] block">操作日時</span>
              <span className="font-medium text-content-main">
                {new Date(log.createdAt).toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-content-muted text-[11px] block">実行者 (操作者)</span>
              <span className="font-medium text-content-main">
                {log.operatorEmail || log.operatorUserId}
              </span>
            </div>
            <div>
              <span className="text-content-muted text-[11px] block">対象エンティティ</span>
              <span className="font-mono text-content-main">
                {log.entityType} {log.entityId ? `(${log.entityId})` : ""}
              </span>
            </div>
            {log.checkpointId && (
              <div className="sm:col-span-2">
                <span className="text-content-muted text-[11px] block">チェックポイントID</span>
                <span className="font-mono text-[11px] text-content-main">{log.checkpointId}</span>
              </div>
            )}
            <div className="sm:col-span-2">
              <span className="text-content-muted text-[11px] block">概要</span>
              <span className="font-medium text-content-main">{log.summary}</span>
            </div>
          </div>

          {/* 変更前データ JSON */}
          {log.beforeDataJson != null && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-content-main text-xs">
                <FileCode className="w-3.5 h-3.5 text-danger" />
                <span>{t.admin.auditLogsBeforeData}</span>
              </div>
              <pre className="p-3 bg-app-subtle border border-border/80 rounded-xl font-mono text-[11px] text-content-main overflow-x-auto max-h-48 whitespace-pre-wrap leading-relaxed">
                {typeof log.beforeDataJson === "string"
                  ? log.beforeDataJson
                  : JSON.stringify(log.beforeDataJson, null, 2)}
              </pre>
            </div>
          )}

          {/* 変更後データ JSON */}
          {log.afterDataJson != null && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-content-main text-xs">
                <FileCode className="w-3.5 h-3.5 text-success" />
                <span>{t.admin.auditLogsAfterData}</span>
              </div>
              <pre className="p-3 bg-app-subtle border border-border/80 rounded-xl font-mono text-[11px] text-content-main overflow-x-auto max-h-48 whitespace-pre-wrap leading-relaxed">
                {typeof log.afterDataJson === "string"
                  ? log.afterDataJson
                  : JSON.stringify(log.afterDataJson, null, 2)}
              </pre>
            </div>
          )}

        </div>

        {/* フッター */}
        <div className="px-5 py-3 border-t border-border flex justify-end shrink-0 bg-app-subtle/50">
          <button
            onClick={onClose}
            className="py-1.5 px-4 bg-app-surface border border-border text-content-main text-xs font-bold rounded-lg hover:bg-border/60 transition-colors cursor-pointer"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
