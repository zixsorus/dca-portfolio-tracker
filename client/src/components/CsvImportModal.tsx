import { useMemo, useState } from "react";
import { parseTransactionsCsv, type CsvRow } from "../dataIO";
import { Alert, Button, Label, Modal, Textarea } from "./ui";

const baht = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const number = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 4 });

const PLACEHOLDER = `date,symbol,amount,fee,fx,price,note
2026-09-01,NVDA,5000,0,32.10,180.25,DCA ก.ย.
2026-09-01,VOO,3000,12.50,32.10,285.40,`;

export interface ImportAsset {
  id: number;
  symbol: string;
}

export interface ImportSubmitItem {
  assetId: number;
  tradeDate: string;
  grossThb: number;
  feeThb: number;
  fxThbUsd: number;
  priceUsd: number;
  note: string;
}

export interface ImportRejected {
  index: number;
  line: number;
  symbol: string;
  reason: string;
}

/**
 * Paste-in CSV importer.
 *
 * Parsing happens here in the browser so the user sees exactly what will be
 * written, per row, before anything is sent. Three things are flagged before
 * submission and none of them block the import silently:
 *  - a symbol that is not in the plan          → row cannot be saved
 *  - gross <= fees                             → violates the portfolio rule
 *  - same date + symbol + amount as an existing row → possible double count
 */
