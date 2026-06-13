#!/usr/bin/env bash
# ================================================================
#  ███████╗███████╗██████╗ ██╗   ██╗██╗██╗  ██╗
#  ╚══███╔╝██╔════╝██╔══██╗██║   ██║██║╚██╗██╔╝
#    ███╔╝ █████╗  ██████╔╝██║   ██║██║ ╚███╔╝
#   ███╔╝  ██╔══╝  ██╔══██╗╚██╗ ██╔╝██║ ██╔██╗
#  ███████╗███████╗██████╔╝ ╚████╔╝ ██║██╔╝ ██╗
#  ╚══════╝╚══════╝╚═════╝   ╚═══╝  ╚═╝╚═╝  ╚═╝
#
#  India's Pro-Grade Crypto Exchange — VPS Setup & Upgrade Script
#  Version : 2.5
#  Tested  : Ubuntu 22.04 LTS / Debian 12
#  Usage   : sudo bash deploy/zebvix-setup.sh [--upgrade]
# ================================================================
set -euo pipefail
trap 'echo -e "\n\033[0;31m✘  Script exited at line $LINENO (exit code: $?)\033[0m" >&2' ERR

# ── Colours ──────────────────────────────────────────────────────
R="\033[0;31m"   # red
G="\033[1;32m"   # green
Y="\033[1;33m"   # yellow
C="\033[1;36m"   # cyan
M="\033[1;35m"   # magenta
W="\033[1;37m"   # white
DIM="\033[2m"
NC="\033[0m"

# ── Helpers ───────────────────────────────────────────────────────
step()  { echo -e "\n${C}┌─────────────────────────────────────────────────┐${NC}"; \
          echo -e "${C}│ ${W}$*${C}${NC}"; \
          echo -e "${C}└─────────────────────────────────────────────────┘${NC}"; }
ok()    { echo -e "  ${G}✔${NC}  $*"; }
warn()  { echo -e "  ${Y}⚠${NC}  $*"; }
err()   { echo -e "  ${R}✘  ERROR: $*${NC}"; exit 1; }
info()  { echo -e "  ${DIM}ℹ  $*${NC}"; }
ask()   { echo -e "  ${M}?${NC}  $1"; }

spinner() {
  local pid=$1 msg=${2:-"working..."}
  local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
  local i=0
  while kill -0 "$pid" 2>/dev/null; do
    printf "\r  ${C}%s${NC}  %s " "${frames[$((i % 10))]}" "$msg"
    sleep 0.1; i=$((i + 1))
  done
  printf "\r%-60s\r" " "
  wait "$pid"
}

# ── Banner ────────────────────────────────────────────────────────
clear
echo -e "${Y}"
cat << 'BANNER'
  ███████╗███████╗██████╗ ██╗   ██╗██╗██╗  ██╗
  ╚══███╔╝██╔════╝██╔══██╗██║   ██║██║╚██╗██╔╝
    ███╔╝ █████╗  ██████╔╝██║   ██║██║ ╚███╔╝
   ███╔╝  ██╔══╝  ██╔══██╗╚██╗ ██╔╝██║ ██╔██╗
  ███████╗███████╗██████╔╝ ╚████╔╝ ██║██╔╝ ██╗
  ╚══════╝╚══════╝╚═════╝   ╚═══╝  ╚═╝╚═╝  ╚═╝
BANNER
echo -e "${NC}"
echo -e "  ${W}India's Pro-Grade Crypto Exchange${NC}   ${DIM}v2.5${NC}"
echo -e "  ${DIM}ISO 27001 · SOC 2 Type II · FIU-IND Registered${NC}"
echo ""
echo -e "  ${G}●${NC} Spot  ${G}●${NC} Futures  ${G}●${NC} P2P  ${G}●${NC} AI Trading  ${G}●${NC} Options"
echo ""
echo -e "${DIM}  ────────────────────────────────────────────────────${NC}"

# ── Mode detection ────────────────────────────────────────────────
UPGRADE_MODE=false
[[ "${1:-}" == "--upgrade" ]] && UPGRADE_MODE=true

APP_DIR="${APP_DIR:-/opt/cryptox}"
APP_USER="cryptox"
LOG_DIR="/var/log/cryptox"
NODE_VERSION="24"
GO_VERSION="1.22.4"
PNPM_VERSION="9"

if $UPGRADE_MODE; then
  echo -e "\n  ${Y}▶  UPGRADE MODE${NC} — Existing data will be preserved\n"
else
  echo -e "\n  ${G}▶  FRESH INSTALL MODE${NC}\n"
fi

# ── Root check ────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && err "Run as root: sudo bash $0"

