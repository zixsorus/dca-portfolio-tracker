import { z } from "zod";

const settingsShape = z.object({
  monthlyDca: z.number(),
  goalThb: z.number(),
  expectedAnnualReturn: z.number(),
  fxThbUsd: z.number().nullable(),
  dailyAlertThreshold: z.number(),
  drawdownThreshold: z.number(),
  rebalanceTolerance: z.number(),
  updatedAt: z.string(),
});

const assetShape = z.object({
  id: z.number(),
  symbol: z.string(),
  name: z.string(),
  sector: z.string(),
  targetWeight: z.number(),
  currentPriceUsd: z.number().nullable(),
  previousCloseUsd: z.number().nullable(),
  high52wUsd: z.number().nullable(),
  priceUpdatedAt: z.string().nullable(),
  createdAt: z.string(),
});

const transactionShape = z.object({
  id: z.number(),
  assetId: z.number(),
  symbol: z.string(),
  tradeDate: z.string(),
  grossThb: z.number(),
  feeThb: z.number(),
  fxThbUsd: z.number(),
  priceUsd: z.number(),
  note: z.string(),
  createdAt: z.string(),
});

const resultShape = z.object({ ok: z.boolean(), error: z.string().optional() });

const refreshPricesResponse = z.object({
  ok: z.boolean(),
  updated: z.number(),
  failedSymbols: z.array(z.string()),
  asOf: z.string().nullable(),
  error: z.string().optional(),
});

const presetType = z.enum(["equal", "trend"]);
const presetPreviewResponse = z.object({
  ok: z.boolean(),
  preset: presetType,
  items: z.array(z.object({
    id: z.number(),
    symbol: z.string(),
    weight: z.number(),
    metric: z.number().nullable(),
  })),
  missingSymbols: z.array(z.string()),
  asOf: z.string().nullable(),
  methodology: z.string(),
  error: z.string().optional(),
});

export function normalizeScores<T extends { id: number; symbol: string; score: number; metric: number | null }>(rows: T[]) {
  const total = rows.reduce((sum, row) => sum + row.score, 0);
  if (!(total > 0)) return [];
  let assigned = 0;
  return rows.map((row, index) => {
    const isLast = index === rows.length - 1;
    const weight = isLast ? Math.max(0, 1 - assigned) : Math.round((row.score / total) * 10000) / 10000;
    assigned += weight;
    return { id: row.id, symbol: row.symbol, weight, metric: row.metric };
  });
}

export const actionSchemas = {
  getPortfolio: {
    request: z.object({}),
    response: z.object({
      settings: settingsShape,
      assets: z.array(assetShape),
      transactions: z.array(transactionShape),
    }),
  },
  updateSettings: {
    request: z.object({
      monthlyDca: z.number().positive(),
      goalThb: z.number().positive(),
      expectedAnnualReturn: z.number().min(-0.99).max(2),
      fxThbUsd: z.number().positive().nullable(),
      dailyAlertThreshold: z.number().min(0).max(1),
      drawdownThreshold: z.number().min(0).max(1),
      rebalanceTolerance: z.number().min(0).max(1),
    }),
    response: resultShape,
  },
  refreshMarketPrices: {
    request: z.object({}),
    response: refreshPricesResponse,
  },
  previewWeightPreset: {
    request: z.object({ preset: presetType }),
    response: presetPreviewResponse,
  },
  applyWeightPreset: {
    request: z.object({
      items: z.array(z.object({ id: z.number().int().positive(), weight: z.number().min(0).max(1) })).min(1).max(50),
    }),
    response: resultShape,
  },
  addAsset: {
    request: z.object({
      symbol: z.string().trim().min(1).max(12),
      name: z.string().trim().min(1).max(80),
      sector: z.string().trim().min(1).max(80),
      targetWeight: z.number().min(0).max(1),
    }),
    response: resultShape,
  },
  updateAsset: {
    request: z.object({
      id: z.number().int().positive(),
      symbol: z.string().trim().min(1).max(12),
      name: z.string().trim().min(1).max(80),
      sector: z.string().trim().min(1).max(80),
      targetWeight: z.number().min(0).max(1),
      currentPriceUsd: z.number().positive().nullable(),
      previousCloseUsd: z.number().positive().nullable(),
      high52wUsd: z.number().positive().nullable(),
    }),
    response: resultShape,
  },
  deleteAsset: {
    request: z.object({ id: z.number().int().positive() }),
    response: resultShape,
  },
  addTransaction: {
    request: z.object({
      assetId: z.number().int().positive(),
      tradeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      grossThb: z.number().positive(),
      feeThb: z.number().min(0),
      fxThbUsd: z.number().positive(),
      priceUsd: z.number().positive(),
      note: z.string().trim().max(240),
    }).refine((v) => v.grossThb > v.feeThb, { message: "ยอดซื้อรวมต้องมากกว่าค่าธรรมเนียม" }),
    response: resultShape,
  },
  deleteTransaction: {
    request: z.object({ id: z.number().int().positive() }),
    response: resultShape,
  },
} as const;

export type ActionName = keyof typeof actionSchemas;
export type ActionRequest<A extends ActionName> = z.infer<(typeof actionSchemas)[A]["request"]>;
export type ActionResponse<A extends ActionName> = z.infer<(typeof actionSchemas)[A]["response"]>;
