"use client";

import React, { useState, useEffect } from "react";
import { AuditLogItem, CheckpointItem } from "@/types";
import { History, Download, RotateCcw, Shield } from "lucide-react";
import { RevertModal } from "./RevertModal";
import { useTranslation } from "@/lib/i18n";

interface AdminTabProps {
  onTriggerToast: (msg: string) => void;
  onRefreshAll: () => void;
}

export function AdminTab({ onTriggerToast, onRefreshAll }: AdminTabProps) {
  const { t } = useTranslation();

  const [checkpoints, setCheckpoints] = useState<CheckpointItem[]>([]);
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<CheckpointItem | null>(null);

  const fetchAdminData = async () => {
    try {
      const [cpRes, logRes] = await Promise.all([
        fetch("/api/admin/checkpoints"),
        fetch("/api/admin/logs"),
      ]);

      if (cpRes.ok) {
        const data = await cpRes.json();
        setCheckpoints(data.checkpoints || []);
      }
      if (logRes.ok) {
        const data = await logRes.json();
        setLogs(data.logs || []);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleConfirmRevert = async (checkpointId: string) => {
    try {
      const res = await fetch("/api/admin/revert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkpointId }),
      });

      if (res.ok) {
        const data = await res.json();
        onTriggerToast(`✓ ${data.message} (${data.revertedCount}件巻き戻し)`);
        fetchAdminData();
        onRefreshAll();
      } else {
        const data = await res.json();
        onTriggerToast(data.error || "リバートに失敗しました");
      }
    } catch {
      onTriggerToast("リバート処理中にエラーが発生しました");
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-20">
      {/* 24時間チェックポイントリバート セクション */}
      <div className="p-4 bg-app-surface border border-border rounded-xl shadow-sm">
        <div className="flex items-center gap-1.5 text-xs font-bold text-content-main mb-2">
          <RotateCcw className="w-4 h-4 text-primary" />
          <span>{t.admin.revertSectionTitle}</span>
        </div>
        <p className="text-[11px] text-content-muted mb-3 leading-relaxed">
          {t.admin.revertSectionDesc}
        </p>

        <div className="space-y-2">
          {checkpoints.length === 0 ? (
            <div className="p-3 bg-app-subtle rounded-lg text-center text-xs text-content-muted">
              {t.admin.noCheckpoints}
            </div>
          ) : (
            checkpoints.map((cp) => (
              <div
                key={cp.id}
                className="p-3 bg-app-subtle border border-border rounded-lg flex items-center justify-between gap-2"
              >
                <div>
                  <div className="text-xs font-bold text-content-main">
                    📍 {cp.description || "明細登録直前"}
                  </div>
                  <div className="text-[10px] text-content-subtle">
                    {new Date(cp.createdAt).toLocaleTimeString()} • 影響: {cp.impactSummary?.txCount || 0}件
                  </div>
                </div>

                <button
                  onClick={() => setSelectedCheckpoint(cp)}
                  className="px-2.5 py-1 bg-app-surface border border-border text-danger text-xs font-bold rounded hover:bg-danger-light hover:border-danger transition-colors shrink-0 cursor-pointer"
                >
                  {t.admin.revertBtn}
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 世帯監査ログ セクション */}
      <div className="p-4 bg-app-surface border border-border rounded-xl shadow-sm">
        <div className="flex items-center gap-1.5 text-xs font-bold text-content-main mb-2">
          <History className="w-4 h-4 text-primary" />
          <span>{t.admin.auditLogsTitle}</span>
        </div>

        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {logs.length === 0 ? (
            <div className="text-center py-4 text-xs text-content-subtle">ログはありません。</div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="p-2 bg-app-subtle rounded text-[11px] flex justify-between">
                <div>
                  <span className="font-bold text-content-main">{log.action}</span>
                  <span className="text-content-muted ml-2">{log.summary || ""}</span>
                </div>
                <span className="text-[10px] text-content-subtle">
                  {new Date(log.createdAt).toLocaleTimeString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* CSV エクスポート セクション */}
      <div className="p-4 bg-app-surface border border-border rounded-xl shadow-sm flex items-center justify-between">
        <div>
          <div className="text-xs font-bold text-content-main flex items-center gap-1.5">
            <Download className="w-4 h-4 text-primary" />
            <span>{t.admin.exportTitle}</span>
          </div>
          <p className="text-[11px] text-content-muted mt-0.5">
            {t.admin.exportDesc}
          </p>
        </div>

        <a
          href="/api/admin/csv"
          download
          className="py-2 px-3 bg-primary text-white text-xs font-bold rounded-lg shadow-xs hover:bg-primary-hover transition-colors shrink-0 cursor-pointer"
        >
          {t.admin.exportBtn}
        </a>
      </div>

      {/* リバート二重確認モーダル */}
      <RevertModal
        checkpoint={selectedCheckpoint}
        isOpen={!!selectedCheckpoint}
        onClose={() => setSelectedCheckpoint(null)}
        onConfirmRevert={handleConfirmRevert}
      />
    </div>
  );
}
