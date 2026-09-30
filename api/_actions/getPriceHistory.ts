import { asc } from "drizzle-orm";
import * as schema from "../../shared/schema";
import type { ApiHandler } from "../_lib/handler";

export const handler: ApiHandler<"getPriceHistory"> = async (_args, { db }) => {
  const [assetRows, historyRows] = await Promise.all([
    db.select({ id: schema.assets.id, symbol: schema.assets.symbol })
      .from(schema.assets)
      .orderBy(asc(schema.assets.id)),
    db
      .select({
        assetId: schema.priceHistory.assetId,
        date: schema.priceHistory.date,
        closeUsd: schema.priceHistory.closeUsd,
      })
      .from(schema.priceHistory)
      .orderBy(asc(schema.priceHistory.date)),
  ]);

  const byAsset = new Map<number, { assetId: number; symbol: string; points: Array<{ date: string; closeUsd: number }> }>();
  for (const asset of assetRows) {
    byAsset.set(asset.id, { assetId: asset.id, symbol: asset.symbol, points: [] });
  }
  let from: string | null = null;
  let to: string | null = null;
  for (const row of historyRows) {
    const bucket = byAsset.get(row.assetId);
    if (!bucket) continue; // orphan row from a since-deleted asset
    bucket.points.push({ date: row.date, closeUsd: row.closeUsd });
    if (!from || row.date < from) from = row.date;
    if (!to || row.date > to) to = row.date;
  }

  return { ok: true, from, to, series: [...byAsset.values()] };
};
