"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  CategoryItem,
  PaymentMethodItem,
  AccountItem,
  SuggestionItem,
  SuggestionResult,
  TagItem,
  RecurringTemplateItem,
  TransactionItem,
} from "@/types";
import { Sparkles, Save, Check, Plus, Trash2, RotateCcw, Clock, AlertTriangle, X, ArrowRightLeft, TrendingUp, Tag } from "lucide-react";
import { HelpTooltip } from "./HelpTooltip";
import {
  DEFAULT_QUANTITY,
  UnitPriceCalculator,
  UnitPriceCalculatorPanel,
  UnitPriceCalculatorToggle,
} from "./UnitPriceCalculator";
import { RecurringTemplatesSection } from "./RecurringTemplatesSection";
import { formatCurrency } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

interface RegisterTabProps {
  categories: CategoryItem[];
  paymentMethods: PaymentMethodItem[];
  accounts?: AccountItem[];
  tags?: TagItem[];
  recurringTemplates?: RecurringTemplateItem[];
  transactions?: TransactionItem[];
  onRefreshTags?: () => void;
  onRefreshData?: () => Promise<void> | void;
  onSubmitSuccess: () => void;
  onTriggerToast: (msg: string) => void;
  onDirtyChange?: (isDirty: boolean) => void;
}

interface DraftData {
  id: string;
  draftType: "manual" | "auto";
  formType: "single" | "shop_batch" | "category_batch";
  payloadJson: any;
  savedAt: string;
}

interface ShopBatchRow {
  rowId: string;
  categoryId: string;
  amount: string;
  note: string;
}

interface CategoryBatchRow {
  rowId: string;
  date: string;
  shopName: string;
  amount: string;
  note: string;
}

interface RowCalcState {
  isOpen: boolean;
  unitPrice: string;
  quantity: string;
}

const DEFAULT_ROW_CALC_STATE: RowCalcState = {
  isOpen: false,
  unitPrice: "",
  quantity: DEFAULT_QUANTITY,
};

function buildDraftPayload(params: {
  date: string;
  shopName: string;
  amount: string;
  categoryId: string;
  paymentMethodId: string;
  toAccountId?: string;
  note: string;
  grossAmount: string;
  taxDeduction: string;
  batchRows: ShopBatchRow[];
  categoryBatchRows: CategoryBatchRow[];
  selectedTagIds: string[];
}) {
  return {
    date: params.date,
    shopName: params.shopName,
    amount: params.amount,
    categoryId: params.categoryId,
    paymentMethodId: params.paymentMethodId,
    toAccountId: params.toAccountId,
    note: params.note,
    grossAmount: params.grossAmount,
    taxDeduction: params.taxDeduction,
    batchRows: params.batchRows.map(({ categoryId, amount, note }) => ({
      categoryId,
      amount,
      note,
    })),
    categoryBatchRows: params.categoryBatchRows.map(({ date, shopName, amount, note }) => ({
      date,
      shopName,
      amount,
      note,
    })),
    selectedTagIds: params.selectedTagIds,
  };
}

