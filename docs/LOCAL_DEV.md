# Local development (host `pnpm dev`, no image rebuilds)

Docker is only needed for **infrastructure** (Postgres/Redis) and for **deployment**.
Application code changes never require rebuilding an image — run the app on the host
and let `tsx watch` / `next dev` hot-reload it.

## Ports: what owns what

| Port | Owner | Notes |
|---|---|---|
| 3000 | `realbulls-web` (Docker) | conflicts with `next dev -p 3000` |
| 4000 | `realbulls-api` (Docker) | conflicts with `tsx watch` (API dev) |
| 8080 | `realbulls-ws` (Docker) | Go gateway |
| 5432 | `realbulls-postgres` (Docker) | also what host API dev connects to |
| **6379** | **`memurai`** (native Windows Redis) | local Redis |
| **6380** | **`realbulls-redis` (Docker)** | published as `127.0.0.1:6380` |
| 80 / 443 | `realbulls-caddy` | serves `https://localhost`, proxies `/api/*` |

> **Redis matters.** The Docker `ws-gateway` reads the instrument registry from the
> **Docker** Redis. A host-run API must therefore publish to the *same* Redis, i.e.
> `REDIS_URL=redis://localhost:6380`. `apps/api/.env` is set that way. Using the
> native 6379 works for the API alone but the gateway will not see its registry.

## Option A — front-end dev only (no Docker changes, recommended)

Keeps the whole Docker backend running and hot-reloads the web app on a free port.

```powershell
pnpm --filter @realbulls/web exec next dev -p 3100
# browse http://localhost:3100
```

Works because `apps/web/.env.local` sets `NEXT_PUBLIC_API_URL=http://localhost:4000`,
and the API reflects the calling origin (`CORS_ORIGINS` unset ⇒ `origin: true`), so a
browser on `:3100` can call the Docker API directly.

If you prefer a same-origin call with no CORS at all, build with
`NEXT_PUBLIC_API_URL=/api`: `middleware.ts` proxies `/api/*` to `API_INTERNAL_URL`
at request time.

## Option B — full stack on the host (API + web hot reload)

`api` and `web` must own ports 4000 / 3000, so stop those two containers first:

```powershell
docker compose -f infra/docker-compose.yml stop web api
pnpm dev            # turbo: API :4000 + web :3000, both hot-reloading
```

Postgres (5432) and Redis (6380) stay in Docker and are reused as-is; `ws-gateway`,
`caddy` and the rest are unaffected.

Restore the containers when you are done:

```powershell
docker compose -f infra/docker-compose.yml start web api
```

## Why the login screen said "Not Found"

`infra/Dockerfile.web` builds with `NEXT_PUBLIC_API_URL=/api` (compose default), which
only resolves behind Caddy's `handle_path /api/*`. Opening the web container directly
(`http://localhost:3000`) bypasses Caddy, so `/api/auth/login` hit Next, returned a 404
HTML page, and the UI fell back to `res.statusText` — "Not Found".

Fixed in `apps/web/src/middleware.ts`, which rewrites `/api/*` to `API_INTERNAL_URL`
at runtime. That fix ships in the next web build; `next dev` picks it up instantly.