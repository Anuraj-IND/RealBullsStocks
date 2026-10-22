# Fix Log — Chart, Market Data, Auth & UI

Living document of significant fixes made to the local Realbulls stack.
Newest session first.

---

## 2026-10-22 — No stale data in any calculation (fallback audit)

- Removed fresh-stamps on stale data: bridge + Kite ticker no longer
  `Date.now()`-stamp quoteless responses — they skip, so the last honest
  snapshot keeps its real age and STALE_QUOTE keeps gating fills.
- `accountUnrealized` mark ladder is now fresh (<5min) → last cached (any
  age) → entry-only-if-never-quoted. A dark position marks at its last
  price, never a silent zero that would hide a live loss from margin checks.
- Audited the rest, all safe as-is: `runRiskCycle` skips quoteless symbols;
  fills throw NO_QUOTE/STALE_QUOTE past 5min (SL path included — a stale
  trigger aborts at the gated close); ticket preview is advisory with the
  server as enforcer; chart history join is display-only.
- Verified live: BTC 0.2s, crude printing ~1/sec via ticker.

---

## 2026-10-22 — Full ₹ ledger migration (×83.5) + 27/27 panel validation

- Ledger is rupees end to end: `quoteToUsd` → `quoteToInr` (INR×1,
  foreign×83.5), brokerage passthrough (no more ÷83.5), web money identity,
  notify payloads `{amountInr}`, ₹ error strings, `baseCurrency: "INR"` on
  all create paths + seed, signup default ₹83,50,000.
- One-shot migration with the API stopped: accounts/positions/ledger ×83.5
  (9/34/346 rows), notification JSON converted, append-only trigger lifted
  inside the tx and proven restored (UPDATE still raises). Fee configs,
  prices, qtys, percents untouched. Guard refuses re-run.
- Validation: every panel via API across 3 profiles — login, me, assets
  (BTC market-$, crude as-is), watchlists, orders+history, positions+history
  (equity identity, ₹ commissions), ledger walk == balance to the paise,
  analytics identity, alerts, broker, notifications (structured live),
  admin users/summary/trades/positions/ledger, trader4510 = ₹26,412.62
  exact, plus a live 1-lot close (realized exact, ₹3.00 both legs).
  27 PASS, 0 FAIL (2 first-run FAILs were test-authoring bugs, system clean).

---

## 2026-10-22 — ₹-only UI (dollar purge, display phase)

- Currency switch deleted (TopBar + AdminConsole); store pinned to INR,
  stale `rb_currency=USD` scrubbed on hydrate; `money.*` hardcodes ₹.
- New `fmtMarket(price, quoteCurrency)`: INR as-is, USD/USDT ×83.5, foreign
  ratios plain with no symbol, unresolved → "—". Applied to every price
  surface (ticker, header, book, tape, watchlist, chart candles + live edge
  with converted precision, ticket, positions/history/orders, analytics,
  alerts, all admin cells). Inputs (limit/stop/SL/TP/alerts) typed in ₹,
  converted back tick-rounded on submit — API untouched (market terms).
- Notifications carry structured `{amountUsd, price, quoteCurrency}` (new
  nullable `data` column, additive); bell/center/toasts render ₹ with a
  legacy-text fallback. API margin errors now read ₹. SEO + help copy fixed.
- Verified: engine 30/30, all typechecks clean, zero `$`/USD in web+api
  sources outside symbol names, live 1-lot close (commission exact,
  structured notif live end to end).

---

## 2026-10-22 — Indian markets now tick-by-tick (Kite WS ticker, REST retired)