export function RegisterTab({
  categories,
  paymentMethods,
  accounts = [],
  tags = [],
  recurringTemplates = [],
  transactions = [],
  onRefreshTags,
  onRefreshData,
  onSubmitSuccess,
  onTriggerToast,
  onDirtyChange,
}: RegisterTabProps) {
  const { t } = useTranslation();

  const [entryType, setEntryType] = useState<"expense" | "income">("expense");
  const [formMode, setFormMode] = useState<"single" | "shop_batch" | "category_batch">("single");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [shopName, setShopName] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<TagItem[]>(tags);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#4F46E5");
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [toAccountId, setToAccountId] = useState(
    accounts.find((a) => a.type === "nisa_investment" || a.type === "term_deposit")?.id || accounts[0]?.id || ""
  );
  const [note, setNote] = useState("");
  const [candidateShops, setCandidateShops] = useState<string[]>([]);
  const [currentSuggestion, setCurrentSuggestion] = useState<SuggestionItem | null>(null);
  const [showCandidateDropdown, setShowCandidateDropdown] = useState(false);
  const [isSuggestApplied, setIsSuggestApplied] = useState(false);
  const suggestTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 収入用フィールド
  const [grossAmount, setGrossAmount] = useState("");
  const [taxDeduction, setTaxDeduction] = useState("");
  const [incomeAccountId, setIncomeAccountId] = useState(accounts[0]?.id || "");
  const [isTemporaryIncome, setIsTemporaryIncome] = useState(false);

  // 一括登録用の行データ (同店舗一括)
  const rowSeqRef = useRef(0);
  const createRowId = (prefix: string) => {
    rowSeqRef.current += 1;
    return `${prefix}_${Date.now()}_${rowSeqRef.current}`;
  };

  const [batchRows, setBatchRows] = useState<ShopBatchRow[]>([
    { rowId: "shop_init_1", categoryId: "", amount: "", note: "" },
    { rowId: "shop_init_2", categoryId: "", amount: "", note: "" },
  ]);

  // 一括登録用の行データ (同費目一括)
  const [categoryBatchRows, setCategoryBatchRows] = useState<CategoryBatchRow[]>([
    { rowId: "cat_init_1", date: new Date().toISOString().split("T")[0], shopName: "", amount: "", note: "" },
    { rowId: "cat_init_2", date: new Date().toISOString().split("T")[0], shopName: "", amount: "", note: "" },
  ]);

  // 単価×個数 計算補助UI状態 (1件登録 / 各一括行独立管理)
  const [singleCalcOpen, setSingleCalcOpen] = useState(false);
  const [singleCalcUnitPrice, setSingleCalcUnitPrice] = useState("");
  const [singleCalcQuantity, setSingleCalcQuantity] = useState(DEFAULT_QUANTITY);
  const [rowCalcStates, setRowCalcStates] = useState<Record<string, RowCalcState>>({});

  const resetCalculators = () => {
    setSingleCalcOpen(false);
    setSingleCalcUnitPrice("");
    setSingleCalcQuantity(DEFAULT_QUANTITY);
    setRowCalcStates({});
  };

  const getRowCalcState = (rowId: string): RowCalcState =>
    rowCalcStates[rowId] ?? DEFAULT_ROW_CALC_STATE;

  const toggleRowCalc = (rowId: string) => {
    setRowCalcStates((prev) => {
      const current = prev[rowId] ?? DEFAULT_ROW_CALC_STATE;
      return {
        ...prev,
        [rowId]: { ...current, isOpen: !current.isOpen },
      };
    });
  };

  const closeRowCalc = (rowId: string) => {
    setRowCalcStates((prev) => {
      const current = prev[rowId];
      if (!current || !current.isOpen) return prev;
      return {
        ...prev,
        [rowId]: { ...current, isOpen: false },
      };
    });
  };

  const updateRowCalcField = (
    rowId: string,
    field: "unitPrice" | "quantity",
    value: string
  ) => {
    setRowCalcStates((prev) => {
      const current = prev[rowId] ?? DEFAULT_ROW_CALC_STATE;
      return {
        ...prev,
        [rowId]: { ...current, [field]: value },
      };
    });
  };

  const removeRowCalcState = (rowId: string) => {
    setRowCalcStates((prev) => {
      if (!(rowId in prev)) return prev;
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
  };

  const handleRemoveBatchRow = (rowId: string) => {
    setBatchRows((prev) => prev.filter((r) => r.rowId !== rowId));
    removeRowCalcState(rowId);
  };

  const handleRemoveCategoryBatchRow = (rowId: string) => {
    setCategoryBatchRows((prev) => prev.filter((r) => r.rowId !== rowId));
    removeRowCalcState(rowId);
  };

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

  // タグ一覧の同期
  useEffect(() => {
    setAvailableTags(tags || []);
  }, [tags]);

  // タグ選択のトグル
  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  // 新規タグ作成
  const handleCreateTag = async () => {
    const clean = newTagName.trim().replace(/^#+/, "");
    if (!clean) return;
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clean, color: newTagColor }),
      });
      if (res.ok) {
        const data = await res.json();
        const tag = data.tag;
        if (!availableTags.some((t) => t.id === tag.id)) {
          setAvailableTags((prev) => [...prev, tag]);
        }
        if (!selectedTagIds.includes(tag.id)) {
          setSelectedTagIds((prev) => [...prev, tag.id]);
        }
        setNewTagName("");
        setIsCreatingTag(false);
        if (onRefreshTags) onRefreshTags();
      }
    } catch {
      // ignore
    }
  };

  // ドラフト復元実行
  const handleRestoreDraft = (draft: DraftData) => {
    try {
      const p = draft.payloadJson;
      if (!p) return;

      if (p.date) setDate(p.date);
      if (p.shopName !== undefined) setShopName(p.shopName);
      if (p.amount !== undefined) setAmount(p.amount);
      if (p.categoryId) {
        const isValidCategory =
          categories.length === 0 || categories.some((c) => c.id === p.categoryId);
        setCategoryId(isValidCategory ? p.categoryId : categories[0]?.id || "");
      }
      if (p.paymentMethodId) setPaymentMethodId(p.paymentMethodId);
      if (p.toAccountId) setToAccountId(p.toAccountId);
      if (p.note !== undefined) setNote(p.note);
      if (p.grossAmount !== undefined) setGrossAmount(p.grossAmount);
      if (p.taxDeduction !== undefined) setTaxDeduction(p.taxDeduction);
      if (p.batchRows && Array.isArray(p.batchRows)) {
        setBatchRows(
          p.batchRows.map((r: { categoryId?: string; amount?: string; note?: string }) => {
            const isValidRowCat =
              Boolean(r.categoryId) &&
              (categories.length === 0 || categories.some((c) => c.id === r.categoryId));
            return {
              rowId: createRowId("shop"),
              categoryId: isValidRowCat ? r.categoryId! : "",
              amount: r.amount || "",
              note: r.note || "",
            };
          })
        );
      }
      if (p.categoryBatchRows && Array.isArray(p.categoryBatchRows)) {
        setCategoryBatchRows(
          p.categoryBatchRows.map(
            (r: { date?: string; shopName?: string; amount?: string; note?: string }) => ({
              rowId: createRowId("cat"),
              date: r.date || new Date().toISOString().split("T")[0],
              shopName: r.shopName || "",
              amount: r.amount || "",
              note: r.note || "",
            })
          )
        );
      }
      if (p.selectedTagIds && Array.isArray(p.selectedTagIds)) setSelectedTagIds(p.selectedTagIds);

      if (draft.formType) setFormMode(draft.formType);
      if (p.grossAmount || p.taxDeduction) {
        setEntryType("income");
      } else {
        setEntryType("expense");
      }

      resetCalculators();
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

  // 機械的サジェスト (過去の明細データから動的集計)
  const fetchSuggestions = async (name: string) => {
    try {
      const q = name.trim();
      const res = await fetch(`/api/transactions/suggest?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data: SuggestionResult = await res.json();
        setCandidateShops(data.candidates || []);
        setCurrentSuggestion(data.suggestion || null);
        setIsSuggestApplied(false);
      }
    } catch {
      // ignore
    }
  };

  const handleShopNameChange = (val: string) => {
    setShopName(val);
    setShowCandidateDropdown(true);

    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
    if (!val.trim()) {
      setCandidateShops([]);
      setCurrentSuggestion(null);
      setIsSuggestApplied(false);
      setShowCandidateDropdown(false);
      return;
    }

    suggestTimerRef.current = setTimeout(() => {
      fetchSuggestions(val);
    }, 250);
  };

  const handleSelectCandidate = (name: string) => {
    setShopName(name);
    setShowCandidateDropdown(false);
    fetchSuggestions(name);
  };

  const applySuggestion = () => {
    if (!currentSuggestion) return;

    if (currentSuggestion.categoryId) {
      const cat = categories.find((c) => c.id === currentSuggestion.categoryId);
      if (cat) setCategoryId(cat.id);
    }

    if (currentSuggestion.paymentMethodId) {
      const pm = paymentMethods.find((p) => p.id === currentSuggestion.paymentMethodId);
      if (pm) setPaymentMethodId(pm.id);
    }

    setIsSuggestApplied(true);
    const catName = currentSuggestion.categoryName || "";
    const pmName = currentSuggestion.paymentMethodName || "";
    onTriggerToast(`💡 過去の利用実績から「${catName}」「${pmName}」を適用しました`);
  };

  // ドロップダウン外クリック時の閉じる制御
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowCandidateDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
    };
  }, []);

  // フォームに入力途中の値があるかどうかの判定 (未保存変更の検出)
  const hasEnteredData = Boolean(
    shopName.trim() ||
    amount.trim() ||
    note.trim() ||
    grossAmount.trim() ||
    taxDeduction.trim() ||
    selectedTagIds.length > 0 ||
    (formMode === "shop_batch" &&
      batchRows.some((r) => r.amount.trim() !== "" || r.note.trim() !== "")) ||
    (formMode === "category_batch" &&
      categoryBatchRows.some(
        (r) => r.shopName.trim() !== "" || r.amount.trim() !== "" || r.note.trim() !== ""
      ))
  );

  const isFormDirty = !isSubmitting && hasEnteredData;

  // 親コンポーネントに入力状態（未保存変更の有無）を通知
  useEffect(() => {
    onDirtyChange?.(isFormDirty);
  }, [isFormDirty, onDirtyChange]);

  // アンマウント時に入力フラグを解除
  useEffect(() => {
    return () => {
      onDirtyChange?.(false);
    };
  }, [onDirtyChange]);

  // 離脱時ガード: ブラウザを閉じようとした場合・リロード時の警告 (beforeunload)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isFormDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isFormDirty]);

  // 2秒デバウンス自動一時保存
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (hasEnteredData && !isSubmitting) {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(async () => {
        try {
          await fetch("/api/drafts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              draftType: "auto",
              formType: formMode,
              payloadJson: buildDraftPayload({
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
                categoryBatchRows,
                selectedTagIds,
              }),
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
  }, [
    date,
    shopName,
    amount,
    categoryId,
    paymentMethodId,
    toAccountId,
    isSavingsOrInvestmentCategory,
    note,
    grossAmount,
    taxDeduction,
    formMode,
    batchRows,
    categoryBatchRows,
    selectedTagIds,
    hasEnteredData,
    isSubmitting,
  ]);

  // 手動一時保存
  const handleManualDraft = async () => {
    try {
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftType: "manual",
          formType: formMode,
          payloadJson: buildDraftPayload({
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
            categoryBatchRows,
            selectedTagIds,
          }),
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
        const netAmt = parseInt(grossAmount || amount || "0", 10) - parseInt(taxDeduction || "0", 10);
        payload = [
          {
            type: "income",
            date,
            amount: netAmt,
            toAccountId: incomeAccountId,
            shopName: shopName || (isTemporaryIncome ? "臨時収入・賞与" : "給与振込"),
            note: `額面:${grossAmount || amount || 0} 控除:${taxDeduction || 0} ${note}`,
            tagIds: selectedTagIds,
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
            tagIds: selectedTagIds,
          },
        ];
      } else if (formMode === "category_batch") {
        const validRows = categoryBatchRows.filter((r) => r.amount && parseInt(r.amount, 10) > 0);
        if (validRows.length === 0) {
          onTriggerToast("金額が入力された行がありません");
          setIsSubmitting(false);
          return;
        }
        payload = validRows.map((r) => ({
          type: "expense",
          date: r.date || date,
          amount: parseInt(r.amount, 10),
          categoryId,
          paymentMethodId,
          toAccountId: isSavingsOrInvestmentCategory ? toAccountId : undefined,
          shopName: r.shopName || selectedCategoryObj?.name || "支出",
          note: r.note,
          tagIds: selectedTagIds,
        }));
      } else {
        const validRows = batchRows.filter((r) => r.amount && parseInt(r.amount, 10) > 0);
        if (validRows.length === 0) {
          onTriggerToast("金額が入力された行がありません");
          setIsSubmitting(false);
          return;
        }
        payload = validRows.map((r) => ({
          type: "expense",
          date,
          amount: parseInt(r.amount, 10),
          categoryId: r.categoryId || categoryId,
          paymentMethodId,
          shopName: shopName || "支出",
          note: r.note,
          tagIds: selectedTagIds,
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
        setAmount("");
        setShopName("");
        setCandidateShops([]);
        setCurrentSuggestion(null);
        setShowCandidateDropdown(false);
        setIsSuggestApplied(false);
        setNote("");
        setSelectedTagIds([]);
        setBatchRows([
          { rowId: createRowId("shop"), categoryId: "", amount: "", note: "" },
          { rowId: createRowId("shop"), categoryId: "", amount: "", note: "" },
        ]);
        setCategoryBatchRows([
          { rowId: createRowId("cat"), date: new Date().toISOString().split("T")[0], shopName: "", amount: "", note: "" },
          { rowId: createRowId("cat"), date: new Date().toISOString().split("T")[0], shopName: "", amount: "", note: "" },
        ]);
        resetCalculators();

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

  const getDraftSummary = (draft: DraftData) => {
    const p = draft.payloadJson;
    if (!p) return "未設定";
    if (draft.formType === "category_batch") {
      const catName = categories.find((c) => c.id === p.categoryId)?.name || "費目一括";
      const count = Array.isArray(p.categoryBatchRows)
        ? p.categoryBatchRows.filter((r: any) => r.amount).length
        : 0;
      const total = Array.isArray(p.categoryBatchRows)
        ? p.categoryBatchRows.reduce(
            (sum: number, r: any) => sum + (parseInt(r.amount, 10) || 0),
            0
          )
        : 0;
      return `${catName}一括 • ${count}件 (${formatCurrency(total)})`;
    }
    if (draft.formType === "shop_batch") {
      const shop = p.shopName || "店舗一括";
      const count = Array.isArray(p.batchRows) ? p.batchRows.filter((r: any) => r.amount).length : 0;
      const total = Array.isArray(p.batchRows)
        ? p.batchRows.reduce(
            (sum: number, r: any) => sum + (parseInt(r.amount, 10) || 0),
            0
          )
        : 0;
      return `${shop} • ${count}品目 (${formatCurrency(total)})`;
    }
    return `${p.shopName || "名称未設定"} • ${p.amount ? formatCurrency(parseInt(p.amount, 10)) : "金額未入力"}`;
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
                    {getDraftSummary(manualDraft)}
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
                    {getDraftSummary(autoDraft)}
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
          {/* 日付入力 (single または shop_batch または income の場合) */}
          {!(entryType === "expense" && formMode === "category_batch") && (
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
          )}

          {/* 支出フォーム */}
          {entryType === "expense" ? (
            <>
              {/* 店舗名 ＆ 機械的サジェスト (single または shop_batch のみ) */}
              {formMode !== "category_batch" && (
                <div className="relative" ref={dropdownRef}>
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
                    onFocus={() => {
                      if (candidateShops.length > 0) {
                        setShowCandidateDropdown(true);
                      } else if (shopName.trim()) {
                        fetchSuggestions(shopName);
                      }
                    }}
                    className="w-full px-3 py-2 bg-app-subtle border border-border rounded-lg text-content-main text-xs font-medium focus:border-primary outline-none"
                    autoComplete="off"
                  />

                  {/* 候補店舗名のドロップダウン */}
                  {showCandidateDropdown && candidateShops.length > 0 && (
                    <div className="absolute z-30 left-0 right-0 mt-1 bg-app-surface border border-border rounded-xl shadow-lg overflow-hidden animate-in fade-in duration-150">
                      <div className="px-3 py-1.5 bg-app-subtle/80 border-b border-border/50 text-[10px] font-bold text-content-subtle flex items-center justify-between">
                        <span>過去の利用履歴</span>
                        <span>{candidateShops.length}件の候補</span>
                      </div>
                      <div className="max-h-48 overflow-y-auto divide-y divide-border/40">
                        {candidateShops.map((name) => (
                          <button
                            key={name}
                            type="button"
                            onClick={() => handleSelectCandidate(name)}
                            className="w-full px-3 py-2 text-left text-xs text-content-main hover:bg-primary-light hover:text-primary transition-colors flex items-center justify-between cursor-pointer"
                          >
                            <span className="font-medium truncate">{name}</span>
                            <span className="text-[10px] text-content-subtle shrink-0 ml-2">履歴から選択</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 動的サジェスト適用バナー */}
                  {currentSuggestion && !isSuggestApplied && (currentSuggestion.categoryName || currentSuggestion.paymentMethodName) && (
                    <div
                      onClick={applySuggestion}
                      className="mt-1.5 p-2.5 bg-primary-light border border-primary-border rounded-xl flex items-center justify-between cursor-pointer hover:bg-primary/20 transition-colors animate-in fade-in slide-in-from-top-1 duration-150"
                    >
                      <div className="flex items-center gap-2 text-xs text-primary font-bold overflow-hidden">
                        <Sparkles className="w-4 h-4 shrink-0 text-primary" />
                        <span className="truncate">
                          {t.register.suggestPrompt}{" "}
                          {currentSuggestion.categoryName && `「${currentSuggestion.categoryIcon ? currentSuggestion.categoryIcon + " " : ""}${currentSuggestion.categoryName}」`}
                          {currentSuggestion.categoryName && currentSuggestion.paymentMethodName && " / "}
                          {currentSuggestion.paymentMethodName && `「${currentSuggestion.paymentMethodName}」`}
                          {currentSuggestion.count > 0 && (
                            <span className="text-[10px] font-normal text-primary/80 ml-1">
                              (過去{currentSuggestion.count}回利用)
                            </span>
                          )}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-primary shrink-0 ml-2">{t.register.applySuggest}</span>
                    </div>
                  )}
                </div>
              )}

              {/* 金額・費目・決済手段 */}
              {formMode === "single" && (
                <>
                  <UnitPriceCalculator
                    onApplyAmount={setAmount}
                    isOpen={singleCalcOpen}
                    onOpenChange={setSingleCalcOpen}
                    unitPrice={singleCalcUnitPrice}
                    onUnitPriceChange={setSingleCalcUnitPrice}
                    quantity={singleCalcQuantity}
                    onQuantityChange={setSingleCalcQuantity}
                    labelContent={
                      <label className="text-xs font-bold text-content-muted flex items-center gap-1">
                        <span>{t.register.amount}</span>
                        <HelpTooltip text={t.register.amountTooltip} />
                      </label>
                    }
                  >
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                      className="w-full px-3.5 py-2.5 bg-app-subtle border border-border rounded-xl text-content-main font-display text-xl font-extrabold focus:border-primary outline-none"
                      required
                    />
                  </UnitPriceCalculator>

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

                  <div className="text-xs font-bold text-content-main flex items-center justify-between mt-1">
                    <div className="flex items-center gap-2">
                      <span>{t.register.batchItemsTitle}</span>
                      <span className="text-[11px] font-normal text-content-subtle">
                        ({batchRows.filter((r) => r.amount && parseInt(r.amount, 10) > 0).length}品目入力中)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setBatchRows((prev) => [
                          ...prev,
                          { rowId: createRowId("shop"), categoryId: "", amount: "", note: "" },
                        ])
                      }
                      className="text-xs text-primary font-bold flex items-center gap-1 cursor-pointer hover:underline"
                    >
                      <Plus className="w-3.5 h-3.5" /> {t.register.addRow}
                    </button>
                  </div>

                  {batchRows.map((row) => {
                    const rowCalc = getRowCalcState(row.rowId);
                    return (
                      <div
                        key={row.rowId}
                        className="p-2.5 bg-app-subtle/60 border border-border/70 rounded-xl space-y-1 transition-all hover:border-primary/40"
                      >
                        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                          <select
                            value={row.categoryId || categoryId}
                            onChange={(e) => {
                              const nextCatId = e.target.value;
                              setBatchRows((prev) =>
                                prev.map((r) =>
                                  r.rowId === row.rowId ? { ...r, categoryId: nextCatId } : r
                                )
                              );
                            }}
                            className="w-full sm:w-[30%] px-2.5 py-2 bg-app-surface border border-border rounded-lg text-content-main text-xs cursor-pointer outline-none focus:border-primary"
                          >
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.icon} {c.name}
                              </option>
                            ))}
                          </select>

                          <div className="flex items-center gap-1.5 flex-1 sm:w-[36%]">
                            <input
                              type="text"
                              inputMode="numeric"
                              placeholder="金額"
                              value={row.amount}
                              onChange={(e) => {
                                const nextAmt = e.target.value.replace(/[^0-9]/g, "");
                                setBatchRows((prev) =>
                                  prev.map((r) =>
                                    r.rowId === row.rowId ? { ...r, amount: nextAmt } : r
                                  )
                                );
                              }}
                              className="w-full min-w-0 px-2.5 py-2 bg-app-surface border border-border rounded-lg text-content-main text-xs font-bold text-right outline-none focus:border-primary"
                            />
                            <UnitPriceCalculatorToggle
                              compact
                              isOpen={rowCalc.isOpen}
                              onToggle={() => toggleRowCalc(row.rowId)}
                            />
                          </div>

                          <div className="flex items-center gap-1.5 w-full sm:w-[34%]">
                            <input
                              type="text"
                              placeholder="メモ・品名"
                              value={row.note}
                              onChange={(e) => {
                                const nextNote = e.target.value;
                                setBatchRows((prev) =>
                                  prev.map((r) =>
                                    r.rowId === row.rowId ? { ...r, note: nextNote } : r
                                  )
                                );
                              }}
                              className="flex-1 min-w-0 px-2.5 py-2 bg-app-surface border border-border rounded-lg text-content-main text-xs outline-none focus:border-primary"
                            />

                            {batchRows.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveBatchRow(row.rowId)}
                                className="p-1.5 text-content-subtle hover:text-danger rounded-lg transition-colors cursor-pointer shrink-0"
                                title="行を削除"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        {rowCalc.isOpen && (
                          <UnitPriceCalculatorPanel
                            unitPrice={rowCalc.unitPrice}
                            quantity={rowCalc.quantity}
                            onUnitPriceChange={(val) =>
                              updateRowCalcField(row.rowId, "unitPrice", val)
                            }
                            onQuantityChange={(val) =>
                              updateRowCalcField(row.rowId, "quantity", val)
                            }
                            onApplyAmount={(val) => {
                              setBatchRows((prev) =>
                                prev.map((r) =>
                                  r.rowId === row.rowId ? { ...r, amount: val } : r
                                )
                              );
                            }}
                            onClose={() => closeRowCalc(row.rowId)}
                            className="bg-app-surface"
                          />
                        )}
                      </div>
                    );
                  })}

                  {/* 店舗一括 合計表示 */}
                  <div className="flex items-center justify-between p-3 bg-app-subtle border border-border/80 rounded-xl text-xs font-bold text-content-main mt-1">
                    <span>{t.register.totalBatchAmount || "合計金額"}</span>
                    <span className="text-base text-primary font-display font-extrabold">
                      {formatCurrency(
                        batchRows.reduce((sum, r) => sum + (parseInt(r.amount, 10) || 0), 0)
                      )}
                    </span>
                  </div>
                </div>
              )}

              {/* 同費目一括登録モード */}
              {formMode === "category_batch" && (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-content-muted mb-1 flex items-center gap-1">
                        <span>{t.register.category} (固定)</span>
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

                  {/* 行リスト */}
                  <div className="flex flex-col gap-3 border-t border-border pt-3">
                    <div className="text-xs font-bold text-content-main flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>{t.register.catBatchItemsTitle}</span>
                        <span className="text-[11px] font-normal text-content-subtle">
                          ({categoryBatchRows.filter((r) => r.amount && parseInt(r.amount, 10) > 0).length}件入力中)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setCategoryBatchRows((prev) => [
                            ...prev,
                            {
                              rowId: createRowId("cat"),
                              date: prev[prev.length - 1]?.date || date,
                              shopName: "",
                              amount: "",
                              note: "",
                            },
                          ])
                        }
                        className="text-xs text-primary font-bold flex items-center gap-1 cursor-pointer hover:underline"
                      >
                        <Plus className="w-3.5 h-3.5" /> {t.register.addRow}
                      </button>
                    </div>

                    {categoryBatchRows.map((row) => {
                      const rowCalc = getRowCalcState(row.rowId);
                      return (
                        <div
                          key={row.rowId}
                          className="p-3 bg-app-subtle border border-border/70 rounded-xl transition-all hover:border-primary/40"
                        >
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                            <div className="flex items-center gap-2 sm:w-36">
                              <input
                                type="date"
                                value={row.date}
                                onChange={(e) => {
                                  const nextDate = e.target.value;
                                  setCategoryBatchRows((prev) =>
                                    prev.map((r) =>
                                      r.rowId === row.rowId ? { ...r, date: nextDate } : r
                                    )
                                  );
                                }}
                                className="w-full px-2.5 py-1.5 bg-app-surface border border-border rounded-lg text-content-main text-xs outline-none focus:border-primary"
                              />
                            </div>

                            <div className="flex-1">
                              <input
                                type="text"
                                placeholder="店舗・取引先名"
                                value={row.shopName}
                                onChange={(e) => {
                                  const nextShop = e.target.value;
                                  setCategoryBatchRows((prev) =>
                                    prev.map((r) =>
                                      r.rowId === row.rowId ? { ...r, shopName: nextShop } : r
                                    )
                                  );
                                }}
                                className="w-full px-2.5 py-1.5 bg-app-surface border border-border rounded-lg text-content-main text-xs outline-none focus:border-primary"
                              />
                            </div>

                            <div className="flex items-center gap-1.5 sm:w-36">
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="金額 (円)"
                                value={row.amount}
                                onChange={(e) => {
                                  const nextAmt = e.target.value.replace(/[^0-9]/g, "");
                                  setCategoryBatchRows((prev) =>
                                    prev.map((r) =>
                                      r.rowId === row.rowId ? { ...r, amount: nextAmt } : r
                                    )
                                  );
                                }}
                                className="w-full min-w-0 px-2.5 py-1.5 bg-app-surface border border-border rounded-lg text-content-main text-xs font-bold outline-none focus:border-primary text-right"
                              />
                              <UnitPriceCalculatorToggle
                                compact
                                isOpen={rowCalc.isOpen}
                                onToggle={() => toggleRowCalc(row.rowId)}
                              />
                            </div>

                            <div className="flex-1 flex items-center gap-2">
                              <input
                                type="text"
                                placeholder="メモ・品名"
                                value={row.note}
                                onChange={(e) => {
                                  const nextNote = e.target.value;
                                  setCategoryBatchRows((prev) =>
                                    prev.map((r) =>
                                      r.rowId === row.rowId ? { ...r, note: nextNote } : r
                                    )
                                  );
                                }}
                                className="flex-1 px-2.5 py-1.5 bg-app-surface border border-border rounded-lg text-content-main text-xs outline-none focus:border-primary"
                              />

                              {categoryBatchRows.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveCategoryBatchRow(row.rowId)}
                                  className="p-1.5 text-content-subtle hover:text-danger rounded-lg transition-colors cursor-pointer"
                                  title="行を削除"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>

                          {rowCalc.isOpen && (
                            <UnitPriceCalculatorPanel
                              unitPrice={rowCalc.unitPrice}
                              quantity={rowCalc.quantity}
                              onUnitPriceChange={(val) =>
                                updateRowCalcField(row.rowId, "unitPrice", val)
                              }
                              onQuantityChange={(val) =>
                                updateRowCalcField(row.rowId, "quantity", val)
                              }
                              onApplyAmount={(val) => {
                                setCategoryBatchRows((prev) =>
                                  prev.map((r) =>
                                    r.rowId === row.rowId ? { ...r, amount: val } : r
                                  )
                                );
                              }}
                              onClose={() => closeRowCalc(row.rowId)}
                              className="bg-app-surface"
                            />
                          )}
                        </div>
                      );
                    })}

                    {/* 費目一括 合計表示 */}
                    <div className="flex items-center justify-between p-3 bg-app-subtle border border-border/80 rounded-xl text-xs font-bold text-content-main">
                      <span>{t.register.totalBatchAmount || "合計金額"}</span>
                      <span className="text-base text-primary font-display font-extrabold">
                        {formatCurrency(
                          categoryBatchRows.reduce(
                            (acc, r) => acc + (parseInt(r.amount, 10) || 0),
                            0
                          )
                        )}
                      </span>
                    </div>
                  </div>
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

          {/* タグ付け & カラーラベリング */}
          <div className="pt-2 border-t border-border/60">
            <label className="block text-xs font-bold text-content-muted mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-primary" />
                <span>タグ・カラーラベル</span>
                <HelpTooltip text="支出や振替に色付きタグ（#固定費、#自己投資など）を付与できます。" />
              </span>
              <button
                type="button"
                onClick={() => setIsCreatingTag(!isCreatingTag)}
                className="text-[11px] text-primary hover:underline font-bold flex items-center gap-0.5 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>{isCreatingTag ? "閉じる" : "新規タグ"}</span>
              </button>
            </label>

            {isCreatingTag && (
              <div className="mb-2.5 p-2.5 bg-app-subtle border border-border rounded-xl space-y-2 animate-in fade-in duration-150">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="タグ名 (例: 固定費, ご褒美)"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 bg-app-surface border border-border rounded-lg text-xs text-content-main outline-none focus:border-primary"
                  />
                  <div className="flex items-center gap-1">
                    {["#4F46E5", "#0284C7", "#16A34A", "#EA580C", "#9333EA", "#E11D48"].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewTagColor(c)}
                        className={`w-4 h-4 rounded-full transition-transform cursor-pointer ${
                          newTagColor === c ? "ring-2 ring-primary scale-110" : ""
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateTag}
                    className="px-2.5 py-1.5 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary-hover cursor-pointer"
                  >
                    追加
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
              {availableTags.length === 0 ? (
                <span className="text-[11px] text-content-subtle">登録されているタグがありません</span>
              ) : (
                availableTags.map((tag) => {
                  const isSelected = selectedTagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer border ${
                        isSelected
                          ? "border-transparent text-white shadow-2xs"
                          : "bg-app-subtle border-border text-content-muted hover:border-primary/40 hover:text-content-main"
                      }`}
                      style={{
                        backgroundColor: isSelected ? tag.color || "#10B981" : undefined,
                      }}
                    >
                      <span>#{tag.name}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

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
              <span>
                {isSubmitting
                  ? t.register.submitting
                  : formMode === "category_batch" && entryType === "expense"
                  ? `${t.register.submit} (${categoryBatchRows.filter((r) => r.amount && parseInt(r.amount, 10) > 0).length}件)`
                  : formMode === "shop_batch" && entryType === "expense"
                  ? `${t.register.submit} (${batchRows.filter((r) => r.amount && parseInt(r.amount, 10) > 0).length}件)`
                  : t.register.submit}
              </span>
            </button>
          </div>
        </form>
      </div>

      {/* 定例支払いテンプレート管理 & 未精算支払い予定一覧 (要件 2-8) */}
      <RecurringTemplatesSection
        templates={recurringTemplates}
        transactions={transactions}
        categories={categories}
        paymentMethods={paymentMethods}
        accounts={accounts}
        onRefreshAll={onRefreshData || onRefreshTags || onSubmitSuccess}
        onTriggerToast={onTriggerToast}
      />

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
