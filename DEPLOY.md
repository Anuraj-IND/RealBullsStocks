# Deploying Realbulls

Production runbook for a **single DigitalOcean Droplet running Docker Compose**:
Caddy terminates TLS and proxies to the Next.js web app, Fastify API and Go
WebSocket gateway. PostgreSQL and Redis run as containers on the same host.

> Replace every placeholder before running a command:
> `app.example.com`, `<droplet-ip>`, `<repo-url>`, `<email>`, `<password>`.
> The examples assume the domain `app.example.com` and the branch `master`.

## 1. What runs where

```
Internet :80/:443
        |
      Caddy  (automatic HTTPS)
      /   |   \
   /api  /ws   /
    |    |    |
   api  ws   web      127.0.0.1-bound internal ports
    \    |    /
   PostgreSQL + Redis  (Docker network, no public ports)
```

- **Postgres** stores users, accounts, orders, positions, ledger and sessions.
- **Redis** is required at startup. It holds market-data snapshots, pub/sub
  channels, the instrument registry, login-lockout counters and Zerodha tokens.
  It is intentionally non-persistent (`--save "" --appendonly no`); restarting
  Redis drops cached ticks, lockout counters and broker tokens.
- **Images are built in GitHub Actions**, not on the Droplet. The Droplet only
  loads images and runs Compose.
- The first deployment is **manual** (`workflow_dispatch` with `bootstrap=true`).
  Automatic deploys on `master` are enabled later with the repository variable
  `DEPLOY_ENABLED=true`.

## 2. Droplet and DNS

Recommended minimum: **2 vCPU / 4 GB RAM / 80 GB SSD**, Ubuntu 24.04 LTS.
Use **4 vCPU / 8 GB** if you expect meaningful traffic or want faster deploys.
Enable DigitalOcean backups (weekly snapshots).

Create these DNS records at your DNS provider:

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| A | `app` | `<droplet-ip>` | 300 |
| A | `www` (optional) | `<droplet-ip>` | 300 |

Only add `www` if you will also add it to `SITES` and `CORS_ORIGINS`. If the
record is missing, Caddy cannot issue a certificate for it.

If you use Cloudflare, start with **DNS only** (grey cloud). Once HTTPS works,
you may enable proxying with SSL mode **Full (strict)**. Do not use Flexible
mode: it creates redirect loops with Caddy.

## 3. Firewall

Create a DigitalOcean Cloud Firewall and also enable UFW on the host.

Allowed inbound:

| Port | Source |
| --- | --- |
| `22` | your IP (or a VPN/bastion) |
| `80` | `0.0.0.0/0`, `::/0` |
| `443` | `0.0.0.0/0`, `::/0` |

Do not open `3000`, `4000`, `5432`, `6379` or `8080`. Compose binds those to
`127.0.0.1`; the only public entry point is Caddy.

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from <your-ip> to any port 22 proto tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

Note: Docker can publish ports around UFW. The Compose file avoids that by
binding internal services to `127.0.0.1`.

## 4. Server bootstrap

SSH in as root once, create a deploy user and add your public key:

```bash
adduser deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
# paste your public key:
nano /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
```

Harden SSH only after confirming key login works in a second terminal:

```bash
sudo nano /etc/ssh/sshd_config
# PasswordAuthentication no
# PermitRootLogin no
sudo systemctl reload ssh
```

Install packages and Docker:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg git ufw fail2ban htop
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy
```

Log out and reconnect as `deploy` so the `docker` group and `sudo` access
apply, then verify:

```bash
docker version
docker compose version
```

Add a 2 GB swap file (useful during image loads and unexpected memory spikes):

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

Create the application directory and clone the repository:

```bash
sudo mkdir -p /opt/realbulls
sudo chown deploy:deploy /opt/realbulls
git clone <repo-url> /opt/realbulls
```

If the repository is private, use a read-only GitHub deploy key:

```bash
ssh-keygen -t ed25519 -C "realbulls-server" -f ~/.ssh/realbulls_deploy
cat ~/.ssh/realbulls_deploy.pub
# Add it under GitHub -> Settings -> Deploy keys (read-only).
GIT_SSH_COMMAND='ssh -i ~/.ssh/realbulls_deploy' \
  git clone git@github.com:<owner>/<repo>.git /opt/realbulls
```

The deploy workflow overwrites source files in `/opt/realbulls` from a tarball,
but it **does not touch `infra/.env`**. That file must exist before the first
workflow run.

## 5. Production environment

```bash
cd /opt/realbulls/infra
cp .env.example .env
chmod 600 .env
nano .env
```

Use this as the production template:

```env
PUBLIC_HOST=app.example.com
SITES=app.example.com
CORS_ORIGINS=https://app.example.com
ROOT_DOMAIN=app.example.com
ACME_EMAIL=<email>