- Kite REST polling (2s) replaced with the WS ticker (`wss://ws.kite.trade`,
  Zerodha's `gokiteconnect`): FULL-mode subscription to every registry
  instrument token (16 live), resync every 30s for newly added symbols, token
  re-read on every reconnect (survives the 6am rotation). Same dual-write as
  every feed; exchange timestamps preserved (tradability gates unaffected).
- Verified live 17:52 IST (MCX open): all 16 symbols publishing, median gap
  0ms; crude payloads show real advancing exchange prints
  (…750→…751→…758, mid 9443→9447). NSE validates at the 9:15 open.
- Quote-bridge retuned to pure gap-filler (stale gate 1.5s → 8s, above the
  ticker cadence) so it never races live ticks; old REST poller deleted.
- Incidents along the way: box DNS flapped (both Kite + Binance unreachable
  for minutes — both feeds self-recovered); fixed a nil-Conn panic where the
  resync loop could fire while disconnected (connected-flag guard).

---

## 2026-10-22 — Crypto is now per-trade tick-by-tick (aggTrade + bookTicker)

- The 2.5s "delay" on BTC was upstream silence (no best bid/ask change, so
  Binance sent nothing) plus 2s REST sampling — the pipeline itself has no
  timers (`ReadMessage` → publish instantly; earlier it carried 100+/sec).
- Gateway now subscribes `aggTrade` alongside `bookTicker` per symbol: every
  printed trade publishes a tick immediately (real bid/ask kept from the
  book, trade price as mid). Verified live: **651 BTC publishes in 12s,
  median gap 1ms, max 725ms**. This is the physical speed limit — silence
  between prints means no trades happened, not lag.

---

## 2026-10-22 — Terminal Balance is now live walk-away money

- The header Balance cell shows live equity (settled + open P&L, breathing
  every tick) with the settled ledger balance as a sub-caption. Display-only:
  the stored balance, ledger trail, margin math and the 95% trigger are
  untouched (making the stored balance move would double-count inside margin
  level and the trigger).

---

## 2026-10-22 — Live margin hold + no-stale-balance (stacking protection)

- Ticket `freeMarginAfter` is now true free funds (balance + live P&L −
  locked margin − requirement), not raw balance minus requirement — a second
  position prices off the first one's live hold. Test updated to the new rule.
- Affordability re-checked *inside* the fill transaction (market + pending
  fills) with `FOR UPDATE` serialization — closes the race that once filled
  an order on a negative balance.
- Session (TopBar balance/margin) now refreshes after every fill/close/
  close-all/quick-order — it previously loaded once at login and sat stale.
  Ticket fallbacks reordered to WS snapshot → positions summary (3s) →
  session, so unrealized can never silently price as 0 while positions move.
- Verified live: 1-lot open locks $113.62 + live −$1.14 in the summary the
  ticket reads; 1000-lot rejected ("need 113628.74"); close posts +$1.26 and
  /me returns balance $10,100.87 + margin 0.

- All accounts ACTIVE (house×2 SUSPENDED by design); admin + riskprobe
  logins tested OK; rahul actively trading, others with recent IPs.
- trader4510's ₹76,596 (vs restored ₹8.76L) traced to a legit 12:24Z admin
  WITHDRAWAL of $9,580.84 — no new raw postings, incident closed.
- 95% path re-validated: all 5 `quoteToUsd` sites intact, single writer
  (`docker ps -a` empty, one :4000 listener), rahul's live ETH mark matches
  independent math to 0.0005 (2.79% vs 95% trigger), converted close legs
  proven post-exit. A repeat needs another pre-conversion writer — none exists.
- Freshness: BTC 0.3s, crude ~8s (exchange trade-time), positions 1s/3s.
  NSE dark = market closed.

---

## 2026-10-22 — Post-exit validation: accounts, 95% path, no-stale-data

- Stopped `realbulls-api/-web/-ws` first (raw-math writer dead), then migrated
  fully: Kite token rescued from container redis → Memurai 6379 (verified);
  host API repointed to 6379 (broker still connected, quotes flowing);
  database pg_dumped (12.8MB) → portable PG16 initdb/restore with exact
  counts (ledger 254, positions 26, users 9) → cut over to localhost:5432;
  native Go gateway on 8080 for Binance (BTC sub-second again, Kite stays on
  the quote-bridge); `compose down` — zero containers remain.
- Verified post-exit: 32 assets, crude ticking, burn-in 1-lot crude close
  posts converted legs (commission $0.03592814 = 2×₹1.5/83.5).
- trader4510 restored +$20,596.43 (raw postings $21,088.51 vs true $492.08).
  Overrides left at 10000/10000 — now converting correctly ($119.76/leg).
- Reboot notes: Memurai auto-starts (service); Postgres needs
  `pg_ctl -D D:\realbulls-infra\data -l D:\realbulls-infra\pg.log start`;
  gateway needs `go run ./cmd/gateway` with the Binance env; API runs in its
  terminal as before. Backups: `D:\realbulls-infra-dump.sql`,
  `C:\Users\anura\AppData\Local\Temp\opencode\kite-token.txt`.

---

## 2026-10-22 — Full Docker exit (native Postgres + Memurai + native gateway)

---

## 2026-10-22 — Stale Docker API auto-closed live positions with pre-conversion math (−₹19.5L day)

- Two 1-lot crude closes posted **raw INR values as USD**: realized
  −$594.28/−$494.23 (true −$7.12/−$5.92) and close commission $10,000.00
  (true $119.76 for the ₹10,000/lot override) — booked Day P&L −₹19.5L on
  ~₹500/position of real market movement.
- Root cause is operational, not formula: host PG is shared with the stale
  `realbulls-api` container (image built Oct 20, pre-`quoteToUsd`). Its risk
  worker sees INR-asset unrealized **83.5× inflated**, so the 95% auto-close
  trips on healthy positions within seconds and books them with raw math.
  Proven by `MARGIN_CALL / Positions auto-closed` notifications 18ms/46ms
  after each close, exact-figure fingerprints ($10,000.00, −594.28), and a
  full ledger walk ($407 → +$16 → +$255 → −$10,238 → −$10,358 → +$420 →
  +$300 → −$10,294). USD assets (BTC) are immune — no conversion involved.
- Collateral findings: 11:06/11:08 positions survived (manual close won the
  race / marks stayed above the raw threshold); an 11:16:26 open filled with
  −$10k balance (affordability race — request in flight before the close
  committed); one close is stamped 1.5s before its open (container/host
  clock step, sequence proven by refIds + notifications).
- Fix is operational: stop the stale stack (`docker stop realbulls-api
  realbulls-web realbulls-ws`, keep redis/postgres) so only the converting
  host API writes; then restore the account via ledger adjust. Do NOT top up
  before stopping — the ₹9L grant was eaten in 27s the same way.

---

## 2026-10-22 — Search expiry badge: group-based MONTHLY/WEEKLY (was +7-day guess)

- `Watchlist.tsx` tagged expiries MONTHLY vs WEEKLY by adding 7 days and
  checking for a month-boundary cross — wrong once NSE moved expiries to
  Tuesday plus holiday shifts (TCS Nov 2026 monthly moved Mon 23rd for Guru
  Nanak Jayanti; 23+7=30 Nov stayed in-month → mislabeled WEEKLY).
- New rule, computed over the whole search result set: group rows by
  (exchange, underlying, calendar month); the LAST expiry in each group is
  MONTHLY, earlier ones WEEKLY. Verified: TCS Oct/Nov/Dec → 3× MONTHLY;
  synthetic NIFTY weeklies → WEEKLY with last-of-month MONTHLY. Generic for
  any searched underlying — no symbol lists.

---

## 2026-10-22 — True 2s live quotes (quote-bridge cadence + gateway aligned)

- The bridge polled Kite every 10s but only refreshed symbols whose cached
  snapshot was >30s old — every displayed price was effectively ~30s stale
  even while the WS fanout to the browser is instant. The stale gate, not
  the poll, was the latency.
- New defaults: bridge poll 2s, stale gate 1.5s (`QUOTE_BRIDGE_POLL_MS` /
  `QUOTE_BRIDGE_STALE_MS`, clamped ≥1s/0.5s; template updated). Stale < poll
  ⇒ every cycle refreshes every registered symbol — quotes are at most one
  poll old end to end: Kite → bridge → Redis dual-write → gateway `ticks:*`
  fanout → browser. The chart's live candle, ticket, watchlist and P&L all
  paint straight from WS ticks (rAF-batched), so there is no display-side
  lag; crypto (Binance WS) remains sub-second.
- Gateway aligned: its Kite poller default dropped 30s → 2s
  (`ZERODHA_POLL_MS`, compose + `infra/.env` updated) and the Go clamp that
  silently forced any poll <5s back to 30s now floors at 1s (→2s), so the
  two Kite loops can never overwrite each other with stale ticks once the
  gateway's container DNS is fixed. TwelveData default 60s → 15s (one
  batched req/poll stays inside free-plan limits; feed still off — no key).
