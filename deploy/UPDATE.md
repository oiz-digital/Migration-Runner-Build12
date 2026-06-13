# Zebvix — VPS Update Guide

Yeh file sirf **code update** ke liye hai. Fresh install ke liye `README.md` dekho.

---

## ⚡ Sabse Zyada Use Hone Wala Command

```bash
cd /opt/cryptox
git pull origin main
sudo bash deploy/zebvix-setup.sh --upgrade
```

Bas itna. Yeh command sab kuch handle karti hai — build, migrate, reload. Data safe rehta hai.

---

## Kya Karna Hai — Situation ke Hisaab se

### 1. Sirf code change kiya (koi DB change nahi)

```bash
cd /opt/cryptox
git pull origin main
sudo bash deploy/build.sh          # rebuild karo
pm2 reload cryptox-api             # zero-downtime reload
pm2 restart cryptox-go             # Go engine restart
```

---

### 2. DB schema bhi badla (naya column / table)

```bash
cd /opt/cryptox
git pull origin main
sudo bash deploy/build.sh

# Schema migrate karo (KABHI bhi push se pehle backup lo)
pg_dump -U cryptox -h localhost cryptox > /opt/backup_$(date +%Y%m%d_%H%M%S).sql

pnpm --filter @workspace/db run push

pm2 reload cryptox-api
pm2 restart cryptox-go
```

> ⚠️ `push` sirf additive changes karta hai — new tables, new columns.
> Existing data ko touch nahi karta.
> Column drop karna ho to manually karo.

---

### 3. Sirf frontend badla (user portal ya admin)

```bash
cd /opt/cryptox
git pull origin main

# User portal rebuild
pnpm --filter @workspace/user-portal run build
sudo cp -r artifacts/user-portal/dist/* /var/www/cryptox/user/

# Admin rebuild
pnpm --filter @workspace/admin run build
sudo cp -r artifacts/admin/dist/* /var/www/cryptox/admin/
```

API ya Go engine restart ki zaroorat nahi hai.

---

### 4. Sirf API server badla (no schema change)

```bash
cd /opt/cryptox
git pull origin main
pnpm --filter @workspace/api-server run build
pm2 reload cryptox-api
```

---

### 5. Go engine badla

```bash
cd /opt/cryptox/artifacts/go-service
git pull origin main
CGO_ENABLED=0 GOOS=linux go build -o zebvix-go .
pm2 restart cryptox-go
```

> ⚠️ `CGO_ENABLED=0` ZAROORI hai — CGO binary production mein crash karta hai.

---

## DB Backup — Kab Bhi Lo

```bash
# Backup lo
pg_dump -U cryptox -h localhost cryptox > /opt/backup_$(date +%Y%m%d_%H%M%S).sql

# Backup list dekho
ls -lh /opt/backup_*.sql

# Restore karo (zaroori pade to)
psql -U cryptox -h localhost cryptox < /opt/backup_YYYYMMDD_HHMMSS.sql
```

**Kab backup lena chahiye:**
- `git pull` se pehle agar schema change ho
- Kisi bhi bade feature deploy se pehle
- Mahine mein kam se kam ek baar

---

## PM2 — Process Management

```bash
pm2 status                  # sab processes ka status
pm2 monit                   # live dashboard (CPU, RAM, logs)
pm2 logs cryptox-api        # API server ke logs live
pm2 logs cryptox-go         # Go engine ke logs live
pm2 logs cryptox-api --lines 200  # last 200 lines
pm2 reload cryptox-api      # zero-downtime reload (cluster mode)
pm2 restart cryptox-api     # hard restart
pm2 restart cryptox-go      # Go engine restart
pm2 restart all             # sab restart
pm2 stop all                # sab band karo
pm2 save                    # process list save karo (reboot ke baad bhi chalega)
pm2 startup                 # boot pe auto-start setup karo
```

---

## Nginx

