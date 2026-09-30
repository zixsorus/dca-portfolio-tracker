// Import / export helpers: paste-in CSV parsing for transaction history, CSV
// and JSON serialisation for backups, and the browser download plumbing.
// Everything is client-side — the payloads are assembled from data `getPortfolio`
// already returned, so exporting costs no API calls.

export interface CsvRow {
  /** 1-based line number in the pasted text, for error messages. */
  line: number;
  symbol: string;
  tradeDate: string;
  grossThb: number;
  feeThb: number;
  fxThbUsd: number;
  priceUsd: number;
  note: string;
}

export interface CsvParseResult {
  rows: CsvRow[];
  errors: Array<{ line: number; error: string }>;
  delimiter: string;
  /** True when a header row was recognised; line 1 was then consumed. */
  hadHeader: boolean;
}

const COLUMN_ALIASES: Record<string, string[]> = {
  date: ["date", "trade_date", "tradedate", "วันที่", "วันที่ซื้อ"],
  symbol: ["symbol", "ticker", "สัญลักษณ์", "หุ้น", "ตัวย่อ"],
  amount: ["amount", "gross", "gross_thb", "value", "total", "ยอด", "ยอดซื้อ", "จำนวนเงิน", "มูลค่า"],
  fee: ["fee", "fee_thb", "commission", "ค่าธรรมเนียม", "ค่า commission"],
  fx: ["fx", "fx_thb_usd", "fxrate", "fx_rate", "rate", "อัตรา", "อัตราแลกเปลี่ยน", "ค่าเงิน"],
  price: ["price", "price_usd", "ราคา", "ราคาต่อหุ้น", "ราคาซื้อ"],
  note: ["note", "notes", "memo", "comment", "หมายเหตุ", "รายละเอียด"],
};

const REQUIRED_COLUMNS = ["date", "symbol", "amount", "price"] as const;
const MAX_IMPORT_ROWS = 200;

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/^["']|["']$/g, "").replace(/^﻿/, "").replace(/[\s.-]+/g, "_");
}

function matchColumn(header: string): string | null {
  const normalized = normalizeHeader(header);
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.some((alias) => alias === normalized || normalizeHeader(alias) === normalized)) return field;
  }
  return null;
}

