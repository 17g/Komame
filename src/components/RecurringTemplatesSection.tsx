"use client";

import React, { useMemo, useState } from "react";
import {
  AccountItem,
  CategoryItem,
  PaymentMethodItem,
  RecurringTemplateItem,
  RecurringTemplateType,
  TransactionItem,
} from "@/types";
import {
  DEFAULT_CREDIT_CARD_WITHDRAWAL_DAY,
  END_OF_MONTH_DAY,
  MAX_RECURRING_NOTE_LENGTH,
  MAX_RECURRING_TITLE_LENGTH,
  validateRecurringTemplateInput,
} from "@/lib/recurring-helpers";
import { formatCurrency } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  PauseCircle,
  Pencil,
  PlayCircle,
  Plus,
  RefreshCw,
  Repeat,
  Trash2,
  X,
} from "lucide-react";

interface RecurringTemplatesSectionProps {
  templates: RecurringTemplateItem[];
  transactions: TransactionItem[];
  categories: CategoryItem[];
  paymentMethods: PaymentMethodItem[];
  accounts: AccountItem[];
  onRefreshAll: () => Promise<void> | void;
  onTriggerToast: (msg: string) => void;
}

const DAY_OF_MONTH_OPTIONS: number[] = [
  ...Array.from({ length: 28 }, (_, idx) => idx + 1),
  END_OF_MONTH_DAY,
];

function formatDayLabel(day: number, endOfMonthLabel: string, everyMonthPrefix: string, suffix: string): string {
  if (day === END_OF_MONTH_DAY) {
    return `${everyMonthPrefix} ${endOfMonthLabel}`;
  }
  return `${everyMonthPrefix}${day}${suffix}`;
}

