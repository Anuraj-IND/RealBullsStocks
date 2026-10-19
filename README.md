<p align="center">
  <img src="brand/logo.svg" alt="Realbulls" width="200" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Go-1.23-00ADD8?logo=go&logoColor=white" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white" />
  <img src="https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white" />
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white" />
</p>

# Realbulls

Multi-asset trading terminal — real-time charts, market depth, margin/leverage engine, double-entry ledger, admin control panel and whitelabel support.

**हिन्दी** — रियलबुल्स एक मल्टी-एसेट ट्रेडिंग टर्मिनल है: लाइव चार्ट, ऑर्डर बुक, मार्जिन और लेवरेज इंजन, डबल-एंट्री लेजर, एडमिन पैनल और व्हाइटलेवल सपोर्ट।

## Architecture

```
                        ┌──────────────────────────────┐
   browser  ─────────►  │  web (Next.js 15, :3000)     │
                        │  terminal · admin · auth     │
                        └───────────────┬──────────────┘
                                        │ REST (:4000) + WebSocket (:8080)
                        ┌───────────────▼──────────────┐
                        │  api (Fastify + Prisma)      │
                        │  orders · ledger · margin    │
                        │  P&L / candle / alert workers│
                        └───────┬───────────────┬──────┘
                                │ SQL           │ Redis pub/sub
                        ┌───────▼──────┐  ┌─────▼──────────────┐
                        │ PostgreSQL 16│  │ Redis 7            │
                        │  (Prisma)    │  │ ticks · registry   │
                        └──────────────┘  └─────▲──────────────┘
                                                │ ticks / registry
                        ┌───────────────────────┴──────────────┐
                        │  ws-gateway (Go, :8080)              │
                        │  Binance · TwelveData · Kite · synth │
                        └──────────────────────────────────────┘
```

Feeds: Binance (crypto), Twelve Data (forex/commodities), Zerodha Kite Connect (NSE/BSE), plus a built-in GBM simulator for any symbol without a live feed.

## Stack

| Layer | Tech |
| --- | --- |
| Web | Next.js 15 (App Router), Tailwind, Framer Motion, Zustand, TanStack Query, lightweight-charts |
| API | Node.js 20+, Fastify 5, Prisma 5, ioredis, jose |
| Feed | Go 1.23 WebSocket gateway |
| Data | PostgreSQL 16, Redis 7 |
| Infra | pnpm workspaces, Turborepo, Docker Compose, Caddy, GitHub Actions |

## Layout

```
apps/web         terminal + admin + whitelabel (Next.js)
apps/api         REST API, order/ledger engine, background workers (Fastify)
apps/ws-gateway  Go: market-data ingest + tick fan-out
packages/db      Prisma schema, seed, reset-admin helpers
packages/engine  pure margin/P&L/liquidation math (unit-tested)
packages/shared  types, Zod schemas, design tokens
infra            docker-compose, Dockerfiles, Caddyfile, OAuth notes
docs             data flow, routing, key functions, fix log
brand            logo assets
```

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | ≥ 20 | `package.json` `engines` |
| pnpm | 10.19.0 | `corepack enable && corepack prepare pnpm@10.19.0 --activate` |
| Go | ≥ 1.23 | only needed for the gateway |
| PostgreSQL | 16 | Docker (`infra/docker-compose.yml`) or native |
| Redis | 7 | Docker, or **Memurai** on Windows (Redis-compatible) |
| Docker | latest | optional; used for the DB/Redis and for production builds |

## Quickstart (local development)

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Create the runtime env files
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
#   -> edit if your Postgres/Redis are not on localhost defaults

# 3. Start PostgreSQL + Redis (either option)
pnpm infra:up
#   OR use a native PostgreSQL 16 install + Memurai/Redis and skip this step

# 4. Point Prisma at the database (matches DATABASE_URL above)
#    macOS / Linux
export DATABASE_URL='postgresql://realbulls:realbulls@localhost:5432/realbulls?schema=public'
#    Windows PowerShell
$env:DATABASE_URL='postgresql://realbulls:realbulls@localhost:5432/realbulls?schema=public'

# 5. Create the schema and seed demo data
pnpm db:generate
pnpm db:push
pnpm db:seed

# 6. Run web (:3000) + api (:4000)
pnpm dev
```

The Go gateway runs as a separate process and reads configuration from the
environment (it does not load a `.env` file):

```bash
# macOS / Linux
REDIS_URL=redis://localhost:6379 BINANCE_SYMBOLS=btcusdt,ethusdt SYNTHETIC_ENABLED=true \
  go run ./cmd/gateway   # run from apps/ws-gateway

