"use client";

import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, Calculator, X } from "lucide-react";
import { calculateUnitTotal, formatCurrency, UnitTotalErrorCode } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

/** 個数セレクトボックスの初期値 */
export const DEFAULT_QUANTITY = "1";

/** 個数セレクトボックスの上限値（31個以上は金額入力欄へ直接手入力） */
export const MAX_UI_QUANTITY = 30;

/** 個数セレクトボックス用の選択肢配列（"1" 〜 "30"） */
export const UNIT_CALC_QUANTITY_OPTIONS: readonly string[] = Array.from(
  { length: MAX_UI_QUANTITY },
  (_, index) => String(index + 1)
);

/**
 * 全角数字を半角数字へ変換し、数字以外の文字を除去する入力サニタイザー
 */
export function sanitizeUnitCalcInput(raw: string): string {
  const halfWidth = raw.replace(/[０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  );
  return halfWidth.replace(/[^0-9]/g, "");
}

function getUnitCalcErrorMessage(
  errorCode: UnitTotalErrorCode,
  t: ReturnType<typeof useTranslation>["t"]
): string | null {
  switch (errorCode) {
    case "INVALID_UNIT_PRICE":
      return t.register.unitCalcInvalidUnitPrice;
    case "INVALID_QUANTITY":
      return t.register.unitCalcInvalidQuantity;
    case "EXCEEDS_MAX_AMOUNT":
      return t.register.unitCalcExceedsMax;
    case "EMPTY_INPUT":
    default:
      return null;
  }
}

export interface UnitPriceCalculatorToggleProps {
  isOpen: boolean;
  onToggle: () => void;
  compact?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * 単価×個数 計算補助パネルを開閉するトグルボタン
 */
export function UnitPriceCalculatorToggle({
  isOpen,
  onToggle,
  compact = false,
  disabled = false,
  className = "",
}: UnitPriceCalculatorToggleProps) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-expanded={isOpen}
      aria-label={t.register.unitCalcToggleTitle}
      title={t.register.unitCalcToggleTitle}
      className={`inline-flex items-center justify-center gap-1 rounded-lg border font-bold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0 ${
        compact ? "p-1.5 text-[11px]" : "px-2 py-1 text-[11px]"
      } ${
        isOpen
          ? "bg-primary-light border-primary-border text-primary"
          : "bg-app-subtle border-border text-content-muted hover:text-primary hover:border-primary/40"
      } ${className}`}
    >
      <Calculator className="w-3.5 h-3.5 shrink-0" />
      {!compact && <span>{t.register.unitCalcToggle}</span>}
    </button>
  );
}

export interface UnitPriceCalculatorPanelProps {
  unitPrice: string;
  quantity: string;
  onUnitPriceChange: (value: string) => void;
  onQuantityChange: (value: string) => void;
  onApplyAmount: (amountStr: string) => void;
  onClose?: () => void;
  currencySymbol?: string;
  className?: string;
}

/**
 * 単価×個数 インライン計算補助パネル
 * - 双方に正の整数が入力されるとリアルタイムで合計金額を算出し、上限内のみ親へ反映する
 * - 金額欄を手入力編集した場合は、単価・個数を再編集するまで手動値を上書きしない
 */