- Per-feed cadence (single reference): crypto = Binance WS sub-second;
  all Indian (NSE/MCX/FNO) = Kite REST every 2s via bridge (+ gateway once
  healthy); forex/metals = TwelveData every 15s when keyed, otherwise dark.
- Hardening alongside: in-flight guard prevents overlapping cycles when a
  Kite response is slow; 250ms pause between >500-instrument chunks keeps
  the bridge under Kite's quote rate limits (~0.5 req/s at 16 symbols).
- Verified live (03:00 IST, markets closed): every registry symbol
  (CRUDEOIL/NATURALGAS FUT+OPT, NIFTY/stock FUT+OPT, …) publishes on
  `ticks:*` every 2.0s; crypto (Binance) remains sub-second. Closed markets
  republish the same last price with the exchange's real ts, so
  tradability gates (STALE_QUOTE) still work unchanged.

---

## 2026-10-22 — 15-second minimum holding period on manual closes

- Replaces the earlier hold-and-fill model: a manually closed position must
  be at least `MIN_HOLD_MS` old (default 15s, env-overridable), otherwise the
  close is rejected with `422 POSITION_TOO_NEW` + remaining seconds; aged
  positions close instantly. By close time quotes have refreshed, so stale
  ticks can't be exploited. Risk-engine closes (SL/TP, liquidation,
  auto-close) and admin force-close bypass the gate; close-all closes aged
  rows and reports `skipped` with per-row waits.
- UI: instant `Hold on / You can close in Xs` toast on young positions
  (client pre-check from `openedAt`; server re-enforces), partial close-all
  reports who still needs time. Verified live: instant close → 422
  `Wait 15s…`; after 16s → 0.1s fill.

---

## 2026-10-22 — Brokerage is rupees: converted + defaults for new assets

- Fee config (per-lot/per-order, incl. user overrides) is rupee-denominated
  but entered USD math raw. Converted at the single choke point
  (`getBrokerage` → USD) and in the ticket preview — same pattern as prices.
- Gap found alongside: instrument-created assets (e.g. crude) have no
  `AssetConfig` row, so brokerage was silently 0. `getEffectiveConfig` now
  falls back to seed parity (FOREX 3.5, COMMODITY 1.5 per lot); explicit 0
  still respected. Verified: crude → ₹1.5/lot → $0.01796 → displays ₹1.50.

- `previewOrder`: `requiredMargin = notional/leverage + fee`,
  `freeMarginAfter = balance − requiredMargin`. Acceptance check unchanged in
  effect (still true free funds) — only the quoted figures follow the new
  formulas. Margin storage/ledger untouched (fee stays a separate COMMISSION
  posting, margin stays releasable collateral). Rejection message updated.
- Per-order brokerage is charged on open AND close (incl. stop-loss closes,
  same `closePosition` path), so required margin now holds **2× fee**.
  Verified live: ₹100/order → open $1.1976 + close $1.1976 = $2.39521 total.
- Verified live (crude @ 9200): notional $11,017.96, required $1,103.30
  ($1,101.80 + $1.50 fee), freeAfter $8,896.70. Engine 23/23, api+web clean.

- All 32 `Asset.maxLeverage` rows → 500 (one-off update); seed rows and
  `ensureAssetForInstrument` now default 500 so it sticks. Rules/floors
  untouched — they still bind below the ceiling.
- Verified: `trader4510`/BTC → **500** (dormant override now live);
  `trader`/BTC → 20, `AXISBANK` → 20 (rules bind, unchanged).
- Side effects to know: with caps at 500, global rules now bind where the
  old cap did — NFO futures 10 → **200** (global INDEX rule), MCX 10 → **100**
  (global COMMODITY rule). Say the word to pin those back with explicit
  rules if 10x should stay their default.

- Symptom: admin set `CRYPTO 1:500` for `trader4510@realbulls.local`, ticket
  showed `1:20`. Trace proved the override row was stored and matched
  correctly — `resolveRisk()` clamped it via `min(…, asset.maxLeverage = 20)`.
- Decision: reverted the override-wins experiment; caps always win
  (`market.service.ts` back to HEAD state). The 500 row stays dormant in the
  DB. Platform max remains 20 unless caps themselves are raised.
- Cap-20 trace, all green: `trader4510`/BTC → 20 (override present, clamped),
  `trader4510`/NIFTY26OCTFUT → 10, `trader4510`/AXISBANK → 20,
  `trader@realbulls.io`/BTC → 20. Live trade (probe account, 20x): BUY 0.01
  BTC @ 84,314.44 → margin $42.157 (= notional/20 exactly); close @ 84,309.14
  → realized -$0.053; ledger HOLD/RELEASE/REALIZED_PNL all consistent.
- Follow-up fixed: admin segment vocabulary (`INDEX_FUTURES`, …) never
  matched NFO/MCX asset segments (`NFO-FUT`, `MCX-FUT`). Added
  `canonicalSegment()` in `market.service.ts` (`MCX-*` → `COMMODITY`,
  `*-FUT` → `INDEX/STOCK_FUTURES` by asset class, `*-OPT` → `…_OPTIONS`,
  `NSE`/`BSE` → `EQUITY`; idempotent on canonical values) and used it in
  `resolveRisk` override matching + `isSegmentTradable`. Verified on probe
  account: `INDEX_FUTURES`→5 hits `NIFTY26OCTFUT` (5, capped from 10),
  `COMMODITY`→7 hits `CRUDEOIL26NOVFUT` (7); `AXISBANK26OCTFUT` control stays
  10. Overrides cleaned up after. Note: for restricted tenants this also
  newly *allows* previously-blocked F&O/MCX rows under matching canonical
  lists — intended, but worth knowing.

