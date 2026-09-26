# DCA Portfolio Tracker

A personal web app for tracking a monthly DCA (dollar-cost averaging) investment
plan focused on the "Magnificent 7" US stocks — with purchase logging,
price tracking, goal projection, and rebalancing guidance.

## Stack

- TypeScript, React 19, TanStack Query, Recharts
- Tailwind CSS v4 with shadcn-style UI components (light/dark mode)
- Bun runtime, SQLite via Drizzle ORM
- Market prices via a platform-managed data feed (no API key required)

## Default plan

- Monthly DCA: 2,000 THB
- Goal: 100,000 THB portfolio value
- Assets: AAPL, MSFT, NVDA, TSLA, META, AMZN, GOOGL (equal weight, adjustable)
- Extra stocks/ETFs can be added from the UI

## Notes

- This repo is a source snapshot of a privately hosted web artifact.
- `app.db` (personal portfolio data) is gitignored and never committed.
- Prices shown are for tracking/education only, not investment advice.