# ── Source directory (repo root — one level above deploy/) ────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(dirname "$SCRIPT_DIR")"

# ─────────────────────────────────────────────────────────────────
#  SECTION 1 — INTERACTIVE CONFIGURATION
# ─────────────────────────────────────────────────────────────────
step "STEP 1/8 — Configuration"
echo ""

read_default() {
  local prompt="$1" default="$2" var_name="$3"
  ask "${prompt} ${DIM}[${default}]${NC}"
  read -r input
  eval "$var_name=\"${input:-$default}\""
}

read_secret() {
  local prompt="$1" var_name="$2" default="${3:-}"
  ask "${prompt}"
  read -rs input
  echo ""
  if [[ -z "$input" && -n "$default" ]]; then
    eval "$var_name=\"$default\""
  else
    eval "$var_name=\"$input\""
  fi
}

# ── Domain ────────────────────────────────────────────────────────
echo -e "  ${W}Deployment Configuration${NC}"
echo ""
read_default "Domain name (e.g. zebvix.com):" "zebvix.com" DOMAIN
read_default "App name:" "Zebvix" APP_NAME

# ── Database ──────────────────────────────────────────────────────
echo ""
echo -e "  ${W}Database Configuration${NC}"
echo ""
read_default "PostgreSQL database name:" "cryptox" DB_NAME
read_default "PostgreSQL user:" "cryptox" DB_USER
read_default "PostgreSQL port:" "5432" DB_PORT
if $UPGRADE_MODE && [[ -f "$APP_DIR/.env" ]]; then
  EXISTING_PASS=$(grep "^DATABASE_URL=" "$APP_DIR/.env" 2>/dev/null | sed 's/.*:\([^@]*\)@.*/\1/' || echo "")
  read_secret "PostgreSQL password ${DIM}(press Enter to keep existing)${NC}:" DB_PASS "$EXISTING_PASS"
else
  SUGGESTED_PASS=$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 32)
  read_secret "PostgreSQL password ${DIM}[leave blank for: ${SUGGESTED_PASS:0:12}...]${NC}:" DB_PASS "$SUGGESTED_PASS"
fi