```bash
# Config test karo (deploy se pehle hamesha)
sudo nginx -t

# Reload karo (SSL renewal ke baad bhi)
sudo systemctl reload nginx

# Logs dekho
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

---

## SSL Certificate Renew

Certbot automatically renew karta hai. Manual renewal ya check ke liye:

```bash
# Dry run (test, koi change nahi)
sudo certbot renew --dry-run

# Force renew karo
sudo certbot renew --force-renewal

# Expiry date dekho
sudo certbot certificates
```

---

## Logs Kahan Hain

| Service | Log |
|---------|-----|
| API Server | `pm2 logs cryptox-api` ya `/var/log/cryptox/api.log` |
| Go Engine | `pm2 logs cryptox-go` ya `/var/log/cryptox/go.log` |
| Nginx access | `/var/log/nginx/access.log` |
| Nginx error | `/var/log/nginx/error.log` |
| PostgreSQL | `sudo journalctl -u postgresql` |

---

## Seed Data Dobara Chalana

Seeds safe hain — upsert use karti hain, duplicate nahi banata:

```bash
cd /opt/cryptox

# Sab kuch ek saath
bash deploy/seed.sh

# Alag alag
pnpm --filter @workspace/api-server run seed          # coins, networks, pairs
pnpm --filter @workspace/scripts run seed:admin       # admin wallets
pnpm --filter @workspace/scripts run seed:bots        # market maker bots
pnpm --filter @workspace/scripts run seed:ai-plans    # AI trading plans
pnpm --filter @workspace/scripts run seed:earn        # earn products
pnpm --filter @workspace/scripts run seed:kyc         # KYC level settings
```

---

## Admin Password Reset

```bash
cd /opt/cryptox
node deploy/create-admin.mjs \
  --email admin@zebvix.com \
  --password "NayaStrongPassword123!" \
  --name "Admin"
```

---

## Emergency Rollback

```bash
# Step 1 — Pichli working commit pe wapas jao
cd /opt/cryptox
git log --oneline -10        # commits dekho
git checkout <commit-hash>   # us commit pe jao

# Step 2 — Rebuild
sudo bash deploy/build.sh

# Step 3 — Services reload
pm2 reload cryptox-api
pm2 restart cryptox-go

# Step 4 — Agar DB bhi rollback karna ho (seedhi last backup se)
psql -U cryptox -h localhost cryptox < /opt/backup_YYYYMMDD_HHMMSS.sql
```

---

## Common Problems — Fix

| Problem | Fix |
|---------|-----|
| `pm2 logs` mein "Cannot find module" | `pnpm install` chalao, phir rebuild |
| API 502 Bad Gateway | `pm2 restart cryptox-api`, phir `pm2 logs cryptox-api` dekho |
| DB connection failed | `.env` mein `DATABASE_URL` check karo; `sudo systemctl status postgresql` |
| Build fail — "out of memory" | `NODE_OPTIONS=--max-old-space-size=4096 pnpm run build` |
| Go binary crash on start | `CGO_ENABLED=0` ke saath dobara build karo |
| Nginx 403 on /user/ ya /admin/ | `sudo chown -R www-data:www-data /var/www/cryptox/` |
| SSL expired | `sudo certbot renew` |
| Port 8080 already in use | `lsof -i :8080` se process ID nikalo, `kill -9 <PID>` |
| Redis error on start | API server khud Redis start karta hai — koi external Redis install mat karo |
| `pnpm: command not found` | `npm install -g pnpm@9`, phir `pnpm env use --global 24` |
| TDS ya tax report galat values | INR rate live aa raha hai — koi action nahi chahiye |

---

## Quick Health Check

Update ke baad yeh sab check karo:

```bash
# 1. PM2 processes running hain
pm2 status

# 2. API respond kar raha hai
curl -s https://zebvix.com/api/healthz | jq .

# 3. Go engine theek hai
curl -s https://zebvix.com/go-service/ | jq .

# 4. Nginx config valid hai
sudo nginx -t

# 5. DB connected hai
psql -U cryptox -h localhost -c "SELECT count(*) FROM users;" cryptox
```

Agar sab `ok` / number return kare — sab theek hai. ✅