# Windows PowerShell
$env:REDIS_URL='redis://localhost:6379'; $env:BINANCE_SYMBOLS='btcusdt,ethusdt'; $env:SYNTHETIC_ENABLED='true'
go run ./cmd/gateway       # run from apps/ws-gateway
```

Open <http://localhost:3000> and sign in with a demo account (below).

## Demo accounts

Seeded by `pnpm db:seed` — all use password `password123`.

| Role | Login | Tenant |
| --- | --- | --- |
| Super admin | `admin@realbulls.io` | realbulls |
| Trader | `trader@realbulls.io` | realbulls |
| Tenant admin | `admin@bullsx.io` | bullsx (whitelabel) |
| Trader | `trader@bullsx.io` | bullsx (whitelabel) |

Both tenants share a single `/login`; tenancy is resolved from the account, an
`x-tenant` header, or the `?tenant=` query. See `docs/CREDENTIALS.md` for details.

> **Security:** these are demo credentials for local development only. Rotate
> them (`pnpm db:reset-admin <email>`) and set `ALLOW_SIGNUP=false` before any
> real deployment.

## Database

- Schema: `packages/db/prisma/schema.prisma` (models include `User`, `Tenant`,
  `Account`, `Order`, `Position`, `LedgerEntry`, `Instrument`, `Asset`, …).
- This project currently ships **no migration files**; the schema is applied with
  `prisma db push`. For production-grade change tracking, switch to
  `pnpm db:migrate` and commit the generated files under
  `packages/db/prisma/migrations/`.
- The Prisma CLI reads `DATABASE_URL` from the environment (or a `.env` file in
  `packages/db/`). The seed scripts are plain `tsx` and require the variable to be
  exported in your shell.

| Command | What it does |
| --- | --- |
| `pnpm db:generate` | Generate the Prisma client into `packages/db/generated/` |
| `pnpm db:push` | Sync the schema to the database (no migration history) |
| `pnpm db:migrate` | Create/apply a versioned migration (`prisma migrate dev`) |
| `pnpm db:seed` | Insert tenants, demo users, assets and instruments |
| `pnpm db:reset-admin <email>` | Reset a super-admin password |
| `pnpm --filter @realbulls/db studio` | Open Prisma Studio |

Local reset helpers (`packages/db/src/applySql.ts`, `ledger_immutable.sql`) apply
the ledger immutability trigger.

## Redis usage

Redis is required — the API publishes market data and the gateway consumes it.

| Key / channel | Purpose |
| --- | --- |
| `realbulls:registry` | Instrument registry (tokens, symbols, start prices) published by the API |
| `realbulls:price:<SYMBOL>` | Latest tick snapshot (`{ bid, ask, mid, ts }`) |
| `ticks:<SYMBOL>` (pub/sub) | Tick fan-out consumed by the gateway |
| `accounts:<ACCOUNT_ID>` (pub/sub) | Per-account equity/margin pushes |
| `instruments:lastSync` | Timestamp of the last NFO/BFO instrument sync |
| `login:fail:<...>` | Failed-login counters for lockout |
| `zerodha:access_token`, `zerodha:user_id`, `zerodha:connected_at` | Kite session (set after broker login) |

`REGISTRY_KEY` changes the registry key name if needed.

### Instruments

The API syncs NSE/BSE F&O instrument metadata from the public Kite instruments
CSV (`https://api.kite.trade/instruments/{NFO,BFO}`) into the `Instrument` table
on startup and then every 12 hours. Force a sync as a super admin:

```bash
curl -X POST http://localhost:4000/instruments/sync -H "Authorization: Bearer <token>"
curl http://localhost:4000/instruments/status
```

Live option/equity quotes need a Zerodha Kite access token; without it the
gateway serves synthetic ticks so search, charts, orders and P&L still work.

## Environment variables

Each app reads its own file. Copy the matching `.env.example` and never commit
the result.

### `apps/api/.env` (see `apps/api/.env.example`)

| Var | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | `development` | Runtime mode |
| `API_PORT` | `4000` | API listen port |
| `ROOT_DOMAIN` | `realbulls.local` | Base domain for whitelabel subdomains |
| `DATABASE_URL` | `postgresql://realbulls:realbulls@localhost:5432/realbulls?schema=public` | Postgres connection |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | `change-me…` | **Change in production** |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | `900` / `1209600` | Token lifetimes (seconds) |
| `PNL_TICK_MS` | `1000` | P&L recompute cadence |
| `REGISTRY_KEY` | `realbulls:registry` | Instrument registry key |
| `CORS_ORIGINS` | _(empty)_ | Comma separated allowed browser origins |
| `PUBLIC_API_BASE` / `PUBLIC_WEB_URL` | `http://localhost:4000` / `:3000` | Absolute URLs for OAuth/broker callbacks |
| `ALLOW_SIGNUP` | `true` | Public self-signup toggle |
| `SIGNUP_STARTING_BALANCE` | `100000` | Starting balance for signups |
| `GOOGLE_*` / `GITHUB_*` | _(empty)_ | Social login (see `infra/OAUTH.md`) |
| `ZERODHA_API_KEY` / `ZERODHA_API_SECRET` / `ZERODHA_REDIRECT` | _(empty)_ | Kite Connect |

### `apps/web/.env.local` (see `apps/web/.env.example`)

