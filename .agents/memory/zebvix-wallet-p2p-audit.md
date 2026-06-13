---
name: Zebvix wallet/P2P/AI audit fixes (June 2026)
description: Full second-pass audit findings — wallet ledger, P2P escrow, AI trading, KYC, fee cache, referral commission
---

## Fixed bugs

### AI Trading: INR → USDT free conversion
- **Bug**: Subscribe with INR deducted INR, but cancel always credited USDT (stored only `investedAmount` in USDT units, no funding coin tracking)
- **Fix**: Added `fundingCoinId` + `fundingAmount` columns to `ai_trading_subscriptions` table. Subscribe stores actual coin used. Cancel returns the exact funding coin/amount. Legacy rows (null `fundingCoinId`) fall back to USDT for backward compat.
- **Files**: `lib/db/src/schema/ai-trading.ts`, `artifacts/api-server/src/routes/ai-trading.ts`

### KYC missing on crypto withdrawals (bicrypto.ts)
- **Bug**: `/finance/withdraw/spot` in bicrypto compat routes had no KYC check
- **Fix**: Added `if ((req.bcUser?.kycLevel ?? 0) < 2) return 403` after the INR check, before coin lookup
- **File**: `artifacts/api-server/src/routes/bicrypto.ts` ~line 1470

### P2P ledger entries had zero balanceBefore/After (4 entries)
- **Bug**: All 4 wallet ledger inserts in p2p.ts had `balanceBefore: "0", balanceAfter: "0"` hardcoded
- **Fix**: Added wallet SELECT before each escrow operation to snapshot pre-op balance; computed after-balance arithmetically. For release (seller side) tracked `p2pLocked`; for lock and cancel/refund tracked `balance`.
- **File**: `artifacts/api-server/src/routes/p2p.ts` (order create, releaseOrder, cancelOrder)

### Duplicate bank accounts
- **Bug**: No uniqueness check when POSTing to `/finance/bank/accounts` — user could add same account multiple times
- **Fix**: Added SELECT before INSERT; return 409 if `accountNumber` already exists for user
- **File**: `artifacts/api-server/src/routes/bicrypto.ts` ~line 1442

### Fee settings hit DB on every match iteration
- **Bug**: `loadFeeSettings()` and `loadVipTiers()` queried DB on every call (up to 200×/order during matching)
- **Fix**: Added module-level TTL cache (30s) for both functions. `invalidateFeeCache()` exported for admin use.
- **File**: `artifacts/api-server/src/routes/fees.ts`

### Referral commission calculated on GST-inclusive gross fee
- **Bug**: `final.fee` (GST-inclusive) was passed to `creditTradingFeeReferralChain`; inflated commission by ~18%
- **Fix**: Back-calculate base fee = `grossFee / (1 + gstPercent/100)` via cached `getSpotFeeRates(vipTier)` call before crediting
- **File**: `artifacts/api-server/src/routes/orders.ts` ~line 382

## False positives from audit explorers (do NOT "fix")
- "Bot vs human wallet update bug" — intentional design; bot wallets aren't updated
- "TDS on maker uses taker.side" — actually uses `maker.side === "sell"`, correct
- "filledQty null → NaN" — JS: `Number(null) === 0`, not NaN

## Wallet model reminder
- `balance` = NET available (locked already deducted at placement)
- `locked` = informational only; do NOT subtract again on frontend
- `p2pLocked` = escrow holds for P2P; separate from `locked`
