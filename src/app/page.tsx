"use client";

import React, { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { BottomNav, TabType } from "@/components/BottomNav";
import { DashboardTab } from "@/components/DashboardTab";
import { SearchTab } from "@/components/SearchTab";
import { RegisterTab } from "@/components/RegisterTab";
import { AccountsTab } from "@/components/AccountsTab";
import { GoalsTab } from "@/components/GoalsTab";
import { AdminTab } from "@/components/AdminTab";
import { Toast } from "@/components/Toast";
import { NotificationBox, NotificationItem } from "@/components/NotificationBox";
import {
  UserSession,
  AccountItem,
  AccountReservationItem,
  PaymentMethodItem,
  CategoryItem,
  TransactionItem,
  SavingsGoalItem,
} from "@/types";
import { ArrowRight } from "lucide-react";

export default function Home() {
  const [user, setUser] = useState<(UserSession & { householdName: string }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("dashboard");

  // アプリデータ
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [reservations, setReservations] = useState<AccountReservationItem[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [goals, setGoals] = useState<SavingsGoalItem[]>([]);

  // 通知状態 (アプリ内通知ボックス)
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: "notif-01",
      type: "success",
      title: "次回カード引き落としの原資確認",
      message: "2/27 楽天カード引き落とし予定額（¥85,420）の原資が三井住友銀行に確保されています。",
      createdAt: new Date().toISOString(),
      isRead: false,
    },
    {
      id: "notif-02",
      type: "info",
      title: "貯蓄目標の進捗",
      message: "年間100万円貯蓄チャレンジの達成率が 74% に達しました！素晴らしいペースです🌱",
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      isRead: false,
    },
  ]);

  const unreadNotifCount = notifications.filter((n) => !n.isRead).length;

  const handleMarkAllAsRead = () => {
    setNotifications(notifications.map((n) => ({ ...n, isRead: true })));
    triggerToast("すべての通知を既読にしました");
  };

  // トースト状態
  const [toastMsg, setToastMsg] = useState("");
  const [isToastOpen, setIsToastOpen] = useState(false);

  // 認証フォーム入力
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("admin@komame.local");
  const [password, setPassword] = useState("Password123!");
  const [householdName, setHouseholdName] = useState("山田家");
  const [authError, setAuthError] = useState("");

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setIsToastOpen(true);
  };

  // セッション確認
  const checkSession = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          fetchAllData();
        }
      }
    } catch {
      // not logged in
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  // 全データ取得
  const fetchAllData = async () => {
    try {
      const [accRes, catRes, txRes, goalRes] = await Promise.all([
        fetch("/api/accounts"),
        fetch("/api/categories"),
        fetch("/api/transactions"),
        fetch("/api/goals"),
      ]);

      if (accRes.ok) {
        const d = await accRes.json();
        setAccounts(d.accounts || []);
        setReservations(d.reservations || []);
        setPaymentMethods(d.paymentMethods || []);
      }
      if (catRes.ok) {
        const d = await catRes.json();
        setCategories(d.categories || []);
      }
      if (txRes.ok) {
        const d = await txRes.json();
        setTransactions(d.transactions || []);
      }
      if (goalRes.ok) {
        const d = await goalRes.json();
        setGoals(d.goals || []);
      }
    } catch {
      // ignore
    }
  };

  // ログイン実行
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (res.ok) {
        triggerToast("ログインしました！");
        checkSession();
      } else {
        setAuthError(data.error || "ログインに失敗しました。");
      }
    } catch {
      setAuthError("通信エラーが発生しました。");
    }
  };

  // サインアップ実行
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, householdName }),
      });

      const data = await res.json();
      if (res.ok) {
        triggerToast("新規世帯アカウントを作成しました！");
        checkSession();
      } else {
        setAuthError(data.error || "登録に失敗しました。");
      }
    } catch {
      setAuthError("通信エラーが発生しました。");
    }
  };

  // ログアウト実行
  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    triggerToast("ログアウトしました");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app-bg text-content-main">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary-light flex items-center justify-center text-2xl animate-bounce">
            🌱
          </div>
          <span className="text-xs font-bold text-content-muted">Komame を読み込み中...</span>
        </div>
      </div>
    );
  }

  // 未ログイン時: 認証画面
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-app-bg text-content-main">
        <div className="max-w-md w-full p-8 bg-app-surface border border-border rounded-3xl shadow-xl flex flex-col gap-5">
          <div className="flex flex-col items-center text-center gap-2.5">
            <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-sm border border-border">
              <img src="/logo.jpg" alt="Komame" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="font-display font-extrabold text-2xl text-primary tracking-tight">
                Komame
              </h1>
              <p className="text-xs text-content-muted mt-1 font-medium">
                こまめに記録、すくすく育つ家計管理
              </p>
            </div>
          </div>

          <div className="flex p-1 bg-app-subtle rounded-xl">
            <button
              onClick={() => {
                setAuthMode("login");
                setAuthError("");
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                authMode === "login"
                  ? "bg-app-surface text-content-main shadow-xs"
                  : "text-content-muted hover:text-content-main"
              }`}
            >
              ログイン
            </button>
            <button
              onClick={() => {
                setAuthMode("signup");
                setAuthError("");
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                authMode === "signup"
                  ? "bg-app-surface text-content-main shadow-xs"
                  : "text-content-muted hover:text-content-main"
              }`}
            >
              新規世帯登録
            </button>
          </div>

          {authError && (
            <div className="p-3 bg-danger-light text-danger border border-danger/20 rounded-xl text-xs font-medium">
              {authError}
            </div>
          )}

          <form onSubmit={authMode === "login" ? handleLogin : handleSignup} className="space-y-3.5">
            {authMode === "signup" && (
              <div>
                <label className="block text-xs font-bold text-content-muted mb-1">
                  世帯名 (家計簿の名前)
                </label>
                <input
                  type="text"
                  placeholder="例: 山田家, マイホーム"
                  value={householdName}
                  onChange={(e) => setHouseholdName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-app-subtle border border-border rounded-xl text-xs font-medium focus:border-primary outline-none text-content-main"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-content-muted mb-1">
                メールアドレス
              </label>
              <input
                type="email"
                placeholder="admin@komame.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-app-subtle border border-border rounded-xl text-xs font-medium focus:border-primary outline-none text-content-main"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-content-muted mb-1">
                パスワード (8文字以上・英大小数字)
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-app-subtle border border-border rounded-xl text-xs font-medium focus:border-primary outline-none text-content-main"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-primary text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm hover:bg-primary-hover active:scale-98 transition-all"
            >
              <span>{authMode === "login" ? "ログインする" : "世帯を開設して始める"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {authMode === "login" && (
            <div className="p-3 bg-app-subtle rounded-xl text-[11px] text-content-muted border border-border leading-relaxed">
              💡 <b>初期デモ管理者アカウント:</b><br />
              ・メール: <code>admin@komame.local</code><br />
              ・パスワード: <code>Password123!</code>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ログイン後: 本格レスポンシブ画面
  return (
    <div className="min-h-screen bg-app-bg text-content-main flex">
      {/* PC表示用 サイドバー (lg以上) */}
      <Sidebar
        user={user}
        unreadCount={unreadNotifCount}
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        onOpenNotification={() => setIsNotifOpen(true)}
        onLogout={handleLogout}
        onTriggerToast={triggerToast}
      />

      {/* メインエリア */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* スマホ・タブレット表示用 ヘッダー (lg未満) */}
        <Header
          user={user}
          unreadCount={unreadNotifCount}
          onOpenNotification={() => setIsNotifOpen(true)}
          onOpenAdmin={() => setActiveTab("admin")}
          onLogout={handleLogout}
          onTriggerToast={triggerToast}
        />

        {/* コンテンツエリア */}
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {activeTab === "dashboard" && (
            <DashboardTab
              accounts={accounts}
              transactions={transactions}
              onOpenRegister={() => setActiveTab("register")}
              onOpenAllTransactions={() => setActiveTab("search")}
            />
          )}

          {activeTab === "search" && (
            <SearchTab
              transactions={transactions}
              categories={categories}
              paymentMethods={paymentMethods}
              onTriggerToast={triggerToast}
              onRefresh={fetchAllData}
            />
          )}

          {activeTab === "register" && (
            <RegisterTab
              categories={categories}
              paymentMethods={paymentMethods}
              accounts={accounts}
              onSubmitSuccess={() => {
                fetchAllData();
                setActiveTab("dashboard");
              }}
              onTriggerToast={triggerToast}
            />
          )}

          {activeTab === "accounts" && (
            <AccountsTab
              accounts={accounts}
              reservations={reservations}
              paymentMethods={paymentMethods}
              onTriggerToast={triggerToast}
              onRefresh={fetchAllData}
            />
          )}

          {activeTab === "goals" && (
            <GoalsTab goals={goals} onTriggerToast={triggerToast} />
          )}

          {activeTab === "admin" && (
            <AdminTab onTriggerToast={triggerToast} onRefreshAll={fetchAllData} />
          )}
        </main>

        {/* スマホ・タブレット表示用 ボトムナビゲーション (lg未満) */}
        <BottomNav activeTab={activeTab} onChangeTab={setActiveTab} />

        {/* アプリ内通知ボックス (画面最上位・全画面オーバーレイ) */}
        <NotificationBox
          isOpen={isNotifOpen}
          onClose={() => setIsNotifOpen(false)}
          notifications={notifications}
          onMarkAllAsRead={handleMarkAllAsRead}
        />

        {/* トースト通知 */}
        <Toast
          message={toastMsg}
          isOpen={isToastOpen}
          onClose={() => setIsToastOpen(false)}
        />
      </div>
    </div>
  );
}
