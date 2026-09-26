import { SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, type ApiResponse } from "./api";
import { Alert, Button, Card, DatePicker, Dialog, DialogContent, Input, Label, Select, Tabs, TabsList, TabsTrigger, Textarea } from "./components/ui";

type Portfolio = ApiResponse<typeof api, "getPortfolio">;
type Asset = Portfolio["assets"][number];
type Transaction = Portfolio["transactions"][number];
type Tab = "overview" | "activity" | "plan";

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

function finiteNumber(value: FormDataEntryValue | null, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalPositive(value: FormDataEntryValue | null) {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent title={title} onClose={onClose}>{children}</DialogContent></Dialog>;
}

function Field({ label, name, type = "text", defaultValue, step, min, placeholder, required = true }: {
  label: string; name: string; type?: string; defaultValue?: string | number | null; step?: string; min?: string; placeholder?: string; required?: boolean;
}) {
  return (
    <Label>
      <span>{label}</span>
      <Input name={name} type={type} defaultValue={defaultValue ?? ""} step={step} min={min} placeholder={placeholder} required={required} />
    </Label>
  );
}

export function App() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [transactionOpen, setTransactionOpen] = useState(false);
  const [assetOpen, setAssetOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const portfolio = useQuery({ queryKey: ["portfolio"], queryFn: () => api.getPortfolio({}) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["portfolio"] });

  const addTransaction = useMutation({
    mutationFn: (input: Parameters<typeof api.addTransaction>[0]) => api.addTransaction(input),
    onSuccess: async (result) => {
      if (!result.ok) { setNotice(result.error ?? "บันทึกไม่สำเร็จ"); return; }
      await refresh(); setTransactionOpen(false); setNotice("บันทึกรายการซื้อแล้ว");
    },
  });
  const deleteTransaction = useMutation({
    mutationFn: (id: number) => api.deleteTransaction({ id }),
    onSuccess: async () => { await refresh(); setNotice("ลบรายการแล้ว"); },
  });
  const saveSettings = useMutation({
    mutationFn: (input: Parameters<typeof api.updateSettings>[0]) => api.updateSettings(input),
    onSuccess: async () => { await refresh(); setNotice("บันทึกแผนแล้ว"); },
  });
  const addAsset = useMutation({
    mutationFn: (input: Parameters<typeof api.addAsset>[0]) => api.addAsset(input),
    onSuccess: async (result) => {
      if (!result.ok) { setNotice(result.error ?? "เพิ่มหุ้นไม่สำเร็จ"); return; }
      await refresh(); setAssetOpen(false); setNotice("เพิ่มหุ้นแล้ว");
    },
  });
  const updateAsset = useMutation({
    mutationFn: (input: Parameters<typeof api.updateAsset>[0]) => api.updateAsset(input),
    onSuccess: async (result) => {
      if (!result.ok) { setNotice(result.error ?? "แก้ไขหุ้นไม่สำเร็จ"); return; }
      await refresh(); setEditingAsset(null); setDeleteConfirmOpen(false); setNotice("อัปเดตหุ้นแล้ว");
    },
  });
  const deleteAsset = useMutation({
    mutationFn: (id: number) => api.deleteAsset({ id }),
    onSuccess: async (result) => {
      if (!result.ok) { setNotice(result.error ?? "ลบหุ้นไม่สำเร็จ"); return; }
      await refresh(); setEditingAsset(null); setDeleteConfirmOpen(false); setNotice("ลบหุ้นและรายการซื้อที่เกี่ยวข้องแล้ว");
    },
  });
  const refreshMarketPrices = useMutation({
    mutationFn: () => api.refreshMarketPrices({}),
    onSuccess: async (result) => {
      if (result.updated > 0) await refresh();
      if (!result.ok) {
        const failedNote = result.failedSymbols.length > 0 ? ` (${result.failedSymbols.join(", ")})` : "";
        setNotice(`${result.error ?? "อัปเดตราคาไม่สำเร็จ"}${failedNote}`);
        return;
      }
      const failedNote = result.failedSymbols.length > 0 ? ` · ไม่พบข้อมูล ${result.failedSymbols.join(", ")}` : "";
      setNotice(`อัปเดตราคา ${result.updated} ตัวแล้ว${failedNote}`);
    },
    onError: () => setNotice("บริการราคาตลาดยังไม่พร้อม กรุณาลองใหม่อีกครั้ง"),
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
    const withWeights = rows.map((row) => ({
      ...row,
      actualWeight: totalValue > 0 ? row.referenceValueThb / totalValue : 0,
      normalizedTarget: totalTarget > 0 ? row.targetWeight / totalTarget : 0,
    }));
    const desiredTotal = totalValue + settings.monthlyDca;
    const needs = withWeights.map((row) => ({ ...row, need: Math.max(0, row.normalizedTarget * desiredTotal - row.referenceValueThb) }));
    const needTotal = needs.reduce((sum, row) => sum + row.need, 0);
    const allocation = needs.map((row) => ({
      symbol: row.symbol,
      amount: needTotal > 0 ? settings.monthlyDca * row.need / needTotal : settings.monthlyDca * row.normalizedTarget,
    })).filter((row) => row.amount >= 1).sort((a, b) => b.amount - a.amount);
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

  if (portfolio.isPending) return <div className="state-screen"><span className="spinner" />กำลังเปิดสมุดพอร์ต…</div>;
  if (portfolio.error || !portfolio.data || !computed) return <div className="state-screen"><strong>เปิดข้อมูลไม่สำเร็จ</strong><Button onClick={() => portfolio.refetch()}>ลองอีกครั้ง</Button></div>;

  const { settings, assets, transactions } = portfolio.data;
  const latestPriceUpdatedAt = assets.reduce<string | null>((latest, asset) => {
    if (!asset.priceUpdatedAt) return latest;
    if (!latest || new Date(asset.priceUpdatedAt) > new Date(latest)) return asset.priceUpdatedAt;
    return latest;
  }, null);
  const progress = settings.goalThb > 0 ? computed.totalValue / settings.goalThb : 0;
  const pnl = computed.exactMarketValue > 0 ? computed.exactMarketValue - computed.rows.filter((r) => r.marketValueThb != null).reduce((s, r) => s + r.investedThb, 0) : null;

  function onAddTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    addTransaction.mutate({
      assetId: finiteNumber(form.get("assetId")), tradeDate: String(form.get("tradeDate")), grossThb: finiteNumber(form.get("grossThb")),
      feeThb: finiteNumber(form.get("feeThb")), fxThbUsd: finiteNumber(form.get("fxThbUsd")), priceUsd: finiteNumber(form.get("priceUsd")), note: String(form.get("note") ?? ""),
    });
  }

  function onSaveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    saveSettings.mutate({
      monthlyDca: finiteNumber(form.get("monthlyDca")), goalThb: finiteNumber(form.get("goalThb")), expectedAnnualReturn: finiteNumber(form.get("expectedAnnualReturn")) / 100,
      fxThbUsd: optionalPositive(form.get("fxThbUsd")), dailyAlertThreshold: finiteNumber(form.get("dailyAlertThreshold")) / 100,
      drawdownThreshold: finiteNumber(form.get("drawdownThreshold")) / 100, rebalanceTolerance: finiteNumber(form.get("rebalanceTolerance")) / 100,
    });
  }

  function onAddAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    addAsset.mutate({ symbol: String(form.get("symbol")), name: String(form.get("name")), sector: String(form.get("sector")), targetWeight: finiteNumber(form.get("targetWeight")) / 100 });
  }

  function onUpdateAsset(event: FormEvent<HTMLFormElement>, asset: Asset) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    updateAsset.mutate({ id: asset.id, symbol: String(form.get("symbol")), name: String(form.get("name")), sector: String(form.get("sector")), targetWeight: finiteNumber(form.get("targetWeight")) / 100,
      currentPriceUsd: optionalPositive(form.get("currentPriceUsd")), previousCloseUsd: optionalPositive(form.get("previousCloseUsd")), high52wUsd: optionalPositive(form.get("high52wUsd")) });
  }

  return (
    <div className="app-shell">
      <SafeAreaTopScrim backgroundColor="var(--bg)" />
      <main className="content-wrap">
        {notice && <Alert className="notice" role="status"><span>{notice}</span><Button variant="ghost" size="icon" type="button" onClick={() => setNotice("")} aria-label="ปิดข้อความ">×</Button></Alert>}

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
          </Card>

          <section className="next-action">
            <div><p className="section-kicker">รอบถัดไป</p><h2>จัดงบ {baht.format(settings.monthlyDca)}</h2><p>เติมฝั่งที่ต่ำกว่าเป้าด้วยเงินใหม่</p></div>
            <Button onClick={() => setTransactionOpen(true)}>บันทึกการซื้อ</Button>
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
                return <article className="asset-row" key={row.id}>
                  <span className="asset-mark" style={{ background: COLORS[index % COLORS.length] }}>{row.symbol.slice(0, 2)}</span>
                  <div className="asset-main"><strong>{row.symbol}</strong><span>{row.units > 0 ? `${number.format(row.units)} หุ้น` : row.name}</span>{(alert || deep) && <small className="warning">{alert ? "ราคาวันนี้เปลี่ยนแรง" : "ต่ำกว่าจุดสูงสุดถึงเกณฑ์"}</small>}</div>
                  <div className="asset-value"><strong>{baht.format(row.referenceValueThb)}</strong><span>{percent.format(row.actualWeight)} / เป้า {percent.format(row.normalizedTarget)}</span></div>
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
        </>}

        {tab === "activity" && <section className="page-section">
          <div className="page-lead"><div><p className="section-kicker">บันทึกการลงทุน</p><h1>รายการซื้อ</h1><p>{transactions.length} รายการ · ลงทุนรวม {baht.format(computed.totalInvested)}</p></div><Button onClick={() => setTransactionOpen(true)}>เพิ่มรายการ</Button></div>
          {transactions.length === 0 ? <div className="empty-state"><strong>ยังไม่มีรายการซื้อ</strong><p>เริ่มจากบันทึกยอดซื้อจริงครั้งแรก แล้วระบบจะคำนวณจำนวนหุ้นและต้นทุนเฉลี่ยให้</p><Button variant="secondary" onClick={() => setTransactionOpen(true)}>บันทึกครั้งแรก</Button></div> : <div className="transaction-list">
            {transactions.map((tx: Transaction) => {
              const units = (tx.grossThb - tx.feeThb) / tx.fxThbUsd / tx.priceUsd;
              return <article className="transaction-row" key={tx.id}>
                <div className="date-box"><strong>{new Date(`${tx.tradeDate}T00:00:00`).toLocaleDateString("th-TH", { day: "2-digit" })}</strong><span>{new Date(`${tx.tradeDate}T00:00:00`).toLocaleDateString("th-TH", { month: "short", year: "2-digit" })}</span></div>
                <div className="transaction-main"><strong>{tx.symbol}</strong><span>{number.format(units)} หุ้น @ {usd.format(tx.priceUsd)}</span>{tx.note && <small>{tx.note}</small>}</div>
                <div className="transaction-amount"><strong>{baht.format(tx.grossThb)}</strong><span>ค่าธรรมเนียม {baht.format(tx.feeThb)}</span><Button variant="ghost" className="danger-link" onClick={() => deleteTransaction.mutate(tx.id)} disabled={deleteTransaction.isPending}>ลบ</Button></div>
              </article>;
            })}
          </div>}
        </section>}

        {tab === "plan" && <section className="page-section">
          <div className="page-lead"><div><p className="section-kicker">ปรับได้ทุกเมื่อ</p><h1>แผนและราคาล่าสุด</h1><p>ตั้งสมมติฐาน จัดการหุ้น และอัปเดตราคาตลาดโดยไม่ต้องตั้งค่า API key</p></div></div>
          <section className="price-sync" aria-label="อัปเดตราคาหุ้นจากแหล่งข้อมูลตลาด">
            <div><span className="live-mark" aria-hidden="true" /><div><strong>ราคาตลาด</strong><p>{latestPriceUpdatedAt ? `ข้อมูลล่าสุด ${new Date(latestPriceUpdatedAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}` : "ยังไม่เคยดึงราคา"}</p></div></div>
            <Button variant="secondary" type="button" onClick={() => refreshMarketPrices.mutate()} disabled={assets.length === 0 || refreshMarketPrices.isPending}>{refreshMarketPrices.isPending ? "กำลังอัปเดต…" : "อัปเดตราคา"}</Button>
          </section>
          <form className="settings-form" onSubmit={onSaveSettings}>
            <div className="form-section"><h2>เป้าหมาย</h2><div className="field-grid"><Field label="DCA ต่อเดือน (บาท)" name="monthlyDca" type="number" min="1" step="1" defaultValue={settings.monthlyDca}/><Field label="เป้าหมายพอร์ต (บาท)" name="goalThb" type="number" min="1" step="1" defaultValue={settings.goalThb}/><Field label="ผลตอบแทนคาดหวังต่อปี (%)" name="expectedAnnualReturn" type="number" step="0.1" defaultValue={settings.expectedAnnualReturn * 100}/><Field label="FX ปัจจุบัน (บาท/USD)" name="fxThbUsd" type="number" min="0.01" step="0.01" defaultValue={settings.fxThbUsd} required={false}/></div></div>
            <div className="form-section"><h2>เกณฑ์เตือน</h2><div className="field-grid"><Field label="ราคาวันเดียวเปลี่ยน (%)" name="dailyAlertThreshold" type="number" min="0" step="0.1" defaultValue={settings.dailyAlertThreshold * 100}/><Field label="Drawdown จากจุดสูงสุด (%)" name="drawdownThreshold" type="number" min="0" step="0.1" defaultValue={settings.drawdownThreshold * 100}/><Field label="Tolerance รีบาลานซ์ (%)" name="rebalanceTolerance" type="number" min="0" step="0.1" defaultValue={settings.rebalanceTolerance * 100}/></div></div>
            <Button className="wide" type="submit" disabled={saveSettings.isPending}>{saveSettings.isPending ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}</Button>
          </form>
          <div className="section-heading plan-assets"><div><p className="section-kicker">หุ้นและน้ำหนัก</p><h2>{assets.length} ตัวในแผน</h2></div><Button variant="secondary" onClick={() => setAssetOpen(true)}>เพิ่มหุ้น</Button></div>
          {assets.length === 0 ? <div className="empty-state compact"><strong>ยังไม่มีหุ้นในแผน</strong><p>เพิ่มหุ้นหรือ ETF ตัวแรกเพื่อเริ่มกำหนดสัดส่วนและบันทึกรายการซื้อ</p><Button type="button" onClick={() => setAssetOpen(true)}>เพิ่มหุ้นตัวแรก</Button></div> : <div className="plan-list">
            {assets.map((asset) => <Button variant="ghost" key={asset.id} className="plan-row" type="button" aria-label={`แก้ไข ${asset.symbol}`} onClick={() => { setEditingAsset(asset); setDeleteConfirmOpen(false); }}><span><strong>{asset.symbol}</strong><small>{asset.name} · {asset.sector}</small></span><span className="plan-row-meta"><strong>{percent.format(asset.targetWeight)}</strong><small>{asset.currentPriceUsd ? usd.format(asset.currentPriceUsd) : "ยังไม่มีราคา"}</small><em>แก้ไข</em></span></Button>)}
          </div>}
          <div className={Math.abs(computed.totalTarget - 1) < 0.0001 ? "weight-total okay" : "weight-total warning-box"}><span>น้ำหนักรวม</span><strong>{percent.format(computed.totalTarget)}</strong><small>{Math.abs(computed.totalTarget - 1) < 0.0001 ? "ครบ 100%" : "ควรปรับให้รวมเป็น 100%"}</small></div>
        </section>}
      </main>

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)} className="bottom-tabs">
        <TabsList className="bottom-nav" aria-label="เมนูหลัก">
          <TabsTrigger value="overview"><span>ภาพรวม</span></TabsTrigger>
          <TabsTrigger value="activity"><span>รายการซื้อ</span></TabsTrigger>
          <TabsTrigger value="plan"><span>แผน</span></TabsTrigger>
        </TabsList>
      </Tabs>

      {transactionOpen && <Modal title="บันทึกรายการซื้อ" onClose={() => setTransactionOpen(false)}><form className="modal-form" onSubmit={onAddTransaction}>
        <Label><span>หุ้น</span><Select name="assetId" aria-label="เลือกหุ้น" defaultValue={assets[0] ? String(assets[0].id) : undefined} required items={assets.map((asset) => ({ value: String(asset.id), label: `${asset.symbol} — ${asset.name}` }))} /></Label>
        <Label><span>วันที่ซื้อ</span><DatePicker name="tradeDate" aria-label="เลือกวันที่ซื้อ" defaultValue={localDateValue()} required /></Label>
        <div className="field-grid"><Field label="ยอดซื้อรวม (บาท)" name="grossThb" type="number" min="0.01" step="0.01" placeholder="285.71"/><Field label="ค่าธรรมเนียม (บาท)" name="feeThb" type="number" min="0" step="0.01" defaultValue={0}/><Field label="FX ตอนซื้อ (บาท/USD)" name="fxThbUsd" type="number" min="0.01" step="0.01" defaultValue={settings.fxThbUsd}/><Field label="ราคาซื้อ (USD)" name="priceUsd" type="number" min="0.01" step="0.01" placeholder="100.00"/></div>
        <Label><span>หมายเหตุ</span><Textarea name="note" rows={2} placeholder="เช่น DCA รอบเดือนนี้" /></Label>
        <Button className="wide" type="submit" disabled={addTransaction.isPending}>{addTransaction.isPending ? "กำลังบันทึก…" : "บันทึกรายการ"}</Button>
      </form></Modal>}

      {assetOpen && <Modal title="เพิ่มหุ้นหรือ ETF" onClose={() => setAssetOpen(false)}><form className="modal-form" onSubmit={onAddAsset}>
        <div className="field-grid"><Field label="สัญลักษณ์" name="symbol" placeholder="เช่น VOO"/><Field label="ชื่อ" name="name" placeholder="เช่น Vanguard S&P 500 ETF"/></div><Field label="กลุ่ม" name="sector" placeholder="เช่น Broad market ETF"/><Field label="สัดส่วนเป้าหมาย (%)" name="targetWeight" type="number" min="0" step="0.1" defaultValue={0}/>
        <Button className="wide" type="submit" disabled={addAsset.isPending}>{addAsset.isPending ? "กำลังเพิ่ม…" : "เพิ่มเข้าพอร์ต"}</Button>
      </form></Modal>}

      {editingAsset && <Modal title={`แก้ไข ${editingAsset.symbol}`} onClose={() => { setEditingAsset(null); setDeleteConfirmOpen(false); }}><form className="modal-form" onSubmit={(event) => onUpdateAsset(event, editingAsset)}>
        <div className="field-grid"><Field label="สัญลักษณ์" name="symbol" defaultValue={editingAsset.symbol}/><Field label="ชื่อ" name="name" defaultValue={editingAsset.name}/><Field label="กลุ่ม" name="sector" defaultValue={editingAsset.sector}/><Field label="สัดส่วนเป้าหมาย (%)" name="targetWeight" type="number" min="0" step="0.1" defaultValue={editingAsset.targetWeight * 100}/><Field label="ราคาล่าสุด (USD)" name="currentPriceUsd" type="number" min="0.01" step="0.01" defaultValue={editingAsset.currentPriceUsd} required={false}/><Field label="ราคาปิดวันก่อน (USD)" name="previousCloseUsd" type="number" min="0.01" step="0.01" defaultValue={editingAsset.previousCloseUsd} required={false}/><Field label="จุดสูงสุด 52 สัปดาห์ (USD)" name="high52wUsd" type="number" min="0.01" step="0.01" defaultValue={editingAsset.high52wUsd} required={false}/></div>
        <Button className="wide" type="submit" disabled={updateAsset.isPending}>{updateAsset.isPending ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}</Button>
        {!deleteConfirmOpen ? <Button variant="ghost" className="danger-button" type="button" onClick={() => setDeleteConfirmOpen(true)}>ลบหุ้นนี้</Button> : <Alert className="delete-confirm" role="alert"><strong>ลบ {editingAsset.symbol} ออกจากพอร์ต?</strong><p>รายการซื้อทั้งหมดของหุ้นนี้จะถูกลบด้วย และย้อนกลับไม่ได้</p><div><Button variant="secondary" type="button" onClick={() => setDeleteConfirmOpen(false)}>ยกเลิก</Button><Button variant="destructive" type="button" onClick={() => deleteAsset.mutate(editingAsset.id)} disabled={deleteAsset.isPending}>{deleteAsset.isPending ? "กำลังลบ…" : "ยืนยันลบหุ้น"}</Button></div></Alert>}
      </form></Modal>}
    </div>
  );
}
