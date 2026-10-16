"use client";

import React, { useState, useEffect } from "react";
import { AuditLogItem, CheckpointItem, MemberItem, SystemSettingsConfig } from "@/types";
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
  Settings,
  Lock,
  FileSpreadsheet,
  FileJson,
  Eye,
} from "lucide-react";
import { RevertModal } from "./RevertModal";
import { CsvImportModal } from "./CsvImportModal";
import { InviteMemberModal } from "./InviteMemberModal";
import { ResetPasswordModal } from "./ResetPasswordModal";
import { AuditLogDetailModal } from "./AuditLogDetailModal";
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

  const [logFilterUser, setLogFilterUser] = useState<string>("all");
  const [logFilterAction, setLogFilterAction] = useState<string>("all");
  const [logFilterStartDate, setLogFilterStartDate] = useState<string>("");
  const [logFilterEndDate, setLogFilterEndDate] = useState<string>("");
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [selectedLogDetail, setSelectedLogDetail] = useState<AuditLogItem | null>(null);

  const [selectedCheckpoint, setSelectedCheckpoint] = useState<CheckpointItem | null>(null);
  const [isCsvImportOpen, setIsCsvImportOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [resetTargetMember, setResetTargetMember] = useState<MemberItem | null>(null);


  const [settings, setSettings] = useState<SystemSettingsConfig>({
    currencySymbol: "¥",
    dateFormat: "YYYY/MM/DD",
    passwordPolicy: {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: false,
    },
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const fetchAdminData = async () => {
    try {
      const [membersRes, cpRes, logRes, settingsRes] = await Promise.all([
        fetch("/api/admin/members"),
        fetch("/api/admin/checkpoints"),
        fetch("/api/admin/logs"),
        fetch("/api/admin/settings"),
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
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        if (data.settings) {
          setSettings(data.settings);
        }
      }
    } catch {
      // ignore
    }
  };

  const fetchFilteredLogs = async (
    user = logFilterUser,
    action = logFilterAction,
    start = logFilterStartDate,
    end = logFilterEndDate
  ) => {
    setIsLoadingLogs(true);
    try {
      const params = new URLSearchParams();
      if (user !== "all") params.set("userId", user);
      if (action !== "all") params.set("action", action);
      if (start) params.set("startDate", start);
      if (end) params.set("endDate", end);

      const res = await fetch(`/api/admin/logs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handleResetLogFilters = () => {
    setLogFilterUser("all");
    setLogFilterAction("all");
    setLogFilterStartDate("");
    setLogFilterEndDate("");
    fetchFilteredLogs("all", "all", "", "");
  };

  const handleExportLogs = (format: "csv" | "json") => {
    const params = new URLSearchParams();
    params.set("format", format);
    params.set("download", "true");
    if (logFilterUser !== "all") params.set("userId", logFilterUser);
    if (logFilterAction !== "all") params.set("action", logFilterAction);
    if (logFilterStartDate) params.set("startDate", logFilterStartDate);
    if (logFilterEndDate) params.set("endDate", logFilterEndDate);

    const downloadUrl = `/api/admin/logs?${params.toString()}`;
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    onTriggerToast(`✓ 監査ログ (${format.toUpperCase()}) のダウンロードを開始しました`);
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

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      const data = await res.json();
      if (res.ok) {
        onTriggerToast(t.admin.settingsSavedToast);
        if (data.settings) {
          setSettings(data.settings);
        }
        fetchAdminData();
      } else {
        onTriggerToast(data.error || "設定の保存に失敗しました");
      }
    } catch {
      onTriggerToast("設定の保存中に通信エラーが発生しました");
    } finally {
      setIsSavingSettings(false);
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

      {/* システム設定 & セキュリティポリシー セクション */}
      <div className="p-4 bg-app-surface border border-border rounded-xl shadow-sm">
        <div className="flex items-center gap-1.5 text-xs font-bold text-content-main mb-2">
          <Settings className="w-4 h-4 text-primary" />
          <span>{t.admin.settingsSectionTitle}</span>
        </div>
        <p className="text-[11px] text-content-muted mb-3 leading-relaxed">
          {t.admin.settingsSectionDesc}
        </p>

        <form onSubmit={handleSaveSettings} className="space-y-4">
          {/* 通貨 & 日付表示設定 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-content-main mb-1">
                {t.admin.currencySymbolLabel}
              </label>
              <div className="flex items-center gap-2">
                {["¥", "$", "€"].map((sym) => (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => setSettings((prev) => ({ ...prev, currencySymbol: sym }))}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                      settings.currencySymbol === sym
                        ? "bg-primary text-white border-primary shadow-xs"
                        : "bg-app-subtle border-border text-content-main hover:bg-border"
                    }`}
                  >
                    {sym}
                  </button>
                ))}
                <input
                  type="text"
                  maxLength={5}
                  value={settings.currencySymbol}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, currencySymbol: e.target.value }))
                  }
                  placeholder="その他"
                  className="w-16 px-2 py-1.5 text-xs border border-border rounded-lg bg-app-subtle text-content-main focus:outline-none focus:border-primary text-center"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-content-main mb-1">
                {t.admin.dateFormatLabel}
              </label>
              <select
                value={settings.dateFormat}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, dateFormat: e.target.value }))
                }
                className="w-full px-2.5 py-1.5 text-xs border border-border rounded-lg bg-app-subtle text-content-main focus:outline-none focus:border-primary cursor-pointer"
              >
                <option value="YYYY/MM/DD">YYYY/MM/DD (例: 2026/10/17)</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD (例: 2026-10-17)</option>
                <option value="YYYY.MM.DD">YYYY.MM.DD (例: 2026.10.17)</option>
              </select>
            </div>
          </div>

          {/* パスワード強度ポリシー */}
          <div className="p-3 bg-app-subtle border border-border rounded-lg space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-content-main">
              <Lock className="w-3.5 h-3.5 text-primary" />
              <span>{t.admin.passwordPolicyTitle}</span>
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-content-main">{t.admin.minLengthLabel}</span>
                <span className="font-bold text-primary">{settings.passwordPolicy.minLength} 文字</span>
              </div>
              <input
                type="range"
                min={6}
                max={24}
                value={settings.passwordPolicy.minLength}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setSettings((prev) => ({
                    ...prev,
                    passwordPolicy: { ...prev.passwordPolicy, minLength: val },
                  }));
                }}
                className="w-full accent-primary cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <label className="flex items-center gap-2 p-1.5 bg-app-surface rounded border border-border/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.passwordPolicy.requireUppercase}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      passwordPolicy: {
                        ...prev.passwordPolicy,
                        requireUppercase: e.target.checked,
                      },
                    }))
                  }
                  className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5"
                />
                <span className="text-content-main">{t.admin.requireUpperLabel}</span>
              </label>

              <label className="flex items-center gap-2 p-1.5 bg-app-surface rounded border border-border/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.passwordPolicy.requireLowercase}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      passwordPolicy: {
                        ...prev.passwordPolicy,
                        requireLowercase: e.target.checked,
                      },
                    }))
                  }
                  className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5"
                />
                <span className="text-content-main">{t.admin.requireLowerLabel}</span>
              </label>

              <label className="flex items-center gap-2 p-1.5 bg-app-surface rounded border border-border/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.passwordPolicy.requireNumbers}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      passwordPolicy: {
                        ...prev.passwordPolicy,
                        requireNumbers: e.target.checked,
                      },
                    }))
                  }
                  className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5"
                />
                <span className="text-content-main">{t.admin.requireNumberLabel}</span>
              </label>

              <label className="flex items-center gap-2 p-1.5 bg-app-surface rounded border border-border/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.passwordPolicy.requireSpecialChars}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      passwordPolicy: {
                        ...prev.passwordPolicy,
                        requireSpecialChars: e.target.checked,
                      },
                    }))
                  }
                  className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5"
                />
                <span className="text-content-main">{t.admin.requireSpecialLabel}</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSavingSettings}
              className="py-1.5 px-4 bg-primary text-white text-xs font-bold rounded-lg shadow-xs hover:bg-primary-hover disabled:opacity-50 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>{isSavingSettings ? t.admin.savingSettings : t.admin.saveSettingsBtn}</span>
            </button>
          </div>
        </form>
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

      {/* 世帯監査ログ & 条件付きエクスポート セクション */}
      <div className="p-4 bg-app-surface border border-border rounded-xl shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-content-main">
            <History className="w-4 h-4 text-primary" />
            <span>{t.admin.auditLogsTitle}</span>
            <span className="ml-1 px-1.5 py-0.5 bg-app-subtle border border-border text-[10px] text-content-muted rounded-full">
              {logs.length} {t.admin.auditLogsCountUnit}
            </span>
          </div>

          {/* CSV / JSON エクスポート ボタン群 */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handleExportLogs("csv")}
              title="現在の条件でCSVダウンロード"
              className="py-1 px-2.5 bg-app-subtle hover:bg-border/60 border border-border text-content-main text-xs font-medium rounded-lg shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>{t.admin.auditLogsExportCsv}</span>
            </button>
            <button
              onClick={() => handleExportLogs("json")}
              title="現在の条件でJSONダウンロード"
              className="py-1 px-2.5 bg-app-subtle hover:bg-border/60 border border-border text-content-main text-xs font-medium rounded-lg shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
            >
              <FileJson className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>{t.admin.auditLogsExportJson}</span>
            </button>
          </div>
        </div>

        {/* フィルター コントロール */}
        <div className="p-2.5 mb-3 bg-app-subtle rounded-xl border border-border/60 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {/* ユーザー選択 */}
            <div>
              <label className="text-[10px] text-content-muted block mb-0.5">
                {t.admin.auditLogsFilterUser}
              </label>
              <select
                value={logFilterUser}
                onChange={(e) => {
                  setLogFilterUser(e.target.value);
                  fetchFilteredLogs(e.target.value, logFilterAction, logFilterStartDate, logFilterEndDate);
                }}
                className="w-full py-1 px-2 bg-app-surface border border-border rounded-lg text-content-main text-xs focus:ring-1 focus:ring-primary focus:outline-none"
              >
                <option value="all">{t.admin.auditLogsAllUsers}</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.email} ({m.role === "admin" ? "管理者" : "メンバー"})
                  </option>
                ))}
              </select>
            </div>

            {/* 操作種別 */}
            <div>
              <label className="text-[10px] text-content-muted block mb-0.5">
                {t.admin.auditLogsFilterAction}
              </label>
              <select
                value={logFilterAction}
                onChange={(e) => {
                  setLogFilterAction(e.target.value);
                  fetchFilteredLogs(logFilterUser, e.target.value, logFilterStartDate, logFilterEndDate);
                }}
                className="w-full py-1 px-2 bg-app-surface border border-border rounded-lg text-content-main text-xs focus:ring-1 focus:ring-primary focus:outline-none"
              >
                <option value="all">{t.admin.auditLogsAllActions}</option>
                <option value="CREATE">CREATE (新規登録)</option>
                <option value="UPDATE">UPDATE (更新・変更)</option>
                <option value="DELETE">DELETE (削除・除外)</option>
                <option value="REVERT">REVERT (リバート)</option>
              </select>
            </div>

            {/* 期間 開始日 */}
            <div>
              <label className="text-[10px] text-content-muted block mb-0.5">
                {t.admin.auditLogsStartDate}
              </label>
              <input
                type="date"
                value={logFilterStartDate}
                onChange={(e) => {
                  setLogFilterStartDate(e.target.value);
                  fetchFilteredLogs(logFilterUser, logFilterAction, e.target.value, logFilterEndDate);
                }}
                className="w-full py-1 px-2 bg-app-surface border border-border rounded-lg text-content-main text-xs focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </div>

            {/* 期間 終了日 */}
            <div>
              <label className="text-[10px] text-content-muted block mb-0.5">
                {t.admin.auditLogsEndDate}
              </label>
              <input
                type="date"
                value={logFilterEndDate}
                onChange={(e) => {
                  setLogFilterEndDate(e.target.value);
                  fetchFilteredLogs(logFilterUser, logFilterAction, logFilterStartDate, e.target.value);
                }}
                className="w-full py-1 px-2 bg-app-surface border border-border rounded-lg text-content-main text-xs focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </div>
          </div>

          {(logFilterUser !== "all" || logFilterAction !== "all" || logFilterStartDate || logFilterEndDate) && (
            <div className="flex justify-end pt-1">
              <button
                onClick={handleResetLogFilters}
                className="text-[11px] text-content-muted hover:text-danger flex items-center gap-1 cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                <span>{t.admin.auditLogsResetFilter}</span>
              </button>
            </div>
          )}
        </div>

        {/* ログ一覧 */}
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {isLoadingLogs ? (
            <div className="text-center py-6 text-xs text-content-muted">読み込み中...</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-6 text-xs text-content-muted">
              {t.admin.auditLogsNoLogs}
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="p-2.5 bg-app-subtle border border-border/50 rounded-lg text-xs flex items-center justify-between gap-2 hover:bg-app-subtle/80 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span
                    className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                      log.action === "CREATE"
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                        : log.action === "UPDATE"
                        ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30"
                        : log.action === "DELETE"
                        ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30"
                        : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                    }`}
                  >
                    {log.action}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-content-main truncate">
                      {log.summary || `${log.entityType}の${log.action}`}
                    </div>
                    <div className="text-[10px] text-content-muted flex items-center gap-1.5 mt-0.5">
                      <span>{log.operatorEmail || log.operatorUserId}</span>
                      <span>•</span>
                      <span>{new Date(log.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedLogDetail(log)}
                  className="px-2 py-1 bg-app-surface border border-border text-content-muted hover:text-content-main text-[11px] rounded hover:bg-border/40 transition-colors shrink-0 flex items-center gap-1 cursor-pointer"
                  title="詳細データを表示"
                >
                  <Eye className="w-3 h-3" />
                  <span>{t.admin.auditLogsDetailBtn}</span>
                </button>
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

      {/* 操作ログ詳細モーダル */}
      <AuditLogDetailModal
        log={selectedLogDetail}
        isOpen={!!selectedLogDetail}
        onClose={() => setSelectedLogDetail(null)}
      />
    </div>

  );
}
