"use client";

import React, { useState } from "react";
import { AccountItem, AccountReservationItem, PaymentMethodItem } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { Plus, Lock, ArrowRightLeft, CreditCard, Landmark, Palette, Edit2 } from "lucide-react";
import { AddAccountModal } from "./AddAccountModal";
import { EditAccountModal } from "./EditAccountModal";
import { EditReservationModal } from "./EditReservationModal";
import { EditPaymentMethodModal } from "./EditPaymentMethodModal";
import { HelpTooltip } from "./HelpTooltip";
import { useTranslation } from "@/lib/i18n";

interface AccountsTabProps {
  accounts: AccountItem[];
  reservations: AccountReservationItem[];
  paymentMethods: PaymentMethodItem[];
  onTriggerToast: (msg: string) => void;
  onRefresh: () => void;
}

export function AccountsTab({
  accounts,
  reservations,
  paymentMethods,
  onTriggerToast,
  onRefresh,
}: AccountsTabProps) {
  const { t } = useTranslation();

  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [modalInitialTab, setModalInitialTab] = useState<"account" | "payment_method">("account");
  const [showAddReserve, setShowAddReserve] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id || "");
  const [reserveName, setReserveName] = useState("");
  const [reserveAmount, setReserveAmount] = useState("");

  // 編集モーダル状態
  const [selectedAccForEdit, setSelectedAccForEdit] = useState<AccountItem | null>(null);
  const [selectedResForEdit, setSelectedResForEdit] = useState<AccountReservationItem | null>(null);
  const [selectedPmForEdit, setSelectedPmForEdit] = useState<PaymentMethodItem | null>(null);

  const handleOpenAccountModal = (tab: "account" | "payment_method") => {
    setModalInitialTab(tab);
    setShowAddAccountModal(true);
  };

  const handleAddReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reserveName || !reserveAmount) return;

    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "reservation",
          accountId: selectedAccountId || accounts[0]?.id,
          name: reserveName,
          amount: parseInt(reserveAmount, 10),
        }),
      });

      if (res.ok) {
        onTriggerToast("🎨 口座内資金色分け（バーチャル貯蓄）を追加しました！");
        setShowAddReserve(false);
        setReserveName("");
        setReserveAmount("");
        onRefresh();
      }
    } catch {
      onTriggerToast("色分け設定の追加に失敗しました");
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-20">
      {/* PC・タブレットで2カラムに広がるグリッドレイアウト */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* 口座・資産一覧カード */}
        <div className="p-5 bg-app-surface border border-border rounded-2xl shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Landmark className="w-4 h-4 text-primary" />
                <span className="text-sm font-bold text-content-main">{t.accounts.title}</span>
                <HelpTooltip text={t.accounts.titleTooltip} />
              </div>
              
              <button
                onClick={() => handleOpenAccountModal("account")}
                className="px-3 py-1.5 bg-primary text-white text-xs font-bold rounded-lg flex items-center gap-1.5 hover:bg-primary-hover shadow-xs transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t.accounts.addAccountBtn}</span>
              </button>
            </div>

            <div className="divide-y divide-border">
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  onClick={() => setSelectedAccForEdit(acc)}
                  className="py-3.5 flex items-center justify-between first:pt-0 last:pb-0 group hover:bg-app-subtle/50 px-2 rounded-xl transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="text-2xl p-2 bg-app-subtle rounded-xl border border-border">{acc.icon || "🏛️"}</div>
                    <div>
                      <div className="text-xs font-bold text-content-main flex items-center gap-1.5">
                        <span>{acc.name}</span>
                      </div>
                      <div className="text-[10px] text-content-subtle mt-0.5">
                        {acc.type === "bank"
                          ? "銀行口座"
                          : acc.type === "prepaid_wallet"
                          ? "プリペイドウォレット"
                          : acc.type === "nisa_investment"
                          ? "投資信託 (NISA)"
                          : acc.type === "term_deposit"
                          ? "定期預金"
                          : "現金"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="font-display text-sm font-extrabold text-content-main">
                        {formatCurrency(acc.balance)}
                      </div>
                      {acc.reservedAmount && acc.reservedAmount > 0 ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-accent bg-accent-light px-2 py-0.5 rounded-md mt-0.5">
                          <Lock className="w-2.5 h-2.5" /> {t.accounts.realAvailable} {formatCurrency(acc.availableBalance || 0)}
                        </span>
                      ) : null}
                    </div>

                    <div className="p-1.5 text-content-subtle group-hover:text-primary group-hover:bg-app-surface rounded-lg border border-transparent group-hover:border-border transition-all">
                      <Edit2 className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 口座内バーチャル貯蓄 (資金色分け) 設定エリア */}
        <div className="p-5 bg-app-surface border border-border rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold text-content-main">{t.accounts.virtualSavingsTitle}</span>
              <HelpTooltip text={t.accounts.virtualSavingsTooltip} />
            </div>
            
            <button
              onClick={() => setShowAddReserve(!showAddReserve)}
              className="px-3 py-1.5 bg-primary-light text-primary border border-primary-border text-xs font-bold rounded-lg flex items-center gap-1 hover:bg-primary/20 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t.accounts.addVirtualSavingsBtn}</span>
            </button>
          </div>

          <p className="text-xs text-content-muted mb-4 leading-relaxed">
            {t.accounts.virtualSavingsDesc}
          </p>

          {showAddReserve && (
            <form onSubmit={handleAddReservation} className="p-4 bg-app-subtle border border-border rounded-xl mb-4 flex flex-col gap-3">
              <div className="text-xs font-bold text-content-main">新規色分け設定</div>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="px-3 py-2 bg-app-surface border border-border rounded-lg text-xs font-medium focus:border-primary outline-none text-content-main cursor-pointer"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} (残高: {formatCurrency(a.balance)})
                  </option>
                ))}
              </select>

              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="目的名 (例: 車検費用)"
                  value={reserveName}
                  onChange={(e) => setReserveName(e.target.value)}
                  className="px-3 py-2 bg-app-surface border border-border rounded-lg text-xs font-medium focus:border-primary outline-none text-content-main"
                  required
                />
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="確保金額 (円)"
                  value={reserveAmount}
                  onChange={(e) => setReserveAmount(e.target.value.replace(/[^0-9]/g, ""))}
                  className="px-3 py-2 bg-app-surface border border-border rounded-lg text-xs font-bold focus:border-primary outline-none text-content-main"
                  required
                />
              </div>

              <button
                type="submit"
                className="py-2 bg-primary text-white text-xs font-bold rounded-lg shadow-sm hover:bg-primary-hover transition-colors cursor-pointer"
              >
                資金をロックして保存
              </button>
            </form>
          )}

          <div className="space-y-2.5">
            {reservations.length === 0 ? (
              <div className="text-xs text-content-subtle text-center py-6">
                {t.accounts.noReservations}
              </div>
            ) : (
              reservations.map((r) => {
                const acc = accounts.find((a) => a.id === r.accountId);
                return (
                  <div
                    key={r.id}
                    onClick={() => setSelectedResForEdit(r)}
                    className="p-3 bg-app-subtle border border-border rounded-xl flex items-center justify-between group hover:border-primary/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: r.color || "#E6A15C" }}
                      />
                      <div>
                        <div className="text-xs font-bold text-content-main">{r.name}</div>
                        <div className="text-[10px] text-content-subtle">
                          {acc?.name || "紐づけ口座"} {r.note && `• ${r.note}`}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="font-display text-xs font-bold text-accent">
                        {formatCurrency(r.amount)}
                      </div>
                      <div className="p-1 text-content-subtle group-hover:text-primary group-hover:bg-app-surface rounded border border-transparent group-hover:border-border transition-all">
                        <Edit2 className="w-3 h-3" />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* 登録決済手段 & 引き落とし資金フロー */}
      <div className="p-5 bg-app-surface border border-border rounded-2xl shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-content-main">{t.accounts.paymentMethodsTitle}</span>
            <HelpTooltip text={t.accounts.paymentMethodsTooltip} />
          </div>

          <button
            onClick={() => handleOpenAccountModal("payment_method")}
            className="px-3 py-1.5 bg-primary text-white text-xs font-bold rounded-lg flex items-center gap-1.5 hover:bg-primary-hover shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.accounts.addPaymentMethodBtn}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {paymentMethods.map((pm) => (
            <div
              key={pm.id}
              onClick={() => setSelectedPmForEdit(pm)}
              className="p-3.5 bg-app-subtle border border-border rounded-xl flex flex-col justify-between gap-2 group hover:border-primary/50 transition-colors cursor-pointer"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-content-main">{pm.name}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold px-2 py-0.5 bg-app-surface border border-border rounded text-content-muted">
                      {pm.type === "credit_card"
                        ? "クレジットカード"
                        : pm.type === "qr_code"
                        ? "QR・バーコード決済"
                        : pm.type === "debit_card"
                        ? "デビットカード"
                        : "現金"}
                    </span>
                    <div className="p-1 text-content-subtle group-hover:text-primary group-hover:bg-app-surface rounded border border-transparent group-hover:border-border transition-all">
                      <Edit2 className="w-3 h-3" />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-content-muted mt-2">
                  <ArrowRightLeft className="w-3 h-3 text-primary" />
                  <span>{t.accounts.sourceAccount} <b>{pm.sourceAccountName || "直接決済"}</b></span>
                </div>
              </div>

              {pm.type === "credit_card" && (
                <div className="pt-2 border-t border-border/60 text-[10px] text-content-subtle flex justify-between">
                  <span>{t.accounts.closingDay} {pm.closingDay === 99 ? t.accounts.endOfMonth : `${pm.closingDay}日`}</span>
                  <span>{t.accounts.withdrawalDay} {t.accounts.nextMonth}{pm.withdrawalDay}日</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 新規登録モーダル */}
      <AddAccountModal
        accounts={accounts}
        isOpen={showAddAccountModal}
        initialTab={modalInitialTab}
        onClose={() => setShowAddAccountModal(false)}
        onSuccess={(msg) => {
          onTriggerToast(msg);
          onRefresh();
        }}
      />

      {/* 口座編集モーダル */}
      <EditAccountModal
        account={selectedAccForEdit}
        isOpen={!!selectedAccForEdit}
        onClose={() => setSelectedAccForEdit(null)}
        onSuccess={(msg) => {
          onTriggerToast(msg);
          onRefresh();
        }}
      />

      {/* 資金色分け編集モーダル */}
      <EditReservationModal
        reservation={selectedResForEdit}
        accounts={accounts}
        isOpen={!!selectedResForEdit}
        onClose={() => setSelectedResForEdit(null)}
        onSuccess={(msg) => {
          onTriggerToast(msg);
          onRefresh();
        }}
      />

      {/* 決済手段編集モーダル */}
      <EditPaymentMethodModal
        paymentMethod={selectedPmForEdit}
        accounts={accounts}
        isOpen={!!selectedPmForEdit}
        onClose={() => setSelectedPmForEdit(null)}
        onSuccess={(msg) => {
          onTriggerToast(msg);
          onRefresh();
        }}
      />
    </div>
  );
}
