"use client";

import React, { useState, useRef, ChangeEvent } from "react";
import { CsvPreviewResult, CsvImportRow } from "@/types";
import {
  Upload,
  X,
  Check,
  AlertTriangle,
  FileText,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { ColumnMapping } from "@/lib/csv";

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (importedCount: number) => void;
  onTriggerToast: (msg: string) => void;
}

export function CsvImportModal({
  isOpen,
  onClose,
  onSuccess,
  onTriggerToast,
}: CsvImportModalProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState("");
  const [csvContent, setCsvContent] = useState("");
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [previewData, setPreviewData] = useState<CsvPreviewResult | null>(null);
  const [selectedRowNumbers, setSelectedRowNumbers] = useState<Set<number>>(new Set());
  const [showMappingSettings, setShowMappingSettings] = useState(false);
  const [currentMapping, setCurrentMapping] = useState<ColumnMapping | null>(null);

  if (!isOpen) return null;

  const handleReset = () => {
    setFileName("");
    setCsvContent("");
    setPreviewData(null);
    setSelectedRowNumbers(new Set());
    setShowMappingSettings(false);
    setCurrentMapping(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const requestPreview = async (text: string, mappingOverride?: ColumnMapping) => {
    setIsLoadingPreview(true);
    try {
      const res = await fetch("/api/admin/csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview",
          csvText: text,
          mapping: mappingOverride || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        onTriggerToast(err.error || "CSVファイルの解析に失敗しました。");
        return;
      }

      const data: CsvPreviewResult = await res.json();
      setPreviewData(data);
      setCurrentMapping(data.mapping);

      // デフォルトでは重複候補以外の有効行をすべて選択
      const initialSelected = new Set<number>();
      for (const row of data.rows) {
        if (row.isValid && !row.isDuplicateCandidate) {
          initialSelected.add(row.rowNumber);
        }
      }
      setSelectedRowNumbers(initialSelected);
    } catch {
      onTriggerToast("CSV解析処理中にエラーが発生しました。");
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    try {
      const text = await file.text();
      setCsvContent(text);
      await requestPreview(text);
    } catch {
      onTriggerToast("ファイルの読み込みに失敗しました。");
    }
  };

  const handleMappingChange = (field: keyof ColumnMapping, colIndex: number) => {
    if (!currentMapping) return;
    const updated: ColumnMapping = {
      ...currentMapping,
      [field]: colIndex >= 0 ? colIndex : undefined,
    };
    setCurrentMapping(updated);
    if (csvContent) {
      requestPreview(csvContent, updated);
    }
  };

  const toggleRow = (rowNum: number) => {
    const next = new Set(selectedRowNumbers);
    if (next.has(rowNum)) {
      next.delete(rowNum);
    } else {
      next.add(rowNum);
    }
    setSelectedRowNumbers(next);
  };

  const selectAllValid = () => {
    if (!previewData) return;
    const next = new Set<number>();
    for (const r of previewData.rows) {
      if (r.isValid) next.add(r.rowNumber);
    }
    setSelectedRowNumbers(next);
  };

  const excludeDuplicates = () => {
    if (!previewData) return;
    const next = new Set<number>();
    for (const r of previewData.rows) {
      if (r.isValid && !r.isDuplicateCandidate) {
        next.add(r.rowNumber);
      }
    }
    setSelectedRowNumbers(next);
  };

  const handleExecuteImport = async () => {
    if (!previewData || selectedRowNumbers.size === 0 || isImporting) return;

    setIsImporting(true);
    try {
      const itemsToImport = previewData.rows
        .filter((r) => selectedRowNumbers.has(r.rowNumber) && r.isValid)
        .map((r) => ({
          date: r.date,
          amount: r.amount,
          type: r.type,
          shopName: r.shopName,
          categoryId: r.categoryId,
          paymentMethodId: r.paymentMethodId,
          fromAccountId: r.fromAccountId,
          toAccountId: r.toAccountId,
          note: r.note,
        }));

      const res = await fetch("/api/admin/csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "import",
          items: itemsToImport,
        }),
      });

      if (res.ok) {
        const result = await res.json();
        onSuccess(result.importedCount);
        handleClose();
      } else {
        const err = await res.json();
        onTriggerToast(err.error || "インポート実行に失敗しました。");
      }
    } catch {
      onTriggerToast("インポート処理中にエラーが発生しました。");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      {/* 外部クリックで閉じるバックドロップ */}
      <div className="fixed inset-0" onClick={handleClose} />

      <div className="relative bg-app-surface border border-border rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* ヘッダー */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-app-subtle">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <h2 className="text-sm font-bold text-content-main">
              {t.csvImportModal.title}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded-lg hover:bg-border/50 text-content-muted hover:text-content-main transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* コンテンツエリア */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {/* STEP 1: ファイル選択 */}
          {!previewData && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border hover:border-primary rounded-xl p-8 text-center cursor-pointer transition-colors bg-app-subtle hover:bg-primary-light/10"
            >
              <Upload className="w-10 h-10 text-primary mx-auto mb-2" />
              <p className="text-xs font-bold text-content-main mb-1">
                {t.csvImportModal.selectFileHint}
              </p>
              <p className="text-[11px] text-content-muted">
                UTF-8 (BOM付き/なし) • カンマ区切りCSV • 最大5,000行
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          )}

          {isLoadingPreview && (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-content-muted">
              <RefreshCw className="w-6 h-6 animate-spin text-primary" />
              <span className="text-xs">CSVファイルを解析しています...</span>
            </div>
          )}

          {/* STEP 2: 解析プレビュー */}
          {previewData && !isLoadingPreview && (
            <div className="space-y-3">
              {/* ファイルバー & サマリー */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-app-subtle border border-border rounded-xl">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-xs font-bold text-content-main truncate max-w-[200px] sm:max-w-xs">
                    {fileName}
                  </span>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[10px] text-primary hover:underline ml-1 cursor-pointer"
                  >
                    {t.csvImportModal.changeFile}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>

                <div className="flex items-center gap-2 text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-app-surface border border-border font-medium">
                    {t.csvImportModal.totalRows}: <strong>{previewData.totalRows}</strong>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-success-light text-success font-medium">
                    {t.csvImportModal.validRows}: <strong>{previewData.validRows}</strong>
                  </span>
                  {previewData.duplicateCount > 0 && (
                    <span className="px-2 py-0.5 rounded bg-warning-light text-warning font-medium flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {t.csvImportModal.duplicateCandidates}: <strong>{previewData.duplicateCount}</strong>
                    </span>
                  )}
                </div>
              </div>

              {/* カラムマッピング設定トグル */}
              <div className="border border-border rounded-xl p-3 bg-app-surface">
                <button
                  type="button"
                  onClick={() => setShowMappingSettings(!showMappingSettings)}
                  className="flex items-center justify-between w-full text-xs font-bold text-content-main cursor-pointer"
                >
                  <div className="flex items-center gap-1.5">
                    <SlidersHorizontal className="w-4 h-4 text-primary" />
                    <span>{t.csvImportModal.colMappingTitle}</span>
                  </div>
                  <span className="text-[11px] text-content-muted">
                    {showMappingSettings ? "閉じる ▲" : "マッピングを確認・変更 ▼"}
                  </span>
                </button>

                {showMappingSettings && currentMapping && (
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-3 border-t border-border text-[11px]">
                    <div>
                      <label className="block text-content-muted mb-1 font-medium">
                        {t.csvImportModal.colDate} *
                      </label>
                      <select
                        value={currentMapping.dateCol}
                        onChange={(e) => handleMappingChange("dateCol", Number(e.target.value))}
                        className="w-full p-1.5 bg-app-subtle border border-border rounded text-content-main text-xs"
                      >
                        {previewData.headers.map((h, i) => (
                          <option key={i} value={i}>
                            列 {i + 1}: {h || `(無名 ${i + 1})`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-content-muted mb-1 font-medium">
                        {t.csvImportModal.colAmount} *
                      </label>
                      <select
                        value={currentMapping.amountCol}
                        onChange={(e) => handleMappingChange("amountCol", Number(e.target.value))}
                        className="w-full p-1.5 bg-app-subtle border border-border rounded text-content-main text-xs"
                      >
                        {previewData.headers.map((h, i) => (
                          <option key={i} value={i}>
                            列 {i + 1}: {h || `(無名 ${i + 1})`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-content-muted mb-1 font-medium">
                        {t.csvImportModal.colShop}
                      </label>
                      <select
                        value={currentMapping.shopNameCol}
                        onChange={(e) => handleMappingChange("shopNameCol", Number(e.target.value))}
                        className="w-full p-1.5 bg-app-subtle border border-border rounded text-content-main text-xs"
                      >
                        <option value={-1}>（なし）</option>
                        {previewData.headers.map((h, i) => (
                          <option key={i} value={i}>
                            列 {i + 1}: {h || `(無名 ${i + 1})`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-content-muted mb-1 font-medium">
                        {t.csvImportModal.colType}
                      </label>
                      <select
                        value={currentMapping.typeCol ?? -1}
                        onChange={(e) => handleMappingChange("typeCol", Number(e.target.value))}
                        className="w-full p-1.5 bg-app-subtle border border-border rounded text-content-main text-xs"
                      >
                        <option value={-1}>（固定: 支出）</option>
                        {previewData.headers.map((h, i) => (
                          <option key={i} value={i}>
                            列 {i + 1}: {h || `(無名 ${i + 1})`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-content-muted mb-1 font-medium">
                        {t.csvImportModal.colCategory}
                      </label>
                      <select
                        value={currentMapping.categoryCol ?? -1}
                        onChange={(e) => handleMappingChange("categoryCol", Number(e.target.value))}
                        className="w-full p-1.5 bg-app-subtle border border-border rounded text-content-main text-xs"
                      >
                        <option value={-1}>（なし）</option>
                        {previewData.headers.map((h, i) => (
                          <option key={i} value={i}>
                            列 {i + 1}: {h || `(無名 ${i + 1})`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-content-muted mb-1 font-medium">
                        {t.csvImportModal.colPayment}
                      </label>
                      <select
                        value={currentMapping.paymentMethodCol ?? -1}
                        onChange={(e) => handleMappingChange("paymentMethodCol", Number(e.target.value))}
                        className="w-full p-1.5 bg-app-subtle border border-border rounded text-content-main text-xs"
                      >
                        <option value={-1}>（なし）</option>
                        {previewData.headers.map((h, i) => (
                          <option key={i} value={i}>
                            列 {i + 1}: {h || `(無名 ${i + 1})`}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* クイック選択バー */}
              <div className="flex items-center justify-between text-xs py-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-content-main">
                    インポート対象: {selectedRowNumbers.size} 件
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {previewData.duplicateCount > 0 && (
                    <button
                      type="button"
                      onClick={excludeDuplicates}
                      className="text-[11px] px-2 py-1 rounded bg-warning-light text-warning font-bold hover:bg-warning hover:text-white transition-colors cursor-pointer"
                    >
                      {t.csvImportModal.removeDuplicates}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={selectAllValid}
                    className="text-[11px] px-2 py-1 rounded bg-app-subtle hover:bg-border text-content-main transition-colors cursor-pointer"
                  >
                    {t.csvImportModal.includeDuplicates}
                  </button>
                </div>
              </div>

              {/* プレビューテーブル */}
              <div className="border border-border rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-[11px] border-collapse text-left">
                  <thead className="sticky top-0 bg-app-subtle border-b border-border text-content-muted font-bold z-10">
                    <tr>
                      <th className="p-2 w-8 text-center">
                        <input
                          type="checkbox"
                          checked={
                            previewData.rows.filter((r) => r.isValid).length > 0 &&
                            previewData.rows
                              .filter((r) => r.isValid)
                              .every((r) => selectedRowNumbers.has(r.rowNumber))
                          }
                          onChange={(e) => {
                            if (e.target.checked) selectAllValid();
                            else setSelectedRowNumbers(new Set());
                          }}
                          className="cursor-pointer"
                        />
                      </th>
                      <th className="p-2 w-10">#</th>
                      <th className="p-2">{t.csvImportModal.thDate}</th>
                      <th className="p-2">{t.csvImportModal.thShop}</th>
                      <th className="p-2 text-right">{t.csvImportModal.thAmount}</th>
                      <th className="p-2">{t.csvImportModal.thType}</th>
                      <th className="p-2">{t.csvImportModal.thCategory}</th>
                      <th className="p-2">{t.csvImportModal.thPayment}</th>
                      <th className="p-2">{t.csvImportModal.thStatus}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {previewData.rows.map((row: CsvImportRow) => {
                      const isSelected = selectedRowNumbers.has(row.rowNumber);
                      return (
                        <tr
                          key={row.rowNumber}
                          className={`transition-colors ${
                            !row.isValid
                              ? "bg-danger-light/10 opacity-70"
                              : row.isDuplicateCandidate
                              ? "bg-warning-light/20"
                              : isSelected
                              ? "bg-primary-light/10"
                              : "hover:bg-app-subtle"
                          }`}
                        >
                          <td className="p-2 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={!row.isValid}
                              onChange={() => toggleRow(row.rowNumber)}
                              className="cursor-pointer"
                            />
                          </td>
                          <td className="p-2 text-content-subtle">{row.rowNumber}</td>
                          <td className="p-2 whitespace-nowrap font-medium text-content-main">
                            {row.date}
                          </td>
                          <td className="p-2 text-content-main truncate max-w-[120px]">
                            {row.shopName || "—"}
                          </td>
                          <td className="p-2 text-right font-bold text-content-main whitespace-nowrap">
                            ¥{row.amount.toLocaleString()}
                          </td>
                          <td className="p-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                row.type === "expense"
                                  ? "bg-danger-light text-danger"
                                  : row.type === "income"
                                  ? "bg-success-light text-success"
                                  : "bg-primary-light text-primary"
                              }`}
                            >
                              {row.type === "expense"
                                ? "支出"
                                : row.type === "income"
                                ? "収入"
                                : "振替"}
                            </span>
                          </td>
                          <td className="p-2 text-content-muted truncate max-w-[90px]">
                            {row.categoryName || (row.categoryId ? "ID一致" : "—")}
                          </td>
                          <td className="p-2 text-content-muted truncate max-w-[90px]">
                            {row.paymentMethodName || (row.paymentMethodId ? "ID一致" : "—")}
                          </td>
                          <td className="p-2 whitespace-nowrap">
                            {!row.isValid ? (
                              <span className="text-danger font-bold flex items-center gap-1">
                                <X className="w-3 h-3" />
                                {row.errorMessage || t.csvImportModal.statusInvalid}
                              </span>
                            ) : row.isDuplicateCandidate ? (
                              <span className="text-warning font-bold flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                {t.csvImportModal.statusDuplicate}
                              </span>
                            ) : (
                              <span className="text-success font-bold flex items-center gap-1">
                                <Check className="w-3 h-3" />
                                {t.csvImportModal.statusValid}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="p-4 border-t border-border flex items-center justify-between bg-app-subtle">
          <button
            type="button"
            onClick={handleClose}
            className="px-3 py-1.5 text-xs text-content-muted hover:text-content-main transition-colors cursor-pointer"
          >
            {t.csvImportModal.cancelBtn}
          </button>

          {previewData && (
            <button
              type="button"
              disabled={selectedRowNumbers.size === 0 || isImporting}
              onClick={handleExecuteImport}
              className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg shadow-sm hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 cursor-pointer"
            >
              {isImporting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{t.csvImportModal.importing}</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>
                    {selectedRowNumbers.size} {t.csvImportModal.importBtn}
                  </span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
