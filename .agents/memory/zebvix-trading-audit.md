---
name: Zebvix trading audit fixes
description: Full financial-calculation audit findings and fixes (June 2026) — what was wrong, why, and the pattern to follow.
---

## Confirmed bugs found & fixed (June 2026 audit)

### 1. ai-credit-engine.ts — Non-atomic principal return
**Problem:** On plan expiry, `getSpotWallet()` read was followed by a literal-value `SET balance=X, locked=Y` — classic read-then-write. A leader failover mid-tick could double-credit the principal; a concurrent wallet write between read and write would silently overwrite.
**Fix:** Replaced with `sql\`${walletsTable.balance} + ${invested}\`` and `sql\`GREATEST(0, ${walletsTable.locked} - ${invested})\``.
**Why:** SQL expressions evaluate atomically inside Postgres; no in-app snapshot needed.

### 2. settler.ts — applyWalletDelta locked column could go negative
**Problem:** `applyWalletDelta` applied `locked += lockedDelta` as a raw SQL expression with no floor. feeBuffer (`1 + takerFeeRate * 1.5`) is slightly larger than the GST-inclusive taker rate used in orders.ts (`1 + fees.taker`), so cumulative fill releases could push `locked` slightly below zero.
**Fix:** When `lockedDelta < 0`, use `GREATEST(0, locked + delta)`.
**Why:** Small buffer mismatch is intentional headroom for GST rounding; GREATEST(0) absorbs it without changing balance math (balance refund is already correct).

### 3. earn-user.ts — Earn redeem locked subtraction had no floor
**Problem:** `locked: sql\`${walletsTable.locked} - ${principal}\`` on redeem could go negative if any accounting drift existed (e.g. admin correction, prior bug residue).
**Fix:** Changed to `GREATEST(0, locked - principal)`.

### 4. ai-trading.ts — INR subscription path: double accounting + phantom USDT lock
**Problem (a):** `INR locked += amount` was wrong — INR is *spent*, not locked. Balance already decremented correctly; adding to locked double-counted.
**Problem (b):** `USDT locked += usdtEquiv` without any matching USDT balance decrease created a phantom lock. On expiry/cancel, releasing that phantom lock while adding USDT balance creates USDT from thin air (unintended).
**Fix:** Removed both wrong wallet updates. INR subscribe now only does `balance -= amount` (SQL expression, FOR UPDATE). No USDT wallet touched at subscribe time. On expiry/cancel, USDT is credited from the exchange's liquidity pool (product-intended INR→USDT conversion flow).
**Why:** INR AI plans are an exchange product where user pays INR, exchange provides USDT returns. The balance-only deduction with no lock is correct; the USDT return at expiry is intentional exchange-funded conversion.

### 5. ai-trading.ts — Subscribe/cancel: no FOR UPDATE → concurrent double-spend risk
**Problem:** `getSpotWallet()` inside the transaction did a plain SELECT (no FOR UPDATE). Two concurrent subscribe requests on the same account could both read the same balance and both succeed, effectively subscribing twice while only paying once.
**Fix:** Replaced `getSpotWallet + upsertSpotWallet` with inline `SELECT … FOR UPDATE` + SQL expression `balance - amount` / `locked + amount` for both USDT subscribe and cancel paths.

## Verified correct (no bugs)

- Spot fee calculation (settler.ts): taker/maker/TDS/GST all correct; feeBuffer headroom positive at all default VIP tiers.
- Futures fee rates in applyFills: uses `getFuturesFeeRates(vipTier)` — VIP + GST-inclusive ✅
- Futures PnL math: liquidation price formula, uPnL, margin isolation all correct ✅
- Futures referral commission: `creditTradingFeeReferralChain` called after each fill ✅
- Earn interest accrual: simple interest (`principal * apy/100 * days/365`) — compounding flag fetched but not applied (intentional design, not a bug)
- P2P escrow: balance/p2pLocked flows all atomic and correct ✅
- Convert: rawRate * (1 - SPREAD) * (1 - feeRate) formula correct ✅
- Transfer: atomic double-ledger with SQL expressions ✅
- Referral chain: 5-level walk, 30%/15%/8%/4%/2% of fee, correct ✅
- TDS: 1% on sell side only, earn TDS on net interest, correct ✅

## Pattern rules going forward

1. **Always use SQL expressions** for wallet balance/locked updates — never read-then-write.
2. **Always use FOR UPDATE** when reading a wallet row inside a transaction that will update it.
3. **Always use GREATEST(0, ...)** when subtracting from `locked` — it is a non-negative informational column.
4. `earn-engine.ts` compounding field is intentionally unused (simple interest only) — do not implement compounding without explicit product decision.
