# Zebvix — VPS Production Deployment Guide

Deploy the full Zebvix platform (API + User Portal + Admin + Go Engine) on your own Ubuntu 22.04 VPS in one command.

---

## Quick Start (Recommended)

```bash
# 1. Clone the repo to your VPS
git clone https://github.com/YOUR_ORG/zebvix.git /opt/cryptox
cd /opt/cryptox

# 2. Run the all-in-one interactive setup (as root)
sudo bash deploy/zebvix-setup.sh
```

The setup wizard will ask for:
- Domain name
- App name (Zebvix)
- Database name, user, password, port
- Admin email, password, display name

Then it will install everything, build, migrate, create the admin account, configure nginx + SSL, and show you a full status dashboard at the end.

---

## Upgrade Without Data Loss

When you push new code or add a new feature:

```bash
cd /opt/cryptox
git pull origin main
sudo bash deploy/zebvix-setup.sh --upgrade
```

**What `--upgrade` does:**
- Backs up the database automatically before anything runs
- Skips reinstalling system packages (Node, Go, etc.)
- Preserves your existing `.env` (all your custom SMTP, gateway, wallet configs)
- Runs new DB migrations via `drizzle push` (additive only — no column drops)
- Does a zero-downtime `pm2 reload` instead of a full restart
- Updates admin password if you provide a new one

---

## Architecture on VPS

```
Internet
   │
   ▼
Nginx (port 80/443 + SSL)
   ├── /user/       → Static files (Vite SPA)
   ├── /admin/      → Static files (Vite SPA)
   ├── /api/        → Node.js API Server (PM2, port 8080)
   └── /go-service/ → Go Order Engine (PM2, port 23004)
            │
            ▼
       PostgreSQL (port 5432, local)
       Redis (embedded in API server — no external Redis needed)
```

---

## Server Requirements

| Requirement | Minimum | Recommended |
|------------|---------|-------------|
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Disk | 40 GB SSD | 80 GB SSD |
| Domain | Required (for SSL) | e.g. zebvix.com |

---

## Files in This Folder

| File | Purpose |
|------|---------|
| `zebvix-setup.sh` | **Main script** — interactive setup + upgrade wizard |
| `seed.sh` | **Standalone seed script** — populate reference data manually |
| `create-admin.mjs` | Admin user creation helper (called by setup script) |
| `build.sh` | Build-only script (skips system install) |
| `install.sh` | System packages only (called by setup on fresh install) |
| `pm2.config.cjs` | PM2 process configuration |
| `nginx.conf` | Nginx reverse proxy + SSL config template |
| `.env.example` | Environment variable reference |

---

## Database Seeding

The full setup script seeds all reference data automatically on a **fresh install**. Upgrade runs (`--upgrade`) skip seeding to protect live data.

### What gets seeded

| Step | Command | Data populated |
|------|---------|----------------|
| 1 | `api-server seed` | 100 coins, networks, 200+ trading pairs |
| 2 | `scripts seed:admin` | Admin bot wallets for market-making |
| 3 | `scripts seed:bots` | Market maker bots for all active pairs |
| 4 | `scripts seed:ai-plans` | 4 AI trading plans (Starter/Growth/Pro/Elite) |
| 5 | `scripts seed:earn` | 12 earn/staking products (USDT/BTC/ETH/SOL/ZBX) |
| 6 | `scripts seed:kyc` | KYC level settings (L1/L2/L3 limits per PMLA) |

### Run seeds manually

All seeds use upsert — safe to re-run without duplicating data.

```bash
# Full seed (all 6 steps)
bash deploy/seed.sh

# Individual seeds
pnpm --filter @workspace/api-server run seed          # coins/networks/pairs
pnpm --filter @workspace/scripts run seed:admin       # admin wallets
pnpm --filter @workspace/scripts run seed:bots        # market bots
pnpm --filter @workspace/scripts run seed:ai-plans    # AI trading plans
pnpm --filter @workspace/scripts run seed:earn        # earn products
pnpm --filter @workspace/scripts run seed:kyc         # KYC level settings

# Or run all non-coin seeds at once:
pnpm --filter @workspace/scripts run seed:all
```

> **Note:** The coin seed must run before the earn seed (earn products reference coin IDs).

---

## Manual Steps (Advanced)

### Step 1 — System setup only
```bash
sudo bash deploy/install.sh
```

### Step 2 — Build only
```bash
sudo -u cryptox bash deploy/build.sh
```

