#!/usr/bin/env bash
# ============================================================
# Zebvix — Production Build Script
# Run from the repo root:  bash deploy/build.sh
# Or as app user:          sudo -u cryptox bash deploy/build.sh
# ============================================================
set -euo pipefail
CYAN="\033[1;36m"; GREEN="\033[1;32m"; YELLOW="\033[1;33m"; RED="\033[0;31m"; NC="\033[0m"
log()  { echo -e "${CYAN}[build]${NC} $*"; }
ok()   { echo -e "${GREEN}[  OK  ]${NC} $*"; }
warn() { echo -e "${YELLOW}[ WARN ]${NC} $*"; }
err()  { echo -e "${RED}[ ERR  ]${NC} $*"; exit 1; }

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
DIST_DIR="$APP_DIR/dist"
export NODE_ENV=production
export PATH=$PATH:/usr/local/go/bin

log "═══════════════════════════════════════════"
log "  Zebvix — Production Build"
log "  Root : $APP_DIR"
log "  Node : $(node --version)"
log "  Go   : $(go version | awk '{print $3}')"
log "  pnpm : $(pnpm --version)"
log "═══════════════════════════════════════════"

cd "$APP_DIR"

# ── Load .env ────────────────────────────────────────────────
if [[ -f "$APP_DIR/.env" ]]; then
  set -a; source "$APP_DIR/.env"; set +a
  log "Environment loaded from .env"
else
  warn ".env not found — using environment variables only"
fi

# ── 1. Install all dependencies ──────────────────────────────
log "[1/7] Installing pnpm dependencies..."
pnpm install --frozen-lockfile --prod=false
ok "Dependencies installed"

# ── 2. Build shared libraries ────────────────────────────────
log "[2/7] Building shared libraries (TypeScript composite build)..."
pnpm run typecheck:libs
ok "Libraries built"

# ── 3. Build API server (esbuild → ESM bundle) ───────────────
log "[3/7] Building API server..."
pnpm --filter @workspace/api-server run build
ok "API server built → artifacts/api-server/dist/index.mjs"

# ── 4. Build User Portal (Vite → static SPA) ─────────────────
log "[4/7] Building user portal..."
BASE_PATH=/user/ pnpm --filter @workspace/user-portal run build
ok "User portal built → artifacts/user-portal/dist/"

# ── 5. Build Admin Panel (Vite → static SPA) ─────────────────
log "[5/7] Building admin panel..."
BASE_PATH=/admin/ pnpm --filter @workspace/admin run build
ok "Admin panel built → artifacts/admin/dist/"

# ── 6. Build Go service (order matching engine) ───────────────
log "[6/7] Building Go order matching engine..."
cd "$APP_DIR/artifacts/go-service"
go build -o server -ldflags="-s -w" .
cd "$APP_DIR"
ok "Go service built → artifacts/go-service/server"

# ── 7. Copy static files to serve dir ────────────────────────
log "[7/7] Copying static files to /opt/cryptox/dist/..."
mkdir -p "$DIST_DIR/user" "$DIST_DIR/admin"

# User portal: Vite outputs to dist/public by default
if [[ -d "$APP_DIR/artifacts/user-portal/dist/public" ]]; then
  rsync -a --delete "$APP_DIR/artifacts/user-portal/dist/public/" "$DIST_DIR/user/"
else
  rsync -a --delete "$APP_DIR/artifacts/user-portal/dist/" "$DIST_DIR/user/"
fi

# Admin panel
if [[ -d "$APP_DIR/artifacts/admin/dist/public" ]]; then
  rsync -a --delete "$APP_DIR/artifacts/admin/dist/public/" "$DIST_DIR/admin/"
else
  rsync -a --delete "$APP_DIR/artifacts/admin/dist/" "$DIST_DIR/admin/"
fi
ok "Static files copied to $DIST_DIR"

# ── 8. Run database migrations ────────────────────────────────
if [[ -n "${DATABASE_URL:-}" ]]; then
  log "Running database migrations (drizzle migrate)..."
  pnpm --filter @workspace/db run migrate
  ok "Database schema up to date"
else
  warn "DATABASE_URL not set — skipping DB migration. Run manually: pnpm --filter @workspace/db run migrate"
fi

# ── 9. Restart PM2 (if running) ───────────────────────────────
if pm2 list 2>/dev/null | grep -q "cryptox"; then
  log "Restarting PM2 processes..."
  pm2 restart all
  ok "PM2 restarted"
  pm2 status
else
  log "PM2 not running yet. Start with: pm2 start deploy/pm2.config.cjs"
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Build Complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo ""
echo "  API server : artifacts/api-server/dist/index.mjs"
echo "  User portal: $DIST_DIR/user/"
echo "  Admin panel: $DIST_DIR/admin/"
echo "  Go service : artifacts/go-service/server"
echo ""