function detectDelimiter(headerLine: string): string {
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = 0;
  for (const candidate of candidates) {
    const count = headerLine.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/** Splits one CSV line, honouring double-quoted fields with "" escapes. */
function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === delimiter) {
      out.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  out.push(current);
  return out.map((value) => value.trim());
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[฿$€£,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/**
 * Normalises the three date shapes brokers actually emit.
 *
 * A day above 12 settles the order outright. When both numbers are 12 or
 * below the format is genuinely ambiguous and we assume Thai D/M/YYYY — the
 * preview table always shows the parsed date, so a wrong guess is visible
 * before anything is written.
 */
export function normalizeTradeDate(raw: string): { value: string } | { error: string } {
  const text = raw.trim().replace(/^["']|["']$/g, "");
  if (text === "") return { error: "ไม่ได้ระบุวันที่" };

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (iso) {
    const [, year, month, day] = iso;
    return validateParts(Number(year), Number(month), Number(day));
  }

  const slash = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(text);
  if (slash) {
    const [, first, second, rawYear] = slash;
    const year = Number(rawYear) < 100 ? 2000 + Number(rawYear) : Number(rawYear);
    const a = Number(first);
    const b = Number(second);
    if (a > 12 && b <= 12) return validateParts(year, b, a); // unambiguous D/M
    if (b > 12 && a <= 12) return validateParts(year, a, b); // unambiguous M/D
    return validateParts(year, b, a); // ambiguous → assume D/M/YYYY
  }

  const thai = /^(\d{1,2})\s*(\S+)\s*(\d{2,4})$/.exec(text);
  if (thai) {
    const THAI_MONTHS: Record<string, number> = {
      "ม.ค.": 1, "ก.พ.": 2, "มี.ค.": 3, "เม.ย.": 4, "พ.ค.": 5, "มิ.ย.": 6,
      "ก.ค.": 7, "ส.ค.": 8, "ก.ย.": 9, "ต.ค.": 10, "พ.ย.": 11, "ธ.ค.": 12,
    };
    const month = THAI_MONTHS[thai[2]!];
    if (month) {
      const year = Number(thai[3]) < 100 ? 2000 + Number(thai[3]) : Number(thai[3]);
      return validateParts(year, month, Number(thai[1]));
    }
  }

  return { error: "รูปแบบวันที่ไม่ถูกต้อง" };
}

function validateParts(year: number, month: number, day: number): { value: string } | { error: string } {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return { error: "รูปแบบวันที่ไม่ถูกต้อง" };
  if (month < 1 || month > 12 || day < 1 || day > 31) return { error: "วันที่ไม่ถูกต้อง" };
  const stamp = Date.UTC(year, month - 1, day);
  const date = new Date(stamp);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return { error: "วันที่ไม่มีอยู่จริง" };
  }
  return { value: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
}

/**
 * Parses pasted CSV into candidate transactions.
 *
 * Expected columns (English or Thai, any case): date, symbol, amount, price
 * are required; fee, fx and note are optional and fall back to 0, the
 * portfolio's configured FX rate, and an empty note respectively.
 */
export function parseTransactionsCsv(text: string, defaultFxThbUsd: number | null): CsvParseResult {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((line) => line.trim() !== "");
  const errors: CsvParseResult["errors"] = [];
  if (lines.length === 0) return { rows: [], errors, delimiter: ",", hadHeader: false };

  const delimiter = detectDelimiter(lines[0]!);
  const firstCells = splitLine(lines[0]!, delimiter);
  const mapped = firstCells.map(matchColumn);
  const hadHeader = mapped.some((field) => field !== null);
  const hasHeaderColumns = REQUIRED_COLUMNS.every((field) => mapped.includes(field));

  let columns: Record<string, number> = {};
  let startIndex = 0;
  if (hadHeader && hasHeaderColumns) {
    mapped.forEach((field, index) => {
      if (field !== null && columns[field] === undefined) columns[field] = index;
    });
    startIndex = 1;
    const missing = REQUIRED_COLUMNS.filter((field) => columns[field] === undefined);
    if (missing.length > 0) {
      return { rows: [], errors: [{ line: 1, error: `หัวคอลมีชื่อที่ไม่รู้จัก: ${missing.join(", ")}` }], delimiter, hadHeader: true };
    }
  } else {
    // Positional fallback: date, symbol, amount, fee, fx, price, note
    const order = ["date", "symbol", "amount", "fee", "fx", "price", "note"];
    order.forEach((field, index) => { columns[field] = index; });
    if (hadHeader) errors.push({ line: 1, error: "ไม่พบหัวคอลที่รู้จัก ใช้ลำดับ: วันที่, สัญลักษณ์, ยอด, ค่าธรรมเนียม, fx, ราคา, หมายเหตุ" });
    else startIndex = 0;
  }

  const rows: CsvRow[] = [];
  const dataLines = lines.slice(startIndex);
  if (dataLines.length > MAX_IMPORT_ROWS) {
    errors.push({ line: 0, error: `มี ${dataLines.length} แถว เกินลิมิต ${MAX_IMPORT_ROWS} แถวต่อครั้ง` });
  }

  for (let index = 0; index < Math.min(dataLines.length, MAX_IMPORT_ROWS); index += 1) {
    const line = dataLines[index]!;
    const lineNumber = startIndex + index + 1;
    const cells = splitLine(line, delimiter);
    const cell = (field: string): string => {
      const at = columns[field];
      return at === undefined ? "" : (cells[at] ?? "");
    };

    const problems: string[] = [];
    const symbol = cell("symbol").toUpperCase();
    if (!symbol) problems.push("ไม่ได้ระบุสัญลักษณ์");

    const date = normalizeTradeDate(cell("date"));
    if ("error" in date) problems.push(date.error);

    const gross = parseAmount(cell("amount"));
    if (gross == null) problems.push("ยอดซื้อไม่ใช่ตัวเลข");
    else if (gross <= 0) problems.push("ยอดซื้อต้องมากกว่า 0");

    const price = parseAmount(cell("price"));
    if (price == null) problems.push("ราคาไม่ใช่ตัวเลข");
    else if (price <= 0) problems.push("ราคาต้องมากกว่า 0");

    const rawFee = cell("fee");
    const fee = rawFee === "" ? 0 : parseAmount(rawFee);
    if (fee == null) problems.push("ค่าธรรมเนียมไม่ใช่ตัวเลข");
    else if (fee < 0) problems.push("ค่าธรรมเนียมต้องไม่ติดลบ");

    const rawFx = cell("fx");
    const fx = rawFx === "" ? defaultFxThbUsd : parseAmount(rawFx);
    if (fx == null) problems.push("อัตราแลกเปลี่ยนไม่ใช่ตัวเลข");
    else if (fx <= 0) problems.push("อัตราแลกเปลี่ยนต้องมากกว่า 0");

    if (gross != null && fee != null && gross <= fee) problems.push("ยอดซื้อรวมต้องมากกว่าค่าธรรมเนียม");

    if (problems.length > 0) {
      errors.push({ line: lineNumber, error: `${symbol || "แถวนี้"}: ${problems.join(", ")}` });
      continue;
    }

    rows.push({
      line: lineNumber,
      symbol,
      tradeDate: "value" in date ? date.value : "",
      grossThb: gross!,
      feeThb: fee!,
      fxThbUsd: fx!,
      priceUsd: price!,
      note: cell("note"),
    });
  }

  return { rows, errors, delimiter, hadHeader };
}

function escapeCsv(value: string | number): string {
  const text = String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export interface ExportableTransaction {
  tradeDate: string;
  symbol: string;
  grossThb: number;
  feeThb: number;
  fxThbUsd: number;
  priceUsd: number;
  note: string;
}

export function transactionsToCsv(transactions: ExportableTransaction[]): string {
  const header = "date,symbol,amount,fee,fx,price,note";
  const lines = transactions.map((tx) => [
    tx.tradeDate, tx.symbol, tx.grossThb, tx.feeThb, tx.fxThbUsd, tx.priceUsd, tx.note,
  ].map(escapeCsv).join(","));
  return [header, ...lines].join("\r\n");
}

export function downloadTextFile(filename: string, mime: string, content: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function timestampedName(prefix: string, extension: string): string {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ].join("");
  return `${prefix}-${stamp}.${extension}`;
}
