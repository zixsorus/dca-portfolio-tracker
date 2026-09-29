import type { VercelRequest, VercelResponse } from "@vercel/node";
import { asc, eq } from "drizzle-orm";
import * as schema from "../shared/schema";
import { getPriceSnapshot } from "./_lib/finnhub";
import { defineApi } from "./_lib/handler";

const vercelHandler: (req: VercelRequest, res: VercelResponse) => Promise<void> = defineApi(
  "refreshMarketPrices",
  async (_args, { db }) => {
    const assetRows = await db.select({ id: schema.assets.id, symbol: schema.assets.symbol })
      .from(schema.assets)
      .orderBy(asc(schema.assets.id));

    if (assetRows.length === 0) {
      return { ok: false, updated: 0, failedSymbols: [], asOf: null, error: "ยังไม่มีหุ้นในแผน" };
    }

    // Finnhub US-equity daily candles are USD by construction, so the original
    // currency guard (currency === "USD") is preserved by construction. Unknown
    // symbols surface as Finnhub `s: "no_data"`, treated as a per-symbol
    // failure exactly like the original "none" match. Symbols are fetched in
    // parallel (Promise.all) because Vercel serverless functions have a ~10s
    // execution budget — per-symbol try/catch keeps failure isolation and
    // never clears previously stored prices.
    const results = await Promise.all(
      assetRows.slice(0, 50).map(async (asset) => {
        try {
          const snapshot = await getPriceSnapshot(asset.symbol);
          await db.update(schema.assets).set({
            currentPriceUsd: snapshot.price,
            previousCloseUsd: snapshot.previousClose,
            high52wUsd: snapshot.high52w,
            priceUpdatedAt: snapshot.asOf,
          }).where(eq(schema.assets.id, asset.id));
          return { ok: true as const, symbol: asset.symbol, asOf: snapshot.asOf };
        } catch {
          return { ok: false as const, symbol: asset.symbol, asOf: null as Date | null };
        }
      }),
    );

    let updated = 0;
    let latestAsOf: Date | null = null;
    const failedSymbols: string[] = [];
    for (const result of results) {
      if (result.ok) {
        updated += 1;
        if (!latestAsOf || result.asOf > latestAsOf) latestAsOf = result.asOf;
      } else {
        failedSymbols.push(result.symbol);
      }
    }

    if (assetRows.length > 50) {
      failedSymbols.push(...assetRows.slice(50).map((asset) => asset.symbol));
    }

    return {
      ok: updated > 0,
      updated,
      failedSymbols,
      asOf: latestAsOf?.toISOString() ?? null,
      error: updated === 0 ? "บริการราคาตลาดยังไม่ตอบกลับ กรุณาลองใหม่อีกครั้ง" : undefined,
    };
  },
);

export default vercelHandler;
