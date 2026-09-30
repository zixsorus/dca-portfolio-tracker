import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  monthlyDca: real("monthly_dca").notNull(),
  goalThb: real("goal_thb").notNull(),
  expectedAnnualReturn: real("expected_annual_return").notNull(),
  fxThbUsd: real("fx_thb_usd"),
  dailyAlertThreshold: real("daily_alert_threshold").notNull(),
  drawdownThreshold: real("drawdown_threshold").notNull(),
  rebalanceTolerance: real("rebalance_tolerance").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const assets = sqliteTable("assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  symbol: text("symbol").notNull().unique(),
  name: text("name").notNull(),
  sector: text("sector").notNull(),
  targetWeight: real("target_weight").notNull(),
  currentPriceUsd: real("current_price_usd"),
  previousCloseUsd: real("previous_close_usd"),
  high52wUsd: real("high_52w_usd"),
  priceUpdatedAt: integer("price_updated_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  assetId: integer("asset_id").notNull().references(() => assets.id, { onDelete: "restrict" }),
  tradeDate: text("trade_date").notNull(),
  grossThb: real("gross_thb").notNull(),
  feeThb: real("fee_thb").notNull(),
  fxThbUsd: real("fx_thb_usd").notNull(),
  priceUsd: real("price_usd").notNull(),
  note: text("note").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

// Daily closing prices kept for the historical charts. Rows are written from
// the same refresh that fills assets.current_price_usd (free — the price is
// already in hand) plus an explicit backfill from Finnhub daily candles.
export const priceHistory = sqliteTable("price_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  assetId: integer("asset_id").notNull().references(() => assets.id, { onDelete: "restrict" }),
  date: text("date").notNull(),
  closeUsd: real("close_usd").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (table) => [uniqueIndex("price_history_asset_date").on(table.assetId, table.date), index("price_history_date").on(table.date)]);
