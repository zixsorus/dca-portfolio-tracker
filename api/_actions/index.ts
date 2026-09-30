import type { ActionHandlerMap } from "../_lib/handler";

import * as addAsset from "./addAsset";
import * as addTransaction from "./addTransaction";
import * as applyWeightPreset from "./applyWeightPreset";
import * as backfillPriceHistory from "./backfillPriceHistory";
import * as deleteAsset from "./deleteAsset";
import * as deleteTransaction from "./deleteTransaction";
import * as getPortfolio from "./getPortfolio";
import * as getPriceHistory from "./getPriceHistory";
import * as importBackup from "./importBackup";
import * as importTransactions from "./importTransactions";
import * as previewWeightPreset from "./previewWeightPreset";
import * as refreshMarketPrices from "./refreshMarketPrices";
import * as updateAsset from "./updateAsset";
import * as updateSettings from "./updateSettings";
import * as updateTransaction from "./updateTransaction";

// Typed as ActionHandlerMap so a missing or misspelled action is a compile
// error, and so every handler's return type must match its zod response
// schema.
export const actionHandlers: ActionHandlerMap = {
  addAsset: addAsset.handler,
  addTransaction: addTransaction.handler,
  applyWeightPreset: applyWeightPreset.handler,
  backfillPriceHistory: backfillPriceHistory.handler,
  deleteAsset: deleteAsset.handler,
  deleteTransaction: deleteTransaction.handler,
  getPortfolio: getPortfolio.handler,
  getPriceHistory: getPriceHistory.handler,
  importBackup: importBackup.handler,
  importTransactions: importTransactions.handler,
  previewWeightPreset: previewWeightPreset.handler,
  refreshMarketPrices: refreshMarketPrices.handler,
  updateAsset: updateAsset.handler,
  updateSettings: updateSettings.handler,
  updateTransaction: updateTransaction.handler,
};
