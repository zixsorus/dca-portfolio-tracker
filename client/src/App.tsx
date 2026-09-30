import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { buildAllocation } from "../../shared/allocation";
import { api, type ApiResponse } from "./api";
import { BackupModal, type BackupPayload } from "./components/BackupModal";
import { CsvImportModal, type ImportRejected, type ImportSubmitItem } from "./components/CsvImportModal";
import { HistorySection } from "./components/HistorySection";
import { PerformanceCard } from "./components/PerformanceCard";
import { RoundModal, type RoundSubmitItem } from "./components/RoundModal";
import { Sparkline } from "./components/Sparkline";
import { Alert, Button, Card, DatePicker, Input, Label, Modal, Select, Tabs, TabsList, TabsTrigger, Textarea, Toaster } from "./components/ui";
import { buildHistorySeries, computeXirr, type HistorySeries } from "./finance";

type Portfolio = ApiResponse<typeof api, "getPortfolio">;
type Asset = Portfolio["assets"][number];
type Transaction = Portfolio["transactions"][number];
type Tab = "overview" | "activity" | "plan";
type WeightPreset = "equal" | "trend";
type PresetPreview = ApiResponse<typeof api, "previewWeightPreset">;

const PRESETS: Array<{ id: WeightPreset; label: string; hint: string }> = [
  { id: "equal", label: "เท่ากัน", hint: "แบ่ง 100% เท่ากันทุกตัว" },
  { id: "trend", label: "ตามเทรนด์", hint: "อิงผลตอบแทนราคา 6 เดือน" },
];

const COLORS = ["#24A57A", "#E59A2F", "#4F7CAC", "#D66A5E", "#8C6BB1", "#2A9D8F", "#6C7A89", "#CC8F42", "#3A86A8"];
const baht = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const number = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 4 });
const percent = new Intl.NumberFormat("th-TH", { style: "percent", maximumFractionDigits: 1 });

function localDateValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function optionalPositive(value: FormDataEntryValue | null) {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

type FormErrors = Record<string, string>;

function FieldError({ id, message }: { id: string; message?: string }) {
  const visible = Boolean(message);
  return (
    <span
      id={id}
      className="field-error"
      data-visible={visible ? "true" : "false"}
      role={visible ? "alert" : undefined}
      aria-hidden={!visible}
      aria-live="polite"
    >
      {message ?? "\u00a0"}
    </span>
  );
}

function Field({ label, name, type = "text", defaultValue, value, step, min, placeholder, required = true, error, onClearError, onValueChange, errorId = `${name}-error` }: {
  label: string; name: string; type?: string; defaultValue?: string | number | null; value?: string | number; step?: string; min?: string; placeholder?: string; required?: boolean; error?: string; onClearError?: () => void; onValueChange?: (value: string) => void; errorId?: string;
}) {
  return (
    <Label>
      <span>{label}</span>
      <Input
        name={name}
        type={type}
        defaultValue={value === undefined ? (defaultValue ?? "") : undefined}
        value={value}
        step={step}
        min={min}
        placeholder={placeholder}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => { onValueChange?.(event.currentTarget.value); onClearError?.(); }}
      />
      <FieldError id={errorId} message={error} />
    </Label>
  );
}

function textValue(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}

