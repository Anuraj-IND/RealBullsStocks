# Realbulls — Routing

Complete routing reference for the Realbulls monorepo: Next.js web app routes, Fastify REST API routes, WebSocket gateway, and Caddy reverse-proxy routing.

## Architecture at a glance

```mermaid
flowchart LR
    Browser[Browser] --> Caddy[Caddy :443 / :80]
    Caddy -- "handle_path /api/*" --> API[apps/api :4000]
    Caddy -- "handle /ws*" --> WS[apps/ws-gateway :8080]
    Caddy -- "handle (catch-all)" --> Web[apps/web :3000]

    Web -->|"REST : Bearer JWT"| API
    Web -->|"WS : subscribe/tick/account/notify"| WS
    API --> PG[(PostgreSQL :5432)]
    API --> Redis[(Redis :6379)]
    WS --> Redis
    Redis -->|"pub/sub ticks:* / accounts:* / notify:*" --> WS
```

- **Caddy** (`infra/Caddyfile`) is the single entry point. All public traffic is TLS-terminated here.
- **Web** never talks to external market feeds directly; it consumes data over the WS gateway and the REST API.
- **API** is the only consumer of the database (via Prisma).
- **ws-gateway** is the only writer of `realbulls:price:*` and publisher of `ticks:*`. The API never connects to external feeds.

---

## 1. Web app routing (Next.js App Router)

Base: `apps/web/src/app`. All routes are at the root regardless of tenant — tenancy is **subdomain-based**, not path-based (`acme.realbulls.live` → tenant `acme`, not `/acme/...`).

### Route map

| URL | File | Component | Auth | Role gate | Notes |
|---|---|---|---|---|---|
| `/` | `page.tsx` | Server | No | — | Landing page, JSON-LD structured data |
| `/login` | `login/page.tsx` | Client | No | — | Credential login form |
| `/login/callback` | `login/callback/page.tsx` | Client | No | — | OAuth fragment-token callback |
| `/terminal` | `terminal/page.tsx` | Client | Yes | All roles | Main trading terminal |
| `/admin` | `admin/page.tsx` | Client | Yes | `SUPER_ADMIN` / `TENANT_ADMIN` | Role dispatcher → `/admin/super` or `/admin/tenant` |
| `/admin/super` | `admin/super/page.tsx` | Client | Yes | `SUPER_ADMIN` | Super admin panel (full platform control) |
| `/admin/tenant` | `admin/tenant/page.tsx` | Client | Yes | `TENANT_ADMIN` | Tenant admin panel (own clients only) |
| `/analytics` | `analytics/page.tsx` | Client | Yes | All roles | Performance analytics |
| `/orderbook` | `orderbook/page.tsx` | Client | Yes | All roles | Market depth + time & sales |
| `/positions` | `positions/page.tsx` | Client | Yes | All roles | Open positions / ledger |
| `/settings` | `settings/page.tsx` | Client | Yes | All roles | Profile, security, alerts, notifications |
| `/help` | `help/page.tsx` | Server | No | — | Help Center (own `metadata`) |
| `/legal/privacy` | `legal/privacy/page.tsx` | Server | No | — | Privacy Policy |
| `/legal/terms` | `legal/terms/page.tsx` | Server | No | — | Terms of Service |
| `/legal/cookies` | `legal/cookies/page.tsx` | Server | No | — | Cookie Policy |
| `/legal/risk` | `legal/risk/page.tsx` | Server | No | — | Risk Disclaimer |
| `/legal/*` | `legal/layout.tsx` | Server layout | No | — | Wraps all `/legal/*` pages |
| — | `layout.tsx` | **Root layout** (async) | — | — | Wraps ALL routes |
| — | `error.tsx` | Client | — | — | Global error boundary |
| — | `not-found.tsx` | Server | No | — | Custom 404 |
| — | `sitemap.ts` | Server | — | — | `/sitemap.xml` |
| — | `robots.ts` | Server | — | — | `/robots.txt` |
| — | `manifest.ts` | Server | — | — | `/manifest.webmanifest` |

> **No `route.ts` API handlers** exist under `src/app`. All data comes from the external API via `API_BASE`.

### Root layout — `src/app/layout.tsx`

