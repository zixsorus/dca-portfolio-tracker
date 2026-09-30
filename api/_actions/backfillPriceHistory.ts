import { asc, sql } from "drizzle-orm";
import * as schema from "../../shared/schema";
import { getCandleSeries } from "../_lib/finnhub";
import type { ApiHandler } from "../_lib/handler";

const HISTORY_DAYS = 365;
const MAX_SYMBOLS = 50;

export const handler: ApiHandler<"backfillPriceHistory"> = async (_args, { db }) => {
  const assetRows = await db
    .select({ id: schema.assets.id, symbol: schema.assets.symbol })
    .from(schema.assets)
    .orderBy(asc(schema.assets.id));

  if (assetRows.length === 0) {
    return { ok: false, symbols: 0, rows: 0, failedSymbols: [], asOf: null, error: "ยังไม่มีหุ้นในแผน" };
  }

  const toMs = Date.now();
  const fromMs = toMs - HISTORY_DAYS * 24 * 60 * 60 * 1000;

  // Parallel for the serverless time budget, per-symbol try/catch for failure
  // isolation — same discipline as refreshMarketPrices. Finnhub is an exact
  // match endpoint, so an unknown symbol is simply a failed symbol.
  const results = await Promise.all(
    assetRows.slice(0, MAX_SYMBOLS).map(async (asset) => {
      try {
        return { ok: true as const, asset, points: await getCandleSeries(asset.symbol, fromMs, toMs) };
      } catch {
        return { ok: false as const, asset, points: [] };
      }
    }),
  );

  let rows = 0;
  let latest: string | null = null;
  const failedSymbols: string[] = [];

  for (const result of results) {
    if (!result.ok || result.points.length === 0) {
      failedSymbols.push(result.asset.symbol);
      continue;
    }
    const seen = new Set<string>();
    const values = result.points
      .filter((point) => {
        // Candles are already unique per day, but guard the upsert target.
        if (seen.has(point.date)) return false;
        seen.add(point.date);
        return true;
      })
      .map((point) => ({ assetId: result.asset.id, date: point.date, closeUsd: point.closeUsd }));
    // Re-running the backfill must not duplicate rows.
    await db.insert(schema.priceHistory).values(values)
      .onConflictDoUpdate({
        target: [schema.priceHistory.assetId, schema.priceHistory.date],
        set: { closeUsd: sql`excluded.close_usd` },
      });
    rows += values.length;
    const newest = result.points[result.points.length - 1]?.date;
    if (newest && (!latest || newest > latest)) latest = newest;
  }

  if (assetRows.length > MAX_SYMBOLS) {
    failedSymbols.push(...assetRows.slice(MAX_SYMBOLS).map((asset) => asset.symbol));
  }

  return {
    ok: rows > 0,
    symbols: Math.min(assetRows.length, MAX_SYMBOLS) - failedSymbols.length,
    rows,
    failedSymbols,
    asOf: latest,
    error: rows === 0 ? "ดึงราคาย้อนหลังไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" : undefined,
  };
};
