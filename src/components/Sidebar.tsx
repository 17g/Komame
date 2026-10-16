"use client";

import React from "react";
import {
  LayoutDashboard,
  Search,
  PlusCircle,
  WalletCards,
  Sprout,
  Settings,
  LogOut,
  Palette,
  Download,
  Globe,
  Bell,
} from "lucide-react";
import { TabType } from "./BottomNav";
import { ThemeName, UserSession } from "@/types";
import { useTheme } from "./ThemeProvider";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface SidebarProps {
  user: (UserSession & { householdName: string }) | null;
  unreadCount?: number;
  activeTab: TabType;
  onChangeTab: (tab: TabType) => void;
  onOpenNotification: () => void;
  onLogout: () => void;
  onTriggerToast: (msg: string) => void;
}

export function Sidebar({
  user,
  unreadCount = 0,
  activeTab,
  onChangeTab,
  onOpenNotification,
  onLogout,
  onTriggerToast,
}: SidebarProps) {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useTranslation();

  const navItems: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: "dashboard", label: t.nav.dashboard, icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: "search", label: t.nav.search, icon: <Search className="w-4 h-4" /> },
    { id: "register", label: t.nav.register, icon: <PlusCircle className="w-4 h-4" /> },
    { id: "accounts", label: t.nav.accounts, icon: <WalletCards className="w-4 h-4" /> },
    { id: "goals", label: t.nav.goals, icon: <Sprout className="w-4 h-4" /> },
    { id: "admin", label: t.nav.admin, icon: <Settings className="w-4 h-4" /> },
  ];

  const themes: { id: ThemeName; name: string }[] = [
    { id: "natural_komame", name: "🌿 Natural Komame" },
    { id: "warm_latte", name: "☕ Warm Latte & Washi" },
    { id: "fintech_indigo", name: "💎 FinTech Indigo" },
    { id: "forest_mint", name: "🌲 Forest & Mint Clean" },
    { id: "slate_dark", name: "🌙 Slate Minimal Dark" },
  ];

  return (
    <aside className="hidden lg:flex w-64 flex-col justify-between p-5 bg-app-surface border-r border-border min-h-screen sticky top-0 transition-colors duration-200">
      <div className="space-y-5">
        {/* ロゴ & 世帯名 */}
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden border border-border shadow-xs shrink-0">
              <img src="/logo.jpg" alt="Komame" className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="font-display font-extrabold text-xl tracking-tight text-primary">
                Komame
              </div>
              {user && (
                <span className="inline-block mt-0.5 px-2 py-0.5 text-[11px] font-semibold rounded-full bg-primary-light text-primary border border-primary-border">
                  {user.householdName}
                </span>
              )}
            </div>
          </div>

          {/* デスクトップ用 通知ボタン */}
          {user && (
            <button
              onClick={onOpenNotification}
              className="relative p-2 rounded-xl text-content-muted hover:text-primary hover:bg-app-subtle transition-colors cursor-pointer border border-border"
              title={t.nav.notifications}
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-danger rounded-full ring-2 ring-app-surface" />
              )}
            </button>
          )}
        </div>

        {/* ナビゲーションリンク一覧 */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onChangeTab(item.id)}
                className={cn(
                  "w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left cursor-pointer",
                  isActive
                    ? "bg-primary text-white shadow-sm"
                    : "text-content-muted hover:text-content-main hover:bg-app-subtle"
                )}
              >
                <div className="flex items-center gap-3">
                  {item.icon}
                  <span>{item.label}</span>
                </div>
              </button>
            );
          })}
        </nav>

        {/* UIテーマ切替 セレクター */}
        <div className="p-3 bg-app-subtle rounded-xl border border-border space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-content-muted">
            <Palette className="w-3.5 h-3.5 text-primary" />
            <span>{t.nav.theme}</span>
          </div>
          <select
            value={theme}
            onChange={(e) => {
              setTheme(e.target.value as ThemeName);
              onTriggerToast("テーマを変更しました");
            }}
            className="w-full px-2.5 py-1.5 bg-app-surface border border-border rounded-lg text-xs font-medium text-content-main outline-none cursor-pointer"
          >
            {themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* 言語切替 (i18n) */}
        <div className="p-3 bg-app-subtle rounded-xl border border-border space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-content-muted">
            <Globe className="w-3.5 h-3.5 text-primary" />
            <span>{t.nav.language}</span>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => {
                setLanguage("ja");
                onTriggerToast("言語を「日本語」に設定しました");
              }}
              className={`flex-1 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                language === "ja"
                  ? "bg-primary text-white shadow-xs"
                  : "bg-app-surface text-content-muted hover:text-content-main"
              }`}
            >
              🇯🇵 日本語
            </button>
            <button
              onClick={() => {
                setLanguage("en");
                onTriggerToast("Language set to English");
              }}
              className={`flex-1 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                language === "en"
                  ? "bg-primary text-white shadow-xs"
                  : "bg-app-surface text-content-muted hover:text-content-main"
              }`}
            >
              🇺🇸 English
            </button>
          </div>
        </div>
      </div>

      {/* 下部 ユーザープロファイル & ログアウト */}
      {user && (
        <div className="pt-4 border-t border-border space-y-3">
          <div className="px-2">
            <div className="text-xs font-bold text-content-main truncate">{user.email}</div>
            <div className="text-[10px] text-content-subtle">
              {user.role === "admin" ? "管理者権限" : "メンバー"}
            </div>
          </div>

          <div className="flex gap-2">
            <a
              href="/api/admin/csv"
              download
              className="flex-1 py-1.5 px-2 bg-app-subtle border border-border rounded-lg text-[11px] font-bold text-content-main text-center hover:bg-border/50 transition-colors flex items-center justify-center gap-1"
              title="CSV出力"
            >
              <Download className="w-3 h-3" />
              <span>CSV</span>
            </a>

            <button
              onClick={onLogout}
              className="py-1.5 px-3 bg-danger-light text-danger border border-danger/20 rounded-lg text-[11px] font-bold hover:bg-danger/20 transition-colors flex items-center justify-center gap-1 cursor-pointer"
              title={t.nav.logout}
            >
              <LogOut className="w-3 h-3" />
              <span>{t.nav.logout}</span>
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
