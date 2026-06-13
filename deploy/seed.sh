#!/usr/bin/env bash
# ================================================================
#  Zebvix — Full Database Seed Script
#  Run ONCE after a fresh install + migration to populate:
#    1. Coins, networks, trading pairs  (api-server seed)
#    2. Superadmin user + bot wallets   (scripts seed:admin)
#    3. Market bots for all pairs       (scripts seed:bots)
#    4. AI trading plans                (scripts seed:ai-plans)
#    5. Earn / staking products         (scripts seed:earn)
#    6. KYC level settings              (scripts seed:kyc)
#
#  Usage (from repo root):
#    DATABASE_URL="postgresql://..." bash deploy/seed.sh
#
#  Or, if /opt/cryptox/.env exists:
#    sudo -u cryptox bash /opt/cryptox/deploy/seed.sh
# ================================================================
set -euo pipefail

G="\033[1;32m"; Y="\033[1;33m"; C="\033[1;36m"; R="\033[0;31m"; NC="\033[0m"; DIM="\033[2m"
ok()   { echo -e "  ${G}✔${NC}  $*"; }
warn() { echo -e "  ${Y}⚠${NC}  $*"; }
err()  { echo -e "  ${R}✘  ERROR: $*${NC}"; exit 1; }
step() { echo -e "\n${C}▶  $*${NC}"; }

# ── Resolve app directory ─────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"

# ── Load .env if DATABASE_URL not already set ─────────────────────
if [[ -z "${DATABASE_URL:-}" ]]; then
  ENV_FILE="$APP_DIR/.env"
  if [[ -f "$ENV_FILE" ]]; then
    set -a; source "$ENV_FILE"; set +a
    ok "Loaded .env from $ENV_FILE"
  else
    err "DATABASE_URL not set and no .env found at $ENV_FILE"
  fi
fi

cd "$APP_DIR"

echo ""
echo -e "${Y}  ╔══════════════════════════════════════╗${NC}"
echo -e "${Y}  ║   Zebvix — Full Database Seed        ║${NC}"
echo -e "${Y}  ╚══════════════════════════════════════╝${NC}"
echo ""

# ── Step 1: Coins, Networks, Pairs ───────────────────────────────
step "1/6  Coins, networks & trading pairs"
DATABASE_URL="$DATABASE_URL" pnpm --filter @workspace/api-server run seed \
  > /tmp/zbx_seed_coins.log 2>&1 \
  && ok "Coins/networks/pairs seeded — see /tmp/zbx_seed_coins.log" \
  || { warn "Coin seed had issues — check /tmp/zbx_seed_coins.log"; cat /tmp/zbx_seed_coins.log | tail -10; }

# ── Step 2: Admin user + bot wallets ─────────────────────────────
step "2/6  Admin user & bot wallets"
DATABASE_URL="$DATABASE_URL" pnpm --filter @workspace/scripts run seed:admin \
  > /tmp/zbx_seed_admin.log 2>&1 \
  && ok "Admin user seeded — see /tmp/zbx_seed_admin.log" \
  || { warn "Admin seed had issues — check /tmp/zbx_seed_admin.log"; cat /tmp/zbx_seed_admin.log | tail -10; }

# ── Step 3: Market bots ──────────────────────────────────────────
step "3/6  Market maker bots"
DATABASE_URL="$DATABASE_URL" pnpm --filter @workspace/scripts run seed:bots \
  > /tmp/zbx_seed_bots.log 2>&1 \
  && ok "Market bots seeded — see /tmp/zbx_seed_bots.log" \
  || { warn "Bot seed had issues — check /tmp/zbx_seed_bots.log"; cat /tmp/zbx_seed_bots.log | tail -5; }

# ── Step 4: AI trading plans ─────────────────────────────────────
step "4/6  AI trading plans"
DATABASE_URL="$DATABASE_URL" pnpm --filter @workspace/scripts run seed:ai-plans \
  > /tmp/zbx_seed_ai.log 2>&1 \
  && ok "AI plans seeded — see /tmp/zbx_seed_ai.log" \
  || { warn "AI plans seed had issues — check /tmp/zbx_seed_ai.log"; cat /tmp/zbx_seed_ai.log | tail -5; }

# ── Step 5: Earn / staking products ──────────────────────────────
step "5/6  Earn & staking products"
DATABASE_URL="$DATABASE_URL" pnpm --filter @workspace/scripts run seed:earn \
  > /tmp/zbx_seed_earn.log 2>&1 \
  && ok "Earn products seeded — see /tmp/zbx_seed_earn.log" \
  || { warn "Earn seed had issues — check /tmp/zbx_seed_earn.log"; cat /tmp/zbx_seed_earn.log | tail -5; }

# ── Step 6: KYC level settings ───────────────────────────────────
step "6/6  KYC level settings"
DATABASE_URL="$DATABASE_URL" pnpm --filter @workspace/scripts run seed:kyc \
  > /tmp/zbx_seed_kyc.log 2>&1 \
  && ok "KYC settings seeded — see /tmp/zbx_seed_kyc.log" \
  || { warn "KYC seed had issues — check /tmp/zbx_seed_kyc.log"; cat /tmp/zbx_seed_kyc.log | tail -5; }

echo ""
echo -e "${G}  ══════════════════════════════════════════${NC}"
echo -e "${G}  ✦  Full seed complete!${NC}"
echo -e "${G}  ══════════════════════════════════════════${NC}"
echo ""
echo -e "  ${DIM}Seed logs: /tmp/zbx_seed_*.log${NC}"
echo -e "  ${DIM}All seeds are upsert-safe — re-running won't duplicate data.${NC}"
echo ""
