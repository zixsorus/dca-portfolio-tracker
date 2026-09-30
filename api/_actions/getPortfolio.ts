import { asc, desc, eq } from "drizzle-orm";
import * as schema from "../../shared/schema";
import type { ApiHandler } from "../_lib/handler";

export const handler: ApiHandler<"getPortfolio"> = async (_args, { db }) => {
  const [settingRows, assetRows, transactionRows] = await Promise.all([
    db.select().from(schema.settings).limit(1),
    db.select().from(schema.assets).orderBy(asc(schema.assets.id)),
    db.select({
      id: schema.transactions.id,
      assetId: schema.transactions.assetId,
      symbol: schema.assets.symbol,
      tradeDate: schema.transactions.tradeDate,
      grossThb: schema.transactions.grossThb,
      feeThb: schema.transactions.feeThb,
      fxThbUsd: schema.transactions.fxThbUsd,
      priceUsd: schema.transactions.priceUsd,
      note: schema.transactions.note,
      createdAt: schema.transactions.createdAt,
    }).from(schema.transactions)
      .innerJoin(schema.assets, eq(schema.transactions.assetId, schema.assets.id))
      .orderBy(desc(schema.transactions.tradeDate), desc(schema.transactions.id)),
  ]);
  const setting = settingRows[0];
  if (!setting) throw new Error("ไม่พบการตั้งค่าแผนลงทุน");
  return {
    settings: {
      monthlyDca: setting.monthlyDca,
      goalThb: setting.goalThb,
      expectedAnnualReturn: setting.expectedAnnualReturn,
      fxThbUsd: setting.fxThbUsd,
      dailyAlertThreshold: setting.dailyAlertThreshold,
      drawdownThreshold: setting.drawdownThreshold,
      rebalanceTolerance: setting.rebalanceTolerance,
      updatedAt: setting.updatedAt.toISOString(),
    },
    assets: assetRows.map((row) => ({
      id: row.id,
      symbol: row.symbol,
      name: row.name,
      sector: row.sector,
      targetWeight: row.targetWeight,
      currentPriceUsd: row.currentPriceUsd,
      previousCloseUsd: row.previousCloseUsd,
      high52wUsd: row.high52wUsd,
      priceUpdatedAt: row.priceUpdatedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    transactions: transactionRows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
  };
};