- Async server component. Reads `headers()` host, calls `getTenantTheme(host)` → fetches `${SERVER_API}/public/tenant?domain=...` and injects `<style id="rb-tenant-theme">` with CSS custom properties `--rb-navy`, `--rb-red`, `--rb-yellow` from the tenant brand colors (lines 60–69, 92).
- Google Fonts in `<head>`: Inter Tight (600/700/800), Inter (400/500/600/700), JetBrains Mono (400/500/700) (lines 86–91).
- Metadata: title template `%s · Realbulls`, Open Graph, Twitter cards, icons at `/brand/logo.svg` + `/brand/logo.png` (lines 6–45).
- Wraps children in `<AppProviders>` (line 95) → `I18nProvider` → `QueryClientProvider` → children + `<Toasts />`.

### Middleware — `src/middleware.ts`

Two responsibilities: an **API proxy** and additive tenant headers.

**`/api/*` proxy (runtime).** The client bundle is built with the relative API base `/api` (`infra/Dockerfile.web` ARG default, `docker-compose.yml` `${NEXT_PUBLIC_API_URL:-/api}`). Behind Caddy that is handled by `handle_path /api/*` → `api:4000`, but when the web container is reached **directly** (`http://localhost:3000`) nothing serves `/api/*`, so Next answers 404 and every API call renders as a bare *"Not Found"* on the login screen.

`middleware` therefore rewrites `/api/*` to `${API_INTERNAL_URL}/*` (runtime env, default `http://localhost:4000`) via `NextResponse.rewrite`. Because it is resolved per-request, no build-time host is baked into the image and the same-origin `/api` base works through either entry point. Requests arriving via Caddy never reach this branch — Caddy proxies `/api/*` first.

**Tenant headers (additive).** Never redirects or blocks:

```ts
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand).*)"],
};
```

Logic (lines 4–16):
1. Reads `host` header, strips port.
2. Reads `ROOT_DOMAIN` env (default `"realbulls.local"`).
3. If host ends with `.${ROOT_DOMAIN}` → sets response header **`x-tenant: <subdomain>`** (skips `www`).
4. Always sets **`x-tenant-host: <full host>`**.
5. Returns `NextResponse.next()`.

All real tenant resolution and auth enforcement happens client-side (`AppProviders` → `/me`, `useEnsureSession`).

### AppProviders — `src/providers/AppProviders.tsx`

Client component wrapping the whole tree.

- **React Query**: `refetchOnWindowFocus: false`, `staleTime: 5000` (line 12).
- **Session bootstrap** (18–43): if `hasStoredSession()` (localStorage `rb_access`/`rb_refresh`) → `api("/me")` → `setSession`. On 401 clears tokens; always `markSessionChecked()`.
- **WebSocket**: `ws.connect()` on mount; subscribes to user channel when `user` is set (`ws.subscribeUser(user.id)`); `op === "notification"` → toast + invalidate `["notifications"]`.
- **i18n** client-side (locale from settings, not URL); **Toasts** mounted at end.

---

## 2. Tenant / whitelabel routing

| Concern | Mechanism | Location |
|---|---|---|
| Tenant identification | `x-tenant` / `x-tenant-host` response headers from subdomain | `middleware.ts` |
| Tenant branding | `/public/tenant?domain=` → CSS custom properties | `layout.tsx` |
| `ROOT_DOMAIN` (server) | `process.env.ROOT_DOMAIN ?? "realbulls.local"` | `middleware.ts:7` |
| `ROOT_DOMAIN` (client) | `process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "realbulls.live"` | `lib/api.ts:2` |

Flow:
1. Browser hits `acme.realbulls.live/...`
2. Middleware sees host ends with `.realbulls.live` → sets `x-tenant: acme`, `x-tenant-host: acme.realbulls.live`
3. Backend resolves the tenant; `/me` and `/auth/login` return a `TenantInfo` (`primaryColor`, `accentColor`, `background`, `logoUrl`, `slug`, `domain`)
4. Root layout separately calls `GET /public/tenant?domain=<host>` and injects brand colors as `--rb-*` CSS vars via `hexToRgbTriplet()`

---

## 3. Auth flow routing

### Credential login — `login/page.tsx`

Client component. On submit (34–48): `apiPost("/auth/login", {identifier, password})` → `{accessToken, refreshToken, user, tenant, accounts}` → `setTokens()` (localStorage `rb_access`/`rb_refresh`) → `setSession()` → `router.push("/terminal")`. Reads `?error=` on mount (line 30) for "Account suspended".

