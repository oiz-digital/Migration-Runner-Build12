/**
 * trading-fee-referral.ts
 * Distributes a portion of each spot/futures/earn fee to up to 5 levels
 * of the referral chain. Called fire-and-forget after every matched trade.
 *
 * Commission rates are admin-configurable via PUT /api/admin/referral-settings.
 * Defaults (% of fee):
 *   Trading/Futures — L1:30  L2:15  L3:8  L4:4  L5:2
 *   Earn            — L1:3   L2:2   L3:1  L4:0.5 L5:0.25
 *   AI              — L1:5   L2:3   L3:2  L4:1   L5:0.5
 */

import {
  db, usersTable, walletsTable, referralsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import { loadReferralConfig } from "../routes/admin-referrals";

/**
 * Generic 5-level referral chain creditor.
 * Walks up the referral chain from `originUserId` and credits each ancestor.
 *
 * Uses an atomic INSERT … ON CONFLICT DO UPDATE to credit the referrer's spot
 * wallet in a single round-trip, eliminating the SELECT-then-INSERT race
 * condition that existed against the (userId, walletType, coinId) unique index.
 */
export async function creditReferralChain(
  originUserId: number,
  amount: number,
  coinId: number,
  sourceType: string,
  levelRates: Record<string, number>,
): Promise<void> {
  if (!amount || amount <= 0) return;
  let currentId = originUserId;

  for (let level = 1; level <= 5; level++) {
    const [user] = await db
      .select({ id: usersTable.id, referredBy: usersTable.referredBy })
      .from(usersTable)
      .where(eq(usersTable.id, currentId))
      .limit(1);

    if (!user?.referredBy) break;

    const pct = Number(levelRates[String(level)] ?? levelRates[level] ?? 0);
    const commission = parseFloat((amount * pct / 100).toFixed(8));
    if (commission < 0.000001) { currentId = user.referredBy; continue; }

    // Atomic upsert: create the wallet if absent, otherwise increment balance.
    // Avoids the SELECT→INSERT race condition against the unique
    // (user_id, wallet_type, coin_id) index — any concurrent credit will
    // safely queue on the same row rather than losing data.
    await db.insert(walletsTable)
      .values({
        userId: user.referredBy,
        coinId,
        walletType: "spot",
        balance: String(commission),
        locked: "0",
      })
      .onConflictDoUpdate({
        target: [walletsTable.userId, walletsTable.walletType, walletsTable.coinId],
        set: {
          balance: sql`${walletsTable.balance} + ${commission}`,
          updatedAt: new Date(),
        },
      });

    await db.insert(referralsTable).values({
      referrerId:      user.referredBy,
      referredId:      originUserId,
      bonusCredited:   true,
      bonusAmount:     String(commission),
      commissionRate:  String(pct),
      level,
      sourceType,
    }).catch(() => null);

    logger.debug(
      { referrerId: user.referredBy, level, commission, pct, originUserId, sourceType },
      "referral-chain: commission credited",
    );

    currentId = user.referredBy;
  }
}

/**
 * Walk up to 5 levels of the referral chain and credit each referrer.
 *
 * @param traderId    — The user who generated the fee
 * @param feeAmount   — Total fee/profit in quote currency
 * @param quoteCoinId — Coin ID to credit (e.g. USDT)
 * @param sourceType  — "trading_fee" | "futures_fee" | "earn_plan"
 */
export async function creditTradingFeeReferralChain(
  traderId: number,
  feeAmount: number,
  quoteCoinId: number,
  sourceType: "trading_fee" | "futures_fee" | "earn_plan" = "trading_fee",
): Promise<void> {
  const config = await loadReferralConfig();
  if (!config.enabled) return; // Admin can disable referral globally

  const rates = sourceType === "earn_plan" ? config.earn : config.trading;
  return creditReferralChain(traderId, feeAmount, quoteCoinId, sourceType, rates);
}
