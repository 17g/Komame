"use client";

import React, { useState, useRef, useEffect } from "react";
import { Bell, Menu, X, Settings, LogOut, Palette, Download, Globe } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { ThemeName, UserSession } from "@/types";
import { useTranslation } from "@/lib/i18n";

interface HeaderProps {
  user: (UserSession & { householdName: string }) | null;
  unreadCount?: number;
  onOpenNotification: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
  onTriggerToast: (msg: string) => void;
}

export function Header({
  user,
  unreadCount = 0,
  onOpenNotification,
  onOpenAdmin,
  onLogout,
  onTriggerToast,
}: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // ハンバーガーメニューの外部クリック検知
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMenuOpen]);

  const themes: { id: ThemeName; name: string }[] = [
    { id: "natural_komame", name: "🌿 1. Natural Komame" },
    { id: "warm_latte", name: "☕ 2. Warm Latte & Washi" },
    { id: "fintech_indigo", name: "💎 3. Modern FinTech Indigo" },
    { id: "forest_mint", name: "🌲 4. Forest & Mint Clean" },
    { id: "slate_dark", name: "🌙 5. Slate Minimal Dark" },
  ];

  const handleLanguageToggle = () => {
    const nextLang = language === "ja" ? "en" : "ja";
    setLanguage(nextLang);
    onTriggerToast(nextLang === "ja" ? "🇯🇵 日本語に切り替えました" : "🇺🇸 Switched to English");
  };

  return (
    <header className="sticky top-0 z-30 bg-app-surface/95 backdrop-blur-md border-b border-border transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        {/* ロゴ & 世帯名 */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg overflow-hidden border border-border shadow-xs shrink-0">
            <img src="/logo.jpg" alt="Komame" className="w-full h-full object-cover" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-display font-extrabold text-lg tracking-tight text-primary">
              Komame
            </span>
            {user && (
              <span className="hidden sm:inline-flex px-2.5 py-0.5 text-xs font-semibold rounded-full bg-primary-light text-primary border border-primary-border">
                {user.householdName}
              </span>
            )}
          </div>
        </div>

        {/* 右側アクション群 */}
        <div className="flex items-center gap-2" ref={menuRef}>
          {/* 言語切り替えトグルボタン (🇯🇵 JA / 🇺🇸 EN) */}
          <button
            onClick={handleLanguageToggle}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-app-subtle border border-border rounded-lg text-xs font-bold text-content-main hover:border-primary transition-colors cursor-pointer"
            title="Switch Language / 言語切替"
          >
            <Globe className="w-3.5 h-3.5 text-primary" />
            <span>{language === "ja" ? "English" : "日本語"}</span>
          </button>

          {/* PC表示用のテーマセレクター */}
          <div className="hidden md:flex items-center relative">
            <select
              value={theme}
              onChange={(e) => {
                setTheme(e.target.value as ThemeName);
                onTriggerToast("テーマを変更しました");
              }}
              className="appearance-none bg-app-subtle border border-border text-content-main text-xs font-semibold pl-7 pr-3 py-1.5 rounded-lg cursor-pointer outline-none hover:border-primary transition-colors"
            >
              {themes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <Palette className="absolute left-2 w-3.5 h-3.5 text-content-muted pointer-events-none" />
          </div>

          {/* 通知ボタン (全画面通知ボックスを開く) */}
          {user && (
            <button
              onClick={onOpenNotification}
              className="relative p-2 rounded-lg text-content-muted hover:text-primary hover:bg-app-subtle transition-colors cursor-pointer"
              title={t.nav.notifications}
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger rounded-full ring-2 ring-app-surface animate-pulse" />
              )}
            </button>
          )}

          {/* 管理・ログ・CSV設定アイコン */}
          {user && (
            <button
              onClick={onOpenAdmin}
              className="p-2 rounded-lg text-content-muted hover:text-primary hover:bg-app-subtle transition-colors cursor-pointer"
              title={t.nav.admin}
            >
              <Settings className="w-5 h-5" />
            </button>
          )}

          {/* モバイル/タブレット用 ハンバーガーメニュー */}
          <div className="relative">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 rounded-lg text-content-muted hover:text-content-main hover:bg-app-subtle md:hidden transition-colors cursor-pointer"
              title={t.nav.menu}
            >
              {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            {/* ドロップダウンメニュー */}
            {isMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-app-surface border border-border rounded-2xl shadow-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                {user && (
                  <div className="px-4 py-2 border-b border-border">
                    <div className="text-xs font-bold text-content-main">{user.householdName}</div>
                    <div className="text-[10px] text-content-subtle">{user.email}</div>
                  </div>
                )}

                {/* 言語切り替え */}
                <div className="px-4 py-2 border-b border-border">
                  <div className="text-[10px] font-bold text-content-muted mb-1">{t.nav.language}</div>
                  <button
                    onClick={handleLanguageToggle}
                    className="w-full text-left py-1 px-2 bg-app-subtle rounded text-xs font-bold text-primary flex items-center justify-between cursor-pointer"
                  >
                    <span>{language === "ja" ? "日本語 (Japanese)" : "English (英語)"}</span>
                    <Globe className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* テーマ切り替え */}
                <div className="px-4 py-2 border-b border-border">
                  <div className="text-[10px] font-bold text-content-muted mb-1 flex items-center gap-1">
                    <Palette className="w-3 h-3" />
                    <span>{t.nav.theme}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-1">
                    {themes.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          setTheme(t.id);
                          setIsMenuOpen(false);
                          onTriggerToast("テーマを変更しました");
                        }}
                        className={`text-left text-xs px-2 py-1 rounded transition-colors ${
                          theme === t.id
                            ? "bg-primary-light text-primary font-bold"
                            : "text-content-muted hover:bg-app-subtle"
                        }`}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* CSVダウンロード */}
                <a
                  href="/api/admin/csv"
                  download
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-content-main hover:bg-app-subtle transition-colors"
                >
                  <Download className="w-4 h-4 text-primary" />
                  <span>CSVエクスポート</span>
                </a>

                {/* ログアウト */}
                {user && (
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      onLogout();
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-xs font-bold text-danger hover:bg-danger-light transition-colors border-t border-border mt-1 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>{t.nav.logout}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