### OAuth callback — `login/callback/page.tsx`

Client component. On mount (8–18): parses `window.location.hash` (fragment, not query) for `access`/`refresh`. If present → `setTokens()` → hard redirect `window.location.href = "/terminal"`. Else → `/login?error=oauth`.

### Token / API layer — `lib/api.ts`

- Tokens in localStorage: `rb_access`, `rb_refresh` (17–18, 33–43).
- `api<T>()` attaches `Authorization: Bearer <access>` (52–58).
- On 401 → `POST /auth/refresh` (rotating refresh token), deduped via `refreshInFlight`, retry once. On failure → clear tokens + redirect `/login` (60–68, 87–110).
- `API_BASE` = `process.env.NEXT_PUBLIC_API_URL || "/api"` (line 1).

### Protected routes — `useEnsureSession()` (`components/terminal/TopBar.tsx:160`)

```ts
export function useEnsureSession() {
  const user = useAuthStore((s) => s.user);
  useEffect(() => {
    if (!user && !hasStoredSession()) {
      window.location.href = "/login";
    }
  }, [user]);
}
```

Used by `/terminal`, `/admin`, `/analytics`, `/orderbook`, `/positions`, `/settings`. **Soft guard** — redirects only when no stored session AND no in-memory user; does not block render during the check.

### Role gating — `/admin` (`admin/page.tsx`)

`/admin` is now a thin **dispatcher**: once `sessionChecked`, it reads `user.role` and redirects to `adminHomePath(user.role)` — `/admin/super` for `SUPER_ADMIN`, `/admin/tenant` for `TENANT_ADMIN`. Non-admins are sent to `/`.

`/admin/super` and `/admin/tenant` each guard their own role: opening the wrong panel bounces the user to the other one (or `/` for a trader).

Both panels render the shared `components/admin/AdminConsole.tsx`. Tab visibility is driven by `TABS_BY_ROLE`:

| Role | Tabs |
|---|---|
| `SUPER_ADMIN` | overview, admins, users, trades, ledger, positions, risk, audit, tenants |
| `TENANT_ADMIN` | overview, users, trades, ledger, positions, audit |

`TENANT_ADMIN` therefore has no **Admins**, **Risk & Leverage** or **Tenants** tab (no tenant provisioning, no platform-wide settings), and the "↑ Admin" promotion button on a trader row is super-admin only.

> The UI is convenience only. The real boundary is server-side — see "Admin scope" in the API section below.

### Navigation

- `next/link` `<Link>` across landing, headers, legal layout, admin, not-found, error.
- `useRouter()` only in `login/page.tsx` (`push("/terminal")`).
- Hard redirects (`window.location.href`) in `login/callback`, `error.tsx` recovery, `useEnsureSession`, `api.ts` on 401.

### SEO

- **sitemap.ts**: 7 public routes (`/`, `/login`, `/help`, 4 `/legal/*`). Authenticated app routes excluded.
- **robots.ts**: allows `*` except `/terminal`, `/admin`, `/positions`, `/orderbook`, `/analytics`, `/settings`, `/login/callback`.
- **manifest.ts**: PWA `standalone`, `theme_color "#0052BE"`, icon `/brand/logo.svg`.

### next.config.mjs

`output: "standalone"`, `transposePackages: ["@realbulls/shared", "@realbulls/engine"]`, webpack `extensionAlias` (`.js`→`.ts/.tsx`), `reactStrictMode`. **No rewrites/redirects/headers** — all tenant/routing handled by middleware + infra.

---

## 4. REST API routing (apps/api)

Fastify app in `src/index.ts` (`main()`, line 24). **No global route prefix** — every route registers its full path. `/admin/*` is a path convention enforced by `requireRole`, not a Fastify plugin prefix.

### Server bootstrap — `index.ts`