| Var | Default | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `/api` fallback | API base for the browser (baked at build time) |
| `NEXT_PUBLIC_WS_URL` | derived | WebSocket gateway URL |
| `NEXT_PUBLIC_SITE_URL` | `https://app.example.com` | Canonical site URL (SEO/metadata) |
| `NEXT_PUBLIC_ROOT_DOMAIN` | `realbulls.live` | Tenant subdomain root |
| `API_INTERNAL_URL` | `http://localhost:4000` | Server-side API URL (Docker: `http://api:4000`) |
| `ROOT_DOMAIN` | `realbulls.local` | Server-side tenant root (middleware) |
| `ALLOWED_DEV_ORIGINS` | _(empty)_ | Extra hosts allowed to reach the dev server |

### `apps/ws-gateway` (process environment)

| Var | Default | Description |
| --- | --- | --- |
| `WS_PORT` | `8080` | Gateway listen port |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `REGISTRY_KEY` | `realbulls:registry` | Registry key to read |
| `BINANCE_SYMBOLS` | _(empty)_ | Crypto symbols to mirror |
| `SYNTHETIC_ENABLED` | `true` | Generate GBM ticks without live feeds |
| `TICK_THROTTLE_MS` | `250` | Synthetic publish cadence |
| `TWELVEDATA_API_KEY` / `TWELVEDATA_SYMBOLS` / `TWELVEDATA_POLL_MS` | _(empty)_ / defaults / `60000` | Forex/commodities (`INTERNAL=EXTERNAL` maps) |
| `ZERODHA_API_KEY` / `ZERODHA_SYMBOLS` / `ZERODHA_POLL_MS` | _(empty)_ / defaults / `30000` | Kite quotes (`INTERNAL=EXTERNAL` maps) |

### `infra/.env` (see `infra/.env.example`)

Consumed by `infra/docker-compose.yml`: `PUBLIC_HOST`, `SITES` (space-separated
Caddy hosts), `CORS_ORIGINS` (comma-separated), `ROOT_DOMAIN`, `ACME_EMAIL`,
`POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, JWT TTLs,
`REGISTRY_KEY`, feed symbols and optional provider keys.

## Ports

| Service | Port |
| --- | --- |
| web | 3000 |
| api | 4000 |
| ws-gateway | 8080 |
| PostgreSQL | 5432 |
| Redis | 6379 |

## Quality checks

```bash
pnpm typecheck      # tsc --noEmit across packages
pnpm test           # engine unit tests (vitest)
pnpm --filter @realbulls/web build
cd apps/ws-gateway && go build ./... && go vet ./...
```

`pnpm lint` is currently a stub (`next lint` for the web app, no-op elsewhere);
there is no ESLint config committed yet.

## Deployment

Production runs the same containers behind Caddy (automatic HTTPS) on a single
DigitalOcean Droplet with self-hosted PostgreSQL and Redis.

See **[DEPLOY.md](DEPLOY.md)** for the full runbook: Droplet and DNS setup,
firewall, production environment, first deploy with database bootstrap, GitHub
Actions secrets/variables, backups, rollback and troubleshooting.

Quick summary:

```bash
cp infra/.env.example infra/.env   # fill PUBLIC_HOST, SITES, secrets, provider keys
```

GitHub Actions builds the API, web and WebSocket images, ships them to the
server over SSH and restarts the stack. Required repository secrets:

| Secret | Purpose |
| --- | --- |
| `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` | SSH target for the deploy job |

Required repository variables:

| Variable | Purpose |
| --- | --- |
| `PUBLIC_HOST` | Hostname baked into the web image and used for smoke tests |
| `DEPLOY_ENABLED` | Set to `true` after the first manual deploy to enable push-to-`master` deploys |

The first deploy is manual: run **Actions → Deploy → Run workflow** with
`bootstrap=true`. `.github/workflows/ci.yml` runs install, Prisma client
generation, typecheck, engine tests, Go build/vet and the web build on every
push/PR to `master`.

## Security checklist

- [ ] Rotate `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — the defaults are public.
- [ ] Change the Postgres password and stop publishing DB ports publicly.
- [ ] Set `ALLOW_SIGNUP=false` unless public signup is intended.
- [ ] Remove/replace the seeded demo accounts (`pnpm db:reset-admin`).
- [ ] Provide secrets only through `.env` files / the deploy environment — never commit them.
- [ ] Restrict `CORS_ORIGINS` to your real hostnames.
- [ ] Keep broker keys (`ZERODHA_*`, `TWELVEDATA_*`) server-side only.

## Documentation

`docs/DATA_FLOW.md` · `docs/ROUTING.md` · `docs/KEY_FUNCTIONS.md` ·
`docs/FIXES.md` · `docs/RATE_LIMITS.md` · `docs/CREDENTIALS.md` ·
`apps/ws-gateway/README.md` · `infra/OAUTH.md`

## Disclaimer

Trading involves substantial risk. This software is provided for development and
educational purposes; audit it thoroughly before using it with real funds. No
license is granted for redistribution.
