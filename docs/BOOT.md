# Boot Runbook — Realbulls local stack (no Docker)

Every process is native. Ports: web **:3000** (pages + API + tick socket),
API **:4000**, gateway **:8080**, Postgres **:5432**, Memurai **:6379**.

## Every boot (in order)

### 1. Infra — only after a reboot (skip otherwise)

```powershell
powershell -ExecutionPolicy Bypass -File D:\realbulls-infra\start-infra.ps1
```

Starts Postgres if down, starts the gateway binary, prints a status table —
all three lines must read `True`. Memurai starts itself (Windows service).

### 2. Terminal 1 — API

```powershell
cd D:\my-website-main\apps\api
npm run dev
```

Wait for `Server listening at ... :4000` plus the worker lines
(`pnl` / `candle` / `alert` / `quote-bridge`). Leave running.

### 3. Terminal 2 — Web

```powershell
cd D:\my-website-main\apps\web
npm run dev
```

Wait for `[relay] :3000 → next :3001 + ws :8080`. This one command serves
pages, the `/api` proxy, and the `/ws` tick socket — the browser only ever
touches `:3000`. Leave running.

### 4. Tunnel — only for remote access

```powershell
cloudflared tunnel --url http://localhost:3000
```

One link covers everything (pages, API, live ticks).

### 5. Sanity check (30 seconds)

1. Open `http://localhost:3000/login` and log in.
2. Ticks moving, no "Connecting…" banner.
3. Broker connected — if not, reconnect Kite once in Settings (tokens
   expire every morning; that is the normal daily flow, not a fault).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `EADDRINUSE` on 3000/4000 | A leftover background process holds the port — kill that node process (or ask to have it cleared) and rerun. |
| Backend log: `Can't reach database server at localhost:5432` | Postgres didn't survive the reboot — run step 1. The API reconnects on its own. |
| `Connecting…` stuck on screen | Gateway is down — run step 1. Prices still flow via API; only push ticks pause. |
| Broker disconnected after boot | Reconnect Kite in Settings (daily token expiry). |
| Stale `$` or wrong figures after an update | Hard-refresh the browser (Ctrl+Shift+R); dev HMR usually covers it. |

## Backups (untouched by boot)

- DB dump: `D:\realbulls-infra-dump-20261023.sql` (plus `D:\realbulls-infra-dump.sql`)
- Kite token copy: `C:\Users\anura\AppData\Local\Temp\opencode\kite-token.txt`
- Full fix history: `docs/FIXES.md`
