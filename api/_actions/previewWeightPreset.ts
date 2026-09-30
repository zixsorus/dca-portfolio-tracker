import { asc } from "drizzle-orm";
import * as schema from "../../shared/schema";
import { normalizeScores } from "../../shared/actions";
import { getTrendReturn } from "../_lib/finnhub";
import type { ApiHandler } from "../_lib/handler";

export const handler: ApiHandler<"previewWeightPreset"> = async (args, { db }) => {
  const assetRows = await db.select({ id: schema.assets.id, symbol: schema.assets.symbol })
    .from(schema.assets)
    .orderBy(asc(schema.assets.id));

  const methodology = {
    equal: "แบ่งน้ำหนักเท่ากันทุกตัวในแผน",
    trend: "ให้น้ำหนักตามผลตอบแทนราคา 6 เดือน โดยยังคงน้ำหนักขั้นต่ำให้ทุกตัว",
  }[args.preset];

  if (assetRows.length === 0) {
    return { ok: false, preset: args.preset, items: [], missingSymbols: [], asOf: null, methodology, error: "ยังไม่มีหุ้นในแผน" };
  }
  if (assetRows.length > 50) {
    return { ok: false, preset: args.preset, items: [], missingSymbols: assetRows.slice(50).map((asset) => asset.symbol), asOf: null, methodology, error: "พรีเซ็ตรองรับสูงสุด 50 หุ้น" };
  }
  if (args.preset === "equal") {
    const items = normalizeScores(assetRows.map((asset) => ({ ...asset, score: 1, metric: null })));
    return { ok: true, preset: args.preset, items, missingSymbols: [], asOf: null, methodology };
  }

  // Trend preset: 6-month momentum from daily candles (same window math as
  // the original: since.setUTCMonth(since.getUTCMonth() - 6)), score clamped
  // to [0.25, 2.5], fetched in parallel for the serverless time budget.
  const quotes = await Promise.all(assetRows.map(async (asset) => {
    try {
      const trend = await getTrendReturn(asset.symbol);
      return {
        id: asset.id,
        symbol: asset.symbol,
        score: Math.max(0.25, Math.min(2.5, 1 + trend.trendReturn)),
        metric: trend.trendReturn,
        asOf: trend.asOfIso,
      };
    } catch {
      return null;
    }
  }));

  const valid = quotes.filter((quote): quote is NonNullable<typeof quote> => quote !== null);
  const validIds = new Set(valid.map((quote) => quote.id));
  const missingSymbols = assetRows.filter((asset) => !validIds.has(asset.id)).map((asset) => asset.symbol);
  const asOfValues = valid.map((quote) => quote.asOf).filter((value): value is string => value !== null).sort();
  const asOf = asOfValues[asOfValues.length - 1] ?? null;
  if (missingSymbols.length > 0) {
    return {
      ok: false,
      preset: args.preset,
      items: [],
      missingSymbols,
      asOf,
      methodology,
      error: "ข้อมูลตลาดไม่ครบทุกหุ้น จึงยังไม่เปลี่ยนน้ำหนัก",
    };
  }
  return { ok: true, preset: args.preset, items: normalizeScores(valid), missingSymbols: [], asOf, methodology };
};
