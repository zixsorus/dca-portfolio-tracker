// Pure portfolio maths shared by the history charts and the performance card.
// Kept out of the component so the formulas are readable and testable, and so
// `App.tsx` does not grow another 100 lines of arithmetic inside a `useMemo`.

export interface HistoryPoint {
  date: string;
  closeUsd: number;
}

export interface HistorySeries {
  assetId: number;
  symbol: string;
  points: HistoryPoint[];
}

export interface HistoryTransaction {
  assetId: number;
  tradeDate: string;
  grossThb: number;
  feeThb: number;
  fxThbUsd: number;
  priceUsd: number;
}

export interface HistoryRow {
  date: string;
  /** Cumulative gross THB put in, up to and including this day. */
  invested: number;
  /** Marked-to-market value in THB, or null while no FX rate is configured. */
  value: number | null;
  /** Distance below the running peak of `value` — never positive. */
  drawdown: number | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function unitsOf(tx: HistoryTransaction): number {
  return (tx.grossThb - tx.feeThb) / tx.fxThbUsd / tx.priceUsd;
}

/**
 * Turns per-symbol daily closes plus the trade log into the rows the charts
 * need.
 *
 * Conventions, matching the rest of the app: the portfolio is valued at the
 * *current* settings FX rate (not each purchase's historical rate), and days
 * where a symbol has no candle (weekends, holidays) carry the last known
 * close forward. The series starts at the first trade, so an empty portfolio
 * doesn't drag a flat line across the chart.
 */
export function buildHistorySeries(
  series: HistorySeries[],
  transactions: HistoryTransaction[],
  fxThbUsd: number | null,
): HistoryRow[] {
  if (series.length === 0 || transactions.length === 0) return [];

  const firstTrade = transactions.reduce((min, tx) => (tx.tradeDate < min ? tx.tradeDate : min), transactions[0]!.tradeDate);
  const lastTrade = transactions.reduce((max, tx) => (tx.tradeDate > max ? tx.tradeDate : max), firstTrade);

  // last close on or before a given day, for every symbol
  const cursors = series.map((entry) => {
    const points = entry.points.filter((point) => point.date >= firstTrade);
    return { assetId: entry.assetId, points, index: 0, last: null as number | null };
  });

  const dates = [...new Set(cursors.flatMap((cursor) => cursor.points.map((point) => point.date)))]
    .filter((date) => date >= firstTrade && date <= lastTrade)
    .sort();
  if (dates.length === 0) return [];

  // Pre-sort transactions once and walk both streams in lockstep.
  const sortedTx = [...transactions].sort((a, b) => (a.tradeDate < b.tradeDate ? -1 : a.tradeDate > b.tradeDate ? 1 : 0));
  const units = new Map<number, number>();
  let invested = 0;
  let txIndex = 0;
  let peak: number | null = null;

  const rows: HistoryRow[] = [];
  for (const date of dates) {
    while (txIndex < sortedTx.length && sortedTx[txIndex]!.tradeDate <= date) {
      const tx = sortedTx[txIndex]!;
      invested += tx.grossThb;
      units.set(tx.assetId, (units.get(tx.assetId) ?? 0) + unitsOf(tx));
      txIndex += 1;
    }

    for (const cursor of cursors) {
      while (cursor.index < cursor.points.length && cursor.points[cursor.index]!.date <= date) {
        cursor.last = cursor.points[cursor.index]!.closeUsd;
        cursor.index += 1;
      }
    }

    const value = fxThbUsd == null
      ? null
      : cursors.reduce((sum, cursor) => sum + (cursor.last == null ? 0 : (units.get(cursor.assetId) ?? 0) * cursor.last), 0) * fxThbUsd;

    let drawdown: number | null = null;
    if (value != null) {
      peak = peak == null || value > peak ? value : peak;
      drawdown = peak > 0 ? value / peak - 1 : 0;
    }

    rows.push({ date, invested: Math.round(invested), value, drawdown });
  }
  return rows;
}

export interface XirrResult {
  /** Annualised money-weighted return, or null when it cannot be solved. */
  rate: number | null;
  /** Whole-period return, independent of timing. */
  total: number | null;
  /** Days between the first purchase and today. */
  days: number;
  /** True when the window is under a year, so the annualised figure extrapolates. */
  isPartialYear: boolean;
}

interface Flow {
  /** Years since the first flow, fractional. */
  t: number;
  /** Negative for money out, positive for money in. */
  amount: number;
}

function npv(flows: Flow[], rate: number): number {
  let total = 0;
  for (const flow of flows) {
    total += flow.amount / Math.pow(1 + rate, flow.t);
  }
  return total;
}

/**
 * Money-weighted return (XIRR) of the recorded purchases against what the
 * portfolio is worth now.
 *
 * Solved by bisection rather than Newton's method: the function is monotonic
 * in the rate, and bisection cannot diverge on a pathological cash-flow
 * pattern. 200 iterations over [-99.99%, +1000%] is far tighter than the
 * display precision.
 *
 * `null` cases are deliberate and the UI has to explain them:
 * - no purchases, or nothing left to value  → nothing to measure
 * - under 30 days                            → annualising a month of data lies
 * - no sign change in [-99.99%, +1000%]      → return is outside any sane range
 */
export function computeXirr(
  transactions: Pick<HistoryTransaction, "tradeDate" | "grossThb">[],
  currentValueThb: number,
  nowMs: number,
): XirrResult {
  const empty: XirrResult = { rate: null, total: null, days: 0, isPartialYear: false };
  if (transactions.length === 0 || !(currentValueThb > 0)) return empty;

  const dates = transactions.map((tx) => tx.tradeDate).sort();
  const first = dates[0]!;
  const origin = Date.parse(`${first}T00:00:00Z`);
  const end = nowMs;
  const days = Math.round((end - origin) / MS_PER_DAY);
  if (!Number.isFinite(days) || days < 0) return empty;

  const invested = transactions.reduce((sum, tx) => sum + tx.grossThb, 0);
  const total = invested > 0 ? currentValueThb / invested - 1 : null;
  if (days < 30) return { rate: null, total, days, isPartialYear: true };

  const flows: Flow[] = [
    ...transactions.map((tx) => ({
      t: (Date.parse(`${tx.tradeDate}T00:00:00Z`) - origin) / (MS_PER_DAY * 365),
      amount: -tx.grossThb,
    })),
    { t: days / 365, amount: currentValueThb },
  ];
  // Same-day purchases net against the terminal value; without this the root
  // can sit on a discontinuity for a portfolio bought entirely today.
  if (flows[flows.length - 1]!.t === 0) {
    flows[flows.length - 1]!.amount += flows[0]!.amount;
    flows.shift();
  }
  if (flows.length < 2 || flows.some((flow) => !Number.isFinite(flow.t))) return { rate: null, total, days, isPartialYear: days < 365 };

  const low = -0.9999;
  const high = 10;
  const npvLow = npv(flows, low);
  const npvHigh = npv(flows, high);
  if (!Number.isFinite(npvLow) || !Number.isFinite(npvHigh) || npvLow * npvHigh > 0) {
    return { rate: null, total, days, isPartialYear: days < 365 };
  }

  let lo = low;
  let hi = high;
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const mid = (lo + hi) / 2;
    const value = npv(flows, mid);
    if (!Number.isFinite(value)) break;
    if (value > 0) lo = mid;
    else hi = mid;
  }
  const rate = (lo + hi) / 2;
  return { rate, total, days, isPartialYear: days < 365 };
}

/** Resamples a series to at most `max` points, always keeping the last one. */
export function thinSeries<T>(rows: T[], max: number): T[] {
  if (rows.length <= max) return rows;
  const step = (rows.length - 1) / (max - 1);
  const out: T[] = [];
  for (let index = 0; index < max; index += 1) {
    const row = rows[Math.round(index * step)];
    if (row !== undefined) out.push(row);
  }
  return out;
}
