# Zebvix — Full-Stack Crypto Exchange Platform

A full-featured, production-ready cryptocurrency exchange platform built for the Indian market. Includes spot trading, perpetual futures, options, P2P, AI trading plans, copy trading, earn/staking, admin dashboard, and REST API.

---

## Run & Operate

| Service | Command | Notes |
|---------|---------|-------|
| API Server | `pnpm --filter @workspace/api-server run dev` | Port auto-assigned via `PORT` env |
| Admin Panel | `pnpm --filter @workspace/admin run dev` | Needs `PORT` + `BASE_PATH=/admin/` |
| User Portal | `pnpm --filter @workspace/user-portal run dev` | Needs `PORT` + `BASE_PATH=/user/` |
| Go Service | `go run .` (inside `artifacts/go-service/`) | Futures matching engine |

```bash
# Full typecheck
pnpm run typecheck

# Build all packages
pnpm run build

# Regenerate API hooks + Zod schemas from OpenAPI spec
pnpm --filter @workspace/api-spec run codegen

# Push DB schema changes (dev only)
pnpm --filter @workspace/db run push
```

**Required env vars:** `DATABASE_URL` (auto-provisioned by Replit), `SESSION_SECRET`

---

## Architecture

```
Browser / Mobile
     │
     ▼
Reverse Proxy (Replit shared proxy — path-based routing)
     │
     ├── /api/*         → API Server (Express 5, Node.js 24)
     ├── /user/*        → User Portal (Vite + React)
     ├── /admin/*       → Admin Panel (Vite + React)
     └── /go-service/*  → Go Service (Futures matching engine)
```

### API Server (`artifacts/api-server`)
- **Framework**: Express 5, TypeScript 5.9
- **Auth**: Session cookies (`cx_session`) + optional JWT Bearer (Bicrypto-compatible)
- **Redis**: Embedded in-process (via spawned `redis-server` binary); used for orderbook ZSETs, pub/sub, caching, leader election, rate limiting
- **Matching engine**: Pure Node.js in-memory engine (`lib/matching-engine.ts`) for spot orders; Go service for futures
- **Rate limiting**: Global (100 req/15min), Auth (10 login/15min), OTP (5/hr), Order (2/sec per session)

### Database (`lib/db`)
- **ORM**: Drizzle ORM + PostgreSQL
- **Migrations**: `drizzle push` for dev; production managed by Replit Publish flow
- **Schema files**: `lib/db/src/schema/` (one file per domain)

### Go Service (`artifacts/go-service`)
- Futures-only order matching engine (high-concurrency, in-memory orderbook)
- Internal RPC endpoints: `/internal/futures/place`, `/internal/futures/cancel`
- WebSocket hub for real-time depth + trade-history push
- Health: `GET /go-service/` → `{"status":"ok","books":N}`

---

## Stack

- **Runtime**: Node.js 24, Go 1.22
- **Frontend**: React 18, Vite, TailwindCSS, shadcn/ui, Wouter (routing), TanStack Query
- **Backend**: Express 5, Drizzle ORM, Zod v4, ioredis, pino (logging)
- **Codegen**: Orval (generates React Query hooks + Zod schemas from OpenAPI spec)
- **Build**: esbuild (CJS bundle for API server)
- **Package manager**: pnpm workspaces

---

## Where Things Live

| Domain | Path |
|--------|------|
| DB schema (source of truth) | `lib/db/src/schema/index.ts` |
| API contract (OpenAPI) | `lib/api-spec/openapi.yaml` |
| API server routes | `artifacts/api-server/src/routes/` |
| Matching engine | `artifacts/api-server/src/lib/matching-engine.ts` |
| Auth middleware | `artifacts/api-server/src/lib/auth.ts` |
| Admin frontend | `artifacts/admin/src/` |
| User portal frontend | `artifacts/user-portal/src/` |
| Go futures engine | `artifacts/go-service/` |
| Shared DB lib | `lib/db/src/` |
| API spec + codegen | `lib/api-spec/` |

---

## API Routes (Summary)

### Auth (`/api/auth`)
- `POST /login`, `/register`, `/logout`, `/refresh`
- `POST /otp/login`, `/otp/resend`
- `POST /2fa`, `/2fa/enable`, `/2fa/disable`
- `POST /verify`, `/reset`, `/reset/confirm`, `/change-password`
- `GET /pow/challenge` — proof-of-work for registration

### Spot Exchange (`/api/exchange`)
- `GET /market`, `/ticker`, `/orderbook/:currency/:pair`, `/trades/:currency/:pair`, `/chart`
- `POST /order` — place spot limit/market/stop order
- `DELETE /order/:id` — cancel order

### Futures (`/api/futures`)
- `GET /market`, `/order`, `/position`, `/chart`
- `POST /order`, `/position`, `/leverage`
- `DELETE /order/:id`, `/position`

### Wallet & Finance (`/api/finance`)
- `GET /wallet`, `/wallet/symbol`, `/transaction`, `/currency`
- `POST /deposit/spot`, `/withdraw/spot`, `/withdraw/fiat`, `/transfer`

### AI Trading (`/api/ai`)
- `GET /plan`, `/investment`, `/investment/log`, `/trade`
- Plan subscription, earnings, cancellation

### KYC (`/api/user/kyc`)
- `GET /status`, `/level`, `/application`
- `POST /application`, `PUT /application/:id`
- `POST /upload/kyc-document`

### P2P (`/api/p2p`)
- `GET /offer`, `/trade`, `/payment-method`, `/market/stats`
- `POST /offer`, `/trade`, `/trade/:id/confirm`, `/trade/:id/cancel`, `/trade/:id/dispute`

### Earn / Staking (`/api/staking`)
- `GET /pool`, `/position`, `/user/earnings`
- `POST /position`, `/position/:id/withdraw`