function numericValue(form: FormData, name: string) {
  const raw = textValue(form, name);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function App() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [transactionOpen, setTransactionOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null);
  const [roundOpen, setRoundOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [assetOpen, setAssetOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [transactionErrors, setTransactionErrors] = useState<FormErrors>({});
  const [transactionDraft, setTransactionDraft] = useState({ assetId: "", grossThb: "", feeThb: "0", fxThbUsd: "", priceUsd: "" });
  const [settingsErrors, setSettingsErrors] = useState<FormErrors>({});
  const [assetErrors, setAssetErrors] = useState<FormErrors>({});
  const [editAssetErrors, setEditAssetErrors] = useState<FormErrors>({});
  const [presetPreview, setPresetPreview] = useState<PresetPreview | null>(null);

  const clearError = (setter: (value: FormErrors | ((previous: FormErrors) => FormErrors)) => void, name: string) => {
    setter((previous) => {
      if (!previous[name]) return previous;
      const next = { ...previous };
      delete next[name];
      return next;
    });
  };

  const portfolio = useQuery({ queryKey: ["portfolio"], queryFn: () => api.getPortfolio({}) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["portfolio"] });

  // Price history is only needed for the backward-looking charts, so it is a
  // separate query and can be refetched without re-reading the portfolio.
  const priceHistory = useQuery({ queryKey: ["priceHistory"], queryFn: () => api.getPriceHistory({}) });
  const invalidateHistory = () => queryClient.invalidateQueries({ queryKey: ["priceHistory"] });

  const addTransaction = useMutation({
    mutationFn: (input: Parameters<typeof api.addTransaction>[0]) => api.addTransaction(input),
    onSuccess: async (result) => {
      if (!result.ok) { setTransactionErrors({ assetId: result.error ?? "บันทึกไม่สำเร็จ" }); return; }
      await refresh(); setTransactionErrors({}); setTransactionOpen(false); toast.success("บันทึกรายการซื้อแล้ว");
    },
    onError: () => toast.error("บันทึกรายการซื้อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"),
  });
  const updateTransaction = useMutation({
    mutationFn: (input: Parameters<typeof api.updateTransaction>[0]) => api.updateTransaction(input),
    onSuccess: async (result) => {
      if (!result.ok) { setTransactionErrors({ assetId: result.error ?? "แก้ไขไม่สำเร็จ" }); return; }
      await refresh();
      setTransactionErrors({});
      setTransactionOpen(false);
      setEditingTransaction(null);
      toast.success("แก้ไขรายการซื้อแล้ว");
    },
    onError: () => toast.error("แก้ไขรายการซื้อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"),
  });
  const deleteTransaction = useMutation({
    mutationFn: (id: number) => api.deleteTransaction({ id }),
    onSuccess: async (result) => {
      if (!result.ok) { toast.error(result.error ?? "ลบรายการไม่สำเร็จ"); return; }
      setDeletingTransaction(null);
      await refresh();
      toast.success("ลบรายการแล้ว");
    },
    onError: () => toast.error("ลบรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"),
  });
  const saveSettings = useMutation({
    mutationFn: (input: Parameters<typeof api.updateSettings>[0]) => api.updateSettings(input),
    onSuccess: async () => { await refresh(); toast.success("บันทึกแผนแล้ว"); },
    onError: () => toast.error("บันทึกแผนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"),
  });
  const addAsset = useMutation({
    mutationFn: (input: Parameters<typeof api.addAsset>[0]) => api.addAsset(input),
    onSuccess: async (result) => {
      if (!result.ok) { setAssetErrors({ symbol: result.error ?? "เพิ่มหุ้นไม่สำเร็จ" }); return; }
      await refresh(); setAssetErrors({}); setAssetOpen(false); toast.success("เพิ่มหุ้นแล้ว");
    },
    onError: () => toast.error("เพิ่มหุ้นไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"),
  });
  const updateAsset = useMutation({
    mutationFn: (input: Parameters<typeof api.updateAsset>[0]) => api.updateAsset(input),
    onSuccess: async (result) => {
      if (!result.ok) { setEditAssetErrors({ symbol: result.error ?? "แก้ไขหุ้นไม่สำเร็จ" }); return; }
      await refresh(); setEditAssetErrors({}); setEditingAsset(null); setDeleteConfirmOpen(false); toast.success("อัปเดตหุ้นแล้ว");
    },
    onError: () => toast.error("อัปเดตหุ้นไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"),
  });
  const deleteAsset = useMutation({
    mutationFn: (id: number) => api.deleteAsset({ id }),
    onSuccess: async (result) => {
      if (!result.ok) { toast.error(result.error ?? "ลบหุ้นไม่สำเร็จ"); return; }
      await refresh(); setEditingAsset(null); setDeleteConfirmOpen(false); toast.success("ลบหุ้นและรายการซื้อที่เกี่ยวข้องแล้ว");
    },
    onError: () => toast.error("ลบหุ้นไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"),
  });
  const refreshMarketPrices = useMutation({
    mutationFn: () => api.refreshMarketPrices({}),
    onSuccess: async (result) => {
      if (result.updated > 0) { await refresh(); await invalidateHistory(); }
      if (!result.ok) {
        const failedNote = result.failedSymbols.length > 0 ? ` (${result.failedSymbols.join(", ")})` : "";
        toast.error(`${result.error ?? "อัปเดตราคาไม่สำเร็จ"}${failedNote}`);
        return;
      }
      const description = result.failedSymbols.length > 0 ? `ไม่พบข้อมูล ${result.failedSymbols.join(", ")}` : undefined;
      toast.success(`อัปเดตราคา ${result.updated} ตัวแล้ว`, { description });
    },
    onError: () => toast.error("บริการราคาตลาดยังไม่พร้อม กรุณาลองใหม่อีกครั้ง"),
  });
  const previewWeightPreset = useMutation({
    mutationFn: (preset: WeightPreset) => api.previewWeightPreset({ preset }),
    onSuccess: (result) => {
      if (!result.ok) {
        const missing = result.missingSymbols.length > 0 ? `: ${result.missingSymbols.join(", ")}` : "";
        toast.error(`${result.error ?? "สร้างตัวอย่างพรีเซ็ตไม่สำเร็จ"}${missing}`);
        return;
      }
      setPresetPreview(result);
    },
    onError: () => toast.error("ดึงข้อมูลสำหรับพรีเซ็ตไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"),
  });
  const importTransactions = useMutation({
    mutationFn: (items: ImportSubmitItem[]) => api.importTransactions({ items }),
    onSuccess: async (result) => {
      await refresh();
      if (result.imported > 0) {
        const skippedNote = result.failed.length > 0 ? ` ข้าม ${result.failed.length} รายการที่บันทึกไม่ได้` : undefined;
        toast.success(`บันทึก ${result.imported} รายการแล้ว`, { description: skippedNote });
      }
      if (result.failed.length > 0) {
        toast.error(`ข้าม ${result.failed.length} รายการ`, {
          description: result.failed.slice(0, 3).map((row) => `แถวที่ ${row.index + 1}${row.symbol ? ` (${row.symbol})` : ""}: ${row.error}`).join(" · "),
        });
      }
      if (result.imported === 0) return;
      setImportOpen(false);
      setRoundOpen(false);
    },
    onError: () => toast.error("บันทึกรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"),
  });
  const importBackup = useMutation({
    mutationFn: (payload: BackupPayload) => api.importBackup({ payload }),
    onSuccess: async (result) => {
      if (!result.ok) { toast.error(result.error ?? "กู้คืนข้อมูลไม่สำเร็จ"); return; }
      await refresh();
      setBackupOpen(false);
      const parts = [
        result.addedTransactions > 0 ? `เพิ่มรายการซื้อ ${result.addedTransactions} รายการ` : null,
        result.addedAssets > 0 ? `เพิ่มหุ้น ${result.addedAssets} ตัว` : null,
        result.skippedAssets > 0 ? `ข้ามหุ้นที่มีอยู่แล้ว ${result.skippedAssets} ตัว` : null,
        result.skippedTransactions > 0 ? `ข้ามรายการที่หาหุ้นไม่เจอ ${result.skippedTransactions} รายการ` : null,
      ].filter((part): part is string => part !== null);
      toast.success("กู้คืนข้อมูลแล้ว", { description: parts.length > 0 ? parts.join(" · ") : "ไม่มีข้อมูลใหม่ที่ต้องเพิ่ม" });
    },
    onError: () => toast.error("กู้คืนข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"),
  });
  const backfillPriceHistory = useMutation({
    mutationFn: () => api.backfillPriceHistory({}),
    onSuccess: async (result) => {
      await invalidateHistory();
      if (!result.ok) {
        const failedNote = result.failedSymbols.length > 0 ? ` (${result.failedSymbols.join(", ")})` : "";
        toast.error(`${result.error ?? "ดึงราคาย้อนหลังไม่สำเร็จ"}${failedNote}`);
        return;
      }
      const failedNote = result.failedSymbols.length > 0 ? ` ไม่พบข้อมูล ${result.failedSymbols.join(", ")}` : undefined;
      toast.success(`เก็บราคาย้อนหลัง ${number.format(result.rows)} จุด`, { description: failedNote });
    },
    onError: () => toast.error("ดึงราคาย้อนหลังไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"),
  });
  const applyWeightPreset = useMutation({
    mutationFn: (preview: PresetPreview) => api.applyWeightPreset({ items: preview.items.map((item) => ({ id: item.id, weight: item.weight })) }),
    onSuccess: async (result) => {
      if (!result.ok) { toast.error(result.error ?? "ใช้พรีเซ็ตไม่สำเร็จ"); return; }
      await refresh();
      setPresetPreview(null);
      toast.success("อัปเดตน้ำหนักเป้าหมายแล้ว");
    },
    onError: () => toast.error("ใช้พรีเซ็ตไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"),
  });

  const computed = useMemo(() => {
    if (!portfolio.data) return null;
    const { assets, transactions, settings } = portfolio.data;
    const rows = assets.map((asset) => {
      const own = transactions.filter((tx) => tx.assetId === asset.id);
      const units = own.reduce((sum, tx) => sum + (tx.grossThb - tx.feeThb) / tx.fxThbUsd / tx.priceUsd, 0);
      const investedThb = own.reduce((sum, tx) => sum + tx.grossThb, 0);
      const netThb = own.reduce((sum, tx) => sum + tx.grossThb - tx.feeThb, 0);
      const costUsd = own.reduce((sum, tx) => sum + (tx.grossThb - tx.feeThb) / tx.fxThbUsd, 0);
      const marketValueThb = asset.currentPriceUsd && settings.fxThbUsd ? units * asset.currentPriceUsd * settings.fxThbUsd : null;
      const referenceValueThb = marketValueThb ?? investedThb;
      const pnlThb = marketValueThb == null ? null : marketValueThb - investedThb;
      const dayChange = asset.currentPriceUsd && asset.previousCloseUsd ? asset.currentPriceUsd / asset.previousCloseUsd - 1 : null;
      const drawdown = asset.currentPriceUsd && asset.high52wUsd ? asset.currentPriceUsd / asset.high52wUsd - 1 : null;
      return { ...asset, units, investedThb, netThb, costUsd, averageCostUsd: units > 0 ? costUsd / units : 0, marketValueThb, referenceValueThb, pnlThb, dayChange, drawdown };
    });
    const totalInvested = rows.reduce((sum, row) => sum + row.investedThb, 0);
    const totalValue = rows.reduce((sum, row) => sum + row.referenceValueThb, 0);
    const exactMarketValue = rows.reduce((sum, row) => sum + (row.marketValueThb ?? 0), 0);
    const hasFallbacks = rows.some((row) => row.investedThb > 0 && row.marketValueThb == null);
    const totalTarget = rows.reduce((sum, row) => sum + row.targetWeight, 0);
    const withWeights = rows.map((row) => {
      const actualWeight = totalValue > 0 ? row.referenceValueThb / totalValue : 0;
      const normalizedTarget = totalTarget > 0 ? row.targetWeight / totalTarget : 0;
      const rebalanceDelta = actualWeight - normalizedTarget;
      const rebalanceSignal = Math.abs(rebalanceDelta) >= settings.rebalanceTolerance
        ? rebalanceDelta > 0
          ? "slow"
          : "add"
        : "hold";
      return { ...row, actualWeight, normalizedTarget, rebalanceDelta, rebalanceSignal };
    });
    const desiredTotal = totalValue + settings.monthlyDca;
    const needs = withWeights.map((row) => ({ ...row, need: Math.max(0, row.normalizedTarget * desiredTotal - row.referenceValueThb) }));
    const allocation = buildAllocation(
      needs.map((row) => ({ symbol: row.symbol, need: row.need, normalizedTarget: row.normalizedTarget })),
      settings.monthlyDca,
    );
    const monthlyRate = settings.expectedAnnualReturn / 12;
    const projection: Array<{ month: number; value: number }> = [{ month: 0, value: totalValue }];
    let projected = totalValue;
    let month = 0;
    while (projected < settings.goalThb && month < 600) {
      month += 1;
      projected = projected * (1 + monthlyRate) + settings.monthlyDca;
      if (month % 6 === 0 || projected >= settings.goalThb) projection.push({ month, value: Math.round(projected) });
    }
    return { rows: withWeights, totalInvested, totalValue, exactMarketValue, hasFallbacks, totalTarget, allocation, projection, monthsToGoal: projected >= settings.goalThb ? month : null };
  }, [portfolio.data]);

  // Backward-looking series, derived from daily closes + the trade log. The
  // FX convention matches the headline numbers: the *current* plan rate, not
  // each purchase's historical rate.
  const history = useMemo(() => {
    const series: HistorySeries[] = (priceHistory.data?.series ?? []).map((entry) => ({
      assetId: entry.assetId,
      symbol: entry.symbol,
      points: entry.points,
    }));
    if (!portfolio.data) return { rows: [], series };
    const rows = buildHistorySeries(series, portfolio.data.transactions, portfolio.data.settings.fxThbUsd);
    return { rows, series };
  }, [priceHistory.data, portfolio.data]);

  const performance = useMemo(() => {
    if (!portfolio.data) return null;
    return computeXirr(portfolio.data.transactions, computed?.totalValue ?? 0, Date.now());
  }, [portfolio.data, computed?.totalValue]);

  if (portfolio.isPending) return <div className="state-screen"><span className="spinner" />กำลังเปิดสมุดพอร์ต…</div>;
  if (portfolio.error || !portfolio.data || !computed) return <div className="state-screen"><strong>เปิดข้อมูลไม่สำเร็จ</strong><Button onClick={() => portfolio.refetch()}>ลองอีกครั้ง</Button></div>;

  const { settings, assets, transactions } = portfolio.data;
  const openTransaction = () => {
    const firstAsset = assets[0];
    setEditingTransaction(null);
    setTransactionDraft({
      assetId: firstAsset ? String(firstAsset.id) : "",
      grossThb: "",
      feeThb: "0",
      fxThbUsd: settings.fxThbUsd ? String(settings.fxThbUsd) : "",
      priceUsd: firstAsset?.currentPriceUsd ? String(firstAsset.currentPriceUsd) : "",
    });
    setTransactionErrors({});
    setTransactionOpen(true);
  };
  const openTransactionEdit = (tx: Transaction) => {
    setEditingTransaction(tx);
    setTransactionDraft({
      assetId: String(tx.assetId),
      grossThb: String(tx.grossThb),
      feeThb: String(tx.feeThb),
      fxThbUsd: String(tx.fxThbUsd),
      priceUsd: String(tx.priceUsd),
    });
    setTransactionErrors({});
    setTransactionOpen(true);
  };
  const closeTransaction = () => {
    setTransactionOpen(false);
    setEditingTransaction(null);
    setTransactionErrors({});
  };
  const selectedTransactionAsset = assets.find((asset) => String(asset.id) === transactionDraft.assetId) ?? null;
  const transactionGross = Number(transactionDraft.grossThb);
  const transactionFee = Number(transactionDraft.feeThb);
  const transactionFx = Number(transactionDraft.fxThbUsd);
  const transactionPrice = Number(transactionDraft.priceUsd);
  const calculatedPurchaseUsd = Number.isFinite(transactionGross) && Number.isFinite(transactionFee) && Number.isFinite(transactionFx) && transactionGross > transactionFee && transactionFx > 0
    ? (transactionGross - transactionFee) / transactionFx
    : null;
  const calculatedUnits = calculatedPurchaseUsd != null && Number.isFinite(transactionPrice) && transactionPrice > 0
    ? calculatedPurchaseUsd / transactionPrice
    : null;
  const latestPriceUpdatedAt = assets.reduce<string | null>((latest, asset) => {
    if (!asset.priceUpdatedAt) return latest;
    if (!latest || new Date(asset.priceUpdatedAt) > new Date(latest)) return asset.priceUpdatedAt;
    return latest;
  }, null);
  const progress = settings.goalThb > 0 ? computed.totalValue / settings.goalThb : 0;
  // P&L keeps the original definition: market value minus *gross* invested, so
  // brokerage fees always read as a loss. The net line below is additive
  // context only — it is computed over exactly the same rows as `pnl` so the
  // two numbers always reconcile.
  const pricedRows = computed.rows.filter((row) => row.marketValueThb != null);
  const pnl = computed.exactMarketValue > 0
    ? computed.exactMarketValue - pricedRows.reduce((sum, row) => sum + row.investedThb, 0)
    : null;
  const pricedFees = pricedRows.reduce((sum, row) => sum + (row.investedThb - row.netThb), 0);
  const pnlNet = pnl == null ? null : pnl + pricedFees;

  function onSubmitTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const assetId = numericValue(form, "assetId");
    const tradeDate = textValue(form, "tradeDate");
    const grossThb = numericValue(form, "grossThb");
    const feeThb = numericValue(form, "feeThb");
    const fxThbUsd = numericValue(form, "fxThbUsd");
    const priceUsd = numericValue(form, "priceUsd");
    const note = String(form.get("note") ?? "").trim();
    const errors: FormErrors = {};
    if (assetId == null || assetId <= 0) errors.assetId = "กรุณาเลือกหุ้น";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tradeDate)) errors.tradeDate = "กรุณาเลือกวันที่ซื้อ";
    if (grossThb == null || grossThb <= 0) errors.grossThb = "กรุณากรอกยอดซื้อที่มากกว่า 0";
    if (feeThb == null || feeThb < 0) errors.feeThb = "กรุณากรอกค่าธรรมเนียมตั้งแต่ 0 ขึ้นไป";
    if (grossThb != null && feeThb != null && grossThb <= feeThb) errors.grossThb = "ยอดซื้อรวมต้องมากกว่าค่าธรรมเนียม";
    if (fxThbUsd == null || fxThbUsd <= 0) errors.fxThbUsd = "กรุณากรอกอัตราแลกเปลี่ยนที่มากกว่า 0";
    if (priceUsd == null || priceUsd <= 0) errors.priceUsd = "กรุณากรอกราคาซื้อที่มากกว่า 0";
    if (note.length > 240) errors.note = "หมายเหตุต้องไม่เกิน 240 ตัวอักษร";
    if (Object.keys(errors).length > 0) { setTransactionErrors(errors); return; }
    setTransactionErrors({});
    const values = { assetId: assetId ?? 0, tradeDate, grossThb: grossThb ?? 0, feeThb: feeThb ?? 0, fxThbUsd: fxThbUsd ?? 0, priceUsd: priceUsd ?? 0, note };
    if (editingTransaction) updateTransaction.mutate({ id: editingTransaction.id, ...values });
    else addTransaction.mutate(values);
  }

  function onSaveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const monthlyDca = numericValue(form, "monthlyDca");
    const goalThb = numericValue(form, "goalThb");
    const expectedAnnualReturn = numericValue(form, "expectedAnnualReturn");
    const fxThbUsd = numericValue(form, "fxThbUsd");
    const dailyAlertThreshold = numericValue(form, "dailyAlertThreshold");
    const drawdownThreshold = numericValue(form, "drawdownThreshold");
    const rebalanceTolerance = numericValue(form, "rebalanceTolerance");
    const errors: FormErrors = {};
    if (monthlyDca == null || monthlyDca <= 0) errors.monthlyDca = "กรุณากรอกยอด DCA ที่มากกว่า 0";
    if (goalThb == null || goalThb <= 0) errors.goalThb = "กรุณากรอกเป้าหมายที่มากกว่า 0";
    if (expectedAnnualReturn == null || expectedAnnualReturn < -99 || expectedAnnualReturn > 200) errors.expectedAnnualReturn = "กรุณากรอกค่าระหว่าง -99 ถึง 200%";
    if (textValue(form, "fxThbUsd") && (fxThbUsd == null || fxThbUsd <= 0)) errors.fxThbUsd = "กรุณากรอกอัตราแลกเปลี่ยนที่มากกว่า 0";
    for (const [name, value] of [["dailyAlertThreshold", dailyAlertThreshold], ["drawdownThreshold", drawdownThreshold], ["rebalanceTolerance", rebalanceTolerance]] as const) {
      if (value == null || value < 0 || value > 100) errors[name] = "กรุณากรอกค่าระหว่าง 0 ถึง 100%";
    }
    if (Object.keys(errors).length > 0) { setSettingsErrors(errors); return; }
    setSettingsErrors({});
    saveSettings.mutate({
      monthlyDca: monthlyDca ?? 0, goalThb: goalThb ?? 0, expectedAnnualReturn: (expectedAnnualReturn ?? 0) / 100,
      fxThbUsd: fxThbUsd && fxThbUsd > 0 ? fxThbUsd : null, dailyAlertThreshold: (dailyAlertThreshold ?? 0) / 100,
      drawdownThreshold: (drawdownThreshold ?? 0) / 100, rebalanceTolerance: (rebalanceTolerance ?? 0) / 100,
    });
  }

  function validateAssetForm(form: FormData, includePrices: boolean) {
    const errors: FormErrors = {};
    const symbol = textValue(form, "symbol");
    const name = textValue(form, "name");
    const sector = textValue(form, "sector");
    const targetWeight = numericValue(form, "targetWeight");
    if (!symbol) errors.symbol = "กรุณากรอกสัญลักษณ์หุ้น";
    else if (symbol.length > 12) errors.symbol = "สัญลักษณ์ต้องไม่เกิน 12 ตัวอักษร";
    if (!name) errors.name = "กรุณากรอกชื่อหุ้นหรือ ETF";
    else if (name.length > 80) errors.name = "ชื่อต้องไม่เกิน 80 ตัวอักษร";
    if (!sector) errors.sector = "กรุณากรอกกลุ่มของสินทรัพย์";
    else if (sector.length > 80) errors.sector = "กลุ่มต้องไม่เกิน 80 ตัวอักษร";
    if (targetWeight == null || targetWeight < 0 || targetWeight > 100) errors.targetWeight = "กรุณากรอกสัดส่วนระหว่าง 0 ถึง 100%";
    if (includePrices) {
      for (const name of ["currentPriceUsd", "previousCloseUsd", "high52wUsd"] as const) {
        const raw = textValue(form, name);
        const value = numericValue(form, name);
        if (raw && (value == null || value <= 0)) errors[name] = "กรุณากรอกราคาที่มากกว่า 0";
      }
    }
    return errors;
  }

  function onAddAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const errors = validateAssetForm(form, false);
    if (Object.keys(errors).length > 0) { setAssetErrors(errors); return; }
    setAssetErrors({});
    addAsset.mutate({ symbol: textValue(form, "symbol"), name: textValue(form, "name"), sector: textValue(form, "sector"), targetWeight: (numericValue(form, "targetWeight") ?? 0) / 100 });
  }

  function onUpdateAsset(event: FormEvent<HTMLFormElement>, asset: Asset) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const errors = validateAssetForm(form, true);
    if (Object.keys(errors).length > 0) { setEditAssetErrors(errors); return; }
    setEditAssetErrors({});
    updateAsset.mutate({ id: asset.id, symbol: textValue(form, "symbol"), name: textValue(form, "name"), sector: textValue(form, "sector"), targetWeight: (numericValue(form, "targetWeight") ?? 0) / 100,
      currentPriceUsd: optionalPositive(form.get("currentPriceUsd")), previousCloseUsd: optionalPositive(form.get("previousCloseUsd")), high52wUsd: optionalPositive(form.get("high52wUsd")) });
  }

  return (
    <div className="app-shell">
      <div aria-hidden="true" style={{ height: "env(safe-area-inset-top)", background: "var(--background)" }} />
      <Toaster />
      <main className="content-wrap">
        {tab === "overview" && <>
          <Card className="goal-hero" aria-label="ความคืบหน้าเป้าหมาย">
            <div className="goal-copy">
              <p className="section-kicker">เป้าหมายของพอร์ต</p>
              <h1>{baht.format(settings.goalThb)}</h1>
              <p className="hero-balance">ตอนนี้ <strong>{baht.format(computed.totalValue)}</strong></p>
              <p className="hero-note">{computed.hasFallbacks ? "รายการที่ยังไม่มีราคาจะใช้ยอดลงทุนเป็นค่าประมาณ" : "คำนวณจากราคาที่บันทึกล่าสุด"}</p>
            </div>
            <div className="progress-orbit" style={{ "--progress": `${Math.min(progress, 1) * 360}deg` } as CSSProperties}>
              <div><strong>{percent.format(progress)}</strong><span>ของเป้าหมาย</span></div>
            </div>
            <div className="goal-line"><span style={{ width: `${Math.min(progress, 1) * 100}%` }} /></div>
            <div className="hero-stats">
              <div><span>เงินลงทุน</span><strong>{baht.format(computed.totalInvested)}</strong></div>
              <div><span>กำไร/ขาดทุน</span><strong className={pnl != null && pnl < 0 ? "negative" : "positive"}>{pnl == null ? "—" : baht.format(pnl)}</strong></div>
              <div><span>ถึงเป้าโดยประมาณ</span><strong>{computed.monthsToGoal == null ? "มากกว่า 50 ปี" : `${computed.monthsToGoal} เดือน`}</strong></div>
            </div>
            {pnlNet != null && pricedFees > 0 && <p className="hero-fee-note">ค่าธรรมเนียมสะสม {baht.format(pricedFees)} · กำไรสุทธิหลังหักค่าธรรมเนียม {baht.format(pnlNet)}</p>}
          </Card>

          {performance && <PerformanceCard result={performance} expectedAnnualReturn={settings.expectedAnnualReturn} currentValueThb={computed.totalValue} />}

          <section className="next-action">
            <div><p className="section-kicker">รอบถัดไป</p><h2>จัดงบ {baht.format(settings.monthlyDca)}</h2><p>เติมฝั่งที่ต่ำกว่าเป้าด้วยเงินใหม่</p></div>
            <div className="lead-actions">
              <Button variant="secondary" onClick={() => setRoundOpen(true)} disabled={computed.allocation.length === 0}>บันทึกทั้งรอบ</Button>
              <Button onClick={openTransaction}>บันทึกการซื้อ</Button>
            </div>
          </section>

          <section className="allocation-strip" aria-label="ข้อเสนอการจัดสรรงบรอบถัดไป">
            {computed.allocation.slice(0, 4).map((item, index) => <div key={item.symbol}><span className="dot" style={{ background: COLORS[index % COLORS.length] }} /><span>{item.symbol}</span><strong>{baht.format(item.amount)}</strong></div>)}
          </section>

          <section className="section-block">
            <div className="section-heading"><div><p className="section-kicker">สัดส่วนจริง</p><h2>หุ้นในแผน</h2></div><Button variant="ghost" onClick={() => setTab("plan")}>จัดการ</Button></div>
            {computed.totalValue > 0 && <div className="allocation-chart" aria-label="กราฟสัดส่วนมูลค่าพอร์ต">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart><Pie data={computed.rows.filter(r => r.referenceValueThb > 0)} dataKey="referenceValueThb" nameKey="symbol" innerRadius={46} outerRadius={72} paddingAngle={2} stroke="none">
                  {computed.rows.filter(r => r.referenceValueThb > 0).map((row, index) => <Cell key={row.id} fill={COLORS[index % COLORS.length]} />)}
                </Pie><Tooltip formatter={(value) => baht.format(Number(value))} /></PieChart>
              </ResponsiveContainer>
            </div>}
            <div className="asset-list">
              {computed.rows.map((row, index) => {
                const alert = row.dayChange != null && Math.abs(row.dayChange) >= settings.dailyAlertThreshold;
                const deep = row.drawdown != null && row.drawdown <= -settings.drawdownThreshold;
                const spark = history.series.find((entry) => entry.assetId === row.id)?.points ?? [];
                return <article className="asset-row" key={row.id}>
                  <span className="asset-mark" style={{ background: COLORS[index % COLORS.length] }}>{row.symbol.slice(0, 2)}</span>
                  <div className="asset-main">
                    <strong>{row.symbol}</strong>
                    <span>{row.units > 0 ? `${number.format(row.units)} หุ้น` : row.name}</span>
                    {spark.length >= 2 && <Sparkline points={spark} color={COLORS[index % COLORS.length]!} label={row.symbol} />}
                    <small
                      className={`rebalance-badge ${row.rebalanceSignal}`}
                      aria-label={`แนวทางรีบาลานซ์ ${row.rebalanceSignal === "slow" ? "ชะลอซื้อหรือลดน้ำหนัก" : row.rebalanceSignal === "add" ? "เพิ่มน้ำหนักด้วยเงินใหม่" : "คงแผน"} สัดส่วนต่างจากเป้า ${percent.format(Math.abs(row.rebalanceDelta))}`}
                    >
                      {row.rebalanceSignal === "slow" ? "ชะลอซื้อ/ลดน้ำหนัก" : row.rebalanceSignal === "add" ? "เพิ่มน้ำหนักด้วยเงินใหม่" : "คงแผน"}
                    </small>
                    {(alert || deep) && <small className="warning">{deep && row.drawdown != null ? `ต่ำกว่าจุดสูงสุด 52 สัปดาห์ ${percent.format(Math.abs(row.drawdown))} (เกณฑ์ ${percent.format(settings.drawdownThreshold)})` : "ราคาวันนี้เปลี่ยนแรง"}</small>}
                  </div>
                  <div className="asset-value"><strong>{baht.format(row.referenceValueThb)}</strong><span>{percent.format(row.actualWeight)} / เป้า {percent.format(row.normalizedTarget)}</span><small className={`weight-gap ${row.rebalanceDelta > 0 ? "over" : row.rebalanceDelta < 0 ? "under" : "even"}`}>{row.rebalanceDelta > 0 ? "+" : ""}{percent.format(row.rebalanceDelta)} จากเป้า</small></div>
                </article>;
              })}
            </div>
          </section>

          <section className="section-block projection-block">
            <div className="section-heading"><div><p className="section-kicker">ภาพจำลอง</p><h2>เส้นทางสู่เป้าหมาย</h2></div><span className="muted">ผลตอบแทน {percent.format(settings.expectedAnnualReturn)}/ปี</span></div>
            <div className="chart-wrap" aria-label="กราฟประมาณการมูลค่าพอร์ตตามจำนวนเดือน">
              <ResponsiveContainer width="100%" height={210}>
                <AreaChart data={computed.projection} margin={{ top: 8, right: 4, left: -10, bottom: 0 }}>
                  <defs><linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35}/><stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02}/></linearGradient></defs>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
                  <XAxis dataKey="month" tick={{ fill: "var(--dim)", fontSize: 11 }} axisLine={false} tickLine={false} unit=" ด." />
                  <YAxis domain={[0, "auto"]} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} tick={{ fill: "var(--dim)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value) => [baht.format(Number(value)), "พอร์ต"]} labelFormatter={(label) => `เดือนที่ ${label}`} />
                  <Area type="monotone" dataKey="value" stroke="var(--accent)" fill="url(#valueFill)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="fineprint">เป็นเพียงประมาณการจาก DCA รายเดือนและผลตอบแทนที่ตั้งไว้ ไม่ใช่ผลตอบแทนรับประกัน</p>
          </section>

          <HistorySection
            rows={history.rows}
            series={history.series}
            drawdownThreshold={settings.drawdownThreshold}
            fxThbUsd={settings.fxThbUsd}
            from={priceHistory.data?.from ?? null}
            to={priceHistory.data?.to ?? null}
            backfillPending={backfillPriceHistory.isPending}
            onBackfill={() => backfillPriceHistory.mutate()}
          />
        </>}

        {tab === "activity" && <section className="page-section">
          <div className="page-lead"><div><p className="section-kicker">บันทึกการลงทุน</p><h1>รายการซื้อ</h1><p>{transactions.length} รายการ · ลงทุนรวม {baht.format(computed.totalInvested)}</p></div><div className="lead-actions"><Button variant="secondary" onClick={() => setImportOpen(true)}>นำเข้า CSV</Button><Button onClick={openTransaction}>เพิ่มรายการ</Button></div></div>
          {transactions.length === 0 ? <div className="empty-state"><strong>ยังไม่มีรายการซื้อ</strong><p>เริ่มจากบันทึกยอดซื้อจริงครั้งแรก แล้วระบบจะคำนวณจำนวนหุ้นและต้นทุนเฉลี่ยให้</p><Button variant="secondary" onClick={openTransaction}>บันทึกครั้งแรก</Button></div> : <div className="transaction-list">
            {transactions.map((tx: Transaction) => {
              const units = (tx.grossThb - tx.feeThb) / tx.fxThbUsd / tx.priceUsd;
              return <article className="transaction-row" key={tx.id}>
                <div className="date-box"><strong>{new Date(`${tx.tradeDate}T00:00:00`).toLocaleDateString("th-TH", { day: "2-digit" })}</strong><span>{new Date(`${tx.tradeDate}T00:00:00`).toLocaleDateString("th-TH", { month: "short", year: "2-digit" })}</span></div>
                <div className="transaction-main"><strong>{tx.symbol}</strong><span>{number.format(units)} หุ้น @ {usd.format(tx.priceUsd)}</span>{tx.note && <small>{tx.note}</small>}</div>
                <div className="transaction-amount"><strong>{baht.format(tx.grossThb)}</strong><span>ค่าธรรมเนียม {baht.format(tx.feeThb)}</span><div className="row-actions"><Button variant="ghost" className="edit-link" onClick={() => openTransactionEdit(tx)}>แก้ไข</Button><Button variant="ghost" className="danger-link" onClick={() => setDeletingTransaction(tx)}>ลบ</Button></div></div>
              </article>;
            })}
          </div>}
        </section>}

        {tab === "plan" && <section className="page-section">
          <div className="page-lead"><div><p className="section-kicker">ปรับได้ทุกเมื่อ</p><h1>แผนและราคาล่าสุด</h1><p>ตั้งสมมติฐาน จัดการหุ้น และอัปเดตราคาตลาดจาก Finnhub</p></div></div>
          <section className="price-sync" aria-label="ดึงราคาหุ้นจาก Finnhub">
            <div><span className="live-mark" aria-hidden="true" /><div><strong>แหล่งราคาหุ้น: Finnhub</strong><p>{latestPriceUpdatedAt ? `ราคาล่าสุด · อัปเดต ${new Date(latestPriceUpdatedAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}` : "ยังไม่เคยดึงราคา · ต้องตั้งค่า FINNHUB_API_KEY บนเซิร์ฟเวอร์"}</p></div></div>
            <div className="lead-actions">
              <Button variant="secondary" type="button" onClick={() => backfillPriceHistory.mutate()} disabled={assets.length === 0 || backfillPriceHistory.isPending}>{backfillPriceHistory.isPending ? "กำลังดึงย้อนหลัง…" : "ดึงราคาย้อนหลัง 1 ปี"}</Button>
              <Button variant="secondary" type="button" onClick={() => refreshMarketPrices.mutate()} disabled={assets.length === 0 || refreshMarketPrices.isPending}>{refreshMarketPrices.isPending ? "กำลังดึงราคา…" : "ดึงราคาล่าสุด"}</Button>
            </div>
          </section>
          <form className="settings-form" onSubmit={onSaveSettings} noValidate>
            <div className="form-section"><h2>เป้าหมาย</h2><div className="field-grid"><Field label="DCA ต่อเดือน (บาท)" name="monthlyDca" type="number" min="1" step="1" defaultValue={settings.monthlyDca} error={settingsErrors.monthlyDca} onClearError={() => clearError(setSettingsErrors, "monthlyDca")}/><Field label="เป้าหมายพอร์ต (บาท)" name="goalThb" type="number" min="1" step="1" defaultValue={settings.goalThb} error={settingsErrors.goalThb} onClearError={() => clearError(setSettingsErrors, "goalThb")}/><Field label="ผลตอบแทนคาดหวังต่อปี (%)" name="expectedAnnualReturn" type="number" step="0.1" defaultValue={settings.expectedAnnualReturn * 100} error={settingsErrors.expectedAnnualReturn} onClearError={() => clearError(setSettingsErrors, "expectedAnnualReturn")}/><Field label="FX ปัจจุบัน (บาท/USD)" name="fxThbUsd" type="number" min="0.01" step="0.01" defaultValue={settings.fxThbUsd} required={false} error={settingsErrors.fxThbUsd} onClearError={() => clearError(setSettingsErrors, "fxThbUsd")}/></div></div>
            <div className="form-section"><h2>เกณฑ์เตือน</h2><div className="field-grid"><Field label="ราคาวันเดียวเปลี่ยน (%)" name="dailyAlertThreshold" type="number" min="0" step="0.1" defaultValue={settings.dailyAlertThreshold * 100} error={settingsErrors.dailyAlertThreshold} onClearError={() => clearError(setSettingsErrors, "dailyAlertThreshold")}/><Field label="Drawdown จากจุดสูงสุด (%)" name="drawdownThreshold" type="number" min="0" step="0.1" defaultValue={settings.drawdownThreshold * 100} error={settingsErrors.drawdownThreshold} onClearError={() => clearError(setSettingsErrors, "drawdownThreshold")}/><Field label="Tolerance รีบาลานซ์ (%)" name="rebalanceTolerance" type="number" min="0" step="0.1" defaultValue={settings.rebalanceTolerance * 100} error={settingsErrors.rebalanceTolerance} onClearError={() => clearError(setSettingsErrors, "rebalanceTolerance")}/></div></div>
            <Button className="wide" type="submit" disabled={saveSettings.isPending}>{saveSettings.isPending ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}</Button>
          </form>
          <section className="preset-section" aria-labelledby="preset-heading">
            <div className="preset-heading"><div><p className="section-kicker">ตัวช่วยตั้งน้ำหนัก</p><h2 id="preset-heading">ลองพรีเซ็ตก่อนใช้จริง</h2></div><p>กดเพื่อดูน้ำหนักใหม่ ระบบจะยังไม่เปลี่ยนแผนจนกว่าจะยืนยัน</p></div>
            <div className="preset-grid">
              {PRESETS.map((preset) => <Button
                key={preset.id}
                type="button"
                variant="secondary"
                className="preset-button"
                disabled={assets.length === 0 || previewWeightPreset.isPending}
                onClick={() => previewWeightPreset.mutate(preset.id)}
                aria-label={`ลองพรีเซ็ต ${preset.label}`}
              ><strong>{previewWeightPreset.isPending && previewWeightPreset.variables === preset.id ? "กำลังคำนวณ…" : preset.label}</strong><span>{preset.hint}</span></Button>)}
            </div>
            <p className="preset-note">พรีเซ็ตตามเทรนด์ใช้ผลตอบแทนราคา 6 เดือน พรีเซ็ตเป็นจุดเริ่มต้น ไม่ใช่คำแนะนำลงทุน</p>
          </section>
          <div className="section-heading plan-assets"><div><p className="section-kicker">หุ้นและน้ำหนัก</p><h2>{assets.length} ตัวในแผน</h2></div><Button variant="secondary" onClick={() => setAssetOpen(true)}>เพิ่มหุ้น</Button></div>
          {assets.length === 0 ? <div className="empty-state compact"><strong>ยังไม่มีหุ้นในแผน</strong><p>เพิ่มหุ้นหรือ ETF ตัวแรกเพื่อเริ่มกำหนดสัดส่วนและบันทึกรายการซื้อ</p><Button type="button" onClick={() => setAssetOpen(true)}>เพิ่มหุ้นตัวแรก</Button></div> : <div className="plan-list">
            {assets.map((asset) => <Button variant="ghost" key={asset.id} className="plan-row" type="button" aria-label={`แก้ไข ${asset.symbol}`} onClick={() => { setEditingAsset(asset); setDeleteConfirmOpen(false); }}><span><strong>{asset.symbol}</strong><small>{asset.name} · {asset.sector}</small></span><span className="plan-row-meta"><strong>{percent.format(asset.targetWeight)}</strong><small>{asset.currentPriceUsd ? usd.format(asset.currentPriceUsd) : "ยังไม่มีราคา"}</small><em>แก้ไข</em></span></Button>)}
          </div>}
          <div className={Math.abs(computed.totalTarget - 1) < 0.0001 ? "weight-total okay" : "weight-total warning-box"}><span>น้ำหนักรวม</span><strong>{percent.format(computed.totalTarget)}</strong><small>{Math.abs(computed.totalTarget - 1) < 0.0001 ? "ครบ 100%" : "ควรปรับให้รวมเป็น 100%"}</small></div>
          <div className="data-tools">
            <div><h2>สำรองและย้ายข้อมูล</h2><p>ดาวน์โหลดแคปเชอร์ไว้นอกเครื่อง หรือย้ายข้อมูลจากเครื่องอื่น</p></div>
            <div className="lead-actions"><Button variant="secondary" onClick={() => setImportOpen(true)}>นำเข้า CSV</Button><Button variant="secondary" onClick={() => setBackupOpen(true)}>สำรอง / กู้คืน</Button></div>
          </div>
        </section>}
      </main>

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)} className="bottom-tabs">
        <TabsList className="bottom-nav" aria-label="เมนูหลัก">
          <TabsTrigger value="overview"><span>ภาพรวม</span></TabsTrigger>
          <TabsTrigger value="activity"><span>รายการซื้อ</span></TabsTrigger>
          <TabsTrigger value="plan"><span>แผน</span></TabsTrigger>
        </TabsList>
      </Tabs>

      {presetPreview && <Modal title={`ตัวอย่าง: ${PRESETS.find((preset) => preset.id === presetPreview.preset)?.label ?? "พรีเซ็ต"}`} onClose={() => setPresetPreview(null)}>
        <div className="preset-preview">
          <div className="preset-method"><p>{presetPreview.methodology}</p>{presetPreview.asOf && <small>ข้อมูลตลาดล่าสุด {new Date(presetPreview.asOf).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</small>}</div>
          <div className="preset-preview-list" aria-label="ตัวอย่างน้ำหนักใหม่">
            {presetPreview.items.map((item) => {
              const asset = assets.find((candidate) => candidate.id === item.id);
              const metric = presetPreview.preset === "trend"
                ? `${item.metric != null && item.metric >= 0 ? "+" : ""}${percent.format(item.metric ?? 0)} ใน 6 เดือน`
                : asset?.name ?? "";
              return <div key={item.id}><span><strong>{item.symbol}</strong><small>{metric}</small></span><strong>{percent.format(item.weight)}</strong></div>;
            })}
          </div>
          <div className="preset-total"><span>รวม</span><strong>{percent.format(presetPreview.items.reduce((sum, item) => sum + item.weight, 0))}</strong></div>
          <div className="preset-actions"><Button type="button" variant="secondary" onClick={() => setPresetPreview(null)}>ยกเลิก</Button><Button type="button" onClick={() => applyWeightPreset.mutate(presetPreview)} disabled={applyWeightPreset.isPending}>{applyWeightPreset.isPending ? "กำลังใช้…" : "ใช้พรีเซ็ตนี้"}</Button></div>
        </div>
      </Modal>}

      {transactionOpen && <Modal title={editingTransaction ? `แก้ไขรายการซื้อ ${editingTransaction.symbol}` : "บันทึกรายการซื้อ"} onClose={closeTransaction}><form className="modal-form" onSubmit={onSubmitTransaction} noValidate>
        <Label><span>หุ้น</span><Select name="assetId" aria-label="เลือกหุ้น" value={transactionDraft.assetId || undefined} required items={assets.map((asset) => ({ value: String(asset.id), label: `${asset.symbol} — ${asset.name}` }))} aria-invalid={Boolean(transactionErrors.assetId)} aria-describedby={transactionErrors.assetId ? "transaction-assetId-error" : undefined} onValueChange={(value) => {
          const asset = assets.find((item) => String(item.id) === value);
          setTransactionDraft((previous) => ({ ...previous, assetId: value, priceUsd: asset?.currentPriceUsd ? String(asset.currentPriceUsd) : "" }));
          clearError(setTransactionErrors, "assetId");
          clearError(setTransactionErrors, "priceUsd");
        }} /><FieldError id="transaction-assetId-error" message={transactionErrors.assetId} /></Label>
        <Label><span>วันที่ซื้อ</span><DatePicker name="tradeDate" aria-label="เลือกวันที่ซื้อ" defaultValue={editingTransaction?.tradeDate ?? localDateValue()} required aria-invalid={Boolean(transactionErrors.tradeDate)} aria-describedby={transactionErrors.tradeDate ? "transaction-tradeDate-error" : undefined} onValueChange={() => clearError(setTransactionErrors, "tradeDate")} /><FieldError id="transaction-tradeDate-error" message={transactionErrors.tradeDate} /></Label>
        <div className="field-grid">
          <Field label="ยอดซื้อรวม (บาท)" name="grossThb" type="number" min="0.01" step="0.01" placeholder="285.71" value={transactionDraft.grossThb} error={transactionErrors.grossThb} errorId="transaction-grossThb-error" onValueChange={(value) => setTransactionDraft((previous) => ({ ...previous, grossThb: value }))} onClearError={() => clearError(setTransactionErrors, "grossThb")}/>
          <Field label="ค่าธรรมเนียม (บาท)" name="feeThb" type="number" min="0" step="0.01" value={transactionDraft.feeThb} error={transactionErrors.feeThb} errorId="transaction-feeThb-error" onValueChange={(value) => setTransactionDraft((previous) => ({ ...previous, feeThb: value }))} onClearError={() => clearError(setTransactionErrors, "feeThb")}/>
          <Field label="FX ตอนซื้อ (บาท/USD)" name="fxThbUsd" type="number" min="0.01" step="0.01" value={transactionDraft.fxThbUsd} error={transactionErrors.fxThbUsd} errorId="transaction-fxThbUsd-error" onValueChange={(value) => setTransactionDraft((previous) => ({ ...previous, fxThbUsd: value }))} onClearError={() => clearError(setTransactionErrors, "fxThbUsd")}/>
          <Field label="ราคาซื้อ/หุ้น (USD)" name="priceUsd" type="number" min="0.01" step="0.01" placeholder="100.00" value={transactionDraft.priceUsd} error={transactionErrors.priceUsd} errorId="transaction-priceUsd-error" onValueChange={(value) => setTransactionDraft((previous) => ({ ...previous, priceUsd: value }))} onClearError={() => clearError(setTransactionErrors, "priceUsd")}/>
        </div>
        <div className="purchase-calculation" aria-live="polite">
          <div><span>ยอดซื้อสุทธิ (USD)</span><strong>{calculatedPurchaseUsd == null ? "—" : usd.format(calculatedPurchaseUsd)}</strong></div>
          <div><span>จำนวนหุ้นโดยประมาณ</span><strong>{calculatedUnits == null ? "—" : number.format(calculatedUnits)}</strong></div>
          <p>{selectedTransactionAsset?.currentPriceUsd ? `ใส่ราคาล่าสุดของ ${selectedTransactionAsset.symbol} ให้อัตโนมัติ แก้ไขเป็นราคาที่ซื้อจริงได้` : "กรอกยอดซื้อ ค่าเงิน และราคาต่อหุ้น ระบบจะคำนวณ USD กับจำนวนหุ้นให้ทันที"}</p>
        </div>
        <Label><span>หมายเหตุ</span><Textarea name="note" rows={2} maxLength={240} placeholder="เช่น DCA รอบเดือนนี้" defaultValue={editingTransaction?.note} aria-invalid={Boolean(transactionErrors.note)} aria-describedby={transactionErrors.note ? "transaction-note-error" : undefined} onChange={() => clearError(setTransactionErrors, "note")} /><FieldError id="transaction-note-error" message={transactionErrors.note} /></Label>
        <Button className="wide" type="submit" disabled={addTransaction.isPending || updateTransaction.isPending}>{addTransaction.isPending || updateTransaction.isPending ? "กำลังบันทึก…" : editingTransaction ? "บันทึกการแก้ไข" : "บันทึกรายการ"}</Button>
      </form></Modal>}

      {deletingTransaction && <Modal title="ลบรายการซื้อ" onClose={() => setDeletingTransaction(null)}>
        <Alert className="delete-confirm" role="alert">
          <strong>ลบรายการ {deletingTransaction.symbol} วันที่ {new Date(`${deletingTransaction.tradeDate}T00:00:00`).toLocaleDateString("th-TH", { dateStyle: "medium" })}?</strong>
          <p>ยอด {baht.format(deletingTransaction.grossThb)} · {number.format((deletingTransaction.grossThb - deletingTransaction.feeThb) / deletingTransaction.fxThbUsd / deletingTransaction.priceUsd)} หุ้น — ย้อนกลับไม่ได้</p>
          <div><Button variant="secondary" onClick={() => setDeletingTransaction(null)}>ยกเลิก</Button><Button variant="destructive" onClick={() => deleteTransaction.mutate(deletingTransaction.id)} disabled={deleteTransaction.isPending}>{deleteTransaction.isPending ? "กำลังลบ…" : "ยืนยันลบ"}</Button></div>
        </Alert>
      </Modal>}

      {roundOpen && <RoundModal
        slices={computed.allocation}
        assets={assets}
        fxThbUsd={settings.fxThbUsd}
        today={localDateValue()}
        note={`DCA ${new Date().toLocaleDateString("th-TH", { month: "short", year: "2-digit" })}`}
        pending={importTransactions.isPending}
        onClose={() => setRoundOpen(false)}
        onSubmit={(items: RoundSubmitItem[]) => importTransactions.mutate(items)}
      />}

      {importOpen && <CsvImportModal
        assets={assets}
        existing={transactions}
        defaultFxThbUsd={settings.fxThbUsd}
        pending={importTransactions.isPending}
        onClose={() => setImportOpen(false)}
        onSubmit={(items: ImportSubmitItem[], rejected: ImportRejected[]) => {
          if (items.length === 0) {
            toast.error("ไม่มีรายการที่นำเข้าได้", { description: rejected[0]?.reason });
            return;
          }
          importTransactions.mutate(items);
        }}
      />}

      {backupOpen && <BackupModal
        source={{
          settings: {
            monthlyDca: settings.monthlyDca,
            goalThb: settings.goalThb,
            expectedAnnualReturn: settings.expectedAnnualReturn,
            fxThbUsd: settings.fxThbUsd,
            dailyAlertThreshold: settings.dailyAlertThreshold,
            drawdownThreshold: settings.drawdownThreshold,
            rebalanceTolerance: settings.rebalanceTolerance,
          },
          assets: assets.map((asset) => ({ symbol: asset.symbol, name: asset.name, sector: asset.sector, targetWeight: asset.targetWeight })),
          transactions: transactions.map((tx) => ({
            symbol: tx.symbol,
            tradeDate: tx.tradeDate,
            grossThb: tx.grossThb,
            feeThb: tx.feeThb,
            fxThbUsd: tx.fxThbUsd,
            priceUsd: tx.priceUsd,
            note: tx.note,
          })),
        }}
        pending={importBackup.isPending}
        onClose={() => setBackupOpen(false)}
        onRestore={(payload: BackupPayload) => importBackup.mutate(payload)}
      />}

      {assetOpen && <Modal title="เพิ่มหุ้นหรือ ETF" onClose={() => { setAssetOpen(false); setAssetErrors({}); }}><form className="modal-form" onSubmit={onAddAsset} noValidate>
        <div className="field-grid"><Field label="สัญลักษณ์" name="symbol" placeholder="เช่น VOO" error={assetErrors.symbol} errorId="add-symbol-error" onClearError={() => clearError(setAssetErrors, "symbol")}/><Field label="ชื่อ" name="name" placeholder="เช่น Vanguard S&P 500 ETF" error={assetErrors.name} errorId="add-name-error" onClearError={() => clearError(setAssetErrors, "name")}/></div><Field label="กลุ่ม" name="sector" placeholder="เช่น Broad market ETF" error={assetErrors.sector} errorId="add-sector-error" onClearError={() => clearError(setAssetErrors, "sector")}/><Field label="สัดส่วนเป้าหมาย (%)" name="targetWeight" type="number" min="0" step="0.1" defaultValue={0} error={assetErrors.targetWeight} errorId="add-targetWeight-error" onClearError={() => clearError(setAssetErrors, "targetWeight")}/>
        <Button className="wide" type="submit" disabled={addAsset.isPending}>{addAsset.isPending ? "กำลังเพิ่ม…" : "เพิ่มเข้าพอร์ต"}</Button>
      </form></Modal>}

      {editingAsset && <Modal title={`แก้ไข ${editingAsset.symbol}`} onClose={() => { setEditingAsset(null); setDeleteConfirmOpen(false); setEditAssetErrors({}); }}><form className="modal-form" onSubmit={(event) => onUpdateAsset(event, editingAsset)} noValidate>
        <div className="field-grid"><Field label="สัญลักษณ์" name="symbol" defaultValue={editingAsset.symbol} error={editAssetErrors.symbol} errorId="edit-symbol-error" onClearError={() => clearError(setEditAssetErrors, "symbol")}/><Field label="ชื่อ" name="name" defaultValue={editingAsset.name} error={editAssetErrors.name} errorId="edit-name-error" onClearError={() => clearError(setEditAssetErrors, "name")}/><Field label="กลุ่ม" name="sector" defaultValue={editingAsset.sector} error={editAssetErrors.sector} errorId="edit-sector-error" onClearError={() => clearError(setEditAssetErrors, "sector")}/><Field label="สัดส่วนเป้าหมาย (%)" name="targetWeight" type="number" min="0" step="0.1" defaultValue={editingAsset.targetWeight * 100} error={editAssetErrors.targetWeight} errorId="edit-targetWeight-error" onClearError={() => clearError(setEditAssetErrors, "targetWeight")}/><Field label="ราคาล่าสุด (USD)" name="currentPriceUsd" type="number" min="0.01" step="0.01" defaultValue={editingAsset.currentPriceUsd} required={false} error={editAssetErrors.currentPriceUsd} errorId="edit-currentPriceUsd-error" onClearError={() => clearError(setEditAssetErrors, "currentPriceUsd")}/><Field label="ราคาปิดวันก่อน (USD)" name="previousCloseUsd" type="number" min="0.01" step="0.01" defaultValue={editingAsset.previousCloseUsd} required={false} error={editAssetErrors.previousCloseUsd} errorId="edit-previousCloseUsd-error" onClearError={() => clearError(setEditAssetErrors, "previousCloseUsd")}/><Field label="จุดสูงสุด 52 สัปดาห์ (USD)" name="high52wUsd" type="number" min="0.01" step="0.01" defaultValue={editingAsset.high52wUsd} required={false} error={editAssetErrors.high52wUsd} errorId="edit-high52wUsd-error" onClearError={() => clearError(setEditAssetErrors, "high52wUsd")}/></div>
        <Button className="wide" type="submit" disabled={updateAsset.isPending}>{updateAsset.isPending ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}</Button>
        {!deleteConfirmOpen ? <Button variant="ghost" className="danger-button" type="button" onClick={() => setDeleteConfirmOpen(true)}>ลบหุ้นนี้</Button> : <Alert className="delete-confirm" role="alert"><strong>ลบ {editingAsset.symbol} ออกจากพอร์ต?</strong><p>รายการซื้อทั้งหมดของหุ้นนี้จะถูกลบด้วย และย้อนกลับไม่ได้</p><div><Button variant="secondary" type="button" onClick={() => setDeleteConfirmOpen(false)}>ยกเลิก</Button><Button variant="destructive" type="button" onClick={() => deleteAsset.mutate(editingAsset.id)} disabled={deleteAsset.isPending}>{deleteAsset.isPending ? "กำลังลบ…" : "ยืนยันลบหุ้น"}</Button></div></Alert>}
      </form></Modal>}
    </div>
  );
}