---

## 2026-10-21 — Fixed 83.5x notional/margin/P&L blow-up on INR instruments

- Symptom: `CRUDEOIL26NOVFUT` ticket showed Notional `₹76,920.20` for
  `0.1 lots x Rs 9,212` (correct: `Rs 921.20`); AXISBANK/HDFCBANK similarly
  wrong. Root cause: ledger/margin math is USD-denominated but INR-quoted
  prices entered it raw — `0.1 x 9212 = 921.2` was treated as USD, then the
  display multiplied by `83.5` again.
- New `quoteToUsd()` in `packages/engine` (`DEFAULT_USD_INR = 83.5`,
  overridable via API `USD_INR` / web `NEXT_PUBLIC_USD_INR`, both added to the
  `.env.example` files). Prices stay in market terms in storage/display
  (`fmtPrice`); only USD-bound values convert. Applied in `order.service.ts`
  (preview, fill margin, close realized, risk-cycle marks, pending fills),
  `pnl.worker.ts` snapshots, and the `OrderTicket` preview.
- Formula confirmed: futures/options `qty x lot size x price`
  (`contractSize`), cash equities `qty x price` (`contractSize = 1` for
  `AXISBANK`/`HDFCBANK`). **Lot-size correction:** Kite normalizes every MCX
  `lot_size` to 1 while NFO/BFO lots arrive real (NIFTY 65, BANKNIFTY 30,
  AXISBANK 625). Added an `MCX_LOTS` spec table in `instrument.service.ts`
  (CRUDEOIL 100 / mini 10, GOLD 100 / mini 10, SILVER 30 / mini 5 / micro 1,
  NATURALGAS 1250, COPPER 2500, NICKEL 1500, ALUMINIUM/ZINC/LEAD 5000,
  MENTHAOIL 360, COTTON 25, CASTORSEED 100; unknown fall back to Kite's
  value). Re-synced, backfilled the 4 live MCX assets
  (crude 1 → 100, NG 1 → 1250). Ticket caption now reads true lots.
- **MCX session hours:** `isMarketOpen` treated every commodity as open all
  weekday; MCX actually trades 9:00–23:30 IST, so badges lingered open after
  close. `MCX-*` segments now follow the real window in `market-hours.ts`.
  (`1 lot = N units · Notional = qty x N x price`), resets the default qty to
  `1` whole lot when switching to a derivative (API rejects fractional lots),
  since the old `0.10` default was unsubmittable there.
- Verified live (MCX open): BUY 1 lot filled `@ 9211.92` (market terms),
  `marginUsed $11.03`, closed at `9211` → `realized -$0.011` (spread only).
- 95% auto-close validated live: staged BUY 0.013 BTC @ 8,000,000 on a
  throwaway signup (`riskprobe@realbulls.io`, ≈-103% unrealized) → risk cycle
  closed it within seconds, `realized -$102,899.82`, `marginUsed 0`,
  `Positions auto-closed` notification delivered. Probe account left at
  -$2,899.82 for inspection (suspend it from `/admin` when done).
  Engine suite 21/21 incl. new crude/equity conversion cases; api+web
  typecheck clean. Note: closed trades from before keep their old values;
  open positions self-correct on the next risk-cycle mark.

---

## 2026-10-21 — Fixed currency hydration mismatch on /terminal

- Recoverable Error `Hydration failed … server rendered text didn't match the
  client`: `useUiStore` initialized `currency`/`advanced` from `localStorage`
  at module load (`lib/store.ts`), so the server prerendered INR defaults
  while the client hydrated stored USD (`$0.00` vs `₹0.00`, toggle classes in
  `TopBar`/`AccountBar`). Same latent bug in `advanced`.
- Store now initializes with static server-matching defaults (`INR`/`false`)
  and applies stored preferences after mount via `hydrateUi()`, called once in
  `AppProviders` — the same pattern `I18nProvider` already uses for locale.
  `pnpm --filter @realbulls/web typecheck` clean; hot-reloaded, no restart.

---

## 2026-10-21 — MCX instruments searchable + host quote bridge for live ticks

- **Search gap:** instrument sync/search only covered `NFO`/`BFO`/`NSE`, so
  commodity futures (MCX `CRUDEOIL`, `GOLD`, `SILVER`, `NATURALGAS`, …) were
  unfindable. Added `MCX` to `DEFAULT_EXCHANGES` in
  `apps/api/src/services/instrument.service.ts` (sync + search) and mapped
  MCX rows to `COMMODITY` (was `STOCK`, which would have applied NSE 9:15–15:30
  hours instead of the weekday rule in `lib/market-hours.ts`). Synced 16,247
  MCX contracts (72,015 total); `q=crude oil&type=FUT` returns Nov/Dec/Jan…
  `CRUDEOILxxFUT` plus minis, earliest expiry first.
- **No live ticks:** the Docker `ws-gateway` (image predates the repo, logs
  nothing on Kite failures, container DNS flaky per its Binance errors)
  published zero `realbulls:price:*` keys for any Kite instrument despite a
  fresh broker token and a correct registry — verified host-side
  `GET api.kite.trade/quote?i=MCX:CRUDEOIL26NOVFUT` → `200`, `last_price 9202`.
  No Docker operations allowed, so added `apps/api/src/services/quote-bridge.worker.ts`,
  started/stopped in `apps/api/src/index.ts` alongside the other workers: every
  10s it backfills only symbols whose snapshot is missing/stale (>30s) with the
  gateway-identical dual-write (`PUBLISH ticks:<SYM>` + `SET realbulls:price:<SYM>`,
  0.3 bps spread, IST exchange timestamps). It stands down per symbol once the
  gateway recovers, so no duplicate traffic.
- Verified: 26 → 42 price keys, `CRUDEOIL26NOVFUT` `mid 9208 live`,
  `marketOpen true`; illiquid `CRUDEOIL26NOV3850CE` (last traded 6 days ago)
  correctly stays quote-less under the 5-min freshness rule.
