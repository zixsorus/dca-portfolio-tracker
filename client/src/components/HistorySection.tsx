import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { thinSeries, type HistoryRow, type HistorySeries } from "../finance";
import { Button } from "./ui";

const baht = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("th-TH", { style: "percent", maximumFractionDigits: 1 });
const number = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 });
const dayLabel = new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "short" });

const MAX_POINTS = 200;

function formatDay(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : dayLabel.format(date);
}

function formatK(value: number): string {
  return `${Math.round(value / 1000)}k`;
}

/**
 * Backward-looking charts, the counterpart to the existing forward projection.
 * Everything here is derived from `price_history` daily closes plus the trade
 * log — no prices are invented, and days with no candle carry the last close
 * forward.
 *
 * The charts are honest about gaps rather than interpolating silently: if the
 * portfolio has never been priced, the value line is absent and only the
 * invested line shows.
 */
export function HistorySection({
  rows,
  series,
  drawdownThreshold,
  fxThbUsd,
  from,
  to,
  backfillPending,
  onBackfill,
}: {
  rows: HistoryRow[];
  series: HistorySeries[];
  drawdownThreshold: number;
  fxThbUsd: number | null;
  from: string | null;
  to: string | null;
  backfillPending: boolean;
  onBackfill: () => void;
}) {
  const data = thinSeries(rows, MAX_POINTS);
  const hasValue = rows.some((row) => row.value != null);

  return (
    <section className="section-block projection-block">
      <div className="section-heading">
        <div><p className="section-kicker">ย้อนหลัง</p><h2>ผลงานจริงตั้งแต่เริ่มลงทุน</h2></div>
        {from && to ? <span className="muted">{formatDay(from)} – {formatDay(to)}</span> : null}
      </div>

      {data.length === 0 ? (
        <div className="empty-state compact">
          <strong>ยังไม่มีประวัติราคา</strong>
          <p>ดึงราคาปิดย้อนหลัง 1 ปีจาก Finnhub เพื่อดูมูลค่าพอร์ตเทียบกับเงินที่ลงไปจริง</p>
          <Button variant="secondary" onClick={onBackfill} disabled={backfillPending}>{backfillPending ? "กำลังดึง…" : "ดึงราคาย้อนหลัง 1 ปี"}</Button>
        </div>
      ) : (
        <>
          <div className="chart-wrap" aria-label="กราฟมูลค่าพอร์ตเทียบกับเงินที่ลงทุนสะสม">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={data} margin={{ top: 8, right: 4, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="historyFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
                <XAxis dataKey="date" tickFormatter={formatDay} tick={{ fill: "var(--dim)", fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={40} />
                <YAxis domain={[0, "auto"]} tickFormatter={formatK} tick={{ fill: "var(--dim)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value, name) => [baht.format(Number(value)), name === "invested" ? "ลงทุนสะสม" : "มูลค่าพอร์ต"]} labelFormatter={(label) => formatDay(String(label))} />
                <Area type="monotone" dataKey="invested" stroke="var(--dim)" strokeWidth={2} strokeDasharray="4 4" fill="none" connectNulls />
                {hasValue && <Area type="monotone" dataKey="value" stroke="var(--accent)" fill="url(#historyFill)" strokeWidth={3} connectNulls />}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="fineprint">
            เส้นประ = เงินลงทุนสะสม เส้นทึบ = มูลค่าพอร์ตที่คิดจากราคาปิดวัน
            {fxThbUsd == null ? " · ยังไม่ได้ตั้งอัตราแลกเปลี่ยน จึงแสดงเฉพาะเงินที่ลงไป" : ` ที่อัตรา ${number.format(fxThbUsd)} บาท/USD`}
            {" · ราคาปิดย้อนหลังไม่ใช่ราคาที่คุณได้จริง"}
          </p>

          {hasValue && (
            <>
              <div className="chart-wrap secondary" aria-label="กราฟระยะถอยจากจุดสูงสุดของพอร์ต">
                <ResponsiveContainer width="100%" height={150}>
                  <AreaChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="drawdownFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--warning)" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="var(--warning)" stopOpacity={0.04} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
                    <XAxis dataKey="date" tickFormatter={formatDay} tick={{ fill: "var(--dim)", fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={40} />
                    <YAxis domain={["dataMin", 0]} tickFormatter={(value) => percent.format(Number(value))} tick={{ fill: "var(--dim)", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(value) => [percent.format(Number(value)), "ถอยจากจุดสูงสุด"]} labelFormatter={(label) => formatDay(String(label))} />
                    <ReferenceLine y={-drawdownThreshold} stroke="var(--destructive)" strokeDasharray="4 4" label={{ value: `เกณฑ์แจ้งเตือน ${percent.format(-drawdownThreshold)}`, fill: "var(--destructive)", fontSize: 10, position: "insideTopRight" }} />
                    <Area type="monotone" dataKey="drawdown" stroke="var(--warning)" fill="url(#drawdownFill)" strokeWidth={2} connectNulls />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="fineprint">ระยะถอยวัดจากจุดสูงสุดของพอร์ต ไม่ใช่ของหุ้นรายตัว</p>
            </>
          )}

          <div className="history-footer">
            <span className="muted">
              {series.reduce((sum, entry) => sum + entry.points.length, 0)} จุดราคา · {series.length} ตัว
            </span>
            <Button variant="ghost" onClick={onBackfill} disabled={backfillPending}>{backfillPending ? "กำลังอัปเดต…" : "อัปเดตราคาย้อนหลัง"}</Button>
          </div>
        </>
      )}
    </section>
  );
}