export function RecurringTemplatesSection({
  templates,
  transactions,
  categories,
  paymentMethods,
  accounts,
  onRefreshAll,
  onTriggerToast,
}: RecurringTemplatesSectionProps) {
  const { t } = useTranslation();

  // モーダル・フォーム状態
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<RecurringTemplateItem | null>(null);
  const [formType, setFormType] = useState<RecurringTemplateType>("expense");
  const [formTitle, setFormTitle] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formPaymentMethodId, setFormPaymentMethodId] = useState("");
  const [formFromAccountId, setFormFromAccountId] = useState("");
  const [formToAccountId, setFormToAccountId] = useState("");
  const [formDayOfMonth, setFormDayOfMonth] = useState<number>(27);
  const [formNote, setFormNote] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 同期・操作ロック状態
  const [isSyncing, setIsSyncing] = useState(false);
  const [processingTemplateId, setProcessingTemplateId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RecurringTemplateItem | null>(null);
  const [settlingTxId, setSettlingTxId] = useState<string | null>(null);

  const activeTemplatesCount = useMemo(
    () => templates.filter((tpl) => tpl.isActive).length,
    [templates]
  );

  // 定例支払いテンプレート由来の未精算支払い予定明細一覧
  const unsettledScheduledTransactions = useMemo(() => {
    return transactions
      .filter((tx) => Boolean(tx.recurringTemplateId) && !tx.isSettled)
      .slice()
      .sort((a, b) => {
        const dateA = a.scheduledWithdrawalDate || a.date;
        const dateB = b.scheduledWithdrawalDate || b.date;
        return dateA.localeCompare(dateB);
      });
  }, [transactions]);

  const selectedPaymentMethod = useMemo(
    () => paymentMethods.find((pm) => pm.id === formPaymentMethodId) ?? null,
    [paymentMethods, formPaymentMethodId]
  );

  const isCreditCardSelected =
    formType === "expense" && selectedPaymentMethod?.type === "credit_card";

  const resolvedCardWithdrawalDay =
    selectedPaymentMethod?.withdrawalDay ?? DEFAULT_CREDIT_CARD_WITHDRAWAL_DAY;

  const openCreateModal = () => {
    setEditingTemplate(null);
    setFormType("expense");
    setFormTitle("");
    setFormAmount("");
    setFormCategoryId(categories[0]?.id || "");
    setFormPaymentMethodId(paymentMethods[0]?.id || "");
    setFormFromAccountId(accounts[0]?.id || "");
    setFormToAccountId("");
    setFormDayOfMonth(25);
    setFormNote("");
    setFormIsActive(true);
    setFormError("");
    setShowModal(true);
  };

  const openEditModal = (tpl: RecurringTemplateItem) => {
    setEditingTemplate(tpl);
    setFormType(tpl.type);
    setFormTitle(tpl.title);
    setFormAmount(String(tpl.amount));
    setFormCategoryId(tpl.categoryId || categories[0]?.id || "");
    setFormPaymentMethodId(tpl.paymentMethodId || paymentMethods[0]?.id || "");
    setFormFromAccountId(tpl.fromAccountId || accounts[0]?.id || "");
    setFormToAccountId(tpl.toAccountId || (tpl.type === "transfer" ? accounts[1]?.id || accounts[0]?.id || "" : ""));
    setFormDayOfMonth(
      DAY_OF_MONTH_OPTIONS.includes(tpl.dayOfMonth) ? tpl.dayOfMonth : 27
    );
    setFormNote(tpl.note || "");
    setFormIsActive(tpl.isActive);
    setFormError("");
    setShowModal(true);
  };

  const handleSwitchFormType = (nextType: RecurringTemplateType) => {
    setFormType(nextType);
    setFormError("");
    if (nextType === "transfer") {
      if (!formFromAccountId) {
        setFormFromAccountId(accounts[0]?.id || "");
      }
      if (!formToAccountId || formToAccountId === (formFromAccountId || accounts[0]?.id)) {
        const alternative = accounts.find((a) => a.id !== (formFromAccountId || accounts[0]?.id));
        setFormToAccountId(alternative?.id || accounts[0]?.id || "");
      }
    } else {
      if (!formCategoryId) setFormCategoryId(categories[0]?.id || "");
      if (!formPaymentMethodId) setFormPaymentMethodId(paymentMethods[0]?.id || "");
      if (!editingTemplate) {
        setFormToAccountId("");
      }
    }
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    const payload = {
      type: formType,
      title: formTitle,
      amount: formAmount,
      categoryId: formType === "expense" ? formCategoryId || null : null,
      paymentMethodId: formType === "expense" ? formPaymentMethodId || null : null,
      fromAccountId: formType === "transfer" ? formFromAccountId || null : null,
      toAccountId: formToAccountId || null,
      dayOfMonth: isCreditCardSelected ? resolvedCardWithdrawalDay : formDayOfMonth,
      note: formNote || null,
      isActive: formIsActive,
    };

    const validation = validateRecurringTemplateInput(
      payload,
      isCreditCardSelected && selectedPaymentMethod
        ? { type: selectedPaymentMethod.type, withdrawalDay: selectedPaymentMethod.withdrawalDay }
        : null
    );

    if (!validation.ok) {
      setFormError(validation.error);
      return;
    }

    setIsSubmitting(true);
    try {
      const isEditing = Boolean(editingTemplate);
      const res = await fetch("/api/recurring-templates", {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isEditing
            ? { action: "update", id: editingTemplate!.id, ...validation.data }
            : { action: "create", ...validation.data }
        ),
      });

      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "定例支払いテンプレートの保存に失敗しました。");
        return;
      }

      setShowModal(false);
      onTriggerToast(data.message || "✓ 定例支払いテンプレートを保存しました");
      await onRefreshAll();
    } catch {
      setFormError("通信エラーが発生しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (tpl: RecurringTemplateItem) => {
    setProcessingTemplateId(tpl.id);
    try {
      const res = await fetch("/api/recurring-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle",
          id: tpl.id,
          isActive: !tpl.isActive,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onTriggerToast(data.message || "✓ テンプレート状態を更新しました");
        await onRefreshAll();
      } else {
        onTriggerToast(data.error || "状態の更新に失敗しました");
      }
    } catch {
      onTriggerToast("通信エラーが発生しました");
    } finally {
      setProcessingTemplateId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setProcessingTemplateId(deleteTarget.id);
    try {
      const res = await fetch(
        `/api/recurring-templates?id=${encodeURIComponent(deleteTarget.id)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (res.ok) {
        setDeleteTarget(null);
        onTriggerToast(data.message || "🗑️ 定例支払いテンプレートを削除しました");
        await onRefreshAll();
      } else {
        onTriggerToast(data.error || "削除に失敗しました");
      }
    } catch {
      onTriggerToast("通信エラーが発生しました");
    } finally {
      setProcessingTemplateId(null);
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/recurring-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      });
      const data = await res.json();
      if (res.ok) {
        onTriggerToast(data.message || "✓ 月次同期を実行しました");
        await onRefreshAll();
      } else {
        onTriggerToast(data.error || "月次同期に失敗しました");
      }
    } catch {
      onTriggerToast("通信エラーが発生しました");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSettleTransaction = async (transactionId: string) => {
    setSettlingTxId(transactionId);
    try {
      const res = await fetch("/api/recurring-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "settle", transactionId }),
      });
      const data = await res.json();
      if (res.ok) {
        onTriggerToast(data.message || "✓ 支払い予定を精算し口座残高に反映しました");
        await onRefreshAll();
      } else {
        onTriggerToast(data.error || "精算処理に失敗しました");
      }
    } catch {
      onTriggerToast("通信エラーが発生しました");
    } finally {
      setSettlingTxId(null);
    }
  };

  return (
    <div className="p-5 sm:p-6 bg-app-surface border border-border rounded-2xl shadow-sm space-y-5">
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Repeat className="w-4 h-4 text-primary shrink-0" />
            <h2 className="text-sm font-bold text-content-main">{t.recurring.sectionTitle}</h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary-light text-primary border border-primary-border">
              {activeTemplatesCount} {t.recurring.activeCountUnit} / {templates.length} {t.recurring.totalCountUnit}
            </span>
          </div>
          <p className="text-[11px] text-content-muted leading-relaxed">
            {t.recurring.sectionDesc}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing}
            className="px-3 py-2 bg-app-subtle border border-border text-content-main hover:border-primary/40 hover:text-primary rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            <span>{isSyncing ? t.recurring.syncing : t.recurring.syncNowBtn}</span>
          </button>

          <button
            type="button"
            onClick={openCreateModal}
            className="px-3.5 py-2 bg-primary text-white hover:bg-primary-hover rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.recurring.addTemplateBtn.replace(/^[＋+]\s*/, "")}</span>
          </button>
        </div>
      </div>

      {/* 登録済みテンプレート一覧 */}
      {templates.length === 0 ? (
        <div className="p-5 bg-app-subtle/70 border border-dashed border-border rounded-xl text-center text-xs text-content-muted leading-relaxed">
          {t.recurring.noTemplates}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5">
          {templates.map((tpl) => {
            const isProcessing = processingTemplateId === tpl.id;
            const isCardLinked =
              tpl.type === "expense" && tpl.paymentMethodType === "credit_card";
            const dayText = formatDayLabel(
              tpl.dayOfMonth,
              t.recurring.endOfMonthLabel,
              t.recurring.everyMonthPrefix,
              t.recurring.dayOptionSuffix
            );

            return (
              <div
                key={tpl.id}
                className={`p-3.5 rounded-xl border transition-all ${
                  tpl.isActive
                    ? "bg-app-subtle/60 border-border hover:border-primary/40"
                    : "bg-app-subtle/30 border-border/60 opacity-75"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          tpl.type === "transfer"
                            ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300"
                            : "bg-rose-500/15 text-rose-600 dark:text-rose-300"
                        }`}
                      >
                        {tpl.type === "transfer"
                          ? t.recurring.badgeTransfer
                          : t.recurring.badgeExpense}
                      </span>

                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          tpl.isActive
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "bg-zinc-500/15 text-content-muted"
                        }`}
                      >
                        {tpl.isActive ? t.recurring.statusActive : t.recurring.statusPaused}
                      </span>

                      {isCardLinked && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-500/15 text-sky-700 dark:text-sky-300 flex items-center gap-1">
                          <CreditCard className="w-3 h-3" />
                          <span>{t.recurring.creditCardAutoTag}</span>
                        </span>
                      )}

                      <span className="text-xs font-bold text-content-main truncate">
                        {tpl.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap text-[11px] text-content-muted">
                      {tpl.type === "expense" ? (
                        <>
                          {tpl.categoryName && (
                            <span className="font-medium text-content-main">
                              {tpl.categoryIcon ? `${tpl.categoryIcon} ` : ""}
                              {tpl.categoryName}
                            </span>
                          )}
                          {tpl.paymentMethodName && (
                            <span>• {tpl.paymentMethodName}</span>
                          )}
                          {tpl.toAccountName && (
                            <span className="text-primary font-medium flex items-center gap-0.5">
                              <ArrowRight className="w-3 h-3" />
                              {tpl.toAccountName}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="flex items-center gap-1 font-medium text-content-main">
                          <span>{tpl.fromAccountName || "-"}</span>
                          <ArrowRight className="w-3 h-3 text-primary" />
                          <span>{tpl.toAccountName || "-"}</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 flex-wrap text-[10px] text-content-subtle">
                      <span className="flex items-center gap-1 font-semibold text-content-muted">
                        <CalendarClock className="w-3 h-3 text-primary" />
                        <span>{dayText}</span>
                      </span>
                      <span>
                        {t.recurring.lastGeneratedLabel}{" "}
                        <strong className="text-content-muted">
                          {tpl.lastGeneratedMonth || t.recurring.notGeneratedYet}
                        </strong>
                      </span>
                      {tpl.note && <span className="truncate max-w-xs">({tpl.note})</span>}
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
                    <div className="font-display text-sm font-extrabold text-content-main">
                      {formatCurrency(tpl.amount)}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => openEditModal(tpl)}
                        className="px-2.5 py-1 bg-app-surface border border-border rounded-lg text-[11px] font-bold text-content-muted hover:text-primary hover:border-primary/40 flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>{t.recurring.editBtn}</span>
                      </button>

                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleToggleActive(tpl)}
                        className="px-2.5 py-1 bg-app-surface border border-border rounded-lg text-[11px] font-bold text-content-muted hover:text-amber-600 hover:border-amber-500/40 flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {tpl.isActive ? (
                          <>
                            <PauseCircle className="w-3 h-3" />
                            <span>{t.recurring.pauseBtn}</span>
                          </>
                        ) : (
                          <>
                            <PlayCircle className="w-3 h-3" />
                            <span>{t.recurring.resumeBtn}</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => setDeleteTarget(tpl)}
                        className="p-1.5 bg-app-surface border border-border rounded-lg text-content-subtle hover:text-danger hover:border-danger/40 transition-colors cursor-pointer disabled:opacity-50"
                        title={t.recurring.deleteBtn}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 未精算の定例支払い予定明細リスト */}
      {unsettledScheduledTransactions.length > 0 && (
        <div className="pt-4 border-t border-border space-y-2.5">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-amber-500 shrink-0" />
              <h3 className="text-xs font-bold text-content-main">
                {t.recurring.scheduledListTitle} ({unsettledScheduledTransactions.length}
                {t.recurring.countUnit})
              </h3>
            </div>
            <p className="text-[11px] text-content-muted leading-relaxed">
              {t.recurring.scheduledListDesc}
            </p>
          </div>

          <div className="space-y-2">
            {unsettledScheduledTransactions.map((tx) => {
              const dueDate = tx.scheduledWithdrawalDate || tx.date;
              const isSettling = settlingTxId === tx.id;
              return (
                <div
                  key={tx.id}
                  className="p-3 bg-amber-500/5 border border-amber-500/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300">
                        {t.recurring.scheduledBadge}
                      </span>
                      <span className="text-xs font-bold text-content-main truncate">
                        {tx.shopName || "定例支払い"}
                      </span>
                    </div>
                    <div className="text-[11px] text-content-muted flex items-center gap-2 flex-wrap">
                      <span>
                        {t.recurring.scheduledDateLabel}{" "}
                        <strong className="text-content-main">{dueDate}</strong>
                      </span>
                      <span>
                        • {tx.paymentMethodName || (tx.type === "transfer" ? "口座間振替" : "口座引き落とし")}
                      </span>
                      {tx.categoryName && <span>• {tx.categoryName}</span>}
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    <span className="font-display text-sm font-extrabold text-content-main">
                      {formatCurrency(tx.amount)}
                    </span>
                    <button
                      type="button"
                      disabled={isSettling}
                      onClick={() => handleSettleTransaction(tx.id)}
                      className="px-3 py-1.5 bg-primary text-white hover:bg-primary-hover rounded-lg text-[11px] font-bold flex items-center gap-1 shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{isSettling ? t.recurring.settling : t.recurring.settleNowBtn}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* テンプレート作成・編集モーダル */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-app-surface border border-border rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-content-main flex items-center gap-2">
                <Repeat className="w-4 h-4 text-primary" />
                <span>
                  {editingTemplate ? t.recurring.modalEditTitle : t.recurring.modalCreateTitle}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1 rounded-lg text-content-muted hover:text-content-main hover:bg-app-subtle cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-danger-light border border-danger/20 rounded-xl text-xs text-danger font-medium">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmitForm} className="space-y-3.5">
              {/* 種別切替 */}
              <div className="flex p-1 bg-app-subtle rounded-xl">
                <button
                  type="button"
                  onClick={() => handleSwitchFormType("expense")}
                  className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                    formType === "expense"
                      ? "bg-app-surface text-danger shadow-xs"
                      : "text-content-muted hover:text-content-main"
                  }`}
                >
                  {t.recurring.typeExpense}
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchFormType("transfer")}
                  className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                    formType === "transfer"
                      ? "bg-app-surface text-primary shadow-xs"
                      : "text-content-muted hover:text-content-main"
                  }`}
                >
                  {t.recurring.typeTransfer}
                </button>
              </div>

              {/* テンプレート名 */}
              <div>
                <label className="block text-xs font-bold text-content-muted mb-1">
                  {t.recurring.fieldTitle}
                </label>
                <input
                  type="text"
                  maxLength={MAX_RECURRING_TITLE_LENGTH}
                  placeholder={t.recurring.fieldTitlePlaceholder}
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-xs text-content-main outline-none focus:border-primary"
                  required
                />
              </div>

              {/* 金額 */}
              <div>
                <label className="block text-xs font-bold text-content-muted mb-1">
                  {t.recurring.fieldAmount}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="10000"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value.replace(/[^0-9]/g, ""))}
                  className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-sm font-display font-extrabold text-content-main outline-none focus:border-primary"
                  required
                />
              </div>

              {formType === "expense" ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-content-muted mb-1">
                        {t.recurring.fieldCategory}
                      </label>
                      <select
                        value={formCategoryId}
                        onChange={(e) => setFormCategoryId(e.target.value)}
                        className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-xs text-content-main outline-none focus:border-primary cursor-pointer"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.icon} {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-content-muted mb-1">
                        {t.recurring.fieldPaymentMethod}
                      </label>
                      <select
                        value={formPaymentMethodId}
                        onChange={(e) => setFormPaymentMethodId(e.target.value)}
                        className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-xs text-content-main outline-none focus:border-primary cursor-pointer"
                      >
                        {paymentMethods.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-content-muted mb-1">
                      {t.recurring.fieldDestAccountOptional}
                    </label>
                    <select
                      value={formToAccountId}
                      onChange={(e) => setFormToAccountId(e.target.value)}
                      className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-xs text-content-main outline-none focus:border-primary cursor-pointer"
                    >
                      <option value="">{t.recurring.fieldDestAccountNone}</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.icon || "🏦"} {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-content-muted mb-1">
                      {t.recurring.fieldFromAccount}
                    </label>
                    <select
                      value={formFromAccountId}
                      onChange={(e) => setFormFromAccountId(e.target.value)}
                      className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-xs text-content-main outline-none focus:border-primary cursor-pointer"
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.icon || "🏦"} {a.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-content-muted mb-1">
                      {t.recurring.fieldToAccount}
                    </label>
                    <select
                      value={formToAccountId}
                      onChange={(e) => setFormToAccountId(e.target.value)}
                      className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-xs text-content-main outline-none focus:border-primary cursor-pointer"
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.icon || "🏦"} {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* 支払日設定UI (クレカは規定日自動連動、それ以外は任意指定) */}
              <div className="p-3.5 bg-app-subtle border border-border rounded-xl space-y-2">
                {isCreditCardSelected ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-content-muted flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5 text-primary" />
                        <span>{t.recurring.fieldCardWithdrawalDay}</span>
                      </span>
                      <span className="px-2.5 py-1 bg-primary-light text-primary border border-primary-border rounded-lg text-xs font-extrabold">
                        {formatDayLabel(
                          resolvedCardWithdrawalDay,
                          t.recurring.endOfMonthLabel,
                          t.recurring.everyMonthPrefix,
                          t.recurring.dayOptionSuffix
                        )}
                      </span>
                    </div>
                    <p className="text-[11px] text-content-muted leading-relaxed">
                      {t.recurring.cardLinkedHint}
                    </p>
                  </>
                ) : (
                  <>
                    <label className="block text-xs font-bold text-content-muted">
                      {t.recurring.fieldDayOfMonth}
                    </label>
                    <select
                      value={formDayOfMonth}
                      onChange={(e) => setFormDayOfMonth(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-app-surface border border-border rounded-lg text-xs font-bold text-content-main outline-none focus:border-primary cursor-pointer"
                    >
                      {DAY_OF_MONTH_OPTIONS.map((d) => (
                        <option key={d} value={d}>
                          {formatDayLabel(
                            d,
                            t.recurring.endOfMonthLabel,
                            t.recurring.everyMonthPrefix,
                            t.recurring.dayOptionSuffix
                          )}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-content-muted leading-relaxed">
                      {t.recurring.manualDayHint}
                    </p>
                  </>
                )}
              </div>

              {/* メモ */}
              <div>
                <label className="block text-xs font-bold text-content-muted mb-1">
                  {t.recurring.fieldNote}
                </label>
                <input
                  type="text"
                  maxLength={MAX_RECURRING_NOTE_LENGTH}
                  placeholder={t.recurring.fieldNotePlaceholder}
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-xs text-content-main outline-none focus:border-primary"
                />
              </div>

              {/* 有効チェック */}
              <label className="flex items-center gap-2 text-xs font-bold text-content-main cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-primary cursor-pointer"
                />
                <span>{t.recurring.fieldIsActive}</span>
              </label>

              {/* アクションボタン */}
              <div className="flex gap-2.5 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 bg-app-subtle border border-border text-content-main font-bold text-xs rounded-xl hover:bg-border/50 transition-colors cursor-pointer"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-2 py-2.5 px-4 bg-primary text-white font-bold text-xs rounded-xl hover:bg-primary-hover shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting
                    ? t.recurring.saving
                    : editingTemplate
                    ? t.recurring.saveUpdateBtn
                    : t.recurring.saveCreateBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 削除確認モーダル */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-app-surface border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-danger font-bold text-sm">
                <AlertTriangle className="w-5 h-5" />
                <span>{t.recurring.deleteConfirmTitle}</span>
              </div>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="p-1 text-content-muted hover:text-content-main rounded-lg hover:bg-app-subtle cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-app-subtle border border-border rounded-xl text-xs font-bold text-content-main">
              {deleteTarget.title} ({formatCurrency(deleteTarget.amount)})
            </div>

            <p className="text-xs text-content-muted leading-relaxed">
              {t.recurring.deleteConfirmDesc}
            </p>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 bg-app-subtle border border-border text-content-main font-bold text-xs rounded-xl hover:bg-border/50 cursor-pointer"
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                disabled={processingTemplateId === deleteTarget.id}
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-md transition-all disabled:opacity-50 cursor-pointer"
              >
                {t.recurring.confirmDeleteBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