export function UnitPriceCalculatorPanel({
  unitPrice,
  quantity,
  onUnitPriceChange,
  onQuantityChange,
  onApplyAmount,
  onClose,
  currencySymbol = "¥",
  className = "",
}: UnitPriceCalculatorPanelProps) {
  const { t } = useTranslation();
  const selectedQuantity = UNIT_CALC_QUANTITY_OPTIONS.includes(quantity)
    ? quantity
    : DEFAULT_QUANTITY;
  const result = calculateUnitTotal(unitPrice, selectedQuantity);
  const errorMessage = result.ok ? null : getUnitCalcErrorMessage(result.errorCode, t);

  const handleUnitPriceChange = (raw: string) => {
    const nextUnit = sanitizeUnitCalcInput(raw);
    onUnitPriceChange(nextUnit);
    const nextResult = calculateUnitTotal(nextUnit, selectedQuantity);
    if (nextResult.ok) {
      onApplyAmount(String(nextResult.total));
    }
  };

  const handleQuantityChange = (nextValue: string) => {
    const nextQty = UNIT_CALC_QUANTITY_OPTIONS.includes(nextValue)
      ? nextValue
      : DEFAULT_QUANTITY;
    onQuantityChange(nextQty);
    const nextResult = calculateUnitTotal(unitPrice, nextQty);
    if (nextResult.ok) {
      onApplyAmount(String(nextResult.total));
    }
  };

  return (
    <div
      className={`mt-2 p-2.5 sm:p-3 bg-app-subtle border border-primary-border rounded-xl space-y-2 animate-in fade-in slide-in-from-top-1 duration-150 ${className}`}
    >
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-1.5 sm:gap-2">
        <div>
          <label className="block text-[11px] font-bold text-content-muted mb-1">
            {t.register.unitPriceLabel}
          </label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder={t.register.unitPricePlaceholder}
            aria-label={t.register.unitPriceLabel}
            value={unitPrice}
            onChange={(e) => handleUnitPriceChange(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-app-surface border border-border rounded-lg text-content-main text-xs font-bold text-right focus:border-primary outline-none"
          />
        </div>

        <span
          aria-hidden="true"
          className="pb-1.5 text-xs font-extrabold text-content-muted text-center select-none px-0.5"
        >
          ×
        </span>

        <div>
          <label className="block text-[11px] font-bold text-content-muted mb-1">
            {t.register.quantityLabel}
          </label>
          <select
            aria-label={t.register.quantityLabel}
            title={t.register.unitCalcQuantityHint}
            value={selectedQuantity}
            onChange={(e) => handleQuantityChange(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-app-surface border border-border rounded-lg text-content-main text-xs font-bold focus:border-primary outline-none cursor-pointer"
          >
            {UNIT_CALC_QUANTITY_OPTIONS.map((qtyOption) => (
              <option key={qtyOption} value={qtyOption}>
                {qtyOption}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-[10px] text-content-subtle leading-tight">
        {t.register.unitCalcQuantityHint}
      </p>

      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-border/60">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-content-muted">
            {t.register.unitCalcTotalLabel}:
          </span>
          {result.ok ? (
            <span className="text-xs sm:text-sm font-extrabold font-display text-primary">
              {formatCurrency(result.total, currencySymbol)}
            </span>
          ) : (
            <span className="text-xs font-bold text-content-subtle">—</span>
          )}
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            title={t.common.close}
            className="p-1 rounded-lg text-content-muted hover:text-content-main hover:bg-app-surface transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="flex items-start gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-[11px] font-bold leading-snug"
          style={{ color: "var(--danger)" }}
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}

export interface UnitPriceCalculatorProps {
  onApplyAmount: (amountStr: string) => void;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  unitPrice?: string;
  onUnitPriceChange?: (value: string) => void;
  quantity?: string;
  onQuantityChange?: (value: string) => void;
  resetKey?: string | number | boolean;
  compact?: boolean;
  disabled?: boolean;
  currencySymbol?: string;
  className?: string;
  labelContent?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * 再利用可能なインライン単価×個数計算補助コンポーネント
 * - 単体（非制御/制御両対応）での利用と、labelContent + children スロット形式の両方に対応
 * - 折りたたみ時も親の金額欄の値を保持し、手入力値を上書きしない
 */
export function UnitPriceCalculator({
  onApplyAmount,
  isOpen: controlledOpen,
  onOpenChange,
  unitPrice: controlledUnitPrice,
  onUnitPriceChange,
  quantity: controlledQuantity,
  onQuantityChange,
  resetKey,
  compact = false,
  disabled = false,
  currencySymbol = "¥",
  className = "",
  labelContent,
  children,
}: UnitPriceCalculatorProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [internalUnitPrice, setInternalUnitPrice] = useState("");
  const [internalQuantity, setInternalQuantity] = useState(DEFAULT_QUANTITY);

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const unitPrice = controlledUnitPrice !== undefined ? controlledUnitPrice : internalUnitPrice;
  const quantity = controlledQuantity !== undefined ? controlledQuantity : internalQuantity;

  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) {
      setInternalOpen(next);
    }
    onOpenChange?.(next);
  };

  const setUnitPrice = (next: string) => {
    if (controlledUnitPrice === undefined) {
      setInternalUnitPrice(next);
    }
    onUnitPriceChange?.(next);
  };

  const setQuantity = (next: string) => {
    if (controlledQuantity === undefined) {
      setInternalQuantity(next);
    }
    onQuantityChange?.(next);
  };

  const prevResetKeyRef = useRef(resetKey);
  useEffect(() => {
    if (prevResetKeyRef.current !== resetKey) {
      prevResetKeyRef.current = resetKey;
      if (controlledOpen === undefined) setInternalOpen(false);
      if (controlledUnitPrice === undefined) setInternalUnitPrice("");
      if (controlledQuantity === undefined) setInternalQuantity(DEFAULT_QUANTITY);
    }
  }, [resetKey, controlledOpen, controlledUnitPrice, controlledQuantity]);

  return (
    <div className={className}>
      {labelContent !== undefined || children !== undefined ? (
        <>
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="min-w-0">{labelContent}</div>
            <UnitPriceCalculatorToggle
              isOpen={isOpen}
              onToggle={() => setOpen(!isOpen)}
              compact={compact}
              disabled={disabled}
            />
          </div>
          {children}
        </>
      ) : (
        <UnitPriceCalculatorToggle
          isOpen={isOpen}
          onToggle={() => setOpen(!isOpen)}
          compact={compact}
          disabled={disabled}
        />
      )}

      {isOpen && (
        <UnitPriceCalculatorPanel
          unitPrice={unitPrice}
          quantity={quantity}
          onUnitPriceChange={setUnitPrice}
          onQuantityChange={setQuantity}
          onApplyAmount={onApplyAmount}
          onClose={() => setOpen(false)}
          currencySymbol={currencySymbol}
        />
      )}
    </div>
  );
}
