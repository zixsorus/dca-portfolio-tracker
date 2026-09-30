import { useRef, useState } from "react";
import { downloadTextFile, timestampedName, transactionsToCsv } from "../dataIO";
import { Alert, Button, Modal } from "./ui";

const number = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 });

export interface BackupSource {
  settings: {
    monthlyDca: number;
    goalThb: number;
    expectedAnnualReturn: number;
    fxThbUsd: number | null;
    dailyAlertThreshold: number;
    drawdownThreshold: number;
    rebalanceTolerance: number;
  };
  assets: Array<{ symbol: string; name: string; sector: string; targetWeight: number }>;
  transactions: Array<{
    symbol: string;
    tradeDate: string;
    grossThb: number;
    feeThb: number;
    fxThbUsd: number;
    priceUsd: number;
    note: string;
  }>;
}

export interface BackupPayload extends BackupSource {
  version: number;
  exportedAt: string;
}

/** JSON round-trips through `importBackup`; the CSV is for spreadsheets. */
export function buildBackup(source: BackupSource): BackupPayload {
  return { version: 1, exportedAt: new Date().toISOString(), ...source };
}

function describePayload(payload: BackupPayload): string[] {
  return [
    `หุ้น ${payload.assets.length} ตัว`,
    `รายการซื้อ ${payload.transactions.length} รายการ`,
    `ยอดลงทุนรวม ${number.format(payload.transactions.reduce((sum, tx) => sum + tx.grossThb, 0))} บาท`,
  ];
}

/**
 * Backup and restore. Exports are assembled in the browser from data
 * `getPortfolio` already returned, so neither costs an API call.
 *
 * Restore is merge-only by design — the server never overwrites or deletes
 * during an import, and settings are only written when the local row is
 * missing. The confirm step spells that out before anything is sent.
 */
export function BackupModal({
  source,
  pending,
  onClose,
  onRestore,
}: {
  source: BackupSource;
  pending: boolean;
  onClose: () => void;
  onRestore: (payload: BackupPayload) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [preview, setPreview] = useState<BackupPayload | null>(null);

  const exportJson = () => {
    downloadTextFile(timestampedName("dca-backup", "json"), "application/json", JSON.stringify(buildBackup(source), null, 2));
  };
  const exportCsv = () => {
    // BOM keeps Excel from mangling the Thai text.
    downloadTextFile(timestampedName("dca-transactions", "csv"), "text/csv", `﻿${transactionsToCsv(source.transactions)}`);
  };

  const readFile = async (file: File) => {
    setFileError(null);
    setPreview(null);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const payload = parsed as Partial<BackupPayload>;
      if (typeof payload.version !== "number" || !Array.isArray(payload.assets) || !Array.isArray(payload.transactions) || !payload.settings) {
        setFileError("ไฟล์นี้ไม่ใช่แคปเชอร์ของแอปนี้");
        return;
      }
      setPreview(payload as BackupPayload);
    } catch {
      setFileError("อ่านไฟล์ JSON ไม่สำเร็จ กรุณาตรวจสอบว่าเป็นไฟล์ .json");
    }
  };

  return (
    <Modal title="สำรองและกู้คืนข้อมูล" onClose={onClose}>
      <div className="modal-form">
        <section className="backup-block">
          <h3>ดาวน์โหลด</h3>
          <p className="muted">เก็บไว้นอกเครื่อง เผื่อข้อมูลหายหรือย้ายเครื่อง</p>
          <div className="button-row">
            <Button variant="secondary" onClick={exportCsv}>รายการซื้อ (.csv)</Button>
            <Button onClick={exportJson}>แคปเชอร์ทั้งหมด (.json)</Button>
          </div>
        </section>

        <section className="backup-block">
          <h3>กู้คืนจากแคปเชอร์</h3>
          <p className="muted">เพิ่มข้อมูลที่ยังไม่มีเท่านั้น ไม่ทับและไม่ลบสิ่งที่มีอยู่</p>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="file-input"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void readFile(file);
            }}
          />
          <Button variant="secondary" onClick={() => fileInput.current?.click()}>เลือกไฟล์ .json</Button>
          {fileError && <Alert className="delete-confirm" role="alert"><strong>อ่านไฟล์ไม่ได้</strong><p>{fileError}</p></Alert>}
          {preview && (
            <Alert className="warning-box" role="alert">
              <strong>พบข้อมูลในไฟล์</strong>
              <ul className="issue-list">{describePayload(preview).map((line) => <li key={line}>{line}</li>)}</ul>
              <p>หุ้นที่มีสัญลักษณ์ตรงกันจะถูกข้าม รายการซื้อจะถูกเพิ่มทั้งหมด</p>
              <div className="confirm-row">
                <Button variant="secondary" onClick={() => setPreview(null)}>ยกเลิก</Button>
                <Button onClick={() => onRestore(preview)} disabled={pending}>{pending ? "กำลังกู้คืน…" : "ยืนยันกู้คืน"}</Button>
              </div>
            </Alert>
          )}
        </section>

        <Button variant="secondary" onClick={onClose}>ปิด</Button>
      </div>
    </Modal>
  );
}
