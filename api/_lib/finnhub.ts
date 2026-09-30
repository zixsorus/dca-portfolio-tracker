// Market data via Finnhub REST (replaces ctx.tool.finance_ticker from the
// original Hatch space). Uses free-tier supported endpoints:
// - /quote: real-time/latest price (c), previous close (pc), timestamp (t)
// - /stock/metric: 52-week high (52WeekHigh), 6-month momentum (26WeekPriceReturnDaily)
// - /stock/candle: daily close history (1 year on the free tier)
// Preserves guards: price > 0, per-symbol failure isolation.

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

interface QuoteApiResponse {
  c?: number;
  pc?: number;
  h?: number;
  l?: number;
  o?: number;
  t?: number;
}

interface MetricApiResponse {
  metric?: {
    "52WeekHigh"?: number;
    "26WeekPriceReturnDaily"?: number;
  };
}

export interface PriceSnapshot {
  price: number;
  previousClose: number | null;
  high52w: number | null;
  asOf: Date;
}

/** Fetches quote (price, previous close) and basic metrics (52-week high). */
export async function getPriceSnapshot(symbol: string): Promise<PriceSnapshot> {
  const token = encodeURIComponent(apiKey());
  const sym = encodeURIComponent(symbol);
  const quoteUrl = `${FINNHUB_BASE}/quote?symbol=${sym}&token=${token}`;
  const metricUrl = `${FINNHUB_BASE}/stock/metric?symbol=${sym}&metric=all&token=${token}`;

  const [quoteRes, metricRes] = await Promise.all([
    fetch(quoteUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
    fetch(metricUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }).catch(() => null),
  ]);

  if (!quoteRes.ok) throw new Error(`Finnhub quote HTTP ${quoteRes.status} for ${symbol}`);
  const quoteData = (await quoteRes.json()) as QuoteApiResponse;

  // Unknown or invalid symbols return c=0, t=0
  if (typeof quoteData.c !== "number" || !Number.isFinite(quoteData.c) || quoteData.c <= 0 || !quoteData.t) {
    throw new Error(`invalid price or no data for ${symbol}`);
  }

  const price = quoteData.c;
  const previousClose =
    typeof quoteData.pc === "number" && Number.isFinite(quoteData.pc) && quoteData.pc > 0
      ? quoteData.pc
      : null;

  let high52w: number | null = null;
  if (metricRes && metricRes.ok) {
    try {
      const metricData = (await metricRes.json()) as MetricApiResponse;
      const h52 = metricData.metric?.["52WeekHigh"];
      if (typeof h52 === "number" && Number.isFinite(h52) && h52 > 0) {
        high52w = h52;
      }
    } catch {
      // metric failure is non-fatal; high52w stays null
    }
  }

  return {
    price,
    previousClose,
    high52w,
    asOf: new Date(quoteData.t * 1000),
  };
}

export interface TrendResult {
  trendReturn: number;
  asOfIso: string;
}

/** 6-month momentum return via Finnhub 26WeekPriceReturnDaily metric. */
export async function getTrendReturn(symbol: string): Promise<TrendResult> {
  const token = encodeURIComponent(apiKey());
  const sym = encodeURIComponent(symbol);
  const metricUrl = `${FINNHUB_BASE}/stock/metric?symbol=${sym}&metric=all&token=${token}`;

  const res = await fetch(metricUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Finnhub metric HTTP ${res.status} for ${symbol}`);
  const data = (await res.json()) as MetricApiResponse;

  const returnDaily = data.metric?.["26WeekPriceReturnDaily"];
  if (typeof returnDaily !== "number" || !Number.isFinite(returnDaily)) {
    throw new Error(`not enough metric return data for ${symbol}`);
  }

  return {
    trendReturn: returnDaily / 100, // percentage to decimal
    asOfIso: new Date().toISOString(),
  };
}

interface CandleApiResponse {
  s?: string;
  c?: number[];
  t?: number[];
}

export interface CandlePoint {
  /** UTC calendar day, YYYY-MM-DD. */
  date: string;
  closeUsd: number;
}

/**
 * Daily close history from Finnhub candles.
 *
 * Same guard discipline as `getPriceSnapshot`: unknown symbols come back as
 * `s: "no_data"` (the per-symbol failure), every close must be a finite
 * number > 0, and pairs are kept aligned on the `t`/`c` arrays. The free tier
 * serves roughly one year of daily candles, which is the whole retention
 * window the app uses.
 */
export async function getCandleSeries(symbol: string, fromMs: number, toMs: number): Promise<CandlePoint[]> {
  const token = encodeURIComponent(apiKey());
  const sym = encodeURIComponent(symbol);
  const url = `${FINNHUB_BASE}/stock/candle?symbol=${sym}&resolution=D&from=${Math.floor(fromMs / 1000)}&to=${Math.floor(toMs / 1000)}&token=${token}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Finnhub candle HTTP ${res.status} for ${symbol}`);
  const data = (await res.json()) as CandleApiResponse;
  if (data.s !== "ok") throw new Error(`no candle data for ${symbol}`);

  const closes = data.c;
  const stamps = data.t;
  if (!Array.isArray(closes) || !Array.isArray(stamps) || closes.length === 0 || closes.length !== stamps.length) {
    throw new Error(`invalid candle series for ${symbol}`);
  }

  const points: CandlePoint[] = [];
  for (let index = 0; index < closes.length; index += 1) {
    const close = closes[index];
    const stamp = stamps[index];
    if (typeof close !== "number" || !Number.isFinite(close) || close <= 0) continue;
    if (typeof stamp !== "number" || !Number.isFinite(stamp) || stamp <= 0) continue;
    points.push({ date: new Date(stamp * 1000).toISOString().slice(0, 10), closeUsd: close });
  }
  if (points.length === 0) throw new Error(`no usable closes for ${symbol}`);
  return points;
}
