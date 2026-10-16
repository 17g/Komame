"use client";

import React, { useState, useEffect } from "react";
import { AccountItem } from "@/types";
import { X, Check, Landmark, CreditCard, Plus } from "lucide-react";
import { HelpTooltip } from "./HelpTooltip";

interface AddAccountModalProps {
  accounts: AccountItem[];
  isOpen: boolean;
  initialTab?: "account" | "payment_method";
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

export function AddAccountModal({
  accounts,
  isOpen,
  initialTab = "account",
  onClose,
  onSuccess,
}: AddAccountModalProps) {
  const [activeTab, setActiveTab] = useState<"account" | "payment_method">("account");

  // モーダルが開かれたときに初期タブを設定 (要件指摘3-4)
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // 口座フォーム
  const [accName, setAccName] = useState("");
  const [accType, setAccType] = useState<"bank" | "prepaid_wallet" | "cash" | "term_deposit" | "nisa_investment">("bank");
  const [accBalance, setAccBalance] = useState("");
  const [accIcon, setAccIcon] = useState("🏛️");

  // 決済手段フォーム
  const [pmName, setPmName] = useState("");
  const [pmType, setPmType] = useState<"credit_card" | "qr_code" | "debit_card" | "cash">("credit_card");
  const [pmSourceAccId, setPmSourceAccId] = useState(accounts[0]?.id || "");
  const [pmClosingDay, setPmClosingDay] = useState("99"); // 月末
  const [pmWithdrawalDay, setPmWithdrawalDay] = useState("27");
  const [pmMonthOffset, setPmMonthOffset] = useState("1"); // 翌月

  const [isSubmitting, setIsSubmitting] = useState(false);

  // 種別切り替え時の引き落とし元口座自動選択 (現金: 手元現金 / QR決済: Pay残高または銀行)
  useEffect(() => {
    if (pmType === "cash") {
      const cashAcc = accounts.find((a) => a.type === "cash");
      if (cashAcc) setPmSourceAccId(cashAcc.id);
    } else if (pmType === "qr_code") {
      const qrAcc = accounts.find((a) => a.type === "prepaid_wallet" || a.type === "bank");
      if (qrAcc) setPmSourceAccId(qrAcc.id);
    } else if (pmType === "credit_card" || pmType === "debit_card") {
      const bankAcc = accounts.find((a) => a.type === "bank");
      if (bankAcc) setPmSourceAccId(bankAcc.id);
    }
  }, [pmType, accounts]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (activeTab === "account") {
        const res = await fetch("/api/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actionType: "account",
            name: accName,
            type: accType,
            balance: parseInt(accBalance || "0", 10),
            icon: accIcon,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          onSuccess(data.message || "口座を追加しました！");
          onClose();
        }
      } else {
        const res = await fetch("/api/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actionType: "payment_method",
            name: pmName,
            type: pmType,
            sourceAccountId: pmSourceAccId,
            closingDay: parseInt(pmClosingDay, 10),
            withdrawalDay: parseInt(pmWithdrawalDay, 10),
            withdrawalMonthOffset: parseInt(pmMonthOffset, 10),
          }),
        });
        const data = await res.json();
        if (res.ok) {
          onSuccess(data.message || "決済手段を追加しました！");
          onClose();
        }
      }
    } catch {
      onSuccess("登録処理中にエラーが発生しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-app-surface border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 font-bold text-base text-content-main">
            <Plus className="w-5 h-5 text-primary" />
            <span>口座・決済手段の登録</span>
          </div>
          <button onClick={onClose} className="text-content-muted hover:text-content-main p-1 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* タブ切替 */}
        <div className="flex p-1 bg-app-subtle rounded-xl mb-4">
          <button
            type="button"
            onClick={() => setActiveTab("account")}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === "account"
                ? "bg-app-surface text-primary shadow-xs"
                : "text-content-muted hover:text-content-main"
            }`}
          >
            <Landmark className="w-3.5 h-3.5" />
            <span>銀行・ウォレット口座</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("payment_method")}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === "payment_method"
                ? "bg-app-surface text-primary shadow-xs"
                : "text-content-muted hover:text-content-main"
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>カード・決済手段</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {activeTab === "account" ? (
            <>
              <div>
                <label className="block text-xs font-bold text-content-muted mb-1 flex items-center gap-1">
                  <span>口座・資産名</span>
                  <HelpTooltip text="銀行名、ウォレット名、証券口座名などを入力します。" />
                </label>
                <input
                  type="text"
                  placeholder="例: 三菱UFJ銀行, PayPay残高, SBI証券"
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                  className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-xs font-medium focus:border-primary outline-none text-content-main"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-content-muted mb-1">口座種別</label>
                  <select
                    value={accType}
                    onChange={(e) => {
                      const t = e.target.value as any;
                      setAccType(t);
                      if (t === "bank") setAccIcon("🏛️");
                      else if (t === "prepaid_wallet") setAccIcon("📱");
                      else if (t === "cash") setAccIcon("💵");
                      else if (t === "nisa_investment") setAccIcon("📈");
                      else setAccIcon("🏦");
                    }}
                    className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-xs font-medium focus:border-primary outline-none text-content-main cursor-pointer"
                  >
                    <option value="bank">銀行口座 (普通/当座)</option>
                    <option value="prepaid_wallet">プリペイド/Pay残高</option>
                    <option value="cash">手元現金 (財布)</option>
                    <option value="nisa_investment">投資信託 (つみたてNISA)</option>
                    <option value="term_deposit">定期預金・積立</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-content-muted mb-1">初期残高 (円)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={accBalance}
                    onChange={(e) => setAccBalance(e.target.value.replace(/[^0-9]/g, ""))}
                    className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-xs font-bold focus:border-primary outline-none text-content-main"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-bold text-content-muted mb-1 flex items-center gap-1">
                  <span>決済手段名</span>
                  <HelpTooltip text="クレジットカード名、コード決済名などを入力します。" />
                </label>
                <input
                  type="text"
                  placeholder="例: 楽天カード, 三井住友Olive, PayPay残高払い"
                  value={pmName}
                  onChange={(e) => setPmName(e.target.value)}
                  className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-xs font-medium focus:border-primary outline-none text-content-main"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-content-muted mb-1">種別</label>
                  <select
                    value={pmType}
                    onChange={(e) => setPmType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-xs font-medium focus:border-primary outline-none text-content-main cursor-pointer"
                  >
                    <option value="credit_card">クレジットカード</option>
                    <option value="qr_code">QR・バーコード決済</option>
                    <option value="debit_card">デビットカード</option>
                    <option value="cash">現金</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-content-muted mb-1 flex items-center gap-1">
                    <span>引き落とし元口座</span>
                    <HelpTooltip text="この決済手段の利用時に資金が引き落とされる銀行または現金口座を選択します。" />
                  </label>
                  <select
                    value={pmSourceAccId}
                    onChange={(e) => setPmSourceAccId(e.target.value)}
                    className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-xs font-medium focus:border-primary outline-none text-content-main cursor-pointer"
                  >
                    {accounts.map((a) => {
                      // 現金: 手元現金のみ / QR決済: 銀行口座またはプリペイド残高のみ / クレカ・デビット: 銀行口座のみ
                      let isDisabled = false;
                      let hint = "";

                      if (pmType === "cash") {
                        isDisabled = a.type !== "cash";
                        if (isDisabled) hint = "(手元現金のみ選択可)";
                      } else if (pmType === "qr_code") {
                        isDisabled = a.type !== "bank" && a.type !== "prepaid_wallet";
                        if (isDisabled) hint = "(銀行/Pay残高のみ選択可)";
                      } else if (pmType === "credit_card" || pmType === "debit_card") {
                        isDisabled = a.type !== "bank";
                        if (isDisabled) hint = "(銀行口座のみ選択可)";
                      }

                      return (
                        <option
                          key={a.id}
                          value={a.id}
                          disabled={isDisabled}
                          className={isDisabled ? "text-zinc-400 bg-zinc-100 dark:bg-zinc-800" : ""}
                        >
                          {a.icon || "🏦"} {a.name} {hint}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {pmType === "credit_card" && (
                <div className="p-3 bg-app-subtle rounded-xl space-y-2.5 border border-border">
                  <div className="text-[11px] font-bold text-primary flex items-center gap-1">
                    <span>💳 クレジットカード決済日設定</span>
                    <HelpTooltip text="毎月の締め日と引き落とし日を設定すると、利用明細の引き落とし予定日が自動計算されます。" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-content-muted mb-1">締め日</label>
                      <select
                        value={pmClosingDay}
                        onChange={(e) => setPmClosingDay(e.target.value)}
                        className="w-full px-2 py-1.5 bg-app-surface border border-border rounded text-xs text-content-main cursor-pointer"
                      >
                        <option value="99">月末</option>
                        <option value="10">10日</option>
                        <option value="15">15日</option>
                        <option value="20">20日</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-content-muted mb-1">引き落とし月</label>
                      <select
                        value={pmMonthOffset}
                        onChange={(e) => setPmMonthOffset(e.target.value)}
                        className="w-full px-2 py-1.5 bg-app-surface border border-border rounded text-xs text-content-main cursor-pointer"
                      >
                        <option value="1">翌月</option>
                        <option value="2">翌々月</option>
                        <option value="0">当月</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-content-muted mb-1">引き落とし日</label>
                      <select
                        value={pmWithdrawalDay}
                        onChange={(e) => setPmWithdrawalDay(e.target.value)}
                        className="w-full px-2 py-1.5 bg-app-surface border border-border rounded text-xs text-content-main cursor-pointer"
                      >
                        <option value="27">27日</option>
                        <option value="10">10日</option>
                        <option value="26">26日</option>
                        <option value="99">月末</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-app-subtle border border-border text-content-muted text-xs font-bold rounded-lg hover:bg-border/50 cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary-hover flex items-center justify-center gap-1 shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{isSubmitting ? "保存中..." : "登録する"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
