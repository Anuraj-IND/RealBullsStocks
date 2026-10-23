[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$DropletIp = "143.110.188.40",

    [Parameter(Mandatory = $false)]
    [string]$DeployUser = "deploy",

    [Parameter(Mandatory = $false)]
    [string]$Domain = "143.110.188.40.sslip.io",

    [Parameter(Mandatory = $false)]
    [switch]$Bootstrap = $false
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " REALBULLS ULTRA-OPTIMIZED LOCAL DEPLOYMENT" -ForegroundColor Cyan
Write-Host " Target: $DeployUser@$DropletIp | Domain: $Domain" -ForegroundColor Cyan
Write-Host " Heavy building happens locally; server load is minimized." -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Verify local Docker daemon is running
try {
    docker info > $null 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Docker not responding"
    }
} catch {
    Write-Host "`n[ERROR] Docker Desktop is not running on your computer!" -ForegroundColor Red
    Write-Host "Please start Docker Desktop on Windows, wait for it to be ready, and re-run this script." -ForegroundColor Yellow
    exit 1
}

# 2. Build images locally using buildx/docker
Write-Host "`n[1/5] Building images locally on your machine..." -ForegroundColor Green

Write-Host " -> Building realbulls-api:latest..." -ForegroundColor Gray
docker build -f infra/Dockerfile.api -t realbulls-api:latest .
if ($LASTEXITCODE -ne 0) { throw "Failed to build realbulls-api" }

Write-Host " -> Building realbulls-ws:latest..." -ForegroundColor Gray
docker build -f infra/Dockerfile.ws -t realbulls-ws:latest .
if ($LASTEXITCODE -ne 0) { throw "Failed to build realbulls-ws" }

Write-Host " -> Building realbulls-web:latest (Next.js standalone bundle)..." -ForegroundColor Gray
docker build -f infra/Dockerfile.web `
    --build-arg NEXT_PUBLIC_SITE_URL="https://$Domain" `
    --build-arg NEXT_PUBLIC_ROOT_DOMAIN="$Domain" `
    --build-arg NEXT_PUBLIC_API_URL="/api" `
    --build-arg NEXT_PUBLIC_WS_URL="wss://$Domain/ws" `
    --build-arg NEXT_PUBLIC_USD_INR="83.5" `
    -t realbulls-web:latest .
if ($LASTEXITCODE -ne 0) { throw "Failed to build realbulls-web" }

# 3. Stream prebuilt images directly into the Droplet's Docker daemon
Write-Host "`n[2/5] Streaming pre-built images directly into Droplet's Docker daemon..." -ForegroundColor Green
Write-Host " (Zero build CPU on Droplet, zero temporary files on Droplet disk)" -ForegroundColor Gray

# Use cmd.exe raw binary pipe with SSH compression (-C) to avoid PowerShell encoding corruption
cmd.exe /c "docker save realbulls-api:latest realbulls-ws:latest realbulls-web:latest | ssh -C -o StrictHostKeyChecking=no $DeployUser@$DropletIp docker load"
if ($LASTEXITCODE -ne 0) { throw "Failed to transfer and load images on Droplet" }

# 4. Sync configuration files and source to Droplet
Write-Host "`n[3/5] Syncing infra config and workspace files..." -ForegroundColor Green

ssh -o StrictHostKeyChecking=no "$DeployUser@$DropletIp" "mkdir -p /opt/realbulls/infra"
scp -o StrictHostKeyChecking=no infra/docker-compose.yml infra/Caddyfile "$DeployUser@$DropletIp`:/opt/realbulls/infra/"

# Package repository source needed for Prisma migration & seed scripts
$tempArchive = Join-Path $env:TEMP "realbulls-src-$((Get-Date).Ticks).tar.gz"
tar --exclude=node_modules --exclude=.next --exclude=.turbo --exclude=generated `
    --exclude=.git --exclude="*.tsbuildinfo" --exclude=".env" --exclude=".env.*" `
    -czf $tempArchive package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json packages apps infra

scp -o StrictHostKeyChecking=no $tempArchive "$DeployUser@$DropletIp`:/opt/realbulls/src.tar.gz"
Remove-Item $tempArchive -Force -ErrorAction SilentlyContinue

ssh -o StrictHostKeyChecking=no "$DeployUser@$DropletIp" "tar -xzf /opt/realbulls/src.tar.gz -C /opt/realbulls && rm -f /opt/realbulls/src.tar.gz"

# 5. Execute DB push and start stack on Droplet
Write-Host "`n[4/5] Starting database & synchronizing schema..." -ForegroundColor Green

$remoteScript = @'
set -euo pipefail
cd /opt/realbulls/infra

if [ ! -f .env ]; then
    echo "[!] Error: /opt/realbulls/infra/.env is missing on Droplet."
    echo "Please copy .env.example to .env and configure secrets first."
    exit 1
fi

docker compose up -d postgres redis

# Wait for Postgres
ready=0
for i in $(seq 1 30); do
    if docker compose exec -T postgres pg_isready -U realbulls -d realbulls >/dev/null 2>&1; then
        ready=1
        break
    fi
    sleep 1
done

if [ "${ready}" != "1" ]; then
    echo "Postgres failed to start"
    exit 1
fi

# Apply Prisma schema
docker compose run --rm --no-deps -T api pnpm --filter @realbulls/db push

# Check and execute one-shot INR migration if legacy USD accounts exist
usd_count=$(docker compose exec -T postgres psql -U realbulls -d realbulls -tAc 'SELECT count(*) FROM "Account" WHERE "baseCurrency" = '\''USD'\''' 2>/dev/null || echo "0")
if [ "${usd_count}" != "0" ] && [ -n "${usd_count}" ]; then
    echo "Found ${usd_count} legacy USD accounts. Running one-shot INR migration..."
    docker compose run --rm --no-deps -T api pnpm --filter @realbulls/api migrate:inr || true
fi

# Optional bootstrap seed
if [ "${BOOTSTRAP:-false}" = "true" ]; then
    count=$(docker compose exec -T postgres psql -U realbulls -d realbulls -tAc 'SELECT count(*) FROM "User"' 2>/dev/null || echo "0")
    if [ "${count}" = "0" ] || [ -z "${count}" ]; then
        echo "Running initial database seed..."
        docker compose run --rm --no-deps -T api pnpm --filter @realbulls/db seed
    else
        echo "Database already has data (User count: ${count}). Skipping seed."
    fi
fi

# Start remaining containers
docker compose up -d --no-build --remove-orphans
docker compose ps
'@

$bootstrapVal = if ($Bootstrap) { "true" } else { "false" }
$remoteScript | ssh -o StrictHostKeyChecking=no "$DeployUser@$DropletIp" "BOOTSTRAP='$bootstrapVal' bash -s"



Write-Host "`n[5/5] Checking application health at https://$Domain/api/health..." -ForegroundColor Green
Start-Sleep -Seconds 8

try {
    $res = Invoke-RestMethod -Uri "https://$Domain/api/health" -Method Get -TimeoutSec 10 -ErrorAction SilentlyContinue
    Write-Host "`n Deployment Successful! Status: $($res.status)" -ForegroundColor Green
    Write-Host "App is live at: https://$Domain" -ForegroundColor Cyan
} catch {
    Write-Host "`nHealth check returned status or is awaiting DNS/SSL propagation." -ForegroundColor Yellow
    Write-Host "Check running containers with: ssh $DeployUser@$DropletIp 'docker compose -f /opt/realbulls/infra/docker-compose.yml ps'" -ForegroundColor Gray
}