JWT_ACCESS_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>
JWT_ACCESS_TTL=900
JWT_REFRESH_TTL=1209600
POSTGRES_PASSWORD=<openssl rand -hex 24>

REGISTRY_KEY=realbulls:registry
BINANCE_SYMBOLS=btcusdt,ethusdt,solusdt,xrpusdt
SYNTHETIC_ENABLED=true

TWELVEDATA_API_KEY=
TWELVEDATA_SYMBOLS=EURUSD=EUR/USD,GBPUSD=GBP/USD,USDJPY=USD/JPY,AUDUSD=AUD/USD,XAUUSD=XAU/USD
TWELVEDATA_POLL_MS=60000
ZERODHA_API_KEY=
ZERODHA_API_SECRET=
ZERODHA_SYMBOLS=
ZERODHA_POLL_MS=30000
ZERODHA_REDIRECT=https://app.example.com/api/broker/zerodha/callback
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

ALLOW_SIGNUP=false
SIGNUP_STARTING_BALANCE=100000
```

Generate the secrets directly on the server:

```bash
openssl rand -hex 32   # JWT_ACCESS_SECRET
openssl rand -hex 32   # JWT_REFRESH_SECRET
openssl rand -hex 24   # POSTGRES_PASSWORD
```

Use a password without `@ : / ? #` characters. It is interpolated into the
Postgres connection URL.

Changing `POSTGRES_PASSWORD` after the database volume has been initialized does
not change the password inside Postgres, and the API will fail to connect. On a
fresh install, set it before the first deploy. On an existing install, either
alter the role with `ALTER USER realbulls WITH PASSWORD '...'` and restart the
API, or rebuild the database volume (which destroys data).

If you use `www`, add it to both lists (Caddy site addresses are
space-separated; API origins are comma-separated):

```env
SITES=app.example.com www.app.example.com
CORS_ORIGINS=https://app.example.com,https://www.app.example.com
```

`ROOT_DOMAIN` is the whitelabel tenant root. For this single-host deployment it
equals `PUBLIC_HOST`. Subdomain-per-tenant setups need wildcard DNS, wildcard
TLS (DNS-01), and additional CORS/proxy configuration not covered here.

Never commit `infra/.env`. It is ignored by Git and excluded from deploy
tarballs and Docker build contexts.

## 6. GitHub configuration

Repository: `https://github.com/Anuraj-IND/RealBullsStocks`.

Confirm **Settings → General → Default branch** is `master`. `workflow_dispatch`
only appears for workflows on the default branch.

Create an SSH key for the deploy job on your workstation:

```bash
ssh-keygen -t ed25519 -C "github-actions-realbulls" -f realbulls_deploy
cat realbulls_deploy.pub
```

Append the public key to the server:

```bash
# on the server, as deploy
nano ~/.ssh/authorized_keys
# paste realbulls_deploy.pub
chmod 600 ~/.ssh/authorized_keys
```

Add GitHub **Secrets** (Settings → Secrets and variables → Actions → Secrets):

| Secret | Value |
| --- | --- |
| `DEPLOY_HOST` | Droplet public IP (preferred) or hostname |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | full contents of the private key `realbulls_deploy` |

Add GitHub **Variables** (same page → Variables):

| Variable | Value |
| --- | --- |
| `PUBLIC_HOST` | `app.example.com` |
| `DEPLOY_ENABLED` | leave unset for now; set to `true` after the first successful deploy |

The workflow builds the web image with `PUBLIC_HOST` baked in. Changing the
domain later requires a new image build and deploy.

## 7. First deploy (manual, with seed)

Push the current code to `master`. `DEPLOY_ENABLED` is unset, so the push will
run CI but **will not** auto-deploy.

In GitHub:

1. Open **Actions → Deploy → Run workflow**.
2. Branch: `master`.
3. Enable **Seed a fresh database (run once on a new server)**.
4. Run.

The workflow:

1. builds API, web and WebSocket images on GitHub,
2. uploads `images.tgz` and `src.tgz` to `/opt/realbulls`,
3. loads the images and extracts the source,
4. starts Postgres and Redis and waits for readiness,
5. applies the Prisma schema with `prisma db push`,
6. refuses to seed unless the `User` table is empty, then runs the seed once,
7. starts the stack and checks `https://app.example.com/api/health` and `/`.

First-run duration is typically several minutes. If the health check fails,
inspect the workflow logs; it prints `docker compose ps` and recent logs.

Do not run `bootstrap=true` a second time. The seed is not idempotent: it creates
accounts, ledger entries and leverage rules. The workflow guards against this by
checking the `User` table, but a partially failed seed still requires manual
cleanup.

## 8. Required post-bootstrap cleanup

The seed creates demo users with the known password `password123`. Rotate the
super-admin immediately:

