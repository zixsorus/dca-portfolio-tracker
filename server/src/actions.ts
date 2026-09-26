import { defineAction, z, type ActionsModule } from "@hatch/space-sdk";
import { asc, desc, eq } from "drizzle-orm";
import * as schema from "./schema";

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

export const Actions = {
  getPortfolio: defineAction({
    request: z.object({}),
    response: z.object({
      settings: settingsShape,
      assets: z.array(assetShape),
      transactions: z.array(transactionShape),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
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
    },
  }),

  updateSettings: defineAction({
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
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      await db.update(schema.settings).set({ ...args, updatedAt: new Date() }).where(eq(schema.settings.id, 1));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  refreshMarketPrices: defineAction({
    request: z.object({}),
    response: refreshPricesResponse,
    async handler(ctx): Promise<z.infer<typeof refreshPricesResponse>> {
      const db = ctx.db<typeof schema>();
      const assetRows = await db.select({ id: schema.assets.id, symbol: schema.assets.symbol })
        .from(schema.assets)
        .orderBy(asc(schema.assets.id));

      if (assetRows.length === 0) {
        return { ok: false, updated: 0, failedSymbols: [], asOf: null, error: "ยังไม่มีหุ้นในแผน" };
      }

      let updated = 0;
      let latestAsOf: Date | null = null;
      const failedSymbols: string[] = [];

      for (const asset of assetRows.slice(0, 50)) {
        try {
          const quote = await ctx.tool.finance_ticker(asset.symbol, { timeout_secs: 20 });
          const instrument = quote.content.instrument;
          const resolvedSymbol = instrument?.symbol?.toUpperCase() ?? null;
          const requestedSymbol = asset.symbol.toUpperCase();
          const price = instrument?.price;
          const currency = instrument?.currency?.toUpperCase() ?? null;

          if (
            !instrument ||
            quote.content.resolved.matched === "none" ||
            resolvedSymbol !== requestedSymbol ||
            typeof price !== "number" ||
            !Number.isFinite(price) ||
            price <= 0 ||
            currency !== "USD"
          ) {
            failedSymbols.push(asset.symbol);
            continue;
          }

          const change = instrument.change;
          const previousClose = typeof change === "number" && Number.isFinite(change) && price - change > 0
            ? price - change
            : null;
          const high52w = typeof instrument.week_52_high === "number" && Number.isFinite(instrument.week_52_high) && instrument.week_52_high > 0
            ? instrument.week_52_high
            : null;
          const parsedAsOf = instrument.as_of ? new Date(instrument.as_of) : new Date();
          const quoteTime = Number.isNaN(parsedAsOf.getTime()) ? new Date() : parsedAsOf;

          await db.update(schema.assets).set({
            currentPriceUsd: price,
            previousCloseUsd: previousClose,
            high52wUsd: high52w,
            priceUpdatedAt: quoteTime,
          }).where(eq(schema.assets.id, asset.id));
          updated += 1;
          if (!latestAsOf || quoteTime > latestAsOf) latestAsOf = quoteTime;
        } catch {
          failedSymbols.push(asset.symbol);
        }
      }

      if (assetRows.length > 50) {
        failedSymbols.push(...assetRows.slice(50).map((asset) => asset.symbol));
      }

      if (updated > 0) ctx.invalidateQueries();
      return {
        ok: updated > 0,
        updated,
        failedSymbols,
        asOf: latestAsOf?.toISOString() ?? null,
        error: updated === 0 ? "บริการราคาตลาดยังไม่ตอบกลับ กรุณาลองใหม่อีกครั้ง" : undefined,
      };
    },
  }),

  addAsset: defineAction({
    request: z.object({
      symbol: z.string().trim().min(1).max(12),
      name: z.string().trim().min(1).max(80),
      sector: z.string().trim().min(1).max(80),
      targetWeight: z.number().min(0).max(1),
    }),
    response: resultShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const symbol = args.symbol.toUpperCase();
      const existing = await db.select({ id: schema.assets.id }).from(schema.assets).where(eq(schema.assets.symbol, symbol)).limit(1);
      if (existing[0]) return { ok: false, error: "มีสัญลักษณ์หุ้นนี้แล้ว" };
      await db.insert(schema.assets).values({ ...args, symbol });
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  updateAsset: defineAction({
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
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const symbol = args.symbol.toUpperCase();
      const duplicate = await db.select({ id: schema.assets.id }).from(schema.assets).where(eq(schema.assets.symbol, symbol)).limit(1);
      if (duplicate[0] && duplicate[0].id !== args.id) return { ok: false, error: "มีสัญลักษณ์หุ้นนี้แล้ว" };
      const { id, ...values } = args;
      await db.update(schema.assets).set({ ...values, symbol }).where(eq(schema.assets.id, id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  deleteAsset: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: resultShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const found = await db.select({ id: schema.assets.id }).from(schema.assets).where(eq(schema.assets.id, args.id)).limit(1);
      if (!found[0]) return { ok: false, error: "ไม่พบหุ้นที่ต้องการลบ" };
      await db.batch([
        db.delete(schema.transactions).where(eq(schema.transactions.assetId, args.id)),
        db.delete(schema.assets).where(eq(schema.assets.id, args.id)),
      ]);
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  addTransaction: defineAction({
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
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const found = await db.select({ id: schema.assets.id }).from(schema.assets).where(eq(schema.assets.id, args.assetId)).limit(1);
      if (!found[0]) return { ok: false, error: "ไม่พบหุ้นที่เลือก" };
      await db.insert(schema.transactions).values(args);
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  deleteTransaction: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: resultShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      await db.delete(schema.transactions).where(eq(schema.transactions.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),
} satisfies ActionsModule;
