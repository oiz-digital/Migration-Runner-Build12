---
name: Zebvix demo data setup
description: Full production-level seed data — what exists in DB, demo credentials, table names, AI plans route
---

## Demo Credentials
- Admin: admin@zebvix.com / Tyagi00@ (id=2, role=superadmin, KYC=3)
- Demo User: salmanty7860@gmail.com / Tyagi00@ (id=3, role=user, KYC=2)
- Both use bcrypt password hashes (NOT sha256 — the original admin had sha256 which was reset to bcrypt)

## Admin password was sha256 originally
The original admin user had `$sha256$...` password format but auth.ts uses bcrypt. Reset via:
`UPDATE users SET password_hash='<bcrypt_hash>' WHERE email='admin@zebvix.com'`

## DB Tables (correct names)
- announcements (NOT cms_content)
- news_items (NOT news)
- earn_products (NOT earn_plans, NOT staking_pools)
- trading_bots (user trading bots)
- market_bots (market-making bots per pair — all 146 pairs already had bots running)
- home_banners / home_promotions (NOT hero_banners)
- legal_pages (slug PK, has terms/privacy/aml/risk/cookies/fees)
- ai_trading_plans (correct name, risk_level enum: low/medium/high/ultra)
- gateways (payment gateways for INR + crypto)
- exchange_settings (key-value, NOT settings)
- app_settings (key-value, separate table)
- fee_config (single row, default_maker_fee/default_taker_fee)
- kyc_settings (level PK: 1/2/3)

## AI Trading Plans Route
- User route: GET /api/ai-trading/plans (NOT /api/ai/plan)
- Admin route: GET /api/admin/ai-trading/plans
- Admin router loaded from routes/admin-ai-trading.ts separately

## What was seeded
- 4 AI plans: Starter Grow (low, 0.3%), Smart Alpha (medium, 0.65%), Turbo Yield (high, 1.1%), Ultra Quant (ultra, 1.85%)
- 3 announcements: welcome, KYC bonus, futures launch
- 4 news items: BTC ATH, India crypto regulations, ETH staking, P2P launch
- 5 earn products: USDT Flexi 8.5%, BTC 30d 5.2%, ETH 90d 7.8%, SOL 60d 12.5%, BNB Flexi 6.2%
- 10 gateways: UPI/NEFT deposit+withdrawal, BTC/ETH/USDT-TRC20/USDT-ERC20/BNB/SOL networks
- 6 legal pages: terms, privacy, aml, risk, cookies, fees
- 3 KYC levels with limits
- Fee config: 0.1% maker/taker, 0% withdrawal
- 3 home banners + 5 home promotions
- 23 exchange_settings + 13 app_settings keys
- Demo user wallets: admin ₹1Cr INR, 5 BTC, 50 ETH, 1000 SOL, 200 BNB, 100K USDT; demo user ₹2.5L INR, 0.25 BTC, 2.5 ETH, 50 SOL, 10 BNB, 5K USDT

**Why:** Needed for full production-level demo without needing admin panel UI to manually enter everything.
**How to apply:** When re-seeding on VPS, use deploy/create-admin.mjs for admin user, then run the SQL inserts above.
