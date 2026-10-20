# Realbulls — Key Functions

Reference of the most important functions across the monorepo, grouped by package/module, with signatures and callers. All paths are relative to repo root.

Convention: `functionName` — file:line — purpose.

---

## 1. `packages/engine` — pure margin / P&L / liquidation math

No I/O; consumed by the API. Unit-tested (`test/engine.test.ts`).

### `margin.ts`
| Function | Line | Purpose |
|---|---|---|
| `dir(side)` | 10 | +1 for BUY, −1 for SELL |
| `notionalValue(qty, price, contractSize)` | 12 | qty × price × contractSize |
| `requiredMargin(notional, leverage)` | 14 | notional / leverage |
| `freeMargin(equity, marginUsed)` | 16 | equity − marginUsed |
| `equity(balance, unrealizedPnl)` | 18 | balance + unrealizedPnl |
| `marginLevel(equity, marginUsed)` | 20 | (equity / used) × 100; ∞ if used ≤ 0 |
| `commission(notional, rate)` | 22 | notional × rate |
| `evaluateRisk(equity, marginUsed, marginCallPct, stopOutPct)` | 24 | `OK` / `MARGIN_CALL` / `STOP_OUT` vs percentages |
| `canOpenPosition(freeMargin, requiredMargin)` | 26 | affordable check |
| `roundToTick(price, tickSize)` | 28 | snap price to tick |
| `weightedAverageEntry(...)` | 30 | VWAP for partial fills |

### `pnl.ts`
| Function | Line | Purpose |
|---|---|---|
| `unrealizedPnl(qty, mark, avgEntry, contractSize, dir, fx)` | 4 | (mark − entry) × qty × contractSize × dir × fx |
| `realizedPnl(qty, exit, entry, contractSize, dir, fx)` | 6 | (exit − entry) × qty × contractSize × dir × fx |
| `swapFee(...)` | 8 | overnight funding |
| `rawSpread(bid, ask)` | 10 | ask − bid |
| `quotedSpread(markupBps, markdownBps)` | 12 | quoted spread after config bps |
| `fillPrice(side, bid, ask, slippage)` | 14 | mid ± slippage |

### `liquidation.ts`
| Function | Line | Purpose |
|---|---|---|
| `liquidationPrice(avgEntry, leverage, dir, stopOutPct)` | 4 | avgEntry × (1 − dir×buffer), buffer = 1/leverage − (1/leverage)(stopOut/100) |
| `isLiquidated(mark, liqPrice, dir)` | 6 | breach check |

### `index.ts`
| Function | Line | Purpose |
|---|---|---|
| `previewOrder(input)` | 21 | Combines all of the above into `OrderPreview {notional, requiredMargin, commission, liquidationPrice, freeMarginBefore, freeMarginAfter, affordable, risk}` |

**Callers:** `order.service.ts` imports `previewOrder, realizedPnl, unrealizedPnl, requiredMargin, liquidationPrice, evaluateRisk, marginLevel` (2–10); `market.service.ts` imports `quotedSpread, fillPrice` (2); `pnl.worker.ts` imports `unrealizedPnl, equity, freeMargin, marginLevel` (1).

---

## 2. `apps/api/src/services` — domain services

### `order.service.ts`
| Function | Line | Caller | Purpose |
|---|---|---|---|
| `placeOrder(input, userId, tenantId)` | 70 | `POST /orders` | Full order placement pipeline |
| `closePosition(positionId, userId, qty?, reason?)` | 271 | `POST /positions/:id/close`, admin force-close, risk cycle | Close + realized PnL + ledger |
| `closeAllPositions(accountId)` | 364 | `POST /positions/close-all` | Close every open position |
| `cancelOrder(orderId, userId)` | 378 | `DELETE /orders/:id` | Cancel PENDING order |
| `runRiskCycle()` | 393 | `pnl.worker` | Mark-to-market + trigger + liquidation |
| `accountUnrealized(accountId)` | 41 | worker | Sum unrealized PnL |
| `fillPendingOrder(order, quote)` | 504 | `runRiskCycle` | Fill triggered LIMIT/STOP |
| `evaluateRisk(account)` | 565 | `runRiskCycle` | Engine risk evaluation |

### `ledger.service.ts`
| Function | Line | Caller | Purpose |
|---|---|---|---|
| `postLedgerChanges(...)` | 36 | standalone | Double-entry write |
| `postLedgerChangesWithin(tx, ...)` | 48 | order txs | Double-entry write inside a Serializable tx |
| `credit` / `debit` / `getStatement` | 26, 151–157, 159 | routes | Balance ops + statement |