### Step 3 — Migrate schema
```bash
cd /opt/cryptox && pnpm --filter @workspace/db run migrate
```

### Step 4 — Seed reference data
```bash
bash /opt/cryptox/deploy/seed.sh
```

### Step 5 — Create admin manually
```bash
DATABASE_URL="postgresql://..." node deploy/create-admin.mjs \
  --email admin@zebvix.com \
  --password "YourPass" \
  --name "Admin"
```

### Step 6 — Start PM2
```bash
pm2 start deploy/pm2.config.cjs
pm2 save
```

### Step 7 — SSL
```bash
certbot --nginx -d zebvix.com -d www.zebvix.com
```

---

## PM2 Commands Reference

```bash
pm2 status                    # List all processes + status
pm2 monit                     # Live dashboard (CPU, memory, logs)
pm2 logs cryptox-api          # API server logs
pm2 logs cryptox-go           # Go engine logs
pm2 reload cryptox-api        # Zero-downtime reload (cluster mode)
pm2 restart cryptox-go        # Restart Go engine
pm2 stop all                  # Stop all
pm2 save                      # Save process list (survives reboot)
```

---

## Database Management

```bash
# Connect to PostgreSQL
sudo -u postgres psql -d cryptox

# Manual schema migration (additive — safe to run anytime)
cd /opt/cryptox && pnpm --filter @workspace/db run push

# Backup database
pg_dump -U cryptox -h localhost cryptox > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore from backup
psql -U cryptox -h localhost cryptox < backup_YYYYMMDD.sql
```

---

## Adding a New Feature Without Data Loss

When you add a new DB table or column in `lib/db/src/schema/`:

```bash
# On the VPS — just run upgrade:
sudo bash deploy/zebvix-setup.sh --upgrade
```

Drizzle `push` is additive by design:
- New tables → created
- New columns → added with defaults
- Existing data → never touched
- Old columns → only dropped if you explicitly add `drop` annotations

---

## Logs

| Service | Log file |
|---------|----------|
| API Server (all) | `/var/log/cryptox/api.log` |
| API Server (errors) | `/var/log/cryptox/api-error.log` |
| Go Engine (all) | `/var/log/cryptox/go.log` |
| Go Engine (errors) | `/var/log/cryptox/go-error.log` |
| Nginx access | `/var/log/nginx/access.log` |
| Nginx errors | `/var/log/nginx/error.log` |

Logs rotate daily, kept 14 days, compressed after 1 day.

---

## Admin Panel First-Run Checklist

After setup, open `https://zebvix.com/admin/` and complete:

1. **API Integrations → Email** — configure SMTP / SendGrid / Mailgun
2. **Networks** — set hot wallet RPC endpoints for each blockchain
3. **Exchange Settings** — configure TDS %, maker/taker fees, withdrawal limits
4. **Coins & Pairs** — enable/disable trading pairs
5. **KYC Settings** — configure DigiLocker / Aadhaar API credentials

---

## Security Hardening

```bash
# Disable root SSH password login
sudo sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl reload sshd

# Restrict admin panel to specific IPs (edit nginx.conf)
# Uncomment allow/deny lines in the /admin/ location block

# Check fail2ban is active
sudo systemctl status fail2ban

# Verify firewall rules
sudo ufw status
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| API not starting | `pm2 logs cryptox-api` — check for missing env vars |
| DB connection failed | Verify `DATABASE_URL` in `/opt/cryptox/.env`, check: `sudo systemctl status postgresql` |
| Nginx 502 Bad Gateway | API not running — `pm2 restart cryptox-api` |
| Build fails | `pnpm install` first, check Node v24: `node --version` |
| Port 8080 in use | `lsof -i :8080` — kill conflicting process |
| SSL not working | `certbot renew --dry-run`, verify DNS A record points to VPS IP |
| Admin login fails | Re-run: `node deploy/create-admin.mjs --email ... --password ...` |
| Migration error | Check `/tmp/zbx_db.log` — run `pnpm --filter @workspace/db run push` manually |
| Seed failed / empty earn page | Run: `bash /opt/cryptox/deploy/seed.sh` — check logs in `/tmp/zbx_seed_*.log` |
| AI plans not showing | Re-run: `pnpm --filter @workspace/scripts run seed:ai-plans` |
| KYC settings missing | Re-run: `pnpm --filter @workspace/scripts run seed:kyc` |