# ── Admin account ─────────────────────────────────────────────────
echo ""
echo -e "  ${W}Admin Account${NC}"
echo ""
read_default "Admin email:" "admin@${DOMAIN}" ADMIN_EMAIL
read_secret  "Admin password (min 8 chars):" ADMIN_PASS
while [[ ${#ADMIN_PASS} -lt 8 ]]; do
  warn "Password must be at least 8 characters."
  read_secret "Admin password (min 8 chars):" ADMIN_PASS
done
read_default "Admin display name:" "Admin" ADMIN_NAME

# ── Derived values ────────────────────────────────────────────────
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:${DB_PORT}/${DB_NAME}"
SESSION_SECRET=$(openssl rand -hex 64)

# ── Summary ───────────────────────────────────────────────────────
echo ""
echo -e "  ${DIM}────────────────────────────────────────${NC}"
echo -e "  ${W}Configuration Summary${NC}"
echo -e "  ${DIM}────────────────────────────────────────${NC}"
echo -e "  ${C}App name   ${NC}: ${APP_NAME}"
echo -e "  ${C}Domain     ${NC}: ${DOMAIN}"
echo -e "  ${C}App dir    ${NC}: ${APP_DIR}"
echo -e "  ${C}DB name    ${NC}: ${DB_NAME}"
echo -e "  ${C}DB user    ${NC}: ${DB_USER}"
echo -e "  ${C}DB port    ${NC}: ${DB_PORT}"
echo -e "  ${C}Admin email${NC}: ${ADMIN_EMAIL}"
echo -e "  ${C}Admin name ${NC}: ${ADMIN_NAME}"
echo -e "  ${C}Mode       ${NC}: $( $UPGRADE_MODE && echo 'UPGRADE (data preserved)' || echo 'FRESH INSTALL' )"
echo -e "  ${DIM}────────────────────────────────────────${NC}"
echo ""
ask "Proceed with these settings? [Y/n]"
read -r CONFIRM
[[ "${CONFIRM,,}" == "n" ]] && { echo "Aborted."; exit 0; }

# ─────────────────────────────────────────────────────────────────
#  SECTION 2 — SYSTEM DEPENDENCIES
# ─────────────────────────────────────────────────────────────────
if ! $UPGRADE_MODE; then
  step "STEP 2/8 — System Dependencies"
  export DEBIAN_FRONTEND=noninteractive

  (apt-get update -qq && apt-get install -y -qq \
    curl wget git unzip build-essential \
    nginx certbot python3-certbot-nginx \
    postgresql postgresql-contrib \
    ufw fail2ban logrotate htop rsync) &
  spinner $! "Installing system packages (apt)..."
  ok "System packages installed"

  # Node.js
  if ! node --version 2>/dev/null | grep -q "^v${NODE_VERSION}"; then
    (curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash - > /dev/null 2>&1 && \
     apt-get install -y -qq nodejs > /dev/null 2>&1) &
    spinner $! "Installing Node.js ${NODE_VERSION}..."
  fi
  ok "Node.js $(node --version)"

  # pnpm
  (npm install -g "pnpm@${PNPM_VERSION}" --quiet) & spinner $! "Installing pnpm..."
  ok "pnpm $(pnpm --version)"

  # Go
  if ! /usr/local/go/bin/go version 2>/dev/null | grep -q "$GO_VERSION"; then
    ARCH=$(dpkg --print-architecture); [[ "$ARCH" == "amd64" ]] && GOARCH="amd64" || GOARCH="arm64"
    (wget -qO /tmp/go.tar.gz "https://go.dev/dl/go${GO_VERSION}.linux-${GOARCH}.tar.gz" && \
     rm -rf /usr/local/go && tar -C /usr/local -xzf /tmp/go.tar.gz && rm /tmp/go.tar.gz) &
    spinner $! "Installing Go ${GO_VERSION}..."
    grep -qxF 'export PATH=$PATH:/usr/local/go/bin' /etc/profile || \
      echo 'export PATH=$PATH:/usr/local/go/bin' >> /etc/profile
  fi
  export PATH=$PATH:/usr/local/go/bin
  ok "Go $(/usr/local/go/bin/go version | awk '{print $3}')"

  # PM2
  (npm install -g pm2 --quiet) & spinner $! "Installing PM2..."
  ok "PM2 $(pm2 --version)"

  # System user + dirs
  id -u "$APP_USER" &>/dev/null || useradd -r -m -s /bin/bash -d "$APP_DIR" "$APP_USER"
  mkdir -p "$APP_DIR" "$LOG_DIR" "$APP_DIR/uploads"
  chown -R "$APP_USER":"$APP_USER" "$APP_DIR" "$LOG_DIR"
  ok "System user '$APP_USER' and directories ready"

  # Firewall
  ufw --force enable > /dev/null
  ufw allow ssh > /dev/null
  ufw allow 'Nginx Full' > /dev/null
  ok "UFW firewall: SSH + HTTP/HTTPS allowed"

  # Fail2ban
  systemctl enable fail2ban --now > /dev/null 2>&1 || true
  ok "fail2ban active"
else
  step "STEP 2/8 — Dependencies (skipped — upgrade mode)"
  export PATH=$PATH:/usr/local/go/bin
  ok "Skipped system install — using existing environment"
fi

# ─────────────────────────────────────────────────────────────────
#  SECTION 3 — DATABASE SETUP
# ─────────────────────────────────────────────────────────────────
step "STEP 3/8 — Database"
systemctl start postgresql > /dev/null 2>&1

if ! $UPGRADE_MODE; then
  # Create DB user
  sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" > /dev/null
  ok "PostgreSQL user '${DB_USER}' ready"

  # Create database
  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" > /dev/null
  sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};" > /dev/null
  ok "Database '${DB_NAME}' created and owned by '${DB_USER}'"
else
  ok "Database: keeping existing data (upgrade mode)"

  # ── Backup before upgrade ───────────────────────────────────
  BACKUP_FILE="/opt/cryptox-backups/backup_$(date +%Y%m%d_%H%M%S).sql"
  mkdir -p /opt/cryptox-backups
  (pg_dump -U "${DB_USER}" -h localhost "${DB_NAME}" > "$BACKUP_FILE" 2>/dev/null || \
   sudo -u postgres pg_dump "${DB_NAME}" > "$BACKUP_FILE" 2>/dev/null) &
  spinner $! "Creating database backup before upgrade..."
  ok "Backup saved: ${BACKUP_FILE}"
  info "Restore: psql ${DATABASE_URL} < ${BACKUP_FILE}"
fi

# ─────────────────────────────────────────────────────────────────
#  SECTION 4 — ENVIRONMENT FILE
# ─────────────────────────────────────────────────────────────────
step "STEP 4/8 — Environment"
ENV_FILE="$APP_DIR/.env"

if $UPGRADE_MODE && [[ -f "$ENV_FILE" ]]; then
  # Preserve existing .env, only update DB/domain if changed
  cp "$ENV_FILE" "${ENV_FILE}.bak.$(date +%Y%m%d_%H%M%S)"
  ok ".env backed up"
  # Update key values without wiping custom integrations
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=${DATABASE_URL}|" "$ENV_FILE"
  grep -q "^DATABASE_URL=" "$ENV_FILE" || echo "DATABASE_URL=${DATABASE_URL}" >> "$ENV_FILE"
  grep -q "^DOMAIN=" "$ENV_FILE" || echo "DOMAIN=${DOMAIN}" >> "$ENV_FILE"
  ok ".env updated (integrations/custom values preserved)"
else
  cat > "$ENV_FILE" << ENVEOF
# ── Zebvix — Production Environment ─────────────────────────
# Generated: $(date)
# DO NOT COMMIT this file to git.

NODE_ENV=production
PORT=8080

# ── Database ─────────────────────────────────────────────────
DATABASE_URL=${DATABASE_URL}

# ── Session ──────────────────────────────────────────────────
SESSION_SECRET=${SESSION_SECRET}

# ── App ──────────────────────────────────────────────────────
APP_NAME=${APP_NAME}
DOMAIN=${DOMAIN}
BASE_URL=https://${DOMAIN}

# ── Company / Invoice Details ────────────────────────────────
COMPANY_NAME="Zebvix Technologies Private Limited"
COMPANY_SHORT="Zebvix"
COMPANY_CIN="U66190UW2026PTC251591"
COMPANY_PAN="AACCZ9728R"
COMPANY_TAN="MRTZ01489F"
COMPANY_GST=""
COMPANY_ADDRESS="105, Vill Subari, Shamli, Jhinjhana, Kairana, Muzaffarnagar, Uttar Pradesh 247773"
COMPANY_EMAIL="support@zebvix.com"
COMPANY_WEBSITE="zebvix.com"

# ── Email (configure in Admin → API Integrations → Email) ────
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_USER=noreply@${DOMAIN}
# SMTP_PASS=

# ── Crypto Networks (configure in Admin → Networks) ──────────
# HOT_WALLET_KEY=
# BSC_RPC_URL=https://bsc-dataseed.binance.org

# ── Payment Gateway (configure in Admin → Gateways) ─────────
# RAZORPAY_KEY_ID=
# RAZORPAY_KEY_SECRET=

# ── Optional: External Redis (default: embedded in-process) ──
# REDIS_URL=redis://localhost:6379

ENVEOF
  chmod 600 "$ENV_FILE"
  chown "$APP_USER":"$APP_USER" "$ENV_FILE"
  ok ".env created at $ENV_FILE"
fi

# ─────────────────────────────────────────────────────────────────
#  SECTION 5 — BUILD
# ─────────────────────────────────────────────────────────────────
step "STEP 5/8 — Build"

# Sync source → APP_DIR (exclude .git, node_modules, dist, .env)
(rsync -a --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='*/node_modules' \
  --exclude='*/dist' \
  --exclude='.env' \
  --exclude='artifacts/go-service/server' \
  "$SOURCE_DIR/" "$APP_DIR/") &
spinner $! "Syncing source code to $APP_DIR..."
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
ok "Source code synced to $APP_DIR"

cd "$APP_DIR"

# ── pnpm install (synchronous) ────────────────────────────────────
info "Installing pnpm dependencies (may take 3-5 min)..."
HOME=/root CI=true NODE_ENV=development \
  pnpm install --no-frozen-lockfile --shamefully-hoist \
  > /tmp/zbx_pnpm.log 2>&1 \
  || { tail -20 /tmp/zbx_pnpm.log; err "pnpm install failed — see above"; }
ok "pnpm dependencies installed"

# Fix ownership
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

# Source .env for build vars
set -a; source "$ENV_FILE"; set +a

# ── Build shared libs ─────────────────────────────────────────────
info "Building shared TypeScript libraries..."
if [[ -x "$APP_DIR/node_modules/.bin/tsc" ]]; then
  HOME=/root "$APP_DIR/node_modules/.bin/tsc" --build > /tmp/zbx_libs.log 2>&1 \
    || { warn "tsc warnings (non-fatal):"; tail -5 /tmp/zbx_libs.log || true; }
  ok "Libraries built"
else
  warn "tsc not found — skipping (esbuild handles TS directly)"
fi

# ── API server (esbuild) ──────────────────────────────────────────
info "Building API server..."
HOME=/root pnpm --filter @workspace/api-server run build > /tmp/zbx_api.log 2>&1 \
  || { echo ""; tail -20 /tmp/zbx_api.log; err "API server build failed"; }
ok "API server → artifacts/api-server/dist/"

# ── User portal (Vite) ────────────────────────────────────────────
info "Building user portal..."
HOME=/root PORT=3000 BASE_PATH=/user/ \
  pnpm --filter @workspace/user-portal run build > /tmp/zbx_portal.log 2>&1 \
  || { echo ""; tail -20 /tmp/zbx_portal.log; err "User portal build failed"; }
ok "User portal → artifacts/user-portal/dist/public/"

# ── Admin panel (Vite) ────────────────────────────────────────────
info "Building admin panel..."
HOME=/root PORT=3001 BASE_PATH=/admin/ \
  pnpm --filter @workspace/admin run build > /tmp/zbx_admin.log 2>&1 \
  || { echo ""; tail -20 /tmp/zbx_admin.log; err "Admin panel build failed"; }
ok "Admin panel → artifacts/admin/dist/public/"

# ── Go matching engine ────────────────────────────────────────────
info "Building Go matching engine..."
(cd "$APP_DIR/artifacts/go-service" && \
  /usr/local/go/bin/go build -buildvcs=false -o server -ldflags="-s -w" .) > /tmp/zbx_go.log 2>&1 \
  || { echo ""; tail -10 /tmp/zbx_go.log; err "Go build failed"; }
ok "Go engine → artifacts/go-service/server"

# Copy static files
DIST_DIR="$APP_DIR/dist"
mkdir -p "$DIST_DIR/user" "$DIST_DIR/admin"
if [[ -d "$APP_DIR/artifacts/user-portal/dist/public" ]]; then
  rsync -a --delete "$APP_DIR/artifacts/user-portal/dist/public/" "$DIST_DIR/user/"
else
  rsync -a --delete "$APP_DIR/artifacts/user-portal/dist/" "$DIST_DIR/user/"
fi
if [[ -d "$APP_DIR/artifacts/admin/dist/public" ]]; then
  rsync -a --delete "$APP_DIR/artifacts/admin/dist/public/" "$DIST_DIR/admin/"
else
  rsync -a --delete "$APP_DIR/artifacts/admin/dist/" "$DIST_DIR/admin/"
fi
chown -R "$APP_USER":"$APP_USER" "$DIST_DIR"
ok "Static files → $DIST_DIR/"

# ─────────────────────────────────────────────────────────────────
#  SECTION 6 — DATABASE MIGRATIONS
# ─────────────────────────────────────────────────────────────────
step "STEP 6/8 — Database Migrations"

(DATABASE_URL="$DATABASE_URL" sudo -u "$APP_USER" \
  env DATABASE_URL="$DATABASE_URL" \
  pnpm --filter @workspace/db run migrate > /tmp/zbx_db.log 2>&1) &
spinner $! "Running Drizzle schema migration (migrate)..."
ok "Database schema up to date"
info "Migration log: /tmp/zbx_db.log"

# ── Create / update admin user ────────────────────────────────────
ADMIN_SCRIPT="$APP_DIR/deploy/create-admin.mjs"
if [[ -f "$ADMIN_SCRIPT" ]]; then
  (DATABASE_URL="$DATABASE_URL" sudo -u "$APP_USER" \
    env DATABASE_URL="$DATABASE_URL" \
    node "$ADMIN_SCRIPT" \
      --email    "$ADMIN_EMAIL" \
      --password "$ADMIN_PASS" \
      --name     "$ADMIN_NAME" \
    > /tmp/zbx_admin_create.log 2>&1) &
  spinner $! "Creating/updating admin account..."
  ADMIN_CREATE_STATUS=$?
  if [[ $ADMIN_CREATE_STATUS -eq 0 ]]; then
    ok "Admin account ready: $ADMIN_EMAIL"
  else
    warn "Admin creation had issues — check /tmp/zbx_admin_create.log"
    warn "You can create an admin manually from the admin panel after first login"
  fi
else
  warn "deploy/create-admin.mjs not found — create admin from admin panel"
fi

# ── Seed reference data (fresh install only) ──────────────────────
# Upgrade skips seeds — existing live data must not be overwritten.
# All seeds use upsert so re-running is safe if needed manually.
if ! $UPGRADE_MODE; then
  step "STEP 6b/8 — Reference Data Seed"
  info "Seeding coins, networks, pairs, AI plans, earn products, KYC settings…"

  # 1. Coins / networks / pairs
  (cd "$APP_DIR" && DATABASE_URL="$DATABASE_URL" \
    pnpm --filter @workspace/api-server run seed \
    > /tmp/zbx_seed_coins.log 2>&1) &
  spinner $! "Seeding coins, networks and trading pairs..."
  if [[ $? -eq 0 ]]; then
    ok "Coins/networks/pairs seeded"
  else
    warn "Coin seed had issues — check /tmp/zbx_seed_coins.log"
  fi

  # 2. Admin bot wallets (gives admin unlimited balance for market-making)
  (cd "$APP_DIR" && DATABASE_URL="$DATABASE_URL" \
    pnpm --filter @workspace/scripts run seed:admin \
    > /tmp/zbx_seed_admin.log 2>&1) &
  spinner $! "Seeding admin wallets for market-making bots..."
  if [[ $? -eq 0 ]]; then
    ok "Admin bot wallets seeded"
  else
    warn "Admin wallet seed issues — check /tmp/zbx_seed_admin.log"
  fi

  # 3. Market bots
  (cd "$APP_DIR" && DATABASE_URL="$DATABASE_URL" \
    pnpm --filter @workspace/scripts run seed:bots \
    > /tmp/zbx_seed_bots.log 2>&1) &
  spinner $! "Seeding market maker bots for all trading pairs..."
  if [[ $? -eq 0 ]]; then
    ok "Market maker bots seeded"
  else
    warn "Bot seed had issues — check /tmp/zbx_seed_bots.log"
  fi

  # 4. AI trading plans
  (cd "$APP_DIR" && DATABASE_URL="$DATABASE_URL" \
    pnpm --filter @workspace/scripts run seed:ai-plans \
    > /tmp/zbx_seed_ai.log 2>&1) &
  spinner $! "Seeding AI trading plans (Starter / Growth / Pro / Elite)..."
  if [[ $? -eq 0 ]]; then
    ok "AI trading plans seeded"
  else
    warn "AI plans seed had issues — check /tmp/zbx_seed_ai.log"
  fi

  # 5. Earn / staking products
  (cd "$APP_DIR" && DATABASE_URL="$DATABASE_URL" \
    pnpm --filter @workspace/scripts run seed:earn \
    > /tmp/zbx_seed_earn.log 2>&1) &
  spinner $! "Seeding earn/staking products (USDT/BTC/ETH/ZBX)..."
  if [[ $? -eq 0 ]]; then
    ok "Earn products seeded"
  else
    warn "Earn seed had issues — check /tmp/zbx_seed_earn.log"
  fi

  # 6. KYC level settings
  (cd "$APP_DIR" && DATABASE_URL="$DATABASE_URL" \
    pnpm --filter @workspace/scripts run seed:kyc \
    > /tmp/zbx_seed_kyc.log 2>&1) &
  spinner $! "Seeding KYC level settings (Level 1 / 2 / 3 limits)..."
  if [[ $? -eq 0 ]]; then
    ok "KYC settings seeded"
  else
    warn "KYC seed had issues — check /tmp/zbx_seed_kyc.log"
  fi

  info "All seed logs: /tmp/zbx_seed_*.log"
else
  ok "Seed skipped — upgrade mode preserves existing data"
  info "To re-seed manually: bash $APP_DIR/deploy/seed.sh"
fi

# ─────────────────────────────────────────────────────────────────
#  SECTION 7 — NGINX + PM2
# ─────────────────────────────────────────────────────────────────
step "STEP 7/8 — Services (Nginx + PM2)"

# ── Generate HTTP-only nginx config first (SSL added by certbot later) ──
NGINX_CONF="/etc/nginx/sites-available/cryptox"
cat > "$NGINX_CONF" << NGINXEOF
# Zebvix — Nginx Config (HTTP-only, certbot will add SSL)
map \$http_upgrade \$connection_upgrade {
    default upgrade;
    ''      close;
}
upstream cryptox_api { server 127.0.0.1:8080; keepalive 32; }
upstream cryptox_go  { server 127.0.0.1:23004; keepalive 16; }

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    client_max_body_size 20M;
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;

    add_header X-Frame-Options           "SAMEORIGIN"   always;
    add_header X-Content-Type-Options    "nosniff"      always;
    add_header Referrer-Policy           "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy        "payment=(), geolocation=(), camera=(), microphone=()" always;

    location /.well-known/acme-challenge/ { root /var/www/certbot; }

    location = / { return 301 /user/; }

    location /user/ {
        alias /opt/cryptox/dist/user/;
        try_files \$uri \$uri/ /user/index.html;
        expires 1d;
    }
    location /admin/ {
        alias /opt/cryptox/dist/admin/;
        try_files \$uri \$uri/ /admin/index.html;
        expires 1h;
        add_header Cache-Control "no-cache";
    }
    location /api/ {
        proxy_pass         http://cryptox_api;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_set_header   Upgrade           \$http_upgrade;
        proxy_set_header   Connection        \$connection_upgrade;
        proxy_read_timeout 60s;
    }
    location /api/ws {
        proxy_pass         http://cryptox_api;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    \$http_upgrade;
        proxy_set_header   Connection "Upgrade";
        proxy_set_header   Host       \$host;
        proxy_read_timeout 86400s;
    }
    location /internal/ { return 403; }
    location /go-service/ {
        proxy_pass         http://cryptox_go;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   Upgrade           \$http_upgrade;
        proxy_set_header   Connection        \$connection_upgrade;
    }
    location /uploads/ { alias /opt/cryptox/uploads/; expires 7d; }
    location = /favicon.ico { alias /opt/cryptox/dist/user/favicon.ico; access_log off; }
    location = /robots.txt  { alias /opt/cryptox/dist/user/robots.txt; access_log off; }
}
NGINXEOF

ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/cryptox
rm -f /etc/nginx/sites-enabled/default
mkdir -p /var/www/certbot
nginx -t 2>&1 || err "Nginx config test failed — check above"
systemctl enable nginx > /dev/null
systemctl reload nginx
ok "Nginx configured for domain: $DOMAIN"

# ── Log rotation ──────────────────────────────────────────────────
cat > /etc/logrotate.d/cryptox << 'LOGEOF'
/var/log/cryptox/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    sharedscripts
    postrotate
        pm2 reloadLogs 2>/dev/null || true
    endscript
}
LOGEOF
ok "Log rotation configured (14 days)"