```bash
cd /opt/realbulls/infra
docker compose run --rm --no-deps api \
  pnpm --filter @realbulls/db reset-admin admin@realbulls.io
```

The command prints a generated password and re-activates the account. Store it
in your password manager. Then suspend the other seeded demo users:

```bash
docker compose exec -T postgres psql -U realbulls -d realbulls -c \
  "UPDATE \"User\" SET status = 'SUSPENDED' WHERE email IN ('trader@realbulls.io','admin@bullsx.io','trader@bullsx.io');"
```

Verify:

```bash
docker compose exec -T postgres psql -U realbulls -d realbulls -c \
  'SELECT email, role, status FROM "User" ORDER BY role, email;'
```

Sign in at `https://app.example.com/login` with `admin@realbulls.io` and the new
password. Confirm:

- `/admin` loads and the Users table shows P&L,
- a test order can be placed and appears in positions/order history,
- `https://app.example.com/api/health` returns `{"status":"ok",...}`,
- live/synthetic ticks arrive on the terminal.

If you do not want the seeded demo balances or tenants, adjust them from the
admin UI before inviting real users.

## 9. Enable automatic deploys

After the manual deploy and login checks pass:

1. GitHub → Settings → Secrets and variables → Actions → **Variables**.
2. Add `DEPLOY_ENABLED` = `true`.

From then on, every push to `master` (except Markdown-only changes) runs the
deploy workflow. Manual runs remain available for re-deploys and bootstrap.

To pause auto-deploys, set `DEPLOY_ENABLED` to `false` or delete it.

## 10. Day-2 operations

```bash
cd /opt/realbulls/infra

docker compose ps
docker compose logs -f --tail=200 api
docker compose logs -f --tail=200 web
docker compose logs -f --tail=200 ws-gateway
docker compose logs -f --tail=200 caddy

docker compose restart api web ws-gateway
docker compose up -d --no-build --remove-orphans
```

Useful checks:

```bash
curl -fsS https://app.example.com/api/health
docker compose exec -T postgres pg_isready -U realbulls -d realbulls
docker compose exec -T redis redis-cli ping
```

Rollback:

- Preferred: revert the bad commit and push to `master`; CI/deploy rebuilds the
  previous code.
- Emergency: create a branch or tag at the previous commit, select it in
  **Actions → Deploy → Run workflow**, and deploy that ref.
- Images are tagged `latest` only; there is no automatic image rollback. Keep
  the previous commit SHA available.

Never run `docker compose down -v`: it deletes the Postgres volume.

## 11. Backups and restore

Redis is disposable. Postgres is the source of truth.

Create a nightly compressed backup and keep seven days locally:

```bash
sudo mkdir -p /opt/realbulls/backups
sudo chown deploy:deploy /opt/realbulls/backups

cd /opt/realbulls/infra
docker compose exec -T postgres pg_dump -U realbulls -d realbulls -Fc \
  > /opt/realbulls/backups/realbulls-$(date +%F-%H%M).dump
```

Crontab (`crontab -e`):

```cron
0 2 * * * cd /opt/realbulls/infra && docker compose exec -T postgres pg_dump -U realbulls -d realbulls -Fc > /opt/realbulls/backups/realbulls-$(date +\%F-\%H\%M).dump && find /opt/realbulls/backups -type f -mtime +7 -delete
```

Copy backups off the Droplet (for example to DigitalOcean Spaces with rclone),
and keep DigitalOcean weekly snapshots enabled. A backup on the same disk is not
a disaster-recovery plan.

Restore:

```bash
cd /opt/realbulls/infra
docker compose stop api web ws-gateway caddy
docker compose exec -T postgres pg_restore -U realbulls -d realbulls \
  --clean --if-exists < /opt/realbulls/backups/realbulls-YYYY-MM-DD-HHMM.dump
docker compose up -d
```

Test a restore on a staging Droplet before relying on it.

## 12. Schema changes and data safety

The deploy workflow runs:

```bash
docker compose run --rm --no-deps -T api pnpm --filter @realbulls/db push
```

It deliberately does **not** pass `--accept-data-loss`. Additive changes apply
cleanly. Destructive changes will fail the deploy instead of silently dropping
data.

For a planned destructive change:

1. Take a fresh `pg_dump` and copy it off-host.
2. Test the change against a staging copy.
3. Stop the writers:
   ```bash
   cd /opt/realbulls/infra
   docker compose stop api web ws-gateway
   ```
4. Apply intentionally:
   ```bash
   docker compose run --rm --no-deps -T api \
     pnpm --filter @realbulls/db push --accept-data-loss
   ```
5. Start the stack and verify:
   ```bash
   docker compose up -d
   ```

For long-term safety, adopt Prisma migrations (`prisma migrate deploy`) before
the schema starts changing regularly. This repository currently ships no
migration history.

