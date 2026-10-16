"use client";

import React, { useState, useEffect, useRef } from "react";
import { CategoryItem, PaymentMethodItem, AccountItem } from "@/types";
import { Sparkles, Save, Check, Plus, Trash2, RotateCcw, Clock, AlertTriangle, X, ArrowRightLeft, TrendingUp } from "lucide-react";
import { HelpTooltip } from "./HelpTooltip";
import { formatCurrency } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

interface RegisterTabProps {
  categories: CategoryItem[];
  paymentMethods: PaymentMethodItem[];
  accounts?: AccountItem[];
  onSubmitSuccess: () => void;
  onTriggerToast: (msg: string) => void;
}

interface DraftData {
  id: string;
  draftType: "manual" | "auto";
  formType: "single" | "shop_batch" | "category_batch";
  payloadJson: any;
  savedAt: string;
}

export function RegisterTab({
  categories,
  paymentMethods,
  accounts = [],
  onSubmitSuccess,
  onTriggerToast,
}: RegisterTabProps) {
  const { t } = useTranslation();

  const [entryType, setEntryType] = useState<"expense" | "income">("expense");
  const [formMode, setFormMode] = useState<"single" | "shop_batch" | "category_batch">("single");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [shopName, setShopName] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [toAccountId, setToAccountId] = useState(
    accounts.find((a) => a.type === "nisa_investment" || a.type === "term_deposit")?.id || accounts[0]?.id || ""
  );
  const [note, setNote] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 収入用フィールド
  const [grossAmount, setGrossAmount] = useState("");
  const [taxDeduction, setTaxDeduction] = useState("");
  const [incomeAccountId, setIncomeAccountId] = useState(accounts[0]?.id || "");
  const [isTemporaryIncome, setIsTemporaryIncome] = useState(false);

  // 一括登録用の行データ
  const [batchRows, setBatchRows] = useState([
    { categoryId: "", amount: "", note: "" },
    { categoryId: "", amount: "", note: "" },
  ]);

  // 一時保存ドラフト状態 (手動 / 自動)
  const [manualDraft, setManualDraft] = useState<DraftData | null>(null);
  const [autoDraft, setAutoDraft] = useState<DraftData | null>(null);
  const [isDraftRestored, setIsDraftRestored] = useState(false);
  const [showDraftWarningModal, setShowDraftWarningModal] = useState(false);

  // 選択中の費目が「貯蓄・投資」系かどうかを判定
  const selectedCategoryObj = categories.find((c) => c.id === categoryId);
  const isSavingsOrInvestmentCategory =
    selectedCategoryObj &&
    (selectedCategoryObj.name.includes("貯蓄") ||
      selectedCategoryObj.name.includes("投資") ||
      selectedCategoryObj.name.includes("NISA") ||
      selectedCategoryObj.name.includes("定期預金"));

  // ドラフト一覧の取得
  const fetchDrafts = async () => {
    try {
      const res = await fetch("/api/drafts");
      if (res.ok) {
        const data = await res.json();
        setManualDraft(data.manualDraft || null);
        setAutoDraft(data.autoDraft || null);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchDrafts();
  }, []);

  // 初期カテゴリ・決済手段のセット
  useEffect(() => {
    if (categories.length > 0 && !categoryId) {
      setCategoryId(categories[0].id);
    }
    if (paymentMethods.length > 0 && !paymentMethodId) {
      setPaymentMethodId(paymentMethods[0].id);
    }
  }, [categories, paymentMethods]);

  // ドラフト復元実行
  const handleRestoreDraft = (draft: DraftData) => {
    try {
      const p = draft.payloadJson;
      if (!p) return;

      if (p.date) setDate(p.date);
      if (p.shopName !== undefined) setShopName(p.shopName);
      if (p.amount !== undefined) setAmount(p.amount);
      if (p.categoryId) setCategoryId(p.categoryId);
      if (p.paymentMethodId) setPaymentMethodId(p.paymentMethodId);
      if (p.toAccountId) setToAccountId(p.toAccountId);
      if (p.note !== undefined) setNote(p.note);
      if (p.grossAmount !== undefined) setGrossAmount(p.grossAmount);
      if (p.taxDeduction !== undefined) setTaxDeduction(p.taxDeduction);
      if (p.batchRows && Array.isArray(p.batchRows)) setBatchRows(p.batchRows);

      if (draft.formType) setFormMode(draft.formType);
      if (p.grossAmount || p.taxDeduction) {
        setEntryType("income");
      } else {
        setEntryType("expense");
      }

      setIsDraftRestored(true);
      onTriggerToast(`📂 ${draft.draftType === "manual" ? t.register.manualDraftSlot : t.register.autoDraftSlot} ${t.register.restoreBtn}`);
    } catch {
      onTriggerToast("ドラフトの復元に失敗しました");
    }
  };

  // ドラフト破棄実行
  const handleDeleteDraft = async (type: "manual" | "auto") => {
    try {
      const res = await fetch(`/api/drafts?draftType=${type}`, { method: "DELETE" });
      if (res.ok) {
        onTriggerToast(`🗑️ ${type === "manual" ? t.register.manualDraftSlot : t.register.autoDraftSlot} ${t.common.delete}`);
        fetchDrafts();
      }
    } catch {
      onTriggerToast("ドラフトの削除に失敗しました");
    }
  };

  // 機械的サジェスト
  const handleShopNameChange = (val: string) => {
    setShopName(val);
    if (val.includes("セブン") || val.includes("ローソン") || val.includes("マルエツ")) {
      setShowSuggest(true);
    } else {
      setShowSuggest(false);
    }
  };

  const applySuggestion = () => {
    const foodCat = categories.find((c) => c.name.includes("食費"));
    const qrPm = paymentMethods.find((p) => p.type === "qr_code" || p.type === "credit_card");

    if (foodCat) setCategoryId(foodCat.id);
    if (qrPm) setPaymentMethodId(qrPm.id);

    setShowSuggest(false);
    onTriggerToast("💡 過去の利用から費目と決済手段を適用しました");
  };

  // 2秒デバウンス自動一時保存
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (shopName || amount || note || grossAmount) {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(async () => {
        try {
          await fetch("/api/drafts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              draftType: "auto",
              formType: formMode,
              payloadJson: {
                date,
                shopName,
                amount,
                categoryId,
                paymentMethodId,
                toAccountId: isSavingsOrInvestmentCategory ? toAccountId : undefined,
                note,
                grossAmount,
                taxDeduction,
                batchRows,
              },
            }),
          });
          fetchDrafts();
        } catch {
          // ignore auto-save error
        }
      }, 2000);
    }
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [date, shopName, amount, categoryId, paymentMethodId, toAccountId, isSavingsOrInvestmentCategory, note, grossAmount, taxDeduction, formMode, batchRows]);

  // 手動一時保存
  const handleManualDraft = async () => {
    try {
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftType: "manual",
          formType: formMode,
          payloadJson: {
            date,
            shopName,
            amount,
            categoryId,
            paymentMethodId,
            toAccountId: isSavingsOrInvestmentCategory ? toAccountId : undefined,
            note,
            grossAmount,
            taxDeduction,
            batchRows,
          },
        }),
      });
      if (res.ok) {
        onTriggerToast(`💾 ${t.register.manualDraftSlot}に保存しました！`);
        fetchDrafts();
      }
    } catch {
      onTriggerToast("一時保存に失敗しました");
    }
  };

  // フォーム送信前チェック
  const handlePreSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const hasUnrestoredManualDraft = manualDraft !== null && !isDraftRestored;
    if (hasUnrestoredManualDraft) {
      setShowDraftWarningModal(true);
      return;
    }

    executeSubmit();
  };

  // 実際の登録実行処理
  const executeSubmit = async () => {
    setIsSubmitting(true);
    setShowDraftWarningModal(false);

    try {
      let payload;
      if (entryType === "income") {
        const netAmt = parseInt(amount || grossAmount || "0", 10) - parseInt(taxDeduction || "0", 10);
        payload = [
          {
            type: "income",
            date,
            amount: netAmt,
            toAccountId: incomeAccountId,
            shopName: shopName || (isTemporaryIncome ? "臨時収入・賞与" : "給与振込"),
            note: `額面:${grossAmount || amount} 控除:${taxDeduction || 0} ${note}`,
          },
        ];
      } else if (formMode === "single") {
        payload = [
          {
            type: "expense",
            date,
            amount: parseInt(amount, 10),
            categoryId,
            paymentMethodId,
            toAccountId: isSavingsOrInvestmentCategory ? toAccountId : undefined,
            shopName: shopName || (isSavingsOrInvestmentCategory ? "積立・投資実行" : "支出"),
            note,
          },
        ];
      } else {
        payload = batchRows
          .filter((r) => r.amount && parseInt(r.amount, 10) > 0)
          .map((r) => ({
            type: "expense",
            date,
            amount: parseInt(r.amount, 10),
            categoryId: r.categoryId || categoryId,
            paymentMethodId,
            shopName,
            note: r.note,
          }));
      }

      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        await fetch("/api/drafts", { method: "DELETE" });
        setManualDraft(null);
        setAutoDraft(null);
        setIsDraftRestored(false);

        onTriggerToast(`✓ ${payload.length}件のデータを登録しました！`);
        onSubmitSuccess();
      } else {
        const data = await res.json();
        onTriggerToast(data.error || "登録に失敗しました");
      }
    } catch {
      onTriggerToast("通信エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-20 max-w-2xl mx-auto">
      
      {/* 一時保存データ呼び出し・復元バナー */}
      {(manualDraft || autoDraft) && (
        <div className="p-4 bg-app-surface border border-primary-border/80 rounded-2xl shadow-sm space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2 text-xs font-bold text-primary">
            <Save className="w-4 h-4" />
            <span>{t.register.draftFoundTitle}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {manualDraft && (
              <div className="p-3 bg-app-subtle border border-border rounded-xl flex flex-col justify-between gap-2">
                <div>
                  <div className="flex items-center justify-between text-xs font-bold text-content-main">
                    <span className="flex items-center gap-1">
                      <Save className="w-3.5 h-3.5 text-primary" />
                      <span>{t.register.manualDraftSlot}</span>
                    </span>
                    <span className="text-[10px] text-content-subtle">
                      {new Date(manualDraft.savedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div className="text-[11px] text-content-muted mt-1 truncate">
                    {manualDraft.payloadJson?.shopName || "名称未設定"} • {manualDraft.payloadJson?.amount ? formatCurrency(parseInt(manualDraft.payloadJson.amount, 10)) : "金額未入力"}
                  </div>
                </div>

                <div className="flex gap-2 pt-1 border-t border-border/60">
                  <button
                    type="button"
                    onClick={() => handleRestoreDraft(manualDraft)}
                    className="flex-1 py-1 px-2 bg-primary text-white text-[11px] font-bold rounded-lg hover:bg-primary-hover transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>{t.register.restoreBtn}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteDraft("manual")}
                    className="py-1 px-2 bg-app-surface text-content-muted hover:text-danger text-[11px] font-bold rounded-lg border border-border transition-colors cursor-pointer"
                    title={t.register.discardBtn}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}

            {autoDraft && (
              <div className="p-3 bg-app-subtle border border-border rounded-xl flex flex-col justify-between gap-2">
                <div>
                  <div className="flex items-center justify-between text-xs font-bold text-content-main">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-accent" />
                      <span>{t.register.autoDraftSlot}</span>
                    </span>
                    <span className="text-[10px] text-content-subtle">
                      {new Date(autoDraft.savedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div className="text-[11px] text-content-muted mt-1 truncate">
                    {autoDraft.payloadJson?.shopName || "名称未設定"} • {autoDraft.payloadJson?.amount ? formatCurrency(parseInt(autoDraft.payloadJson.amount, 10)) : "金額未入力"}
                  </div>
                </div>

                <div className="flex gap-2 pt-1 border-t border-border/60">
                  <button
                    type="button"
                    onClick={() => handleRestoreDraft(autoDraft)}
                    className="flex-1 py-1 px-2 bg-primary-light text-primary border border-primary-border text-[11px] font-bold rounded-lg hover:bg-primary/20 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>{t.register.restoreBtn}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteDraft("auto")}
                    className="py-1 px-2 bg-app-surface text-content-muted hover:text-danger text-[11px] font-bold rounded-lg border border-border transition-colors cursor-pointer"
                    title={t.register.discardBtn}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="p-6 bg-app-surface border border-border rounded-2xl shadow-sm">
        
        {/* 支出 / 収入 の大分類切替 */}
        <div className="flex p-1 bg-app-subtle rounded-xl mb-4">
          <button
            type="button"
            onClick={() => setEntryType("expense")}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              entryType === "expense"
                ? "bg-app-surface text-danger shadow-xs"
                : "text-content-muted hover:text-content-main"
            }`}
          >
            {t.register.expenseTab}
          </button>
          <button
            type="button"
            onClick={() => setEntryType("income")}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              entryType === "income"
                ? "bg-app-surface text-primary shadow-xs"
                : "text-content-muted hover:text-content-main"
            }`}
          >
            {t.register.incomeTab}
          </button>
        </div>

        {/* 支出時のモード切替タブ */}
        {entryType === "expense" && (
          <div className="flex p-1 bg-app-subtle rounded-lg mb-4">
            <button
              type="button"
              onClick={() => setFormMode("single")}
              className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                formMode === "single"
                  ? "bg-app-surface text-content-main shadow-xs"
                  : "text-content-muted hover:text-content-main"
              }`}
            >
              {t.register.singleMode}
            </button>
            <button
              type="button"
              onClick={() => setFormMode("shop_batch")}
              className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                formMode === "shop_batch"
                  ? "bg-app-surface text-content-main shadow-xs"
                  : "text-content-muted hover:text-content-main"
              }`}
            >
              {t.register.shopBatchMode}
            </button>
            <button
              type="button"
              onClick={() => setFormMode("category_batch")}
              className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                formMode === "category_batch"
                  ? "bg-app-surface text-content-main shadow-xs"
                  : "text-content-muted hover:text-content-main"
              }`}
            >
              {t.register.catBatchMode}
            </button>
          </div>
        )}

        <form onSubmit={handlePreSubmit} className="flex flex-col gap-4">
          {/* 日付入力 */}
          <div>
            <label className="block text-xs font-bold text-content-muted mb-1 flex items-center gap-1">
              <span>{t.register.date}</span>
              <HelpTooltip text={t.register.dateTooltip} />
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-content-main text-xs font-medium focus:border-primary outline-none"
              required
            />
          </div>

          {/* 支出フォーム */}
          {entryType === "expense" ? (
            <>
              {/* 店舗名 ＆ 機械的サジェスト */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-content-muted flex items-center gap-1">
                    <span>{t.register.shopName}</span>
                    <HelpTooltip text={t.register.shopTooltip} />
                  </label>
                </div>
                <input
                  type="text"
                  placeholder="例: セブンイレブン, マルエツ, SBI証券"
                  value={shopName}
                  onChange={(e) => handleShopNameChange(e.target.value)}
                  className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-content-main text-xs font-medium focus:border-primary outline-none"
                />

                {showSuggest && (
                  <div
                    onClick={applySuggestion}
                    className="mt-1.5 p-2.5 bg-primary-light border border-primary-border rounded-xl flex items-center justify-between cursor-pointer hover:bg-primary/20 transition-colors"
                  >
                    <div className="flex items-center gap-2 text-xs text-primary font-bold">
                      <Sparkles className="w-4 h-4" />
                      <span>{t.register.suggestPrompt} 「食費」 / 「PayPay」</span>
                    </div>
                    <span className="text-xs font-bold text-primary">{t.register.applySuggest}</span>
                  </div>
                )}
              </div>

              {/* 金額・費目・決済手段 */}
              {formMode === "single" && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-content-muted mb-1 flex items-center gap-1">
                      <span>{t.register.amount}</span>
                      <HelpTooltip text={t.register.amountTooltip} />
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                      className="w-full px-3.5 py-2.5 bg-app-subtle border border-border rounded-xl text-content-main font-display text-xl font-extrabold focus:border-primary outline-none"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-content-muted mb-1 flex items-center gap-1">
                        <span>{t.register.category}</span>
                        <HelpTooltip text={t.register.categoryTooltip} />
                      </label>
                      <select
                        value={categoryId}
                        onChange={(e) => setCategoryId(e.target.value)}
                        className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-content-main text-xs font-medium focus:border-primary outline-none cursor-pointer"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.icon} {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-content-muted mb-1 flex items-center gap-1">
                        <span>{t.register.paymentMethod}</span>
                        <HelpTooltip text={t.register.paymentMethodTooltip} />
                      </label>
                      <select
                        value={paymentMethodId}
                        onChange={(e) => setPaymentMethodId(e.target.value)}
                        className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-content-main text-xs font-medium focus:border-primary outline-none cursor-pointer"
                      >
                        {paymentMethods.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* 貯蓄・投資(NISA・定期預金)選択時の資金移動先口座 */}
                  {isSavingsOrInvestmentCategory && (
                    <div className="p-3.5 bg-primary-light/30 border border-primary-border rounded-xl space-y-2 animate-in fade-in duration-150">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                        <ArrowRightLeft className="w-4 h-4" />
                        <span>{t.register.savingsDestAccount}</span>
                      </div>
                      <select
                        value={toAccountId}
                        onChange={(e) => setToAccountId(e.target.value)}
                        className="w-full px-3 py-2 bg-app-surface border border-border rounded-lg text-content-main text-xs font-medium focus:border-primary outline-none cursor-pointer"
                      >
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.icon || "🏦"} {a.name} ({a.type === "nisa_investment" ? "投資信託/NISA" : a.type === "term_deposit" ? "定期預金" : a.type === "bank" ? "銀行口座" : "ウォレット"})
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-content-subtle">
                        {t.register.savingsDestNotice}
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-content-muted mb-1 flex items-center gap-1">
                      <span>{t.register.itemNotes}</span>
                      <HelpTooltip text={t.register.itemNotesTooltip} />
                    </label>
                    <input
                      type="text"
                      placeholder="例: お茶、おにぎり2個, つみたてNISA月次積立"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-content-main text-xs font-medium focus:border-primary outline-none"
                    />
                  </div>
                </>
              )}

              {/* 同店舗一括登録モード */}
              {formMode === "shop_batch" && (
                <div className="flex flex-col gap-3 border-t border-border pt-3">
                  <div className="text-xs font-bold text-content-main flex items-center justify-between">
                    <span>{t.register.batchItemsTitle}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setBatchRows([...batchRows, { categoryId: "", amount: "", note: "" }])
                      }
                      className="text-xs text-primary font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> {t.register.addRow}
                    </button>
                  </div>

                  {batchRows.map((row, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        value={row.categoryId || categoryId}
                        onChange={(e) => {
                          const newRows = [...batchRows];
                          newRows[idx].categoryId = e.target.value;
                          setBatchRows(newRows);
                        }}
                        className="w-1/3 px-2.5 py-2 bg-app-subtle border border-border rounded-lg text-content-main text-xs cursor-pointer"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.icon} {c.name}
                          </option>
                        ))}
                      </select>

                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="金額"
                        value={row.amount}
                        onChange={(e) => {
                          const newRows = [...batchRows];
                          newRows[idx].amount = e.target.value.replace(/[^0-9]/g, "");
                          setBatchRows(newRows);
                        }}
                        className="w-1/3 px-2.5 py-2 bg-app-subtle border border-border rounded-lg text-content-main text-xs font-bold"
                      />

                      <input
                        type="text"
                        placeholder="メモ"
                        value={row.note}
                        onChange={(e) => {
                          const newRows = [...batchRows];
                          newRows[idx].note = e.target.value;
                          setBatchRows(newRows);
                        }}
                        className="w-1/3 px-2.5 py-2 bg-app-subtle border border-border rounded-lg text-content-main text-xs"
                      />

                      {batchRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setBatchRows(batchRows.filter((_, i) => i !== idx))}
                          className="p-1.5 text-content-subtle hover:text-danger cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            /* 収入フォーム */
            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-content-muted mb-1 flex items-center gap-1">
                    <span>{t.register.grossAmount}</span>
                    <HelpTooltip text={t.register.grossAmountTooltip} />
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="300000"
                    value={grossAmount}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, "");
                      setGrossAmount(v);
                      if (!amount) setAmount(v);
                    }}
                    className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-xs font-bold focus:border-primary outline-none text-content-main"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-content-muted mb-1 flex items-center gap-1">
                    <span>{t.register.taxDeduction}</span>
                    <HelpTooltip text={t.register.taxDeductionTooltip} />
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="50000"
                    value={taxDeduction}
                    onChange={(e) => setTaxDeduction(e.target.value.replace(/[^0-9]/g, ""))}
                    className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-xs font-bold focus:border-primary outline-none text-content-main"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-content-muted mb-1 flex items-center gap-1">
                  <span>{t.register.incomeAccount}</span>
                  <HelpTooltip text={t.register.incomeAccountTooltip} />
                </label>
                <select
                  value={incomeAccountId}
                  onChange={(e) => setIncomeAccountId(e.target.value)}
                  className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-xs font-medium focus:border-primary outline-none text-content-main cursor-pointer"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="chkTemp"
                  checked={isTemporaryIncome}
                  onChange={(e) => setIsTemporaryIncome(e.target.checked)}
                  className="w-4 h-4 rounded text-primary cursor-pointer"
                />
                <label htmlFor="chkTemp" className="text-xs font-bold text-content-main cursor-pointer">
                  {t.register.temporaryIncome}
                </label>
              </div>
            </div>
          )}

          {/* ボタンエリア: 一時保存 & 登録 */}
          <div className="flex gap-2.5 pt-3 border-t border-border">
            <button
              type="button"
              onClick={handleManualDraft}
              className="flex-1 py-2.5 px-3 bg-app-subtle border border-border rounded-xl text-content-muted font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-border/50 transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{t.register.manualDraft}</span>
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-2 py-2.5 px-4 bg-primary text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm hover:bg-primary-hover active:scale-98 transition-all disabled:opacity-50 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{isSubmitting ? t.register.submitting : t.register.submit}</span>
            </button>
          </div>
        </form>
      </div>

      {/* 手動一時保存データ未呼び出し時の上書き破棄 警告モーダル */}
      {showDraftWarningModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-app-surface border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-warning font-bold text-sm">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <span>{t.register.draftWarningTitle}</span>
              </div>
              <button
                onClick={() => setShowDraftWarningModal(false)}
                className="text-content-muted hover:text-content-main p-1 rounded-lg hover:bg-app-subtle cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-content-muted leading-relaxed mb-4">
              {t.register.draftWarningDesc}
            </p>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setShowDraftWarningModal(false)}
                className="flex-1 py-2.5 bg-app-subtle border border-border text-content-main font-bold text-xs rounded-xl hover:bg-border/50 transition-colors cursor-pointer"
              >
                {t.register.returnToRestore}
              </button>
              <button
                type="button"
                onClick={executeSubmit}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
              >
                {t.register.discardAndSubmit}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