# ── PM2 ──────────────────────────────────────────────────────────
if pm2 list 2>/dev/null | grep -q "cryptox"; then
  if $UPGRADE_MODE; then
    pm2 reload cryptox-api 2>/dev/null || pm2 restart cryptox-api 2>/dev/null || true
    pm2 restart cryptox-go 2>/dev/null || true
    ok "PM2 processes reloaded (zero-downtime)"
  else
    pm2 restart all 2>/dev/null || true
    ok "PM2 processes restarted"
  fi
else
  sudo -u "$APP_USER" pm2 start "$APP_DIR/deploy/pm2.config.cjs" 2>/dev/null || \
    pm2 start "$APP_DIR/deploy/pm2.config.cjs"
  pm2 save
  pm2 startup systemd -u "$APP_USER" --hp "$APP_DIR" 2>/dev/null | grep "sudo" | bash || true
  ok "PM2 started and saved (survives reboot)"
fi

# ── SSL (certbot) ─────────────────────────────────────────────────
step "STEP 8/8 — SSL Certificate"
if ! [[ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]]; then
  echo ""
  ask "Request Let's Encrypt SSL certificate for ${DOMAIN}? [Y/n]"
  read -r SSL_CONFIRM
  if [[ "${SSL_CONFIRM,,}" != "n" ]]; then
    certbot --nginx -d "${DOMAIN}" -d "www.${DOMAIN}" --non-interactive --agree-tos \
      --email "support@${DOMAIN}" --redirect 2>&1 | tail -5
    ok "SSL certificate installed and auto-renewal configured"
  else
    warn "SSL skipped — run: certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}"
  fi
