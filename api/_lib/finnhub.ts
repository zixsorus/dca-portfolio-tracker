// Market data via Finnhub REST (replaces ctx.tool.finance_ticker from the
// original Hatch space). Finnhub US-equity daily candles are USD by
// construction, so the original currency guard (currency === "USD") is
// preserved by construction. The exact-symbol-match guard is replaced by
// Finnhub's `s !== "ok"` / `no_data` signal for unknown symbols, which we
// treat as a per-symbol failure exactly like the original did.

const FINNHUB_BASE = "https://finnhub.io/api/v1";
const REQUEST_TIMEOUT_MS = 20_000;

function apiKey(): string {
  const key = process.env.FINNHUB_API_KEY;
  if (!key || key.trim().length === 0) {
    throw new Error(
      "FINNHUB_API_KEY is not set — กรุณาตั้งค่า FINNHUB_API_KEY ก่อนดึงราคาตลาด",
    );
  }
  return key;
}

interface CandleApiResponse {
  s?: string;
  t?: number[];
  c?: number[];
  h?: number[];
}

export interface CandleData {
  closes: number[];
  highs: number[];
  times: number[];
}

/** Fetch daily candles; throws when Finnhub reports no data or too few points. */
export async function fetchCandles(symbol: string, fromSec: number, toSec: number): Promise<CandleData> {
  const url =
    `${FINNHUB_BASE}/stock/candle?symbol=${encodeURIComponent(symbol)}` +
    `&resolution=D&from=${fromSec}&to=${toSec}&token=${encodeURIComponent(apiKey())}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Finnhub HTTP ${res.status} for ${symbol}`);
  const data = (await res.json()) as CandleApiResponse;
  if (data.s !== "ok" || !Array.isArray(data.t) || !Array.isArray(data.c) || data.t.length === 0) {
    throw new Error(`Finnhub returned no data for ${symbol} (s=${data.s ?? "unknown"})`);
  }
  const rawHighs = Array.isArray(data.h) ? data.h : [];
  const closes: number[] = [];
  const highs: number[] = [];
  const times: number[] = [];
  for (let i = 0; i < data.t.length; i++) {
    const close = data.c[i];
    const t = data.t[i];
    if (typeof close === "number" && Number.isFinite(close) && close > 0 && typeof t === "number") {
      closes.push(close);
      const high = rawHighs[i];
      highs.push(typeof high === "number" && Number.isFinite(high) && high > 0 ? high : close);
      times.push(t);
    }
  }
  if (closes.length < 2) throw new Error(`not enough data points for ${symbol}`);
  return { closes, highs, times };
}

export interface PriceSnapshot {
  price: number;
  previousClose: number | null;
  high52w: number | null;
  asOf: Date;
}

/** 1 year of daily candles → latest close, prior close, 52-week high. */
export async function getPriceSnapshot(symbol: string): Promise<PriceSnapshot> {
  const toSec = Math.floor(Date.now() / 1000);
  const fromSec = toSec - 366 * 24 * 60 * 60;
  const { closes, highs, times } = await fetchCandles(symbol, fromSec, toSec);
  const price = closes.at(-1);
  const previousClose = closes.at(-2) ?? null;
  if (price === undefined || !Number.isFinite(price) || price <= 0) {
    throw new Error(`invalid price for ${symbol}`);
  }
  const maxHigh = highs.length > 0 ? Math.max(...highs) : null;
  const lastTime = times.at(-1);
  if (lastTime === undefined) throw new Error(`not enough data points for ${symbol}`);
  return {
    price,
    previousClose,
    high52w: maxHigh !== null && Number.isFinite(maxHigh) && maxHigh > 0 ? maxHigh : null,
    asOf: new Date(lastTime * 1000),
  };
}

export interface TrendResult {
  trendReturn: number;
  asOfIso: string;
}

/** 6-month daily candles → momentum return (same window math as the original). */
export async function getTrendReturn(symbol: string): Promise<TrendResult> {
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - 6);
  const toSec = Math.floor(Date.now() / 1000);
  const fromSec = Math.floor(since.getTime() / 1000);
  const { closes, times } = await fetchCandles(symbol, fromSec, toSec);
  const first = closes.at(0);
  const last = closes.at(-1);
  const lastTime = times.at(-1);
  if (first === undefined || last === undefined || lastTime === undefined) {
    throw new Error(`not enough data points for ${symbol}`);
  }
  return {
    trendReturn: last / first - 1,
    asOfIso: new Date(lastTime * 1000).toISOString(),
  };
}
