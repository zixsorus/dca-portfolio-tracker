// Market data via Finnhub REST (replaces ctx.tool.finance_ticker from the
// original Hatch space). Uses free-tier supported endpoints:
// - /quote: real-time/latest price (c), previous close (pc), timestamp (t)
// - /stock/metric: 52-week high (52WeekHigh), 6-month momentum (26WeekPriceReturnDaily)
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