else
  ok "SSL certificate already exists for ${DOMAIN}"
fi

# ─────────────────────────────────────────────────────────────────
#  FINAL STATUS DASHBOARD
# ─────────────────────────────────────────────────────────────────
sleep 2

echo ""
echo -e "${Y}══════════════════════════════════════════════════════════════${NC}"
echo -e "${Y}                  ✦  ZEBVIX DEPLOYMENT COMPLETE  ✦${NC}"
echo -e "${Y}══════════════════════════════════════════════════════════════${NC}"
echo ""

# Service health checks
API_STATUS="✘ DOWN"
GO_STATUS="✘ DOWN"
NGINX_STATUS="✘ DOWN"
PG_STATUS="✘ DOWN"

systemctl is-active --quiet nginx 2>/dev/null && NGINX_STATUS="${G}✔ Running${NC}"
systemctl is-active --quiet postgresql 2>/dev/null && PG_STATUS="${G}✔ Running${NC}"
sleep 3
if curl -sf --max-time 5 "http://localhost:8080/api/healthz" > /dev/null 2>&1; then
  API_STATUS="${G}✔ Running${NC}"
fi
if curl -sf --max-time 5 "http://localhost:23004/" > /dev/null 2>&1; then
  GO_STATUS="${G}✔ Running${NC}"