### Admin (`/api/admin/*`)
- Users, KYC, coins, pairs, wallets, bots, AI plans, withdrawals, deposits, audit logs, settings

---

## Database Schema (Key Tables)

| Table | Purpose |
|-------|---------|
| `users` | User accounts, roles, KYC level, 2FA |
| `sessions` | Auth sessions (cx_session cookie) |
| `wallets` | Spot wallet balances per user per coin. `balance` = NET available, `locked` = informational |
| `wallet_ledger` | Double-entry ledger for every balance change |
| `orders` | Spot orders (open/filled/cancelled) |
| `trades` | Executed spot trades |
| `futures_positions` | Open futures positions |
| `ai_trading_subscriptions` | Active AI trading plan subscriptions |
| `ai_trading_plans` | Available AI plan definitions |
| `coins` / `networks` | Asset + chain configuration |
| `pairs` | Trading pairs (base + quote) |
| `kyc_records` | KYC documents and verification state |
| `p2p_offers` / `p2p_trades` | P2P escrow engine |
| `bots` / `market_bots` | Trading bot configuration |
| `audit_log` | Immutable admin action history |
| `otp` | OTP codes (login, verify, reset) |
| `earn_plans` / `earn_subscriptions` | Fixed/flexible savings products |

### Wallet Model (IMPORTANT)
- `balance` column = **net available** (locked amounts already subtracted when order/AI plan placed)
- `locked` column = informational snapshot (what is held)
- Frontend `availOf()` must use `balance` directly — **do NOT subtract `locked` or `inOrder` from it again**

---

## Frontend Pages

### User Portal (`/user/`)

| Page | Path | Auth Required |
|------|------|--------------|
| Home | `/` | No |
| Markets | `/markets` | No |
| Spot Trade | `/trade/:symbol?` | Yes |
| Futures | `/futures/:symbol?` | Yes |
| Options | `/options` | Yes |
| P2P | `/p2p` | Yes |
| Convert | `/convert` | Yes |
| AI Trading | `/ai-trading` | Yes |
| Trading Bots | `/bots` | Yes |
| Copy Trading | `/copy-trading` | Yes |
| Earn/Staking | `/earn` | Yes |
| Wallet | `/wallet` | Yes |
| Orders History | `/orders` | Yes |
| Portfolio | `/portfolio` | Yes |
| Pro Dashboard | `/dashboard` | Yes |
| Ledger | `/ledger` | Yes |
| Discover | `/discover` | No |
| KYC | `/kyc` | Yes |
| Profile | `/profile` | Yes |
| Settings | `/settings` | Yes |
| Invite/Referrals | `/invite`, `/referrals` | Yes |
| INR Payments | `/inr-payments` | Yes |
| Price Alerts | `/price-alerts` | Yes |
| Support | `/support`, `/support/tickets` | No/Yes |

### Legal / Compliance Pages
| Page | Path |
|------|------|
| Terms of Service | `/terms` |
| Privacy Policy | `/privacy` |
| AML / KYC Policy | `/aml` |
| Risk Disclosure | `/risk` |
| Cookie Policy | `/cookies` |
| Fee Schedule | `/fees` |

### Admin Panel (`/admin/`)

Key admin sections: Users, KYC review, Coins & Networks, Trading Pairs, Orders, Wallets, AI Trading Plans, Bots, Futures, Options, P2P, Earn, INR deposits/withdrawals, Crypto deposits/withdrawals, Settings, Audit Logs, Redis monitor, Trading Engine status, Legal CMS.

---

## Security Architecture

| Layer | Mechanism |
|-------|-----------|
| Auth | Session cookie (`cx_session`, SameSite=Strict) + JWT Bearer |
| CSRF | `originGuard` middleware validates `Origin`/`Referer` header |
| Rate limiting | Redis-backed, per-IP: Global 100/15min, Auth 10/15min, OTP 5/hr, Orders 2/sec |
| KYC gating | Frontend `KycGate` + `VerificationGateModal`; API checks `user.kycLevel` |
| Secrets | Vault password for mnemonic decryption; keys encrypted in DB |
| Audit | Immutable `audit_log` table for all admin actions |
| Sanctions | On-chain screening (TRM/Chainalysis equivalent); OFAC/UN/MHA lists |

---

## Compliance (AML/KYC)

Zebvix is registered as a **Reporting Entity** with **FIU-IND** under PMLA 2002.

- **KYC tiers**: Level 1 (PAN), Level 2 (Aadhaar + selfie), Level 3 (EDD)
- **Screening**: Sanctions at onboarding + daily (UN, OFAC, EU, MHA)
- **Reporting**: STR, CTR, CBWTR, VDA-specific reports to FIU-IND
- **Contact**: compliance@zebvix.com

Full policy pages: `/aml`, `/risk`, `/terms`, `/privacy`

---

## User Preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

---

## Gotchas

- Admin and user-portal require `PORT` and `BASE_PATH` env vars set when starting dev server
- `pnpm --filter @workspace/db run push` requires `DATABASE_URL` to be set (auto-provisioned via Replit DB)
- **Do NOT run `pnpm dev` at workspace root** — use per-package filter commands
- After schema changes: run `db push`, then restart `api-server` workflow
- `Migration-Runner9/*` workflows are always NOT_STARTED — ignore them (artifact of old migration)
- Redis auth rate limit key: `cryptox:rl:auth:<IP>` — 10 attempts / 15 min window; clear with `redis-cli DEL` if needed
- Wallet `balance` = NET available; `locked` = informational only — do not double-subtract in frontend

---

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Full exchange audit: `docs/EXCHANGE_AUDIT.md`
- Compiled compliance docs: `docs/AML_TRADE_POLICY.md`