| Aspect | Detail | Lines |
|---|---|---|
| Server | `Fastify({trustProxy: true, logger})`; prod `info`, dev `debug` + pino-pretty | 25–31 |
| CORS | `@fastify/cors`, `origin: env.corsOrigins.length ? env.corsOrigins : true`, `credentials: true` | 33–36 |
| Security headers | `onSend`: nosniff, DENY frame, no-referrer, XSS 0, Permissions-Policy; HSTS prod-only | 38–46 |
| Rate limit | `@fastify/rate-limit` global `max: 300`, `"1 minute"` | 47–50 |
| Body parsers | `application/json` → `JSON.parse`; `x-www-form-urlencoded` → manual decode | 52–68 |
| Error handler | `ZodError`→400; `HttpError`→statusCode; Prisma `P2002`→409; else 500 | 70–82 |
| Health | `GET /health` → `{status:"ok", service:"realbulls-api", ts}` | 84 |
| Route registration | 11 route plugins (see below) | 86–96 |
| Startup side effects | `publishRegistry()`, `startPnlWorker()`, `startCandleWorker()`, `startAlertWorker()` | 100–103 |
| Shutdown | SIGINT/SIGTERM → stop workers, `app.close()`, `prisma.$disconnect()`, `exit(0)` | 105–115 |

**Auth scoping model:** each route file is an encapsulated Fastify plugin; `app.addHook("preHandler", ...)` applies only within that file. `marketRoutes`, `tradingRoutes`, `ledgerRoutes`, `alertRoutes`, `notificationRoutes`, `adminRoutes`, `tenantRoutes` add `authenticate`; `adminRoutes` + `tenantRoutes` add `requireRole`. `authRoutes`/`oauthRoutes` apply `authenticate` per-route (only `/me*`).

### Route inventory

Legend — **Auth**: `public` = no token; `Bearer` = `authenticate`; role = `requireRole`.

#### `routes/auth.ts` (no global auth)
| Method | Path | Auth | Behavior |
|---|---|---|---|
| POST | `/auth/login` | public (12/min) | `loginSchema`; tenant resolve; Redis fail-lockout (8 fails → 429/900s); bcrypt verify; `issueSession`; audit `LOGIN`; returns tokens + user + tenant + accounts |
| POST | `/auth/register` | public (10/min) | Guarded by `env.allowSignup`; resolve/create tenant; unique email; username gen; TRADER + DEMO account; optional welcome balance; default watchlist; audit `REGISTER`; 201 |
| POST | `/auth/refresh` | public | Verify refresh JWT → `Session` by `refreshHash=sha256(jti)` + not revoked/expired; revoke old; issue new pair |
| POST | `/auth/logout` | public | If `refreshToken` supplied, verify + revoke matching session(s); `{ok:true}` |
| GET | `/me` | Bearer | User + tenant + non-house accounts |
| PATCH | `/me` | Bearer | `patchMeSchema` (displayName, locale en/hi) |
| POST | `/me/password` | Bearer | Verify current; update hash; revoke all sessions; audit `PASSWORD_CHANGE` |

`issueSession` (62–76): signs access JWT, creates `jti`, signs refresh JWT, inserts `Session` row with `refreshHash=sha256(jti)`, `ip`, `userAgent`, `expiresAt`.

#### `routes/oauth.ts`
| Method | Path | Auth | Behavior |
|---|---|---|---|
| GET | `/auth/providers` | public | `{google, github}` from env |
| GET | `/auth/oauth/:provider` | public | Redirect to Google/GitHub authorize URL if configured; else 400 |
| GET | `/auth/oauth/:provider/callback` | public | Exchange code; first tenant by `createdAt`; find-or-create TRADER + DEMO + watchlist; sign tokens; redirect `${webUrl}/login/callback#access=...&refresh=...` |

#### `routes/public.ts`
| Method | Path | Auth | Behavior |
|---|---|---|---|
| GET | `/public/tenant` | public | `requireTenant`; returns tenant id/name/slug/domain/logo/colors/themeJson |

#### `routes/broker.ts`
| Method | Path | Auth | Behavior |
|---|---|---|---|
| GET | `/broker/zerodha/login` | public | Redirect to Kite login if `ZERODHA_API_KEY` set |
| GET | `/broker/zerodha/callback` | public | Validate `status=success`+`request_token`; SHA-256 checksum; exchange at Kite `/session/token`; store `zerodha:*` in Redis; redirect `/settings?broker=connected\|error` |
| GET | `/auth/oauth/zerodha/callback` | public | Same handler |
| GET | `/broker/zerodha/status` | Bearer | Read `zerodha:*` keys; return connected/userId/connectedAt |