fi

echo -e "  ${W}SERVICE STATUS${NC}"
echo -e "  ${DIM}──────────────────────────────────────────${NC}"
echo -e "  ${C}Nginx        ${NC}  $(echo -e $NGINX_STATUS)"
echo -e "  ${C}PostgreSQL   ${NC}  $(echo -e $PG_STATUS)"
echo -e "  ${C}API Server   ${NC}  $(echo -e $API_STATUS)"
echo -e "  ${C}Go Engine    ${NC}  $(echo -e $GO_STATUS)"
echo ""

echo -e "  ${W}URLS${NC}"
echo -e "  ${DIM}──────────────────────────────────────────${NC}"
echo -e "  ${C}Exchange     ${NC}  https://${DOMAIN}/user/"
echo -e "  ${C}Admin Panel  ${NC}  https://${DOMAIN}/admin/"
echo -e "  ${C}API          ${NC}  https://${DOMAIN}/api/healthz"
echo ""

echo -e "  ${W}ADMIN CREDENTIALS${NC}"
echo -e "  ${DIM}──────────────────────────────────────────${NC}"
echo -e "  ${C}Email        ${NC}  ${ADMIN_EMAIL}"
echo -e "  ${C}Password     ${NC}  ${ADMIN_PASS}"
echo -e "  ${C}Name         ${NC}  ${ADMIN_NAME}"
echo -e "  ${R}  ⚠ Save these credentials — they won't be shown again!${NC}"
echo ""

