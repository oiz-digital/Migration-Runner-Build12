---
name: Zebvix Security Audit Fixes
description: Full platform security audit findings and fixes applied during June 2026 audit session.
---

# Zebvix Full Security Audit — June 2026

## Issues Fixed

### Frontend Auth Gaps (App.tsx)
Pages that were NOT wrapped in RequireAuth but should be:
- `/trade/:symbol?` — Spot trade page (now RequireAuth)
- `/futures/:symbol?` — Futures page (now RequireAuth)
- `/options` — Options page (now RequireAuth)
- `/p2p` — P2P marketplace (now RequireAuth)
- `/convert` — Convert page (now RequireAuth)
- `/leagues` — Trading Leagues (now RequireAuth)

**Why:** These pages involve financial operations. Without RequireAuth, unauthenticated users land on the page, see broken UI, and can't do anything — bad UX and exposes trading UI to public scraping.

### KYC Enforcement Gaps (API routes)
Added KYC checks to protect financial operations:
- `POST /api/orders` (orders.ts) — KYC Level 1 required
- `POST /api/exchange/order` (bicrypto.ts Flutter bridge) — KYC Level 1 required
- `POST /api/crypto-withdrawals` (public-user.ts) — KYC Level 2 required (Aadhaar + selfie)
- `POST /api/inr-withdrawals` (public-user.ts) — KYC Level 1 required (PAN)
- `POST /api/ai-trading/subscribe` (ai-trading.ts) — KYC Level 1 required

Already had KYC: futures (Level 2), P2P offers/orders (Level 1), convert quote (Level 1), earn subscribe (custom check).

**Why:** PMLA/FIU-IND mandates KYC for all trading and withdrawal operations. Missing KYC gate = compliance violation.

### parseInt Without Radix (API routes)
All `parseInt(...)` without `, 10` radix fixed:
- admin-ai-trading.ts lines 48, 63 — PATCH/DELETE plan by ID
- price-alerts.ts lines 53, 62 — DELETE/PATCH alert by ID
- support-tickets.ts lines 79, 91, 109, 142, 151, 169 — all ticket endpoints
- ai-trading.ts line 196 — cancel subscription
- mt5.ts line 377 — account refresh
Also added `isNaN(id) || id <= 0` guard on admin-ai-trading PATCH/DELETE.

**Why:** Without radix, octal/hex strings parse unexpectedly. Without NaN guard, DB queries with NaN IDs can fail with obscure errors.

## Clean Areas (No Issues Found)
- Admin panel: 66 pages, all routed, zero TS errors, all sidebar links match routes
- All 60+ API route files correctly mounted in index.ts
- admin-source.ts: requireRole("admin","superadmin") at router.use level — secure
- Rate limiting: global (100/15min), auth (10/15min), OTP (5/hr), orders (2/sec) — correct
- No SQL injection: all user inputs go through Drizzle ORM parameterized queries
- No console.log in production server code (only bench.ts/test files)
- Wallet balance NOT double-subtracted in frontend (balance = NET available)
- No hardcoded secrets (all from process.env)
- 2FA enforcement: challenge token system, OTP consumed atomically
- Transfer route: self-transfer prevented, from===to rejected
- Session: SameSite=Strict cookies, originGuard middleware
- account-api-keys.ts: proper `!Number.isInteger(id) || id <= 0` guards

## Notes
- bicrypto.ts (2200+ lines) is intentional Flutter/mobile bridge — stub endpoints return empty arrays for non-implemented Bicrypto features (blog, ecommerce, etc.)
- Two settings tables: settingsTable (engine reads) vs exchangeSettingsTable (generic UI)
- /trade and /futures are public pages in many exchanges but Zebvix wants RequireAuth
