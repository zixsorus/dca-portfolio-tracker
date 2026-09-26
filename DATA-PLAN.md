# Data Plan

## Runtime source

- **Provider channel:** Muse managed finance ticker tool (`ctx.tool.finance_ticker`)
- **Authentication:** managed by the platform; the artifact does not collect, store, or expose an API key.
- **Fields used:** latest USD price, session change (to derive previous close), trailing 52-week high, currency, exact ticker match, and quote timestamp.
- **Scope:** one exact ticker lookup per saved asset, capped at 50 assets per refresh.

## Refresh behavior

The user starts a refresh from the Plan screen with one tap. The server requests a managed finance quote for each saved ticker, accepts only an exact-symbol result denominated in USD, updates successful rows in the artifact database, records the source timestamp, and reports symbols with no usable quote. Individual failures do not erase older saved prices or block successful symbols.

## Stored data

For each asset the artifact stores the latest successful current price, derived previous close when the source provides session change, 52-week high when available, and quote timestamp. User-entered portfolio settings, assets, and transactions remain unchanged. A failed refresh never invents prices and leaves earlier saved values in place.