### `market.service.ts`
| Function | Line | Caller | Purpose |
|---|---|---|---|
| `publishRegistry()` | 40 | `index.ts` startup | Write `realbulls:registry` |
| `getQuote(symbol)` | 56 | `/assets`, workers | Read `realbulls:price:<SYM>` |
| `getEffectiveConfig(tenantId, assetId)` | 68 | `/assets`, orders | Enabled + spread + commission |
| `resolveAssetSegment(asset)` | 90 | orders | Asset → segment |
| `isDerivativeSegment(segment)` | 97 | orders | Futures/options check |
| `getBrokerage` / `brokerageForQty` | 107, 126 | orders | Commission calc |
| `isSegmentTradable` | 131 | orders | Tenant allowedSegments check |
| `pickRule` | 141 | resolveRisk | Select leverage rule |
| `resolveRisk(userId, tenantId, asset, segment)` | 153 | orders | leverage/marginCall/stopOut |
| `getExecutableQuote` / `executablePrice` | 190, 205 | orders | Spread-adjusted price |

### `notify.service.ts`
| Function | Line | Caller | Purpose |
|---|---|---|---|
| `notify(userId, kind, title, body)` | 4 | workers, order.service | DB row + `notify:<userId>` publish |
| `notifyAccountOwner(accountId, ...)` | 15 | order.service | Skip house accounts |

### Workers
| Function | Line | Interval | Purpose |
|---|---|---|---|
| `startPnlWorker` / `stopPnlWorker` | 48–61 | 1000ms | Risk cycle + snapshots |
| `candle.worker` tick | 5–53 | 2000ms | Build candles |
| `alert.worker` tick | 7–31 | 3000ms | Trigger price alerts |

---

## 3. `apps/api/src/lib` — helpers

| Function / export | File:line | Purpose |
|---|---|---|
| `signAccessToken` / `signRefreshToken` | `jwt.ts:10,19` | HS256 JWT issuance |
| `verifyAccessToken` / `verifyRefreshToken` | `jwt.ts:29,36` | JWT verification |
| `resolveTenant(request)` | `tenant.ts:11` | header → query → host |
| `defaultTenant` / `requireTenant` | `tenant.ts:33,37` | fallback / enforce |
| `num` / `dec` / `toMoney` | `money.ts:4,6,10` | Decimal(24,8) ↔ number |
| `toPositionDTO` / `toOrderDTO` / `toLedgerDTO` / `toAssetDTO` | `serialize.ts:5,29,52,67` | Prisma → JSON |
| `isMarketOpen(asset)` | `market-hours.ts:12` | crypto always; forex/commodity UTC weekday; index/stock IST/ET |
| `sha256` / `newJti` | `crypto.ts:4,6` | refresh hash / UUID |
| `hashPassword` / `verifyPassword` | `password.ts:4,6` | bcrypt cost 10 |
| `primaryAccount(userId)` / `ownAccount(userId, accountId)` | `accounts.ts:5,9` | account resolution |
| `slugBase` / `uniqueUsername` | `usernames.ts:4,8` | username generation |
| `HttpError` + 4xx factories | `errors.ts:1–17` | coded errors |
| `tickChannel` / `priceKey` / `accountChannel` / `getCachedPrice` | `redis.ts:10–31` | Redis key helpers |

---

## 4. `apps/api/src/routes` — key handlers

| Route handler | File:line | Purpose |
|---|---|---|
| `POST /auth/login` | `auth.ts:79` | Credential login + issueSession |
| `POST /auth/register` | `auth.ts:109` | Signup + DEMO account |
| `POST /auth/refresh` | `auth.ts:141` | Rotate refresh token |
| `issueSession` | `auth.ts:62` | Sign access+refresh, insert Session |
| `POST /orders` | `trading.ts:21` | Place order |
| `GET /orders` | `trading.ts:38` | PENDING + synthesized SL/TP |
| `GET /positions` | `trading.ts:154` | Open positions + summary |
| `POST /positions/:id/close` | `trading.ts:206` | Close position |
| `GET /assets` | `market.ts:15` | Per-tenant asset config + quotes |
| `GET /assets/:id/candles` | `market.ts:58` | OHLCV |
| `GET /analytics` | `ledger.ts:24` | Performance stats |
| `GET /public/tenant` | `public.ts:6` | Tenant branding |
| `GET /admin/users` | `admin.ts:60` | Scoped user list |
| `POST /admin/tenants` | `tenants.ts:27` | Create tenant + HOUSE |

---

## 5. `apps/ws-gateway` — Go gateway

### `cmd/gateway/main.go`
| Function | Line | Purpose |
|---|---|---|
| `main` | 48 | Config → store → hub → feeds → server |

### `internal/feed/`
| Function | File:line | Purpose |
|---|---|---|
| `Manager.Publish` | `feed.go:52` | Update last price + `PublishTick` |
| `pricePlaces` | `prices.go` | Per-symbol decimal places |

### `internal/server/`
| Function | File:line | Purpose |
|---|---|---|
| `Hub.RunFanout` | `hub.go:131` | PSubscribe + dispatch |
| `Hub.dispatch` / `dispatchTick` / `dispatchAccount` / `dispatchNotify` | `hub.go:149,162,179,196` | Route by channel prefix |
| `Hub.BroadcastAlert` | `hub.go:224` | Alert to all clients |
| `Client.readPump` / `writePump` | `client.go:47,94` | WS read/write loops |
| `serveWS` | `server.go:55` | Upgrade + register + pumps |