- **Empty charts:** the live candle worker only builds bars forward, so new
  contracts graphed nothing. Added `apps/api/src/services/history.service.ts`:
  minute history from Kite (`/instruments/historical`, 7-day lookback) with
  local M5/M15/H1 aggregation into the worker's UTC buckets;
  auto-backfills fire-and-forget in `ensureAssetForInstrument` plus manual
  `POST /assets/:id/candles/backfill`. `CRUDEOIL26NOVFUT` backfilled 4,714 M1
  + 82 H1 bars; live worker continues forward from there.
  `pnpm --filter @realbulls/api typecheck` clean; host `tsx watch` picked it up
  with no restart.

---

## 2026-10-20 — Removed synthetic market data

- Deleted the synthetic Go feed and its market-hours fallback. The gateway now
  publishes only Binance, TwelveData and Kite ticks.
- NSE/NFO quotes use a fresh live tick or the latest official NSE bhavcopy close.
- Orders require a fresh live quote; closed markets return `MARKET_CLOSED`.
- Removed synthetic asset/watchlist seeds and reset local demo orders, positions
  and ledger balances.
- NSE close ingestion now maps FO contracts by `FinInstrmNm`, CM by `TckrSymb`,
  parses ISO trade dates, and covers all nine NFO assets.

---

## 2026-10-20 — Deployment hardening and production runbook

- Added `.dockerignore` so `apps/api/.env`, `apps/web/.env.local`, `infra/.env`,
  build output, logs and archives can never be baked into images or shipped in
  deploy tarballs.
- `infra/Dockerfile.api` / `Dockerfile.web` now copy `pnpm-lock.yaml`, install
  with `--frozen-lockfile --filter <app>...`, and pin pnpm 10.19.0. The web
  build now receives `NEXT_PUBLIC_ROOT_DOMAIN` in addition to site/API/WS URLs.
  `Dockerfile.ws` no longer hides `go mod download` failures.
- `infra/docker-compose.yml`: web build args completed, API `ROOT_DOMAIN` aligned
  with `ROOT_DOMAIN`, JWT TTLs/`REGISTRY_KEY` passed through, API/web
  healthchecks added, and Docker log rotation (`10m`, 3 files) enabled on every
  service.
- `infra/.env.example`: production-safe defaults (`SITES` only the real host,
  `ALLOW_SIGNUP=false`), added JWT TTLs, `REGISTRY_KEY`, `TWELVEDATA_SYMBOLS`
  (correct `INTERNAL=EXTERNAL` format), `ZERODHA_SYMBOLS` and
  `ZERODHA_REDIRECT`.
- `.github/workflows/deploy.yml`: triggers on `master`, supports
  `workflow_dispatch` with a one-time `bootstrap` seed, is gated by
  `DEPLOY_ENABLED`, waits for Postgres before `db push`, no longer hides schema
  failures, refuses to seed a non-empty database, uses `vars.PUBLIC_HOST`, and
  runs HTTPS smoke tests. Deploy tarballs exclude all `.env` files.
- `.github/workflows/ci.yml`: `master` branch + frozen-lockfile install.
- Added `DEPLOY.md`: Droplet/DNS/firewall setup, production env, first deploy,
  demo-account cleanup, auto-deploy enablement, backups/restore, schema-change
  safety, troubleshooting and security checklist. README deployment section now
  links to it.
- Verified: `pnpm install --frozen-lockfile`, `pnpm typecheck` (5/5 packages),
  engine tests (16/16), `docker compose config`, Caddy config validation, and
  Docker builds of the API, web and WS images. The host-side Next build still
  hits the known Windows symlink `EPERM` in `.next/standalone`; the Linux Docker
  build succeeds.

---

## 2026-10-20 — Super-admin per-user P&L and full trade/order history

- `GET /admin/users` now returns an aggregated `pnl` per user: **realized** (all
  positions), **unrealized** (OPEN only), **brokerage** (ledger `COMMISSION`
  debits), **net** (realized + unrealized − brokerage), plus trade and open-trade
  counts. Balance and margin are summed across all non-house accounts instead of
  only the first account.
- Users tab adds **Net P&L** (colored, with realized/unrealized breakdown) and
  **Trades** columns.
- `GET /admin/users/:id/detail` now supports `tradeStatus`, `tradeTake` and
  `orderTake`; returns **all** positions by default (paginated), order history,
  `tradesTotal`/`ordersTotal`, unrealized/net P&L, wins/losses/win rate. Open
  trade rows include the live mark.
- Client drawer rebuilt: 9-stat summary, status-filtered trade history
  (All/Closed/Liquidated/Open) with Load more + per-user CSV export, order
  history (entries & limit orders), existing open positions and ledger.
  Note: closes are positions, not `Order` rows, so they appear in trade history.
- `/admin/trades.csv` accepts `userId` and includes `unrealized_pnl`.
- Verified `pnpm --filter @realbulls/api typecheck` and
  `pnpm --filter @realbulls/web typecheck`; local API returns
  `admin@realbulls.io` net `2819.36` across 5 trades / 5 orders, filtered
  pagination works, CSV export has 5 rows, and `/admin` returns 200.

---

## 2026-10-20 — Remove watchlist search category chips

- Removed the `All / Stocks / Futures / Options / Forex / Crypto / Indices / Commodities`
  chip row from `Watchlist.tsx`; the search bar now always queries all NFO/BFO
  instruments (plus prefix-matched seeded assets), replacing the old "All" behaviour.
- Deleted the now-unused `SEARCH_CATS`, `INSTRUMENT_TYPE_CATS`, `matchCat` and the
  local category-browse `results` memo. Empty search returns no dropdown rows.
- The advanced-mode filter row that filters *existing* watchlist items by
  `assetClass` is unchanged.
- Verified `pnpm --filter @realbulls/web typecheck`.

---

## 2026-10-20 — Remove account selector from the top bar

- Removed the `DEMO · USD · xxxx` account `<select>` from `TopBar.tsx`. It only
  changed client state while every trading REST route resolves
  `primaryAccount(auth.sub)`, and each user has a single non-house account.
- The active account is still set on session load and subscribed over the WS, so
  balance/equity and P&L behave exactly as before.