echo -e "  ${W}DATABASE${NC}"
echo -e "  ${DIM}──────────────────────────────────────────${NC}"
echo -e "  ${C}Host         ${NC}  localhost:${DB_PORT}"
echo -e "  ${C}Database     ${NC}  ${DB_NAME}"
echo -e "  ${C}User         ${NC}  ${DB_USER}"
echo -e "  ${C}Password     ${NC}  ${DB_PASS}"
echo ""

echo -e "  ${W}PM2 PROCESSES${NC}"
echo -e "  ${DIM}──────────────────────────────────────────${NC}"
pm2 list 2>/dev/null | grep -E "cryptox|online|stopped" | sed 's/^/  /' || echo "  (pm2 not available)"
echo ""

echo -e "  ${W}USEFUL COMMANDS${NC}"
echo -e "  ${DIM}──────────────────────────────────────────${NC}"
echo -e "  ${DIM}pm2 monit                    ${NC}Live process dashboard"
echo -e "  ${DIM}pm2 logs cryptox-api         ${NC}API server logs"
echo -e "  ${DIM}pm2 logs cryptox-go          ${NC}Go engine logs"
echo -e "  ${DIM}pm2 reload cryptox-api       ${NC}Zero-downtime API reload"
echo -e "  ${DIM}sudo bash deploy/zebvix-setup.sh --upgrade${NC}  Upgrade without data loss"
echo -e "  ${DIM}pg_dump ${DATABASE_URL} > backup.sql${NC}  Manual DB backup"
echo ""

