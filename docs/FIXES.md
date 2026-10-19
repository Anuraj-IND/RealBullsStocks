# Fix Log — Chart, Market Data, Auth & UI

Living document of significant fixes made to the local Realbulls stack.
Newest session first.

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
