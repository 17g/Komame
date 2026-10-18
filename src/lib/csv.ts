/**
 * Komame CSV Utility
 * RFC 4180準拠のCSVパーサーおよびカラムマッピング・データ正規化ヘルパー
 */

export interface ColumnMapping {
  dateCol: number;
  amountCol: number;
  shopNameCol: number;
  typeCol?: number;
  categoryCol?: number;
  paymentMethodCol?: number;
  noteCol?: number;
}

/**
 * CSVテキストをパースしてヘッダーと各行配列を返す
 */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  // UTF-8 BOM の除去
  const cleanText = text.startsWith("\uFEFF") ? text.slice(1) : text;

  const records: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // エスケープされた引用符 ("")
          currentField += '"';
          i++; // 次の引用符をスキップ
        } else {
          // 引用符の終了
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        currentRow.push(currentField.trim());
        currentField = "";
      } else if (char === "\r") {
        if (nextChar === "\n") {
          i++; // CRLF
        }
        currentRow.push(currentField.trim());
        records.push(currentRow);
        currentRow = [];
        currentField = "";
      } else if (char === "\n") {
        currentRow.push(currentField.trim());
        records.push(currentRow);
        currentRow = [];
        currentField = "";
      } else {
        currentField += char;
      }
    }
  }

  // 最終フィールド・行の処理
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    records.push(currentRow);
  }

  // 空行（全セルが空文字）の除外
  const validRecords = records.filter((row) =>
    row.some((cell) => cell.length > 0)
  );

  if (validRecords.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = validRecords[0];
  const rows = validRecords.slice(1);

  return { headers, rows };
}

/**
 * ヘッダー名からカラムのマッピング候補を自動検出する
 */
export function detectColumnMapping(headers: string[]): ColumnMapping {
  let dateCol = -1;
  let amountCol = -1;
  let shopNameCol = -1;
  let typeCol = -1;
  let categoryCol = -1;
  let paymentMethodCol = -1;
  let noteCol = -1;

  headers.forEach((h, idx) => {
    const name = h.toLowerCase().trim();

    if (dateCol === -1 && /(日付|日時|年月日|date)/i.test(name)) {
      dateCol = idx;
    } else if (amountCol === -1 && /(金額|amount|支払|支出|出金|価格|入金)/i.test(name)) {
      amountCol = idx;
    } else if (shopNameCol === -1 && /(店舗|店名|取引先|shop|摘要|内容|利用先|加盟店)/i.test(name)) {
      shopNameCol = idx;
    } else if (typeCol === -1 && /(種別|収支|区分|type)/i.test(name)) {
      typeCol = idx;
    } else if (categoryCol === -1 && /(費目|カテゴリ|category|分類)/i.test(name)) {
      categoryCol = idx;
    } else if (paymentMethodCol === -1 && /(決済|支払手段|支払い方法|口座|カード|payment|method)/i.test(name)) {
      paymentMethodCol = idx;
    } else if (noteCol === -1 && /(メモ|note|備考|コメント)/i.test(name)) {
      noteCol = idx;
    }
  });

  // フォールバック: 検出できなかった場合は先頭数カラムを割り当て
  if (dateCol === -1) dateCol = 0;
  if (amountCol === -1) amountCol = headers.length > 2 ? 2 : 1;
  if (shopNameCol === -1) shopNameCol = headers.length > 1 ? 1 : 0;

  return {
    dateCol,
    amountCol,
    shopNameCol,
    typeCol: typeCol !== -1 ? typeCol : undefined,
    categoryCol: categoryCol !== -1 ? categoryCol : undefined,
    paymentMethodCol: paymentMethodCol !== -1 ? paymentMethodCol : undefined,
    noteCol: noteCol !== -1 ? noteCol : undefined,
  };
}

/**
 * 日付文字列を YYYY-MM-DD に正規化
 */
export function normalizeDate(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD
  const m1 = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m1) {
    const y = m1[1];
    const m = m1[2].padStart(2, "0");
    const d = m1[3].padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // YYYY年MM月DD日
  const m2 = trimmed.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if (m2) {
    const y = m2[1];
    const m = m2[2].padStart(2, "0");
    const d = m2[3].padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Date.parse可能な場合
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  return null;
}

/**
 * 金額文字列を正の数値に正規化
 */
export function normalizeAmount(input: string | number): number | null {
  if (typeof input === "number") {
    const abs = Math.abs(input);
    return isNaN(abs) || abs === 0 ? null : Math.round(abs);
  }
  if (!input) return null;

  // カンマ、円マーク、ドルマーク、空白を除去
  const cleaned = input.replace(/[¥$,\s円]/g, "").trim();
  const num = Number(cleaned);
  if (isNaN(num)) return null;
  const abs = Math.abs(num);
  if (abs === 0) return null;
  return Math.round(abs);
}

/**
 * 取引種別文字列を正規化
 */
export function normalizeType(input?: string): "expense" | "income" | "transfer" {
  if (!input) return "expense";
  const trimmed = input.trim().toLowerCase();

  if (trimmed.includes("収入") || trimmed.includes("income") || trimmed.includes("給与")) {
    return "income";
  }
  if (trimmed.includes("振替") || trimmed.includes("transfer") || trimmed.includes("移動")) {
    return "transfer";
  }
  return "expense";
}

/**
 * 数式トリガー文字 (=, +, -, @, \t, \r)
 */
const FORMULA_TRIGGERS = ["=", "+", "-", "@", "\t", "\r"];

/**
 * セル値をRFC 4180準拠でエスケープし、数式インジェクション（CSV Injection）を無害化
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '""';
  }

  // 純粋な数値型（負の数値を含む）は数式インジェクション対策の対象外（計算用数値を保護）
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return '""';
    }
    return `"${value}"`;
  }

  if (typeof value === "bigint" || typeof value === "boolean") {
    return `"${value}"`;
  }

  let str: string;
  if (value instanceof Date) {
    str = value.toISOString();
  } else if (typeof value === "object") {
    str = JSON.stringify(value);
  } else {
    str = String(value);
  }

  // 文字列セルの先頭文字が数式トリガー文字 (=, +, -, @, \t, \r) に該当する場合、
  // 先頭にシングルクォート (') を付与して Excel / スプレッドシートでの数式・DDE 実行を無害化
  if (str.length > 0 && FORMULA_TRIGGERS.includes(str[0])) {
    str = `'${str}`;
  }

  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * ヘッダーと行データから UTF-8 BOM付き CSV 文字列を生成
 */
export function generateCsv(headers: string[], rows: unknown[][]): string {
  let csv = "\uFEFF";
  csv += headers.map(escapeCsvCell).join(",") + "\n";
  for (const row of rows) {
    csv += row.map(escapeCsvCell).join(",") + "\n";
  }
  return csv;
}