#### `routes/market.ts` — global `authenticate` (line 13)
| Method | Path | Behavior |
|---|---|---|
| GET | `/assets` | Per-tenant config: commission overrides, allowedSegments, `getEffectiveConfig`, `resolveRisk`, `getQuote` per asset |
| GET | `/assets/:id/quote` | Asset → `getQuote(symbol)`; 404 if missing |
| GET | `/assets/:id/candles` | `timeframe` (M1/M5/M15/H1/H4/D1), `limit`≤2000; OHLCV asc |
| GET | `/watchlists` | Lists + items with live quotes |
| POST | `/watchlists/items` | `watchlistAddSchema`; upsert (unique watchlistId+assetId); ownership |
| DELETE | `/watchlists/items/:assetId` | Delete from user's watchlist |
| POST | `/watchlists` | Create named; max 20; 201 |
| PATCH | `/watchlists/:id` | Rename |
| DELETE | `/watchlists/:id` | Delete; must keep ≥1 |

#### `routes/trading.ts` — global `authenticate` (line 14)
| Method | Path | Behavior |
|---|---|---|
| POST | `/orders` | `placeOrderSchema`; account from body or `primaryAccount`; ownership; `placeOrder`; 201 |
| GET | `/orders` | Real PENDING + synthesized virtual SL/TP "orders" (`sl:<posId>`, `tp:<posId>`) |
| GET | `/orders/history` | FILLED/CANCELLED/REJECTED/EXPIRED, latest 200 |
| DELETE | `/orders/:id` | `sl:`/`tp:` prefix → clear position SL/TP; else `cancelOrder` |
| PATCH | `/orders/:id` | `modifyOrderSchema`; only PENDING; price/trigger/SL/TP |
| PATCH | `/positions/:id` | `modifyPositionSchema`; only OPEN; SL/TP |
| GET | `/positions` | Open positions with mark + summary (unrealized, realizedToday, dayPnl, marginUsed, balance, equity) |
| GET | `/positions/history` | CLOSED/LIQUIDATED, latest 200 |
| POST | `/positions/:id/close` | `closePositionSchema`; `closePosition` with `enforceHours:true` |
| POST | `/positions/close-all` | `closeAllPositions`; count + results |

#### `routes/ledger.ts` — global `authenticate` (line 9)
| Method | Path | Behavior |
|---|---|---|
| GET | `/ledger` | Primary account; optional `type` filter, `take`≤500 |
| GET | `/analytics` | Win rate, wins/losses, gross P/L, profit factor, max drawdown, equity curve, daily PnL, last-50 trade log |

#### `routes/alerts.ts` — global `authenticate` (line 17)
| Method | Path | Behavior |
|---|---|---|
| GET | `/alerts` | User alerts with current mark |
| POST | `/alerts` | `createAlertSchema` (ABOVE/BELOW, price); 201 |
| DELETE | `/alerts/:id` | Delete own |

#### `routes/notifications.ts` — global `authenticate` (line 6)
| Method | Path | Behavior |
|---|---|---|
| GET | `/notifications` | Latest 50 + unread count |
| POST | `/notifications/read` | Mark ids or all read |
| DELETE | `/notifications/:id` | Delete own |
| DELETE | `/notifications` | Delete all own |

#### `routes/admin.ts` — `authenticate` + `requireRole("SUPER_ADMIN","TENANT_ADMIN")` (34–35)
| Method | Path | Behavior |
|---|---|---|
| GET | `/admin/users` | Scoped users + overrides + accounts |
| PATCH | `/admin/users/:id` | status/role/displayName/commission/segments; HOUSE protected; audit `USER_UPDATE` |
| POST | `/admin/users` | Create user; DEMO account; optional balance; audit `USER_CREATE`; 201 + plaintext password |
| GET | `/admin/admins` | Admin list |
| GET | `/admin/trades` | Positions/trades with summary; status filter |
| GET | `/admin/ledger` | Non-house entries with user email |
| POST | `/admin/users/:id/reset-password` | Reset (generated if omitted); audit `PASSWORD_RESET` |
| GET | `/admin/users/:id/detail` | Full detail: accounts, segments, stats, positions, trades, ledger |
| GET | `/admin/trades.csv` | CSV export ≤5000 |
| GET | `/admin/ledger.csv` | CSV export ≤10000 |
| GET | `/admin/tenant-settings` | Tenant name + allowedSegments |
| PATCH | `/admin/tenant/segments` | Update segments; audit `TENANT_SEGMENTS` |
| GET | `/admin/summary` | Aggregated stats |
| GET | `/admin/positions` | Open with mark/margin/liquidation |
| POST | `/admin/positions/:id/force-close` | `closePosition` reason `ADMIN_FORCE_CLOSE`; audit `FORCE_CLOSE` |
| PATCH | `/admin/accounts/:id` | Account status (ACTIVE/MARGIN_CALL/LIQUIDATED/CLOSED); non-house; audit `ACCOUNT_STATUS` |
| POST | `/admin/ledger/adjust` | `adminAdjustSchema`; `postLedgerChanges`; audit `LEDGER_ADJUST` |
| GET | `/admin/leverage` | List rules (tenant + global) |
| PUT | `/admin/leverage` | Create rule; 201 |
| PUT | `/admin/users/:id/leverage` | User leverage override; 201 |
| PUT | `/admin/users/:id/leverage/segments` | Per-segment overrides; 201 |
| PUT | `/admin/assets/config` | Upsert tenant asset config; 201 |
| GET | `/admin/audit` | Latest 200 audit logs |

