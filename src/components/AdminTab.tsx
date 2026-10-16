"use client";

import React, { useState, useEffect } from "react";
import { AuditLogItem, CheckpointItem, MemberItem } from "@/types";
import {
  History,
  Download,
  RotateCcw,
  Shield,
  Upload,
  Users,
  UserPlus,
  User,
  KeyRound,
  UserCheck,
  UserX,
} from "lucide-react";
import { RevertModal } from "./RevertModal";
import { CsvImportModal } from "./CsvImportModal";
import { InviteMemberModal } from "./InviteMemberModal";
import { ResetPasswordModal } from "./ResetPasswordModal";
import { useTranslation } from "@/lib/i18n";

interface AdminTabProps {
  onTriggerToast: (msg: string) => void;
  onRefreshAll: () => void;
}

export function AdminTab({ onTriggerToast, onRefreshAll }: AdminTabProps) {
  const { t } = useTranslation();

  const [members, setMembers] = useState<MemberItem[]>([]);
  const [checkpoints, setCheckpoints] = useState<CheckpointItem[]>([]);
  const [logs, setLogs] = useState<AuditLogItem[]>([]);

  const [selectedCheckpoint, setSelectedCheckpoint] = useState<CheckpointItem | null>(null);
  const [isCsvImportOpen, setIsCsvImportOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [resetTargetMember, setResetTargetMember] = useState<MemberItem | null>(null);

  const fetchAdminData = async () => {
    try {
      const [membersRes, cpRes, logRes] = await Promise.all([
        fetch("/api/admin/members"),
        fetch("/api/admin/checkpoints"),
        fetch("/api/admin/logs"),
      ]);

      if (membersRes.ok) {
        const data = await membersRes.json();
        setMembers(data.members || []);
      }
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

  const handleToggleRole = async (member: MemberItem) => {
    const newRole = member.role === "admin" ? "member" : "admin";
    const confirmMsg =
      newRole === "admin"
        ? `${member.email} を世帯管理者に昇格しますか？`
        : `${member.email} を一般メンバーに変更（降格）しますか？`;

    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch("/api/admin/members", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          membershipId: member.id,
          role: newRole,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        onTriggerToast(`✓ ${data.message}`);
        fetchAdminData();
      } else {
        onTriggerToast(data.error || "ロール変更に失敗しました");
      }
    } catch {
      onTriggerToast("通信エラーが発生しました");
    }
  };

  const handleToggleStatus = async (member: MemberItem) => {
    const isActivating = member.status === "inactive";
    const confirmMsg = isActivating
      ? `${member.email} のアカウントを再有効化しますか？`
      : `${member.email} のアカウントを無効化（ログイン遮断）しますか？`;

    if (!window.confirm(confirmMsg)) return;

    try {
      let res: Response;
      if (isActivating) {
        res = await fetch("/api/admin/members", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            membershipId: member.id,
            status: "active",
          }),
        });
      } else {
        res = await fetch(`/api/admin/members?membershipId=${member.id}`, {
          method: "DELETE",
        });
      }

      const data = await res.json();
      if (res.ok) {
        onTriggerToast(`✓ ${data.message}`);
        fetchAdminData();
      } else {
        onTriggerToast(data.error || "状態変更に失敗しました");
      }
    } catch {
      onTriggerToast("通信エラーが発生しました");
    }
  };

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
      {/* 家族メンバー管理 セクション */}
      <div className="p-4 bg-app-surface border border-border rounded-xl shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-content-main">
            <Users className="w-4 h-4 text-primary" />
            <span>{t.admin.membersSectionTitle}</span>
          </div>

          <button
            onClick={() => setIsInviteModalOpen(true)}
            className="py-1.5 px-3 bg-primary text-white text-xs font-bold rounded-lg shadow-xs hover:bg-primary-hover transition-colors flex items-center gap-1 cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>{t.admin.addMemberBtn}</span>
          </button>
        </div>

        <p className="text-[11px] text-content-muted mb-3 leading-relaxed">
          {t.admin.membersSectionDesc}
        </p>

        <div className="space-y-2">
          {members.length === 0 ? (
            <div className="p-3 bg-app-subtle rounded-lg text-center text-xs text-content-muted">
              {t.admin.noMembers}
            </div>
          ) : (
            members.map((m) => (
              <div
                key={m.id}
                className="p-3 bg-app-subtle border border-border rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      m.role === "admin"
                        ? "bg-primary-light text-primary"
                        : "bg-app-surface text-content-muted"
                    }`}
                  >
                    {m.role === "admin" ? (
                      <Shield className="w-4 h-4 text-primary" />
                    ) : (
                      <User className="w-4 h-4" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-content-main truncate">
                        {m.email}
                      </span>
                      {m.isCurrentUser && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                          ({t.admin.you})
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-0.5 text-[10px]">
                      <span
                        className={`font-bold px-1.5 py-0.2 rounded border ${
                          m.role === "admin"
                            ? "bg-primary-light/40 text-primary border-primary/20"
                            : "bg-app-surface text-content-muted border-border"
                        }`}
                      >
                        {m.role === "admin" ? t.admin.memberRoleAdmin : t.admin.memberRoleMember}
                      </span>

                      <span
                        className={`font-bold px-1.5 py-0.2 rounded border ${
                          m.status === "active"
                            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                            : "bg-danger-light text-danger border-danger/20"
                        }`}
                      >
                        {m.status === "active" ? t.admin.statusActive : t.admin.statusInactive}
                      </span>

                      <span className="text-content-subtle">
                        参加日: {new Date(m.joinedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 操作ボタングループ */}
                {!m.isCurrentUser && (
                  <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                    {/* ロール変更ボタン */}
                    <button
                      onClick={() => handleToggleRole(m)}
                      title={
                        m.role === "admin"
                          ? t.admin.changeRoleToMember
                          : t.admin.changeRoleToAdmin
                      }
                      className="px-2 py-1 text-[11px] font-bold rounded-lg border border-border bg-app-surface hover:bg-border text-content-main transition-colors cursor-pointer"
                    >
                      {m.role === "admin"
                        ? t.admin.changeRoleToMember
                        : t.admin.changeRoleToAdmin}
                    </button>

                    {/* パスワードリセットボタン */}
                    <button
                      onClick={() => setResetTargetMember(m)}
                      title={t.admin.resetPasswordBtn}
                      className="p-1.5 text-content-muted hover:text-primary rounded-lg border border-border bg-app-surface hover:bg-app-subtle transition-colors cursor-pointer"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                    </button>

                    {/* 有効 / 無効化切り替えボタン */}
                    <button
                      onClick={() => handleToggleStatus(m)}
                      title={
                        m.status === "active"
                          ? t.admin.deactivateMember
                          : t.admin.reactivateMember
                      }
                      className={`px-2 py-1 text-[11px] font-bold rounded-lg border transition-colors flex items-center gap-1 cursor-pointer ${
                        m.status === "active"
                          ? "border-danger/30 text-danger hover:bg-danger-light"
                          : "border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"
                      }`}
                    >
                      {m.status === "active" ? (
                        <>
                          <UserX className="w-3 h-3" />
                          <span>{t.admin.deactivateMember}</span>
                        </>
                      ) : (
                        <>
                          <UserCheck className="w-3 h-3" />
                          <span>{t.admin.reactivateMember}</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

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

      {/* CSV データ管理 (エクスポート & インポート) セクション */}
      <div className="p-4 bg-app-surface border border-border rounded-xl shadow-sm space-y-3">
        {/* CSV エクスポート */}
        <div className="flex items-center justify-between gap-2">
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
            className="py-2 px-3 bg-app-subtle border border-border text-content-main text-xs font-bold rounded-lg shadow-xs hover:bg-border transition-colors shrink-0 cursor-pointer"
          >
            {t.admin.exportBtn}
          </a>
        </div>

        {/* CSV インポート */}
        <div className="border-t border-border pt-3 flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-bold text-content-main flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-primary" />
              <span>{t.admin.importTitle}</span>
            </div>
            <p className="text-[11px] text-content-muted mt-0.5">
              {t.admin.importDesc}
            </p>
          </div>

          <button
            onClick={() => setIsCsvImportOpen(true)}
            className="py-2 px-3 bg-primary text-white text-xs font-bold rounded-lg shadow-xs hover:bg-primary-hover transition-colors shrink-0 cursor-pointer"
          >
            {t.admin.importBtn}
          </button>
        </div>
      </div>

      {/* メンバー招待モーダル */}
      <InviteMemberModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onSuccess={() => {
          fetchAdminData();
          onRefreshAll();
        }}
        onTriggerToast={onTriggerToast}
      />

      {/* パスワード再設定モーダル */}
      <ResetPasswordModal
        member={resetTargetMember}
        isOpen={!!resetTargetMember}
        onClose={() => setResetTargetMember(null)}
        onSuccess={() => {
          fetchAdminData();
        }}
        onTriggerToast={onTriggerToast}
      />

      {/* リバート二重確認モーダル */}
      <RevertModal
        checkpoint={selectedCheckpoint}
        isOpen={!!selectedCheckpoint}
        onClose={() => setSelectedCheckpoint(null)}
        onConfirmRevert={handleConfirmRevert}
      />

      {/* CSVインポートモーダル */}
      <CsvImportModal
        isOpen={isCsvImportOpen}
        onClose={() => setIsCsvImportOpen(false)}
        onSuccess={(importedCount) => {
          onTriggerToast(`✓ ${importedCount}件の明細をインポートしました (24hリバート対象)`);
          fetchAdminData();
          onRefreshAll();
        }}
        onTriggerToast={onTriggerToast}
      />
    </div>
  );
}
