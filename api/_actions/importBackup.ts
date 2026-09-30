import { inArray } from "drizzle-orm";
import * as schema from "../../shared/schema";
import { transactionInputSchema, type ActionRequest } from "../../shared/actions";
import type { ApiHandler } from "../_lib/handler";

const MAX_ASSETS = 200;
const MAX_TRANSACTIONS = 5000;
type StrictRow = ActionRequest<"addTransaction">;

export const handler: ApiHandler<"importBackup"> = async (args, { db }) => {
  const { settings, assets, transactions } = args.payload;
  const assetInputs = assets.slice(0, MAX_ASSETS);
  const transactionInputs = transactions.slice(0, MAX_TRANSACTIONS);

  // Merge only — nothing is overwritten or deleted. Existing assets win, and
  // settings are written solely when the local row is missing (a fresh
  // database has none, and getPortfolio refuses to load until one exists).
  const existing = await db
    .select({ id: schema.assets.id, symbol: schema.assets.symbol })
    .from(schema.assets);
  const idBySymbol = new Map(existing.map((row) => [row.symbol, row.id]));

  const freshAssets = assetInputs
    .filter((asset) => {
      const symbol = asset.symbol.toUpperCase();
      if (idBySymbol.has(symbol)) return false;
      idBySymbol.set(symbol, -1); // reserve so a duplicate inside the file is skipped too
      return true;
    })
    .map((asset) => ({ ...asset, symbol: asset.symbol.toUpperCase() }));

  let addedAssets = 0;
  if (freshAssets.length > 0) {
    await db.insert(schema.assets).values(freshAssets);
    const inserted = await db
      .select({ id: schema.assets.id, symbol: schema.assets.symbol })
      .from(schema.assets)
      .where(inArray(schema.assets.symbol, freshAssets.map((asset) => asset.symbol)));
    for (const row of inserted) idBySymbol.set(row.symbol, row.id);
    addedAssets = freshAssets.length;
  }
  const skippedAssets = assetInputs.length - freshAssets.length;

  const rows: StrictRow[] = [];
  let skippedTransactions = 0;
  for (const tx of transactionInputs) {
    const assetId = idBySymbol.get(tx.symbol.toUpperCase());
    if (assetId === undefined || assetId < 0) {
      skippedTransactions += 1;
      continue;
    }
    const parsed = transactionInputSchema.safeParse({ ...tx, assetId, note: tx.note });
    if (!parsed.success) {
      skippedTransactions += 1;
      continue;
    }
    rows.push(parsed.data);
  }

  let addedTransactions = 0;
  if (rows.length > 0) {
    const [first, ...rest] = rows;
    await db.batch([
      db.insert(schema.transactions).values(first!),
      ...rest.map((row) => db.insert(schema.transactions).values(row)),
    ]);
    addedTransactions = rows.length;
  }

  const settingRows = await db.select({ id: schema.settings.id }).from(schema.settings).limit(1);
  const settingsApplied = settingRows.length === 0;
  if (settingsApplied) {
    await db.insert(schema.settings).values({ id: 1, ...settings, updatedAt: new Date() });
  }

  return { ok: true, addedAssets, addedTransactions, skippedAssets, skippedTransactions, settingsApplied };
};
