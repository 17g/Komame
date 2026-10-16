"use client";

import React from "react";
import { LayoutDashboard, Search, Plus, WalletCards, Sprout } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

export type TabType = "dashboard" | "search" | "register" | "accounts" | "goals" | "admin";

interface BottomNavProps {
  activeTab: TabType;
  onChangeTab: (tab: TabType) => void;
}

export function BottomNav({ activeTab, onChangeTab }: BottomNavProps) {
  const { t } = useTranslation();

  const navItems: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: "dashboard", label: t.nav.home, icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: "search", label: t.nav.txSearch, icon: <Search className="w-5 h-5" /> },
    { id: "register", label: t.nav.bookkeeping, icon: <Plus className="w-6 h-6" /> },
    { id: "accounts", label: t.nav.accountMove, icon: <WalletCards className="w-5 h-5" /> },
    { id: "goals", label: t.nav.growth, icon: <Sprout className="w-5 h-5" /> },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-app-surface/95 backdrop-blur-md border-t border-border flex items-center justify-around px-2 z-30 shadow-lg transition-colors duration-200">
      {navItems.map((item) => {
        const isCenter = item.id === "register";
        const isActive = activeTab === item.id;

        if (isCenter) {
          return (
            <div key={item.id} className="relative -top-4 flex justify-center">
              <button
                onClick={() => onChangeTab(item.id)}
                className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/30 hover:scale-105 active:scale-95 transition-all duration-200"
                aria-label="New Entry"
              >
                <Plus className="w-6 h-6 stroke-[2.5]" />
              </button>
            </div>
          );
        }

        return (
          <button
            key={item.id}
            onClick={() => onChangeTab(item.id)}
            className={cn(
              "flex flex-col items-center justify-center gap-1 flex-1 py-1 transition-all duration-200 cursor-pointer",
              isActive ? "text-primary font-bold" : "text-content-subtle hover:text-content-muted font-medium"
            )}
          >
            <div className={cn("transition-transform duration-200", isActive && "scale-110")}>
              {item.icon}
            </div>
            <span className="text-[10px] tracking-tight">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
