# Realbulls Droplet Deployment & Redeployment Runbook

Complete, step-by-step production guide for deploying Realbulls to a fresh DigitalOcean Droplet (or any Ubuntu 24.04 VPS) using the **Zero-Server-Stress Local Build Architecture**.

---

## 1. Architecture & Memory Profile

### High-Level Topology
```text
Internet (:80 / :443)
       │
     Caddy (Automatic Let's Encrypt SSL)
    ┌──┴────────┬─────────┐
    ▼           ▼         ▼
 / (Web)    /api (API)  /ws (WS Gateway)
 Next.js     Fastify     Go Gateway
 (3000)      (4000)      (8080)
    └───────────┬─────────┘
                ▼
       PostgreSQL + Redis
```

### Live Memory Footprint (Production Verified)
With the resource-clamping configurations applied in `infra/docker-compose.yml`, the entire stack consumes **only ~1.0 GB of RAM** under normal load:

| Container | Image | Memory Usage | Memory Cap / Tuning |
| :--- | :--- | :--- | :--- |
| **`realbulls-caddy`** | `caddy:2-alpine` | **~13.3 MiB** | Lightweight reverse proxy & TLS manager |
| **`realbulls-web`** | `realbulls-web:latest` | **~53.0 MiB** | Next.js Standalone, `NODE_OPTIONS="--max-old-space-size=384"` |
| **`realbulls-api`** | `realbulls-api:latest` | **~124.6 MiB** | Fastify + Prisma, `NODE_OPTIONS="--max-old-space-size=384"` |
| **`realbulls-ws`** | `realbulls-ws:latest` | **~7.2 MiB** | Distroless Go WebSocket binary |
| **`realbulls-postgres`** | `postgres:16-alpine` | **~186.9 MiB** | `shared_buffers=128MB`, `max_connections=50`, `work_mem=4MB` |
| **`realbulls-redis`** | `redis:7-alpine` | **~3.3 MiB** | `maxmemory 128mb`, `maxmemory-policy allkeys-lru`, no disk append thrashing |
| **System + OS** | Ubuntu 24.04 LTS | **~600 MiB** | Kernel, UFW, Fail2ban, Systemd, Dockerd |
| **TOTAL** | | **~1.0 GiB** | **Leaves ~2.8 GB headroom on a 4 GB Droplet (or ~1 GB on a 2 GB Droplet)** |

---

## 2. Server Specifications

- **Recommended:** DigitalOcean Basic Droplet (`s-2vcpu-2gb` or `s-2vcpu-4gb`).
- **OS:** Ubuntu 24.04 LTS (x64).
- **Disk:** 60 GB SSD minimum.
- **Backups:** Enable DigitalOcean automated backups (snapshots).

---

## 3. Step-by-Step Droplet Provisioning

### 3.1 Initial SSH Connection
Connect as `root` to your new Droplet IP:
```bash
ssh root@<DROPLET_IP>
```

### 3.2 Configure 4 GB Swap File (Crucial for Low-Memory VPS)
Swap prevents Linux Out-Of-Memory (OOM) killer from terminating PostgreSQL or Docker during burst loads:
```bash
# Allocate 4GB swap
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Tune swappiness (10 = only swap when strictly necessary)
sysctl vm.swappiness=10
echo 'vm.swappiness=10' >> /etc/sysctl.conf

# Verify
free -h
```

### 3.3 Update OS & Install Dependencies
```bash
export DEBIAN_FRONTEND=noninteractive
apt update -y && apt upgrade -y
apt install -y ca-certificates curl gnupg git ufw fail2ban htop
```

### 3.4 Install Docker Engine & Compose Plugin
```bash
curl -fsSL https://get.docker.com | sh
```

### 3.5 Create Dedicated `deploy` User
```bash
adduser --gecos "" --disabled-password deploy
usermod -aG sudo,docker deploy
echo "deploy ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/deploy

# Authorize your workstation's SSH key for deploy user
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

### 3.6 Create App Directory
```bash
mkdir -p /opt/realbulls/infra
chown -R deploy:deploy /opt/realbulls
```

### 3.7 Configure UFW Firewall
Expose **only** SSH (22), HTTP (80), and HTTPS (443). Internal ports (`3000`, `4000`, `5432`, `6379`, `8080`) remain bound strictly to `127.0.0.1`:
```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status verbose
```

---

## 4. Production Environment Configuration (`infra/.env`)

On the Droplet, create `/opt/realbulls/infra/.env`:
```bash
sudo -u deploy nano /opt/realbulls/infra/.env
```

Paste the following template. Generate unique random values for secrets using `openssl rand -hex 32`:

```env
# --- Host & Domains ---
# If you don't have a custom domain yet, use <DROPLET_IP>.sslip.io
PUBLIC_HOST=app.yourdomain.com
SITES=app.yourdomain.com
CORS_ORIGINS=https://app.yourdomain.com
ROOT_DOMAIN=app.yourdomain.com

# ACME Email (Must end with a real TLD like .com or .io; do NOT use .local)
ACME_EMAIL=admin@yourdomain.com

# --- Security & Database Secrets ---
JWT_ACCESS_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>
JWT_ACCESS_TTL=900
JWT_REFRESH_TTL=1209600
POSTGRES_PASSWORD=<openssl rand -hex 24 (alphanumeric only)>

# --- Market Data & Registry ---
REGISTRY_KEY=realbulls:registry
BINANCE_SYMBOLS=btcusdt,ethusdt,solusdt,xrpusdt