- Verified `pnpm --filter @realbulls/web typecheck`.

---

## 2026-10-20 — GitHub repo preparation (docs, env templates, ignore rules)

- **`.gitignore` expanded** — ignore all runtime env variants (`**/.env`,
  `**/.env.local`, `**/.env.*.local`) while keeping every `*.env.example`
  committed; added IDE/OS files, Go binaries (`*.exe`), `*.tgz`, Redis dumps and
  `.cloudflared/`. Verified `apps/api/.env`, `apps/web/.env.local`, `infra/.env`,
  `packages/db/generated/`, `.next/` and `*.tsbuildinfo` are ignored.
- **Per-app env templates** — added `apps/api/.env.example` and
  `apps/web/.env.example` (localhost defaults, no secrets); rewrote root
  `.env.example` as a full stack reference; genericized `infra/.env.example`
  (removed the deploy IP, added CORS/provider keys).
- **`README.md` rewritten** — architecture diagram, prerequisites, full local
  setup (env files, Docker or native Postgres + Memurai, Prisma
  generate/push/seed, gateway run), database + Redis key reference, env-var
  tables per app, ports, quality checks, deployment and a security checklist.
- **Config hardening** — `next.config.mjs` `allowedDevOrigins` now reads
  `ALLOWED_DEV_ORIGINS` (added to the local `.env.local`) instead of a hardcoded
  tunnel host; removed the deploy IP from web fallbacks
  (`layout.tsx`, `page.tsx`, `robots.ts`, `sitemap.ts`),
  `infra/docker-compose.yml` and `infra/OAUTH.md`.
- **`.gitattributes`** added for consistent LF/CRLF handling.
- **Secret audit** — no hardcoded secrets in tracked sources; JWT/Zerodha/OAuth
  secrets live only in ignored `.env` files. `git init` run; 166 files tracked,
  zero ignored artifacts staged (not committed).

---

## 2026-10-20 — Super-admin balance controls (Overview)

- The Overview tab now shows **+ Add balance** / **− Remove balance** for `SUPER_ADMIN`.
- The modal posts to the existing `POST /admin/ledger/adjust` (`DEPOSIT` / `WITHDRAWAL`) against the
  super admin's own trading account(s) — no new backend endpoints, no order-path changes.
- `useAdjustLedger` now invalidates `admin/summary` and `admin/ledger` so `Total balance` and
  `Client deposits` refresh immediately after posting.
- Verified: adding ₹10,000 moved the overview total from `₹11,69,65,748.95` to `₹11,69,75,748.95`.

---

## 2026-10-20 — Kite-style F&O instrument search (NFO + BFO)

### Symptom

Typing `23000` in the watchlist search returned nothing, while Kite showed the full option chain.
The old search filtered only the 39 seeded `Asset` rows client-side (no expiry/strike), and only
4 static option assets existed.

### Root cause

- The product searched its own asset list, not an instrument master.
- `Asset` had no `instrumentToken`/`expiry`/`strike`/`optionType`, so contracts could not be addressed.
- The Go gateway subscribed to a fixed symbol list, so newly added contracts had no feed.

### Change

- **Instrument master** (`Instrument` model): daily sync of the public Kite CSV
  (`https://api.kite.trade/instruments/NFO` + `/BFO`), filtered to `FUT`/`CE`/`PE`, ~44k rows.
  Sync runs on boot, is skippable within 12h, and re-runs daily (Redis key `instruments:lastSync`).
- **Search API** `GET /instruments/search?q=&type=&exchange=&limit=` — matches tradingsymbol,
  underlying name, and numeric strike; `type=FUT` or `type=CE,PE`.
- **Add to watchlist** `POST /instruments/:token/asset` creates the tradable `Asset` on demand
  (lot size → contract size, index vs stock class, expiry/strike/optionType).
- **Watchlist** `POST /watchlists/items` now accepts `instrumentToken` as an alternative to `assetId`.
- **Registry**: publishes `instrumentToken`/`exchange`/`tradingsymbol` and an intrinsic-value
  fallback price (`max(spot-strike,0) + 0.8% spot`) so new options quote sensibly before live data.
- **Gateway**: Zerodha feed reads `realbulls:registry`, maps `EXCHANGE:TRADINGSYMBOL` → token,
  polls `/quote` in 500-symbol chunks; synthetic feed gains `AddSpecs` and refreshes every 60s so
  contracts added at runtime start ticking without a restart.
- **UI**: debounced server search for `ALL/FUTURES/OPTIONS` (options → `CE,PE`), Kite-style rows
  (`UNDERLYING  STRIKE CE  ·  27 OCT MONTHLY  ·  NFO`), click to add. `ALL` still falls back to
  local assets (crypto/FX/etc.) so those remain searchable.

### Follow-up — relevance & expiry ordering

- Search is tokenised: every word must match (`nifty 23000` works).
- Results are ranked in phases: exact underlying name → prefix match on underlying/symbol →
  contains / numeric strike. This keeps `NIFTY` above `BANKNIFTY` for `q=nifty`.
- Result shape mirrors Kite: **underlying (stock/index) → futures → options**, with the earliest
  expiry first inside each group, then canonical underlying order
  (`NIFTY`, `BANKNIFTY`, `FINNIFTY`, `SENSEX`, …), then strike, then CE/PE.
- The underlying row is found by prefix-matching local assets (symbol prefix ranks above name
  prefix), so `nifty` shows `NIFTY50` first and not `BANKNIFTY`.
- Expired contracts are dropped using the IST calendar date (not a rolling 24h window).

### Verified

- `GET /instruments/status` → `count=43994`.
- `q=23000` → 41 contracts (NIFTY/FINNIFTY, weekly + monthly, CE/PE).
- Added `NIFTY26OCT23000CE`: asset created, watchlist updated, synthetic quote `1544.8`
  (spot 24350, intrinsic 1350 + time value) via Redis `realbulls:price:*`.
- Headless Chrome: search rendered 41 rows; clicking one cleared the box and the symbol appeared
  in the watchlist.
- `tsc --noEmit` clean for api + web; `go build ./...` clean.