`tenantScope` (38–43): SUPER_ADMIN any tenant; TENANT_ADMIN own tenant only, cross-tenant → 403.

#### Admin scope — owner-based isolation (`src/lib/scope.ts`)

Tenant-level access is **not** sufficient for a tenant admin. `User.createdById` records the admin who created each user, and every admin route filters on it in the Prisma query itself.

| Helper | Behaviour |
|---|---|
| `isSuperAdmin(auth)` | `true` for `SUPER_ADMIN` — unrestricted, global access. |
| `createdByUserWhere(auth)` | SUPER_ADMIN → `{}` (no restriction). TENANT_ADMIN → `createdById = auth.sub` (users they personally created). |
| `assertManagesUser(auth, target)` | Throws 403 unless the caller is a super admin, the target is the caller, or `target.createdById === auth.sub`. |
| `visibleUserIds` / `visibleAccountIds` | Resolve the caller's visible id sets; super admins get `null` (unrestricted). |

Enforcement points:

- **Lists** — `/admin/users`, `/admin/admins` filter by `createdById`.
- **Detail** — `/admin/users/:id/detail` asserts ownership.
- **Mutations** — `PATCH /admin/users/:id`, `POST /admin/users/:id/reset-password`, `PUT /admin/users/:id/leverage(/segments)`, `PATCH /admin/accounts/:id`, `POST /admin/ledger/adjust`, `POST /admin/positions/:id/force-close` all assert ownership of the target user/account.
- **Reporting** — `/admin/summary`, `/admin/trades(.csv)`, `/admin/ledger(.csv)`, `/admin/positions` are restricted to the caller's owned account ids.
- **Audit** — `/admin/audit` is restricted to the caller's own `actorId`.
- **Role limits** — a tenant admin may only create and manage `TRADER` accounts; `POST /admin/users` with a non-trader role → 403, `PATCH /admin/users/:id` promoting to an admin role → 403.
- **Platform settings** — `PATCH /admin/tenant/segments`, `PUT /admin/leverage` and `PUT /admin/assets/config` are super-admin only: they change tenant/platform-wide configuration that would otherwise affect users the caller does not own.

`POST /admin/users` stamps `createdById = auth.sub` on the newly created user, which is what makes the isolation work for users created from the UI.

> Regression coverage: `cd apps/api && pnpm test:admin-scope` (39 assertions against the real HTTP routes).

#### `routes/tenants.ts` — `authenticate` + `requireRole("SUPER_ADMIN")` (10–11)
| Method | Path | Behavior |
|---|---|---|
| GET | `/admin/tenants` | All tenants + stats |
| POST | `/admin/tenants` | `createTenantSchema`; unique slug/domain; tenant + HOUSE user + house account; audit `TENANT_CREATE`; 201 |
| PATCH | `/admin/tenants/:id` | `patchTenantSchema`; audit `TENANT_UPDATE` |
| GET | `/admin/tenants/:id/metrics` | Users, positions, net PnL, deposits, balance |

### Auth plugin — `plugins/auth.ts`

- `authenticate` (14–22): requires `Authorization: Bearer`; `verifyAccessToken`; failure → `unauthorized()`; success → `request.auth = {sub, tenantId, role}`.
- `requireRole(...roles)` (25–31): no auth → `unauthorized()`; role mismatch → `forbidden()`.
- `isGlobalAdmin(role)` (34–36): true only for `SUPER_ADMIN`.
- Tenant identity comes from the **JWT `tenantId` claim**, never re-resolved from host on authed calls.