export function CsvImportModal({
  assets,
  existing,
  defaultFxThbUsd,
  pending,
  onClose,
  onSubmit,
}: {
  assets: ImportAsset[];
  existing: Array<{ symbol: string; tradeDate: string; grossThb: number }>;
  defaultFxThbUsd: number | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (items: ImportSubmitItem[], rejected: ImportRejected[]) => void;
}) {
  const [text, setText] = useState("");

  const analysis = useMemo(() => {
    if (text.trim() === "") return null;
    const parsed = parseTransactionsCsv(text, defaultFxThbUsd);
    const bySymbol = new Map(assets.map((asset) => [asset.symbol, asset.id]));
    const seen = new Set(existing.map((tx) => `${tx.tradeDate}|${tx.symbol}|${tx.grossThb.toFixed(2)}`));

    const rows: Array<{ row: CsvRow; assetId: number | null; duplicate: boolean }> = parsed.rows.map((row) => {
      const duplicate = seen.has(`${row.tradeDate}|${row.symbol}|${row.grossThb.toFixed(2)}`);
      seen.add(`${row.tradeDate}|${row.symbol}|${row.grossThb.toFixed(2)}`);
      return { row, assetId: bySymbol.get(row.symbol) ?? null, duplicate };
    });
    const unknown = rows.filter((entry) => entry.assetId === null);
    return {
      rows,
      errors: parsed.errors,
      duplicates: rows.filter((entry) => entry.duplicate).length,
      unknownSymbols: [...new Set(unknown.map((entry) => entry.row.symbol))],
      total: rows.reduce((sum, entry) => sum + entry.row.grossThb, 0),
    };
  }, [text, assets, existing, defaultFxThbUsd]);

  const saveable = analysis?.rows.filter((entry) => entry.assetId !== null) ?? [];

  const submit = () => {
    if (!analysis) return;
    const items: ImportSubmitItem[] = [];
    const rejected: ImportRejected[] = [];
    analysis.rows.forEach((entry, index) => {
      if (entry.assetId === null) {
        rejected.push({ index, line: entry.row.line, symbol: entry.row.symbol, reason: "ไม่ได้อยู่ในแผนหุ้น" });
        return;
      }
      items.push({
        assetId: entry.assetId,
        tradeDate: entry.row.tradeDate,
        grossThb: entry.row.grossThb,
        feeThb: entry.row.feeThb,
        fxThbUsd: entry.row.fxThbUsd,
        priceUsd: entry.row.priceUsd,
        note: entry.row.note,
      });
    });
    for (const error of analysis.errors) {
      rejected.push({ index: 0, line: error.line, symbol: "", reason: error.error });
    }
    onSubmit(items, rejected);
  };

  return (
    <Modal title="นำเข้ารายการซื้อจาก CSV" onClose={onClose}>
      <div className="modal-form">
        <p className="credential-note">
          วางข้อความจากไฟล์ CSV ที่คัดลอกมาจากโบรกเกอร์ หัวคอลบังคับคือ <strong>date, symbol, amount, price</strong> —
          ส่วน fee, fx และ note เว้นไว้ได้ (fx จะใช้ค่าในแผน) รองรับหัวคอลภาษาไทยและวันที่แบบ D/M/YYYY
        </p>
        <Label>
          <span>ข้อมูล CSV</span>
          <Textarea rows={7} value={text} placeholder={PLACEHOLDER} onChange={(event) => setText(event.currentTarget.value)} aria-describedby="import-hint" />
        </Label>
        <p id="import-hint" className="muted">ตัวอย่างรูปแบบ</p>
        <pre className="csv-sample" aria-hidden="true">{PLACEHOLDER}</pre>

        {analysis && (
          <>
            <div className="import-summary">
              <div><span>จะบันทึก</span><strong>{saveable.length} รายการ</strong></div>
              <div><span>ยอดรวม</span><strong>{baht.format(analysis.total)}</strong></div>
              <div><span>ข้าม</span><strong>{analysis.errors.length + analysis.rows.length - saveable.length} แถว</strong></div>
            </div>
            {analysis.errors.length > 0 && (
              <Alert className="delete-confirm" role="alert">
                <strong>{analysis.errors.length} แถวอ่านไม่ได้</strong>
                <ul className="issue-list">{analysis.errors.slice(0, 6).map((error, index) => <li key={index}>บรรทัด {error.line}: {error.error}</li>)}</ul>
                {analysis.errors.length > 6 && <p>และอีก {analysis.errors.length - 6} แถว</p>}
              </Alert>
            )}
            {analysis.unknownSymbols.length > 0 && (
              <Alert className="warning-box" role="alert">
                <strong>ไม่พบหุ้น {analysis.unknownSymbols.join(", ")} ในแผน</strong>
                <p>แถวของหุ้นเหล่านี้จะถูกข้าม เพิ่มหุ้นเหล่านี้ในแท็บแผนก่อนแล้วนำเข้าใหม่</p>
              </Alert>
            )}
            {analysis.duplicates > 0 && (
              <Alert className="warning-box" role="alert">
                <strong>{analysis.duplicates} แถวอาจซ้ำกับที่มีอยู่แล้ว</strong>
                <p>วันที่ สัญลักษณ์ และยอดตรงกันทุกช่อง ถ้าบันทึกซ้ำจะนับเงินสองครั้ง — เอาออกจากไฟล์ก่อนนำเข้า</p>
              </Alert>
            )}
            {saveable.length > 0 && (
              <div className="import-preview">
                <div className="import-preview-head"><span>สัญลักษณ์</span><span>วันที่</span><span>ยอด</span><span>ราคา</span></div>
                {saveable.slice(0, 50).map((entry) => (
                  <div key={`${entry.row.line}-${entry.row.symbol}`} className="import-preview-row">
                    <strong>{entry.row.symbol}</strong>
                    <span>{entry.row.tradeDate}</span>
                    <span>{baht.format(entry.row.grossThb)}</span>
                    <span>{usd.format(entry.row.priceUsd)} · {number.format((entry.row.grossThb - entry.row.feeThb) / entry.row.fxThbUsd / entry.row.priceUsd)} หุ้น</span>
                  </div>
                ))}
                {saveable.length > 50 && <p className="muted">แสดง 50 จาก {saveable.length} รายการ</p>}
              </div>
            )}
          </>
        )}

        <div className="preset-actions">
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={submit} disabled={pending || saveable.length === 0}>{pending ? "กำลังนำเข้า…" : `นำเข้า ${saveable.length} รายการ`}</Button>
        </div>
      </div>
    </Modal>
  );
}