### Caveats

- Live option quotes require a Zerodha access token in Redis (`zerodha:access_token`); without it the
  synthetic feed is used.
- BFO index underlyings not in the asset list (e.g. `MIDCPNIFTY`) fall back to a random-walk price.
- `docs/CREDENTIALS.md` demo logins and public tunnel exposure still apply.

### Files

| File | Change |
|---|---|
| `packages/db/prisma/schema.prisma` | `Instrument` model + `Asset` derivative fields |
| `apps/api/src/services/instrument.service.ts` | CSV sync, search, on-demand asset creation |
| `apps/api/src/routes/instruments.ts` | search / status / ensure / sync routes |
| `apps/api/src/index.ts` | routes, boot sync, 30s registry publish |
| `apps/api/src/routes/market.ts` | watchlist add by `instrumentToken` |
| `apps/api/src/services/market.service.ts` | registry tokens + intrinsic start price |
| `packages/shared/src/schemas.ts` | `watchlistAddSchema` (assetId \| instrumentToken) |
| `apps/ws-gateway/internal/model/model.go` | `AssetDef` token/exchange/symbol |
| `apps/ws-gateway/internal/feed/kite.go` | registry-driven chunked quotes |
| `apps/ws-gateway/internal/feed/synthetic.go` | `newInstrument` + `AddSpecs` |
| `apps/ws-gateway/cmd/gateway/main.go` | dynamic registry + 60s synthetic refresh |
| `apps/web/src/lib/hooks.ts` | `useInstrumentSearch`, token add, `assets` invalidation |
| `apps/web/src/components/terminal/Watchlist.tsx` | server search + Kite-style rows |

---

## 2026-10-19 — Chart flat-line bug, login/tenant fixes, misc UI

### 1. Chart rendered “like a line” (main issue)

#### Symptom

- BTCUSDT chart showed a single dashed horizontal line at ~82,125 with the y-axis spanning
  `0.00 → 100000.00`.
- Live ticks were streaming and the watchlist prices were correct.
- The candles API returned data (18–29 M1 bars), yet the chart looked empty/flat.

#### Investigation

1. Probed the candles endpoint directly:

   ```
   GET /assets/:id/candles?timeframe=M1&limit=500
   ```

   Response contained a poisoned bar:

   ```json
   {
     "time": 1792417440,
     "open": 3.92549,
     "high": 82378.005,
     "low": 3.92549,
     "close": 82309.965,
     "volume": 30
   }
   ```

   A real BTC bar can never have `open/low ≈ 3.92` while `high ≈ 82,378`.

2. Reproduced the exact UI in **headless Chrome via CDP** (login → open `/terminal` → click
   BTCUSDT → screenshot). The screenshot matched the user's report exactly:
   y-axis `0 → 100,000`, all real candles compressed into one thin line near the top.

3. Conclusion: the chart was **not** empty and the fetch was fine. One contaminated
   candle forced lightweight-charts to auto-scale the price axis to include ~0, squashing
   the ~82,000-level candles into an invisible line.

#### Main cause

The **Binance feed parsing bug** in the Go gateway
(`apps/ws-gateway/internal/feed/binance.go`):

- Go’s `encoding/json` matches struct tags **case-insensitively**.
- The struct had `Bid string \`json:"b"\`` and `BidQty string \`json:"B"\`` (and the same
  for ask `a`/`A`). Both fields matched both keys, so the **last key won** and the bid/ask
  *price* was overwritten by the *quantity* (~3). Candle bars built from those ticks were
  written to Postgres with prices like `3.92549` mixed with correct `82xxx` values.
- A first cleanup pass deleted rows older than `13:44:00Z`, but the **13:44 bucket itself**
  was still built during the bug window, so the garbage bar survived and kept breaking the
  chart.

#### Fixes

1. **Gateway parsing** — `apps/ws-gateway/internal/feed/binance.go`
   - Accept the raw payload as `json.RawMessage`.
   - Decode into `map[string]interface{}` and read the **exact** keys `s`, `b`, `a`.
   - This removed the case-insensitive collision permanently.

2. **Local candle cleanup** (dev DB only — approved by the user)
   - Deleted crypto (`BTCUSDT`, `ETHUSDT`, `SOLUSDT`, `XRPUSDT`) bars with
     `bucket < 2026-10-19T13:45:00Z` (covers M1/M5/M15/H1 buckets built during the bug).
   - Added a sanity guard `low < 100` (only safe for BTC/ETH/SOL; it also wiped XRP’s
     generated bars since XRP trades ~1.30 — harmless, the worker rebuilds them live).
   - Result: BTCUSDT had 23 healthy M1 bars (`13:45 → 14:07`) and all timeframes clean.

3. **Chart fills the panel** — `apps/web/src/components/terminal/Chart.tsx`
   - Added `chartRef.current?.timeScale().fitContent()` after `setData(...)`, so candles
     spread across the full chart width instead of hugging the right edge.

#### Verification

- API: `GET /assets/:id/candles?timeframe=M1&limit=500` → 23+ bars, all in the `81xxx`
  range, no outliers.
- Headless Chrome screenshot of `/terminal` → BTCUSDT candles render with a y-axis of
  `81,700 → 82,600`.
- `tsc --noEmit` (web) passes.

#### Lesson

When a chart looks “flat/empty”, check the **data range**, not only the bar count.
One outlier (`0`-level) is enough to make a perfectly good series invisible.

---

### 2. Login only worked for the super admin / bullsx IDs failed

#### Main cause

Tenant resolution is **host-based**. The seeded `realbulls` tenant has
`domain = "localhost"`, so any request to `localhost` is scoped to the **realbulls**
tenant. `POST /auth/login` looked up the user only inside that tenant, so
`trader@bullsx.io` etc. returned `401 Invalid credentials`.

#### Fixes (web + API, no server changes)

1. **Web sends a tenant hint** — `apps/web/src/lib/api.ts`
   - `getTenantSlug()` resolves a slug from `?tenant=`, then stored value, then subdomain.
   - `api()` and `downloadCsv()` attach `x-tenant: <slug>` when known.
   - `setTenantSlug()` stores the authoritative tenant returned by login/`/me`.