### `internal/store/redis.go`
| Function | Line | Purpose |
|---|---|---|
| `New` | 17 | Redis connect + ping |
| `PublishTick` | 32 | Dual-write `PUBLISH ticks:` + `SET realbulls:price:` |
| `PublishJSON` | 44 | Generic publish (API accounts/notify) |
| `Registry` | 52 | GET `realbulls:registry` |
| `SubscribePatterns` | 75 | PSUBSCRIBE glob |
| `WaitReady` | 81 | 10s readiness poll |

---

## 6. `apps/web/src/lib` — client lib

| Function | File:line | Purpose |
|---|---|---|
| `api<T>()` | `api.ts` | Fetch wrapper, Bearer, silent refresh |
| `apiPost` | `api.ts` | POST helper |
| `setTokens` | `api.ts:33` | Store `rb_access`/`rb_refresh` |
| `resolveWsUrl` | `api.ts:5` | `NEXT_PUBLIC_WS_URL` or same-origin `/ws` |
| `ws.connect` | `ws.ts:26` | Open WS + subscribe |
| `ws.handle` | `ws.ts:57` | `tick` → market store, `account` → account store |
| `useEnsureSession` | `TopBar.tsx:160` | Soft auth guard → `/login` |
| `useMarketStore.setTick` | `store.ts:65` | Per-symbol ticks + 48-point history |
| `useAccountStore.setSnapshot` | `store.ts:111` | Account snapshot |
| `useAuthStore` / `setSession` | `store.ts` | Zustand auth state |
| `getTenantTheme` | `layout.tsx` | Fetch `/public/tenant` → CSS vars |
| `format` / `money` | `format.ts` / `money.ts` | Display formatting |

---

## 7. `packages/db` — data layer

| Function | File:line | Purpose |
|---|---|---|
| `PrismaClient` singleton | `client.ts` | Global-cached client (HMR-safe) |
| `main` (seed) | `seed.ts:71` | Tenants, assets, leverage rules, configs, house, users |
| `upsertUser` | `seed.ts:179` | User + DEMO account + ledger + watchlist |
| `ensureHouse` | `seed.ts:254` | HOUSE user + house account per tenant |
| `applySql` | `applySql.ts:21` | Ledger immutability triggers |
| `resetAdmin` | `resetAdmin.ts` | CLI password reset |

---

## 8. `packages/shared` — shared schemas & types

| Export | File:line | Purpose |
|---|---|---|
| `loginSchema` / `registerSchema` | `schemas.ts:3,12` | Auth validation |
| `placeOrderSchema` / `closePositionSchema` | `schemas.ts:18,43` | Order validation |
| `adminAdjustSchema` | `schemas.ts:47` | Ledger adjustment |
| `leverageUpdateSchema` / `userLeverageSchema` / `leverageSegmentsSchema` | `schemas.ts:54,64,72` | Leverage rules |
| `assetConfigSchema` / `createTenantSchema` / `watchlistAddSchema` | `schemas.ts:87,99,108` | Config validation |
| `Tick` / `CandleBar` / `AccountSnapshot` / `PositionDTO` / `OrderDTO` / `LedgerDTO` | `types.ts:1,9,20,33,55,77` | Shared types |
| `WsClientMessage` / `WsServerMessage` | `types.ts:91,96` | WS protocol types |
| `UserRole` / `Segment` / `OrderSide` / `LedgerType` / `Timeframe` + const arrays | `enums.ts` | Unions + arrays |
| `segmentForAssetClass` | `enums.ts:45` | AssetClass → Segment |
| `tokens` / `defaultTheme` / `tenantTheme` | `tokens.ts:2,25,41` | Design tokens → `--rb-*` CSS vars |

---

## 9. Function → caller cross-reference

| Function | Called by |
|---|---|
| `previewOrder` | `order.service.placeOrder` |
| `evaluateRisk` | `order.service.runRiskCycle`, `market.service.resolveRisk` |
| `liquidationPrice` | `order.service.placeOrder`, `runRiskCycle` |
| `quotedSpread` / `fillPrice` | `market.service.getExecutableQuote` |
| `postLedgerChangesWithin` | `order.service.placeOrder`, `closePosition`, `fillPendingOrder` |
| `resolveRisk` | `order.service.placeOrder` |
| `getExecutableQuote` | `order.service.placeOrder` |
| `notify` / `notifyAccountOwner` | `order.service`, `pnl.worker`, `alert.worker` |
| `placeOrder` | `POST /orders` |
| `runRiskCycle` | `pnl.worker` |
| `PublishTick` | `feed.Manager.Publish` |
| `hub.RunFanout` | `main.go` |
| `api<T>()` | all web data fetching |
| `useEnsureSession` | `/terminal`, `/admin`, `/analytics`, `/orderbook`, `/positions`, `/settings` |
