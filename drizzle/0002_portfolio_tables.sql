CREATE TABLE settings (
  id INTEGER PRIMARY KEY,
  monthly_dca REAL NOT NULL,
  goal_thb REAL NOT NULL,
  expected_annual_return REAL NOT NULL,
  fx_thb_usd REAL,
  daily_alert_threshold REAL NOT NULL,
  drawdown_threshold REAL NOT NULL,
  rebalance_tolerance REAL NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sector TEXT NOT NULL,
  target_weight REAL NOT NULL,
  current_price_usd REAL,
  previous_close_usd REAL,
  high_52w_usd REAL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  trade_date TEXT NOT NULL,
  gross_thb REAL NOT NULL,
  fee_thb REAL NOT NULL,
  fx_thb_usd REAL NOT NULL,
  price_usd REAL NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
INSERT INTO settings (id, monthly_dca, goal_thb, expected_annual_return, fx_thb_usd, daily_alert_threshold, drawdown_threshold, rebalance_tolerance, updated_at)
VALUES (1, 2000, 100000, 0.08, NULL, 0.10, 0.20, 0.05, unixepoch('now') * 1000);
--> statement-breakpoint
INSERT INTO assets (symbol, name, sector, target_weight, created_at) VALUES
  ('NVDA', 'NVIDIA', 'Semiconductors', 0.142857142857143, unixepoch('now') * 1000),
  ('AAPL', 'Apple', 'Hardware / Services', 0.142857142857143, unixepoch('now') * 1000),
  ('MSFT', 'Microsoft', 'Software / Cloud', 0.142857142857143, unixepoch('now') * 1000),
  ('TSLA', 'Tesla', 'EV / Energy', 0.142857142857143, unixepoch('now') * 1000),
  ('META', 'Meta Platforms', 'Social / Ads', 0.142857142857143, unixepoch('now') * 1000),
  ('AMZN', 'Amazon', 'Commerce / Cloud', 0.142857142857143, unixepoch('now') * 1000),
  ('GOOGL', 'Alphabet', 'Search / Cloud', 0.142857142857143, unixepoch('now') * 1000);
