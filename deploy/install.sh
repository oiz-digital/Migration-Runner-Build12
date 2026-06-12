#!/usr/bin/env bash
# ============================================================
# Zebvix — VPS Initial Setup Script
# Tested on: Ubuntu 22.04 LTS / Debian 12
# Run as root: sudo bash deploy/install.sh
# ============================================================
set -euo pipefail
CYAN="\033[1;36m"; GREEN="\033[1;32m"; YELLOW="\033[1;33m"; RED="\033[0;31m"; NC="\033[0m"
log()  { echo -e "${CYAN}[cryptox]${NC} $*"; }
ok()   { echo -e "${GREEN}[  OK  ]${NC} $*"; }
warn() { echo -e "${YELLOW}[ WARN ]${NC} $*"; }
err()  { echo -e "${RED}[ ERR  ]${NC} $*"; exit 1; }

[[ $EUID -ne 0 ]] && err "Run as root: sudo bash $0"

APP_DIR="/opt/cryptox"
APP_USER="cryptox"
LOG_DIR="/var/log/cryptox"
UPLOAD_DIR="$APP_DIR/uploads"
NODE_VERSION="24"
GO_VERSION="1.22.4"
PNPM_VERSION="9"

log "═══════════════════════════════════════════"
log "  Zebvix — VPS Setup"
log "  App dir : $APP_DIR"
log "  Node    : $NODE_VERSION"
log "  Go      : $GO_VERSION"
log "═══════════════════════════════════════════"

# ── 1. System packages ──────────────────────────────────────
log "Installing system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  curl wget git unzip build-essential \
  nginx certbot python3-certbot-nginx \
  postgresql postgresql-contrib \
  ufw fail2ban \
  logrotate htop

ok "System packages installed"

# ── 2. Node.js via NodeSource ───────────────────────────────
log "Installing Node.js $NODE_VERSION..."
if ! node --version 2>/dev/null | grep -q "^v${NODE_VERSION}"; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
  apt-get install -y nodejs
fi
ok "Node.js $(node --version)"

# ── 3. pnpm ─────────────────────────────────────────────────
log "Installing pnpm $PNPM_VERSION..."
npm install -g "pnpm@$PNPM_VERSION" --quiet
ok "pnpm $(pnpm --version)"

# ── 4. Go ───────────────────────────────────────────────────
log "Installing Go $GO_VERSION..."
if ! go version 2>/dev/null | grep -q "$GO_VERSION"; then
  ARCH=$(dpkg --print-architecture)
  [[ "$ARCH" == "amd64" ]] && GOARCH="amd64" || GOARCH="arm64"
  wget -qO /tmp/go.tar.gz "https://go.dev/dl/go${GO_VERSION}.linux-${GOARCH}.tar.gz"
  rm -rf /usr/local/go && tar -C /usr/local -xzf /tmp/go.tar.gz
  rm /tmp/go.tar.gz
  grep -qxF 'export PATH=$PATH:/usr/local/go/bin' /etc/profile || echo 'export PATH=$PATH:/usr/local/go/bin' >> /etc/profile
  export PATH=$PATH:/usr/local/go/bin
fi
ok "Go $(go version)"

# ── 5. PM2 ──────────────────────────────────────────────────
log "Installing PM2..."
npm install -g pm2 --quiet
ok "PM2 $(pm2 --version)"

# ── 6. Create app user + dirs ───────────────────────────────
log "Creating app user and directories..."
id -u "$APP_USER" &>/dev/null || useradd -r -m -s /bin/bash -d "$APP_DIR" "$APP_USER"
mkdir -p "$APP_DIR" "$LOG_DIR" "$UPLOAD_DIR"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR" "$LOG_DIR"
ok "User '$APP_USER' and directories created"

# ── 7. PostgreSQL database setup ────────────────────────────
log "Setting up PostgreSQL database..."
systemctl start postgresql
PG_PASS=$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 32)
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='cryptox'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER cryptox WITH PASSWORD '$PG_PASS';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='cryptox'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE cryptox OWNER cryptox;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE cryptox TO cryptox;"
echo "DATABASE_URL=postgresql://cryptox:${PG_PASS}@localhost:5432/cryptox" >> /tmp/cryptox_db_url
ok "PostgreSQL configured (save DB password from /tmp/cryptox_db_url)"

# ── 8. Firewall ──────────────────────────────────────────────
log "Configuring UFW firewall..."
ufw --force enable
ufw allow ssh
ufw allow 'Nginx Full'
ufw status
ok "Firewall configured"

# ── 9. Nginx ─────────────────────────────────────────────────
log "Configuring Nginx..."
cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/cryptox
ln -sf /etc/nginx/sites-available/cryptox /etc/nginx/sites-enabled/cryptox
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl enable nginx && systemctl reload nginx
ok "Nginx configured"

# ── 10. Log rotation ────────────────────────────────────────
cat > /etc/logrotate.d/cryptox << 'EOF'
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
EOF
ok "Log rotation configured"

# ── 11. PM2 startup ─────────────────────────────────────────
log "Configuring PM2 auto-start..."
pm2 startup systemd -u "$APP_USER" --hp "$APP_DIR" | tail -1 | bash || true
ok "PM2 startup configured"

echo ""
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo -e "${GREEN}  VPS Setup Complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo ""
echo "Next steps:"
echo "  1. cd $APP_DIR && cp deploy/.env.example .env"
echo "  2. nano .env  (fill all values, especially DATABASE_URL and SESSION_SECRET)"
echo "  3. sudo -u $APP_USER bash deploy/build.sh"
echo "  4. pm2 start deploy/pm2.config.cjs"
echo "  5. pm2 save"
echo "  6. certbot --nginx -d zebvix.com -d www.zebvix.com"
echo ""
echo "DB password saved to: /tmp/cryptox_db_url"
cat /tmp/cryptox_db_url
