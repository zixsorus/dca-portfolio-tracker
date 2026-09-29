#!/usr/bin/env node
/**
 * scripts/seed-defaults.mjs — fill a fresh (empty-schema) database with the
 * app's default starting data: one settings row + the Magnificent Seven assets.
 *
 * Idempotent: uses INSERT OR IGNORE, safe to re-run.
 *
 * Usage (from the project root):
 *   $env:TURSO_AUTH_TOKEN="<token>"   # PowerShell, remote Turso only
 *   node scripts/seed-defaults.mjs --target "libsql://<db>.turso.io"
 *   node scripts/seed-defaults.mjs --target "file:./local.db"
 *
 * Auth token via TURSO_AUTH_TOKEN env var only (never as a CLI arg).
 */

import { createClient } from "@libsql/client";

const DEFAULT_SETTINGS = {
  id: 1,
  monthlyDca: 2000,
  goalThb: 100000,
  expectedAnnualReturn: 0.08,
  fxThbUsd: null,
  dailyAlertThreshold: 0.1,
  drawdownThreshold: 0.2,
  rebalanceTolerance: 0.05,
};

// 2-decimal weights; NVDA at 16% so the total is exactly 100%.
const DEFAULT_ASSETS = [
  ["NVDA", "NVIDIA", "Semiconductors", 0.16],
  ["AAPL", "Apple", "Hardware / Services", 0.14],
  ["MSFT", "Microsoft", "Software / Cloud", 0.14],
  ["TSLA", "Tesla", "EV / Energy", 0.14],
  ["META", "Meta Platforms", "Social / Ads", 0.14],
  ["AMZN", "Amazon", "Commerce / Cloud", 0.14],
  ["GOOGL", "Alphabet", "Search / Cloud", 0.14],
];

function parseArgs(argv) {
  let target = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--target") target = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!target) throw new Error("--target is required (libsql://... or file:...)");
  return target;
}

const target = parseArgs(process.argv.slice(2));
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!target.startsWith("file:") && !authToken) {
  throw new Error("TURSO_AUTH_TOKEN env var is required for remote libsql:// targets.");
}

const client = createClient({ url: target, authToken });
try {
  const s = DEFAULT_SETTINGS;
  await client.execute({
    sql: `INSERT OR IGNORE INTO settings
            (id, monthly_dca, goal_thb, expected_annual_return, fx_thb_usd,
             daily_alert_threshold, drawdown_threshold, rebalance_tolerance, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch('now') * 1000)`,
    args: [
      s.id,
      s.monthlyDca,
      s.goalThb,
      s.expectedAnnualReturn,
      s.fxThbUsd,
      s.dailyAlertThreshold,
      s.drawdownThreshold,
      s.rebalanceTolerance,
    ],
  });
  console.log("settings: default row ensured (id=1)");

  let inserted = 0;
  for (const [symbol, name, sector, weight] of DEFAULT_ASSETS) {
    const r = await client.execute({
      sql: `INSERT OR IGNORE INTO assets (symbol, name, sector, target_weight, created_at)
            VALUES (?, ?, ?, ?, unixepoch('now') * 1000)`,
      args: [symbol, name, sector, weight],
    });
    inserted += Number(r.rowsAffected ?? 0);
  }
  console.log(
    `assets: ${inserted} new default asset(s) inserted ` +
      `(${DEFAULT_ASSETS.length - inserted} already existed)`,
  );
} finally {
  client.close();
}
console.log("Done.");