# --- External Feeds (Optional) ---
TWELVEDATA_API_KEY=
TWELVEDATA_SYMBOLS=EURUSD=EUR/USD,GBPUSD=GBP/USD,USDJPY=USD/JPY,AUDUSD=AUD/USD,XAUUSD=XAU/USD
TWELVEDATA_POLL_MS=60000

ZERODHA_API_KEY=
ZERODHA_API_SECRET=
ZERODHA_SYMBOLS=
ZERODHA_POLL_MS=30000
ZERODHA_REDIRECT=https://app.yourdomain.com/api/broker/zerodha/callback

# --- User Policy ---
ALLOW_SIGNUP=true
SIGNUP_STARTING_BALANCE=100000
```

Lock down permissions:
```bash
chmod 600 /opt/realbulls/infra/.env
```

---

## 5. Local Workstation Build & Direct Streaming Deploy

The deployment script `scripts/deploy-local.ps1` executes all heavy compilation on your local computer and streams pre-built image layers directly to the Droplet over SSH:

### 5.1 Ensure Docker Desktop is Running Locally
Make sure Docker Desktop is launched on your Windows PC and the engine is running.

### 5.2 Execute Deployment Script
Open PowerShell in the project root:

```powershell
# For initial deployment on a fresh server (includes database seed):
.\scripts\deploy-local.ps1 -DropletIp "<DROPLET_IP>" -DeployUser "deploy" -Domain "<YOUR_DOMAIN_OR_SSLIP>" -Bootstrap

# For future code updates (no seed needed):
.\scripts\deploy-local.ps1 -DropletIp "<DROPLET_IP>" -DeployUser "deploy" -Domain "<YOUR_DOMAIN_OR_SSLIP>"
```

### What this automated script does:
1. **Compiles images locally:**
   - `realbulls-api:latest` (Node 20, pnpm, Prisma client)
   - `realbulls-ws:latest` (Go 1.23, distroless binary)
   - `realbulls-web:latest` (Next.js standalone build with domain baked in)
2. **Streams images over SSH pipe:**
   `cmd.exe /c "docker save realbulls-api realbulls-ws realbulls-web | ssh -C deploy@<IP> docker load"`
   *(Zero temporary tarball files on Droplet disk, zero Droplet CPU consumed).*
3. **Synchronizes config files:**
   Copies `infra/docker-compose.yml`, `infra/Caddyfile`, and monorepo packages to `/opt/realbulls`.
4. **Starts database & synchronizes schema:**
   Runs `postgres` and `redis`, then executes `pnpm --filter @realbulls/db push`.
5. **Initializes seed:**
   When `-Bootstrap` is passed, runs `pnpm --filter @realbulls/db seed`.
6. **Starts remaining containers:**
   Launches `api`, `web`, `ws-gateway`, and `caddy`.
7. **Issues TLS Certificate:**
   Caddy automatically challenges Let's Encrypt / ZeroSSL and serves valid HTTPS.

---

## 6. Post-Deployment Security Lockdown

SSH into the droplet as `deploy`:
```bash
ssh deploy@<DROPLET_IP>
```

### 6.1 Rotate Super Admin Password
Reset the super-admin account (`admin@realbulls.io`) and generate a unique secure password:
```bash
cd /opt/realbulls/infra
docker compose run --rm --no-deps api \
  pnpm --filter @realbulls/db reset-admin admin@realbulls.io
```
*Save the generated password in your password manager immediately.*

### 6.2 Suspend Seed Demo Accounts
```bash
docker compose exec -T postgres psql -U realbulls -d realbulls -c \
  "UPDATE \"User\" SET status = 'SUSPENDED' WHERE email != 'admin@realbulls.io';"
```

### 6.3 Verify Account Status
```bash
docker compose exec -T postgres psql -U realbulls -d realbulls -c \
  'SELECT email, role, status FROM "User" ORDER BY role, email;'
```
*(Only `admin@realbulls.io` should show `ACTIVE`; all test traders and tenant admins will show `SUSPENDED`).*

---

## 7. Day-2 Operations & Monitoring

Run these commands on the Droplet (`deploy` user):

```bash
cd /opt/realbulls/infra

# 1. Check all container statuses
docker compose ps

# 2. View live memory & CPU usage
docker stats --no-stream

# 3. View live application logs
docker compose logs -f --tail=100 api
docker compose logs -f --tail=100 web
docker compose logs -f --tail=100 caddy
docker compose logs -f --tail=100 ws-gateway

# 4. Restart services after config edits
docker compose restart api web ws-gateway
docker compose up -d --force-recreate caddy

# 5. Check API health endpoint
curl -fsS https://<YOUR_DOMAIN>/api/health
```

### 7.1 Automated Daily Database Backups
Set up a daily cron job to dump Postgres to `/opt/realbulls/backups`:
```bash
sudo mkdir -p /opt/realbulls/backups
sudo chown deploy:deploy /opt/realbulls/backups

crontab -e
```
Add this line (runs at 02:00 AM daily, keeps 7 days):
```cron
0 2 * * * cd /opt/realbulls/infra && docker compose exec -T postgres pg_dump -U realbulls -d realbulls -Fc > /opt/realbulls/backups/realbulls-$(date +\%F-\%H\%M).dump && find /opt/realbulls/backups -type f -mtime +7 -delete
```

### 7.2 Database Restore
```bash
cd /opt/realbulls/infra
docker compose stop api web ws-gateway caddy
docker compose exec -T postgres pg_restore -U realbulls -d realbulls --clean --if-exists < /opt/realbulls/backups/realbulls-YYYY-MM-DD-HHMM.dump
docker compose up -d
```
