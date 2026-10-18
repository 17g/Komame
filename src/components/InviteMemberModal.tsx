"use client";

import React, { useState } from "react";
import { X, Copy, Check, UserPlus, Link2, Shield, User, KeyRound } from "lucide-react";

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onTriggerToast: (msg: string) => void;
}

export function InviteMemberModal({
  isOpen,
  onClose,
  onSuccess,
  onTriggerToast,
}: InviteMemberModalProps) {
  const [activeTab, setActiveTab] = useState<"direct" | "link">("direct");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [isAutoPassword, setIsAutoPassword] = useState(true);
  const [customPassword, setCustomPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // 招待・登録成功結果
  const [result, setResult] = useState<{
    email?: string;
    initialPassword?: string;
    inviteLink?: string;
  } | null>(null);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    onTriggerToast("クリップボードにコピーしました");
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleResetForm = () => {
    setEmail("");
    setRole("member");
    setIsAutoPassword(true);
    setCustomPassword("");
    setResult(null);
    setErrorMessage("");
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      if (activeTab === "direct") {
        if (!email.trim() || !email.includes("@")) {
          setErrorMessage("有効なメールアドレスを入力してください。");
          setIsSubmitting(false);
          return;
        }

        const payload: { email: string; role: string; password?: string } = {
          email: email.trim(),
          role,
        };
        if (!isAutoPassword && customPassword.trim()) {
          payload.password = customPassword.trim();
        }

        const res = await fetch("/api/admin/members", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (res.ok) {
          const fullInviteLink = data.inviteLink
            ? `${window.location.origin}${data.inviteLink}`
            : "";
          setResult({
            email: email.trim(),
            initialPassword: data.initialPassword,
            inviteLink: fullInviteLink,
          });
          onSuccess();
        } else {
          setErrorMessage(data.error || "メンバーの追加に失敗しました。");
        }
      } else {
        // 招待リンク発行モード
        const res = await fetch("/api/admin/members", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create_invite_link", role }),
        });

        const data = await res.json();
        if (res.ok) {
          const fullInviteLink = `${window.location.origin}${data.inviteLink}`;
          setResult({
            inviteLink: fullInviteLink,
          });
          onSuccess();
        } else {
          setErrorMessage(data.error || "招待リンクの発行に失敗しました。");
        }
      }
    } catch {
      setErrorMessage("通信エラーが発生しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-app-surface border border-border rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* モーダルヘッダー */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-light flex items-center justify-center text-primary">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-content-main">家族メンバーの招待・追加</h3>
              <p className="text-[11px] text-content-muted">世帯に新しい家族のアカウントを登録します</p>
            </div>
          </div>
          <button
            onClick={handleResetForm}
            className="p-1 rounded-lg hover:bg-app-subtle text-content-muted transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* コンテンツエリア */}
        <div className="p-5 overflow-y-auto space-y-4">
          {result ? (
            /* 完了・共有用画面 */
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="p-3 bg-primary-light/40 border border-primary/20 rounded-xl flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center text-xs shrink-0 mt-0.5">
                  ✓
                </div>
                <div>
                  <h4 className="text-xs font-bold text-primary">
                    {result.initialPassword
                      ? "登録・招待準備が完了しました！"
                      : "世帯招待リンクを発行しました！"}
                  </h4>
                  <p className="text-[11px] text-content-main mt-0.5 leading-relaxed">
                    {result.initialPassword
                      ? "以下のログイン情報または招待リンクをご家族へ共有してください。"
                      : "相手の方はすでにKomameアカウントをお持ちのため、本人の認証が必要です。以下の招待リンクをご家族へ共有してください。"}
                  </p>
                </div>
              </div>

              {result.email && (
                <div className="space-y-1.5 bg-app-subtle p-3 rounded-xl border border-border">
                  <div className="text-[11px] font-bold text-content-muted flex items-center justify-between">
                    <span>ログインID (メールアドレス)</span>
                    <button
                      onClick={() => handleCopy(result.email!, "email")}
                      className="text-primary hover:underline flex items-center gap-1 text-[10px] cursor-pointer"
                    >
                      {copiedKey === "email" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      コピー
                    </button>
                  </div>
                  <div className="text-xs font-mono font-bold text-content-main select-all bg-app-surface px-2.5 py-1.5 rounded border border-border">
                    {result.email}
                  </div>
                </div>
              )}

              {result.initialPassword && (
                <div className="space-y-1.5 bg-app-subtle p-3 rounded-xl border border-border">
                  <div className="text-[11px] font-bold text-content-muted flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <KeyRound className="w-3.5 h-3.5 text-warning" />
                      初期パスワード
                    </span>
                    <button
                      onClick={() => handleCopy(result.initialPassword!, "pwd")}
                      className="text-primary hover:underline flex items-center gap-1 text-[10px] cursor-pointer"
                    >
                      {copiedKey === "pwd" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      コピー
                    </button>
                  </div>
                  <div className="text-xs font-mono font-bold text-content-main select-all bg-app-surface px-2.5 py-1.5 rounded border border-border">
                    {result.initialPassword}
                  </div>
                  <p className="text-[10px] text-content-subtle mt-1">
                    ※ログイン後、各自でパスワードを変更していただけます。
                  </p>
                </div>
              )}

              {result.inviteLink && (
                <div className="space-y-1.5 bg-app-subtle p-3 rounded-xl border border-border">
                  <div className="text-[11px] font-bold text-content-muted flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Link2 className="w-3.5 h-3.5 text-primary" />
                      参加招待リンク (7日間有効)
                    </span>
                    <button
                      onClick={() => handleCopy(result.inviteLink!, "link")}
                      className="text-primary hover:underline flex items-center gap-1 text-[10px] cursor-pointer"
                    >
                      {copiedKey === "link" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      リンクをコピー
                    </button>
                  </div>
                  <div className="text-[11px] font-mono text-content-muted break-all select-all bg-app-surface px-2.5 py-1.5 rounded border border-border">
                    {result.inviteLink}
                  </div>
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleResetForm}
                  className="py-2 px-4 bg-primary text-white text-xs font-bold rounded-xl shadow-xs hover:bg-primary-hover transition-colors cursor-pointer"
                >
                  閉じる
                </button>
              </div>
            </div>
          ) : (
            /* 入力フォーム */
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* モード切替タブ */}
              <div className="flex bg-app-subtle p-1 rounded-xl border border-border">
                <button
                  type="button"
                  onClick={() => setActiveTab("direct")}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeTab === "direct"
                      ? "bg-app-surface text-primary shadow-xs"
                      : "text-content-muted hover:text-content-main"
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  メール指定で直接追加
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("link")}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeTab === "link"
                      ? "bg-app-surface text-primary shadow-xs"
                      : "text-content-muted hover:text-content-main"
                  }`}
                >
                  <Link2 className="w-3.5 h-3.5" />
                  招待リンクのみ発行
                </button>
              </div>

              {errorMessage && (
                <div className="p-3 bg-danger-light border border-danger/30 rounded-xl text-danger text-xs font-bold">
                  ⚠️ {errorMessage}
                </div>
              )}

              {activeTab === "direct" ? (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-content-main flex items-center gap-1">
                      <span>メールアドレス</span>
                      <span className="text-danger text-[10px]">*必須</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="family@example.com"
                      className="w-full px-3 py-2 text-xs bg-app-surface border border-border rounded-xl focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary text-content-main"
                    />
                    <p className="text-[10px] text-content-subtle">
                      ※家族メンバーのログインIDとして使用されます。
                    </p>
                  </div>

                  {/* 権限選択 */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-content-main">権限 (ロール)</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setRole("member")}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          role === "member"
                            ? "bg-primary-light/30 border-primary text-content-main shadow-xs"
                            : "bg-app-surface border-border text-content-muted hover:bg-app-subtle"
                        }`}
                      >
                        <div className="text-xs font-bold flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-primary" />
                          一般メンバー
                        </div>
                        <div className="text-[10px] text-content-subtle mt-0.5">
                          明細記帳・検索・ダッシュボード閲覧
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setRole("admin")}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          role === "admin"
                            ? "bg-primary-light/30 border-primary text-content-main shadow-xs"
                            : "bg-app-surface border-border text-content-muted hover:bg-app-subtle"
                        }`}
                      >
                        <div className="text-xs font-bold flex items-center gap-1">
                          <Shield className="w-3.5 h-3.5 text-warning" />
                          世帯管理者
                        </div>
                        <div className="text-[10px] text-content-subtle mt-0.5">
                          メンバー管理・リバート・設定・全操作
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* 初期パスワード設定 */}
                  <div className="space-y-2 pt-1 border-t border-border">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isAutoPassword}
                        onChange={(e) => setIsAutoPassword(e.target.checked)}
                        className="rounded border-border text-primary focus:ring-primary cursor-pointer"
                      />
                      <span className="text-xs font-bold text-content-main">
                        安全な初期パスワードを自動生成する（推奨）
                      </span>
                    </label>

                    {!isAutoPassword && (
                      <div className="space-y-1 pl-5">
                        <input
                          type="password"
                          value={customPassword}
                          onChange={(e) => setCustomPassword(e.target.value)}
                          placeholder="8文字以上 (英大文字・小文字・数字)"
                          className="w-full px-3 py-2 text-xs bg-app-surface border border-border rounded-xl focus:outline-hidden focus:border-primary text-content-main"
                        />
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* 招待リンクモード */
                <div className="space-y-3">
                  <p className="text-xs text-content-muted leading-relaxed">
                    世帯参加用のワンタイム招待リンクを発行します。相手にリンクを送るだけで、相手自身がメールアドレスとパスワードを設定して世帯に参加できます。
                  </p>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-content-main">付与する権限</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setRole("member")}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          role === "member"
                            ? "bg-primary-light/30 border-primary text-content-main shadow-xs"
                            : "bg-app-surface border-border text-content-muted hover:bg-app-subtle"
                        }`}
                      >
                        <div className="text-xs font-bold">一般メンバー</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRole("admin")}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          role === "admin"
                            ? "bg-primary-light/30 border-primary text-content-main shadow-xs"
                            : "bg-app-surface border-border text-content-muted hover:bg-app-subtle"
                        }`}
                      >
                        <div className="text-xs font-bold">世帯管理者</div>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* フッター操作ボタン */}
              <div className="pt-3 border-t border-border flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleResetForm}
                  className="py-2 px-3.5 bg-app-subtle border border-border text-content-main text-xs font-bold rounded-xl hover:bg-border transition-colors cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="py-2 px-4 bg-primary text-white text-xs font-bold rounded-xl shadow-xs hover:bg-primary-hover disabled:opacity-50 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  {isSubmitting ? "処理中..." : activeTab === "direct" ? "メンバーを追加する" : "招待リンクを発行"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
