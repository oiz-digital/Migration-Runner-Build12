---
name: Zebvix VPS deploy fixes
description: What was fixed in the VPS deployment scripts and nginx config
---

## deploy/nginx.conf — http2 fix
- Old (deprecated, nginx 1.25+): `listen 443 ssl http2;`
- New (correct): `listen 443 ssl;` + `http2 on;` inside the server block
- Also: `map $http_upgrade $connection_upgrade` block moved to TOP of file (before server blocks) to avoid potential ordering issues

**Why:** nginx 1.25.1+ split `http2` from the `listen` directive. Old syntax produces a deprecation warning and may be removed in future nginx versions.

## deploy/zebvix-setup.sh — v2.5 is production-ready
Key fixes already in v2.5:
- `CI=true NODE_ENV=development pnpm install --no-frozen-lockfile --shamefully-hoist` — prevents interactive prompts
- Builds are synchronous (not backgrounded with `&`) — `tsc`, `esbuild`, `vite` all run sequentially
- HTTP-only nginx config deployed FIRST, then certbot adds SSL — avoids `options-ssl-nginx.conf` not found error
- `certbot --non-interactive --agree-tos` flags prevent interactive prompts

## DB migration on VPS
- `pnpm --filter @workspace/db run migrate` (uses drizzle-kit migrate with SQL files in `lib/db/drizzle/`)
- Migration files exist: `0000_light_maddog.sql`, `0001_soft_anthem.sql`
- Never use `push` in production — it can drop columns

## Seed data
- Run once after fresh install: `pnpm --filter @workspace/api-server run seed`
- Seeds: 99 coins, 118 networks (92 coins), 146 pairs (USDT/BTC/INR)
- Uses upsert — safe to re-run