## 13. Troubleshooting

**Caddy cannot issue a certificate**

- DNS must resolve to the Droplet before Caddy starts.
- Ports 80 and 443 must be open in both the DO Cloud Firewall and UFW.
- If Cloudflare proxying is on, use SSL mode Full (strict).
- Check `docker compose logs caddy`.
- Only list hostnames in `SITES` that actually have DNS records.

**502 from Caddy**

- `docker compose ps` — are `api` and `web` healthy?
- `docker compose logs --tail=100 api web`
- Check `DATABASE_URL` and `REDIS_URL`; the API requires both.
- The API image installs OpenSSL for Prisma; do not remove that package.

**WebSocket does not connect**

- The browser must use `wss://app.example.com/ws`.
- Check `docker compose logs ws-gateway`.
- Redis must be reachable; the gateway exits at startup without it.
- If you changed `PUBLIC_HOST`, rebuild the web image so the new
  `NEXT_PUBLIC_WS_URL` is baked in.

**Login returns 429**

Redis tracks failed logins under `login:fail:*`. Wait for the lockout window or,
only if you are certain, clear the keys:

```bash
docker compose exec -T redis redis-cli --scan --pattern 'login:fail:*' \
  | xargs -r docker compose exec -T redis redis-cli del
```

**Zerodha quotes are synthetic**

The gateway needs a Kite access token in Redis. Set `ZERODHA_API_KEY`,
`ZERODHA_API_SECRET` and `ZERODHA_REDIRECT`, connect the broker from the UI, then
check `docker compose logs ws-gateway`. Without a token the synthetic feed is
used by design.

**Disk full / image load fails**

```bash
df -h /
docker system df
docker image prune -f
docker builder prune -f
```

The deploy workflow already prunes dangling images and retries image loading
after recycling containers. If the problem repeats, resize the Droplet disk.

**Seed fails partway**

The workflow will refuse to seed again because the `User` table is no longer
empty. Inspect the error and fix the cause. On a **fresh install only**, if you
accept destroying all database data, reset the stack and rerun the Deploy
workflow with `bootstrap=true`:

```bash
cd /opt/realbulls/infra
docker compose down -v
# rerun Actions -> Deploy -> Run workflow with bootstrap enabled
```

`docker compose down -v` deletes the Postgres volume.

## 14. Security checklist

- [ ] `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are unique random values.
- [ ] `POSTGRES_PASSWORD` is long, random and URL-safe.
- [ ] `infra/.env` is `chmod 600` and never committed.
- [ ] `ALLOW_SIGNUP=false` unless public signup is intended.
- [ ] Super-admin password rotated; demo accounts suspended.
- [ ] SSH key-only login; root login disabled; port 22 restricted.
- [ ] Firewall exposes only 22, 80 and 443.
- [ ] `CORS_ORIGINS` contains only real origins.
- [ ] Broker/OAuth secrets exist only in `infra/.env`.
- [ ] Backups run nightly, are copied off-host, and a restore has been tested.
- [ ] DigitalOcean monitoring alerts are enabled (CPU, memory, disk).
- [ ] OS packages and Docker are updated regularly.
- [ ] `DEPLOY_ENABLED` is false when you need to pause deployments.

## 15. Optional: managed Postgres/Redis

The chosen setup is self-hosted. If you later migrate to DigitalOcean Managed
Databases, keep the same Compose stack but override only the connection URLs
with an additional Compose file, for example `infra/docker-compose.managed.yml`:

```yaml
services:
  api:
    environment:
      DATABASE_URL: ${MANAGED_DATABASE_URL}
      REDIS_URL: ${MANAGED_REDIS_URL}
  ws-gateway:
    environment:
      REDIS_URL: ${MANAGED_REDIS_URL}
```

Run with both files:

```bash
docker compose -f docker-compose.yml -f docker-compose.managed.yml up -d
```

Add the Droplet to the managed database's trusted sources, require TLS
(`sslmode=require` for Postgres and `rediss://` for Redis), and keep a local
backup until the managed migration is verified. The stock deploy workflow does
not use the override file; adapting it is a separate change.

## 16. Quick reference

```bash
# On the server
cd /opt/realbulls/infra

docker compose ps
docker compose logs -f --tail=200 api
curl -fsS https://app.example.com/api/health
docker compose exec -T postgres pg_isready -U realbulls -d realbulls
docker compose restart api web ws-gateway
docker compose up -d --no-build --remove-orphans

# Reset the super-admin password (prints a new one)
docker compose run --rm --no-deps api \
  pnpm --filter @realbulls/db reset-admin admin@realbulls.io

# Manual backup
docker compose exec -T postgres pg_dump -U realbulls -d realbulls -Fc \
  > /opt/realbulls/backups/realbulls-$(date +%F-%H%M).dump
```