2. **No stale tenant** — the `/login` page ignores a stored tenant and only uses
   `?tenant=`, so a previous bullsx visit can’t break a later realbulls login.
3. **Single login for all tenants** — `apps/api/src/routes/auth.ts`
   - Login first looks up the account in the resolved tenant, then **falls back to a
     global lookup** across tenants. The account’s own `tenantId` determines the session.
   - Result: every seeded account logs in from plain `/login` (no query param).
4. **Session sync** — `apps/web/src/app/login/page.tsx` and
   `apps/web/src/providers/AppProviders.tsx` store the tenant returned by the API.
   Logout already clears `localStorage`.

#### Verification

All four accounts verified both via API and through the real UI (headless Chrome):

| Account | Tenant | Result |
|---|---|---|
| `admin@realbulls.io` | realbulls | ✅ Realbulls Admin |
| `trader@realbulls.io` | realbulls | ✅ Alice Trader |
| `admin@bullsx.io` | bullsx | ✅ BullsX Admin |
| `trader@bullsx.io` | bullsx | ✅ Bob Trader |

See `docs/CREDENTIALS.md` for credentials.

---

### 3. “Something went wrong” on login = rate limit hidden as 500

- `@fastify/rate-limit` threw a 429, but the global error handler only recognised
  `HttpError`, so it returned `500 InternalError` with a generic message.
- **Fix:** `apps/api/src/index.ts` now forwards any 4xx `statusCode` with its real message.
- **Rate limits removed for local dev/testing** (global 300/min, login 12/min,
  register 10/min). Restore instructions are in **`docs/RATE_LIMITS.md`**.
- The separate brute-force lockout (8 failed attempts → 15 min) is still active; clear it
  with Redis keys `login:fail:*` (documented in `docs/RATE_LIMITS.md`).

---

### 4. Logo click looked like a sign-out

- The terminal header logo linked to the marketing landing page `/`, which made it look
  like the session ended.
- **Fix:** `apps/web/src/components/terminal/TopBar.tsx` — logo now links to `/terminal`.
  Sign out remains in the account menu.

---

## Earlier fixes (same local setup)

### Binance crypto prices were garbage (~3 instead of ~82k)

- Same case-insensitive JSON bug described above. `Bid`/`Ask` price fields were overwritten
  by order-size fields. Fixed by exact-key parsing into a map.
- Live verification: BTCUSDT ~82,374, ETHUSDT ~2,414, SOLUSDT ~104.9, XRPUSDT ~1.3066,
  with tight spreads and `bid < ask`.

### US market hours were wrong (DST)

- `apps/ws-gateway/internal/feed/market_hours.go` hardcoded US offset `-5h` (EST).
- Added `usOffset()` using `nthSunday()` to select `-4h` (EDT, 2nd Sun Mar 02:00 → 1st Sun
  Nov 02:00) or `-5h` (EST).

### Closed markets showed blank prices / empty charts

- `apps/ws-gateway/internal/feed/synthetic.go` only published ticks while a market was
  open, so closed-market rows rendered `—`.
- Instruments now track `closedTicks`/`open`; when closed, a static quote is republished
  every 12 ticks (~3 s) via `publishStatic()`.

### Zerodha symbols were subscribed without a token

- `apps/ws-gateway/cmd/gateway/main.go` added Zerodha symbols to the covered set even when
  no `zerodha:access_token` existed in Redis, leaving them without data.
- Now those symbols are only covered when the token exists; otherwise the synthetic feed
  handles them. Feed size: 35 synthetic + 4 Binance = 39/39 assets quoted.

### Watchlist search only matched symbol + name

- `apps/web/src/components/terminal/Watchlist.tsx` now matches `symbol`, `name`,
  `assetClass` and `segment`.
- Examples: `24400` → NIFTY-24400-CE/PE; `crypto`/`forex`/`options`/`commodity` filter
  correctly; `230000` returns no matches (correct — symbols use `23000`).

---

## Verification commands used

```powershell
# candles for an asset
# (get a token first)
Invoke-WebRequest -Uri "http://localhost:4000/assets/<assetId>/candles?timeframe=M1&limit=500" `
  -Headers @{ Authorization = "Bearer <token>" }

# clear login lockouts
node -e "const Redis=require('D:/my-website-main/apps/api/node_modules/ioredis');const r=new Redis('redis://localhost:6379');r.keys('login:fail:*').then(async k=>{if(k.length)await r.del(...k);await r.quit()})"

# typechecks
pnpm --filter @realbulls/web typecheck
pnpm --filter @realbulls/api typecheck
```

Headless UI checks were done with Chrome + CDP (`--headless=new --remote-debugging-port=9222`)
to log in, navigate, capture console errors and screenshots.

---

## Files touched in this session

| File | Change |
|---|---|
| `apps/ws-gateway/internal/feed/binance.go` | Exact-key JSON parsing (fixes garbage prices) |
| `apps/ws-gateway/internal/feed/market_hours.go` | DST-aware US session times |
| `apps/ws-gateway/internal/feed/synthetic.go` | Static quotes for closed markets |
| `apps/ws-gateway/cmd/gateway/main.go` | Zerodha coverage gated on token |
| `apps/api/src/routes/auth.ts` | Global login fallback; rate-limit configs removed |
| `apps/api/src/index.ts` | 4xx error passthrough; rate-limit plugin removed |
| `apps/web/src/components/terminal/Chart.tsx` | `fitContent()` after seeding candles |
| `apps/web/src/lib/api.ts` | Tenant slug resolution + `x-tenant` header |
| `apps/web/src/app/login/page.tsx` | Persist tenant from login response |
| `apps/web/src/providers/AppProviders.tsx` | Sync tenant on session restore |
| `apps/web/src/components/terminal/TopBar.tsx` | Logo link → `/terminal` |
| `apps/web/src/components/terminal/Watchlist.tsx` | Search across class/segment |
| `docs/RATE_LIMITS.md` | Disabled limits + restore instructions |
| `docs/CREDENTIALS.md` | Single-login note |