echo -e "  ${W}NEXT STEPS${NC}"
echo -e "  ${DIM}──────────────────────────────────────────${NC}"
echo -e "  1. Open ${G}https://${DOMAIN}/admin/${NC} and login with admin credentials"
echo -e "  2. Go to ${C}API Integrations → Email${NC} to configure SMTP"
echo -e "  3. Go to ${C}Networks${NC} to set up hot wallet / RPC endpoints"
echo -e "  4. Go to ${C}Exchange Settings${NC} to configure TDS %, fees, pairs"
echo -e "  5. Point your domain DNS A record to this server's IP"
echo ""

# Save credentials to file
CREDS_FILE="/root/zebvix-credentials.txt"
cat > "$CREDS_FILE" << CREDS
Zebvix Deployment Credentials
Generated: $(date)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Domain      : https://${DOMAIN}
Admin Panel : https://${DOMAIN}/admin/

Admin Email : ${ADMIN_EMAIL}
Admin Pass  : ${ADMIN_PASS}

DB Host     : localhost:${DB_PORT}
DB Name     : ${DB_NAME}
DB User     : ${DB_USER}
DB Pass     : ${DB_PASS}
DATABASE_URL: ${DATABASE_URL}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KEEP THIS FILE SECURE — DELETE AFTER READING
CREDS
chmod 600 "$CREDS_FILE"

echo -e "  ${G}●${NC} Credentials saved to: ${W}${CREDS_FILE}${NC} ${R}(root-only, delete after reading)${NC}"
echo ""
echo -e "${Y}══════════════════════════════════════════════════════════════${NC}"
echo -e "${G}  Setup complete! Zebvix is live at https://${DOMAIN}/user/${NC}"
echo -e "${Y}══════════════════════════════════════════════════════════════${NC}"
echo ""
