# DCA Portfolio Tracker — Vercel port (working copy)

This directory is a **re-platform working copy** of the Hatch web artifact
`dca-portfolio-tracker`, ported to deploy on Vercel as a static SPA + serverless
API functions.

- Source (read-only, never edit): `~/workspace/ts-spaces/dca-portfolio-tracker/`
- This folder: work here freely. It is NOT the canonical artifact — do not
  treat it as one and do not use artifact tools against the `dca-portfolio-tracker`
  slug from here.
- No push/commit to GitHub from this folder without the user's explicit repo
  confirmation.

## Project layout (target)

- **Backend:** Vercel Serverless — a single function `api/handler.ts` dispatching
  through the registry in `api/_actions/index.ts`. Underscore directories are
  not deployed as functions. This keeps the deployment at 1 function
  regardless of how many actions exist (Vercel Hobby caps at 12).
  The file is **not** named `[action].ts`: Vercel's standalone `/api`
  directory maps routes by file path only, and bracket dynamic segments are a
  Next.js feature, so `vercel.json` rewrites `/api/:action` to
  `/api/handler/:action` instead. Do not reintroduce brackets.
- `client/` — React SPA (Vite build → `client/dist`)
- `api/` — serverless functions (one per action, or a single router),
  Node runtime, drizzle-orm + @libsql/client (Turso)
- `shared/` — drizzle schema shared by api/ and scripts, plus pure money
  maths (`allocation.ts`) shared by client and tests
- `drizzle/` — SQL migrations (applied to Turso)
- `scripts/` — seed-from-sqlite.mjs (migrates real data from the original
  `app.db` into Turso; never commits or modifies the original DB file)
- `vercel.json`, `DEPLOY.md` (Thai), `README.md`

## Hard rules

- Never write to `~/workspace/ts-spaces/dca-portfolio-tracker/app.db*`
  (read-only source of real user data for migration).
- Never commit `app.db*`, `*.sqlite*`, `.env*`, API keys, or tokens.
- No Bun-only APIs (`bun:*` imports). Use `process.env` for config.
- DB credentials: `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` env vars.
- Market prices: Finnhub REST (`FINNHUB_API_KEY` env var), keep original
  guards (exact symbol match, USD only, price > 0, per-symbol failure
  isolation). Finnhub's `/stock/candle` is a **paid** endpoint — the free tier
  cannot backfill history, so `price_history` grows from `refreshMarketPrices`
  alone. Do not add a second price provider without asking first.
- Preserve original business logic and validation from `server/src/actions.ts`
  exactly (weights sum to 100%, gross_thb > fee_thb, symbol unique,
  next-round allocation formula, trend preset methodology).
- P&L is defined against **gross** invested, so fees always read as a loss.
  This is intentional and must not be changed; the fee/net figure shown
  alongside is derived, never a replacement.
- UI stays Thai, shadcn components, toasts, reserved error space under
  form fields (client-side only, no logic changes needed).
