"use client";

import React, { useState } from "react";
import { X, KeyRound, RefreshCw } from "lucide-react";
import { MemberItem } from "@/types";

interface ResetPasswordModalProps {
  member: MemberItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onTriggerToast: (msg: string) => void;
}

export function ResetPasswordModal({
  member,
  isOpen,
  onClose,
  onSuccess,
  onTriggerToast,
}: ResetPasswordModalProps) {
  const [newPassword, setNewPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  if (!isOpen || !member) return null;

  const handleGenerateRandom = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
    let pwd = "";
    for (let i = 0; i < 12; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(pwd);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 8) {
      setErrorMessage("パスワードは8文字以上で入力してください。");
      return;
    }

    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/admin/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset_password",
          membershipId: member.id,
          newPassword,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        onTriggerToast(`✓ ${member.email} のパスワードを再設定しました`);
        onSuccess();
        onClose();
        setNewPassword("");
      } else {
        setErrorMessage(data.error || "パスワードのリセットに失敗しました。");
      }
    } catch {
      setErrorMessage("通信エラーが発生しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-app-surface border border-border rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
        {/* ヘッダー */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-warning-light flex items-center justify-center text-warning">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-content-main">パスワードの再設定</h3>
              <p className="text-[11px] text-content-muted">{member.email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-app-subtle text-content-muted transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* フォーム */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-xs text-content-muted leading-relaxed">
            家族メンバーがログインパスワードを紛失した際、管理者が新しい一時パスワードを設定して再発行できます。
          </p>

          {errorMessage && (
            <div className="p-3 bg-danger-light border border-danger/30 rounded-xl text-danger text-xs font-bold">
              ⚠️ {errorMessage}
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-content-main">新しいパスワード</label>
              <button
                type="button"
                onClick={handleGenerateRandom}
                className="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer font-bold"
              >
                <RefreshCw className="w-3 h-3" />
                ランダム生成
              </button>
            </div>
            <input
              type="text"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="8文字以上 (英大文字・小文字・数字)"
              className="w-full px-3 py-2 text-xs font-mono bg-app-surface border border-border rounded-xl focus:outline-hidden focus:border-primary text-content-main"
            />
          </div>

          <div className="pt-2 border-t border-border flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="py-2 px-3.5 bg-app-subtle border border-border text-content-main text-xs font-bold rounded-xl hover:bg-border transition-colors cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="py-2 px-4 bg-primary text-white text-xs font-bold rounded-xl shadow-xs hover:bg-primary-hover disabled:opacity-50 transition-colors cursor-pointer"
            >
              {isSubmitting ? "更新中..." : "パスワードを更新"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