### Validation, serialization, errors

- **Validation**: Zod (`@realbulls/shared` + inline). Parsing via `.parse()`; `ZodError` → 400.
- **Serialization** (`lib/serialize.ts`): `toPositionDTO`, `toOrderDTO`, `toLedgerDTO`, `toAssetDTO` — `Decimal`→number, dates→ISO.
- **Errors** (`lib/errors.ts`): `HttpError` + factories 400/401/403/404/409/422. Domain codes: `ASSET_DISABLED`, `SEGMENT_DISABLED`, `MARKET_CLOSED`, `INSUFFICIENT_MARGIN`, `INVALID_LOT`, `NO_POSITION`.

### Env / config — `env.ts`

| Env | Default |
|---|---|
| `API_PORT` | 4000 |
| `ROOT_DOMAIN` | `realbulls.local` |
| `DATABASE_URL` | postgres local |
| `REDIS_URL` | `redis://localhost:6379` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | change-me |
| `JWT_ACCESS_TTL` | 900s |
| `JWT_REFRESH_TTL` | 1209600s (14d) |
| `PNL_TICK_MS` | 1000 |
| `CORS_ORIGINS` | empty (allow all) |
| `PUBLIC_API_BASE` / `PUBLIC_WEB_URL` | localhost |
| `ALLOW_SIGNUP` | true |
| `SIGNUP_STARTING_BALANCE` | 100000 |

---

## 5. Infra routing — Caddy + Docker

### `infra/Caddyfile`

```
handle_path /api/*  → reverse_proxy api:4000
handle /ws*         → reverse_proxy ws-gateway:8080
handle              → reverse_proxy web:3000
```

TLS via ACME (Let's Encrypt), email `{$ACME_EMAIL}`, domains from `SITES` env. Gzip, `-Server` header.

### `infra/docker-compose.yml` — 5 services

| Service | Image | Ports | Depends on |
|---|---|---|---|
| postgres | postgres:16-alpine | 127.0.0.1:5432 | — |
| redis | redis:7-alpine | 127.0.0.1:6379 | — |
| api | realbulls-api:latest | 127.0.0.1:4000 | postgres, redis (healthy) |
| ws-gateway | realbulls-ws:latest | 127.0.0.1:8080 | redis (healthy) |
| web | realbulls-web:latest | 127.0.0.1:3000 | api |
| caddy | caddy:2-alpine | 80, 443 | web, api, ws-gateway |

Volumes: `realbulls-pg`, `realbulls-redis`, `realbulls-caddy-data`, `realbulls-caddy-config`. Default bridge network (services reach each other by name).

### Dockerfiles

- **web**: build `node:20-alpine`, `pnpm install`, `pnpm --filter @realbulls/web build`; run stage copies `.next/standalone` + static + public. `EXPOSE 3000`.
- **api**: single stage, `pnpm install`, `pnpm --filter @realbulls/db generate`. `EXPOSE 4000`.
- **ws**: build `golang:1.23-alpine` `go build`; runtime `gcr.io/distroless/static-debian12`. `EXPOSE 8080`.

---

## 6. "Proper routing" rationale

- **Flat, unversioned API paths.** No `/v1` prefix; `/admin/*` is a convention enforced by `requireRole` hooks, not a Fastify prefix (`index.ts:86–96`). Keeps routes explicit and Caddy rules simple.
- **Subdomain-based tenancy, not path-based.** `x-tenant` / `x-tenant-host` headers set once in middleware; all downstream resolution is header/query/host at login and JWT `tenantId` thereafter. Avoids `/tenant/slug/...` path duplication across every route.
- **JWT bearer, not cookies.** No cookie/session on the wire; refresh token is a JWT whose `jti` hash is persisted in `Session` for revocation. Web stores both tokens in `localStorage` (`lib/api.ts:17–18`).
- **Client-side soft auth guards.** `useEnsureSession` redirects only when there is no stored session and no in-memory user; it does not block render during the `/me` check. `/admin` additionally hard-gates by role.
- **Redis-mediated market data routing.** The gateway is the only writer of `realbulls:price:*` and publisher of `ticks:*`; the API reads price snapshots and publishes account/notify updates. The web never connects to external feeds directly.
- **Caddy as single TLS/routing edge.** All public traffic terminates at Caddy; internal service-to-service traffic stays on the Docker bridge network.
