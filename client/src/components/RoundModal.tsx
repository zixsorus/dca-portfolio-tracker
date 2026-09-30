import { useMemo, useState } from "react";
import { Alert, Button, Input, Label, Modal } from "./ui";

const baht = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const number = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 4 });

export interface RoundAsset {
  id: number;
  symbol: string;
  currentPriceUsd: number | null;
}

export interface RoundSlice {
  symbol: string;
  amount: number;
}

export interface RoundDraft {
  assetId: number;
  symbol: string;
  amount: string;
}

export interface RoundSubmitItem {
  assetId: number;
  tradeDate: string;
  grossThb: number;
  feeThb: number;
  fxThbUsd: number;
  priceUsd: number;
  note: string;
}

/**
 * "Save the whole round": the allocation the app already computed, turned into
 * one editable list. Every amount is pre-filled and prefilled with the latest
 * price, so a month of DCA is one confirm instead of seven forms.
 *
 * Rows can be unchecked to skip a symbol, and amounts can be edited (the sum
 * is shown live, including a warning when it no longer matches the budget).
 */
export function RoundModal({
  slices,
  assets,
  fxThbUsd,
  today,
  note,
  pending,
  onClose,
  onSubmit,
}: {
  slices: RoundSlice[];
  assets: RoundAsset[];
  fxThbUsd: number | null;
  today: string;
  note: string;
  pending: boolean;
  onClose: () => void;
  onSubmit: (items: RoundSubmitItem[]) => void;
}) {
  const drafts = useMemo<RoundDraft[]>(() => {
    return slices.flatMap((slice) => {
      const asset = assets.find((candidate) => candidate.symbol === slice.symbol);
      if (!asset) return [];
      return [{ assetId: asset.id, symbol: slice.symbol, amount: slice.amount.toFixed(2) }];
    });
  }, [slices, assets]);
  const [rows, setRows] = useState(drafts);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());

  const total = rows.reduce((sum, row) => sum + (skipped.has(row.assetId) ? 0 : Number(row.amount) || 0), 0);
  const budget = slices.reduce((sum, slice) => sum + slice.amount, 0);
  const active = rows.filter((row) => !skipped.has(row.assetId));
  const problems = active
    .filter((row) => {
      const amount = Number(row.amount);
      const asset = assets.find((candidate) => candidate.id === row.assetId);
      return !Number.isFinite(amount) || amount <= 0 || asset?.currentPriceUsd == null;
    })
    .map((row) => row.symbol);

  const submit = () => {
    onSubmit(
      active.map((row) => {
        const asset = assets.find((candidate) => candidate.id === row.assetId)!;
        return {
          assetId: row.assetId,
          tradeDate: today,
          grossThb: Number(row.amount),
          feeThb: 0,
          fxThbUsd: fxThbUsd ?? 0,
          priceUsd: asset.currentPriceUsd ?? 0,
          note,
        };
      }),
    );
  };

  return (
    <Modal title={`บันทึกทั้งรอบ · ${baht.format(budget)}`} onClose={onClose}>
      <div className="modal-form">
        <p className="credential-note">
          ยอดนี้มาจากเป้าหมายน้ำหนักของแต่ละตัว ยิงราคาวันนี้และอัตราแลกเปลี่ยนล่าสุดมาให้แล้ว แก้ยอดเองได้ก่อนบันทึก
          {fxThbUsd == null && " · ยังไม่ได้ตั้ง FX ในแผน กรุณาแก้ยอดเอง"}
        </p>
        <div className="round-list">
          {rows.length === 0 && <p className="muted">ยังไม่มีข้อเสนอการจัดสรรงบรอบนี้</p>}
          {rows.map((row) => {
            const asset = assets.find((candidate) => candidate.id === row.assetId)!;
            const amount = Number(row.amount);
            const units = asset.currentPriceUsd && fxThbUsd && amount > 0 ? (amount / fxThbUsd) / asset.currentPriceUsd : null;
            const off = skipped.has(row.assetId);
            return (
              <div key={row.assetId} className={off ? "round-row off" : "round-row"}>
                <label className="round-check">
                  <input type="checkbox" checked={!off} onChange={() => setSkipped((previous) => {
                    const next = new Set(previous);
                    if (next.has(row.assetId)) next.delete(row.assetId);
                    else next.add(row.assetId);
                    return next;
                  })} aria-label={`ซื้อ ${row.symbol}`} />
                </label>
                <div className="round-symbol"><strong>{row.symbol}</strong><small>{asset.currentPriceUsd ? `${usd.format(asset.currentPriceUsd)} · ${units == null ? "" : `${number.format(units)} หุ้น`}` : "ยังไม่มีราคาล่าสุด"}</small></div>
                <Label className="round-amount">
                  <span className="sr-only">ยอดซื้อ {row.symbol} (บาท)</span>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={row.amount}
                    disabled={off}
                    onChange={(event) => setRows((previous) => previous.map((item) => item.assetId === row.assetId ? { ...item, amount: event.currentTarget.value } : item))}
                  />
                </Label>
              </div>
            );
          })}
        </div>
        {active.length > 0 && <div className="round-total"><span>รวม {active.length} รายการ</span><strong>{baht.format(total)}</strong></div>}
        {problems.length > 0 && <Alert className="warning-box" role="alert"><strong>แก้ยอดของ {problems.join(", ")}</strong><p>ยอดต้องมากกว่า 0 และหุ้นต้องมีราคาล่าสุดที่ดึงมาแล้ว</p></Alert>}
        {active.length > 0 && Math.abs(total - budget) > 0.01 && <p className="muted">ยอดรวมต่างจากงบประมาณ {baht.format(Math.abs(total - budget))} — บันทึกตามที่แก้ไว้</p>}
        <div className="preset-actions">
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={submit} disabled={pending || active.length === 0 || problems.length > 0}>{pending ? "กำลังบันทึก…" : `บันทึก ${active.length} รายการ`}</Button>
        </div>
      </div>
    </Modal>
  );
}
