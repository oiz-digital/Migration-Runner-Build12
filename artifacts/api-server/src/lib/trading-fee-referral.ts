/**
 * trading-fee-referral.ts
 * Distributes a portion of each spot/futures trade fee to up to 5 levels
 * of the referral chain. Called fire-and-forget after every matched trade.
 *
 * Commission rates (% of the fee collected by the exchange):
 *   Level 1: 30%   Level 2: 15%   Level 3: 8%   Level 4: 4%   Level 5: 2%
 */

import {
  db, usersTable, walletsTable, referralsTable, settingsTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "./logger";

const DEFAULT_RATES: Record<number, number> = { 1: 30, 2: 15, 3: 8, 4: 4, 5: 2 };

async function loadRates(): Promise<Record<number, number>> {
  try {
    const [row] = await db.select().from(settingsTable)
      .where(eq(settingsTable.key, "referral.trading_fee_rates")).limit(1);
    if (row?.value) {
      const parsed = JSON.parse(row.value);
      if (parsed && typeof parsed === "object") return { ...DEFAULT_RATES, ...parsed };
    }
  } catch { /* fallback */ }
  return DEFAULT_RATES;
}

async function ensureSpotWallet(userId: number, coinId: number): Promise<string | null> {
  const [w] = await db.select({ id: walletsTable.id, balance: walletsTable.balance })
    .from(walletsTable)
    .where(and(
      eq(walletsTable.userId, userId),
      eq(walletsTable.coinId, coinId),
      eq(walletsTable.walletType, "spot"),
    )).limit(1);
  if (w) return String(w.id);
  const [inserted] = await db.insert(walletsTable).values({
    userId, coinId, walletType: "spot", balance: "0", locked: "0",
  }).returning({ id: walletsTable.id });
  return inserted ? String(inserted.id) : null;
}

/**
 * Walk up to 5 levels of the referral chain and credit each referrer
 * with their tier commission from the `feeAmount` in `quoteCoinId`.
 *
 * @param traderId    — The user who placed the order (taker)
 * @param feeAmount   — Total fee collected in quote currency (already in DB units)
 * @param quoteCoinId — The quote coin's ID (e.g. USDT coin id)
 * @param sourceType  — "trading_fee" | "futures_fee" (for ledger labeling)
 */
export async function creditTradingFeeReferralChain(
  traderId: number,
  feeAmount: number,
  quoteCoinId: number,
  sourceType: "trading_fee" | "futures_fee" = "trading_fee",
): Promise<void> {
  if (!feeAmount || feeAmount <= 0) return;

  const rates = await loadRates();
  let currentId = traderId;

  for (let level = 1; level <= 5; level++) {
    const [user] = await db
      .select({ id: usersTable.id, referredBy: usersTable.referredBy })
      .from(usersTable)
      .where(eq(usersTable.id, currentId))
      .limit(1);

    if (!user?.referredBy) break;

    const pct = rates[level] ?? 0;
    const commission = parseFloat((feeAmount * pct / 100).toFixed(8));
    if (commission < 0.000001) { currentId = user.referredBy; continue; }

    // Credit the referrer's spot wallet
    const walletId = await ensureSpotWallet(user.referredBy, quoteCoinId);
    if (walletId) {
      await db.update(walletsTable)
        .set({
          balance: sql`${walletsTable.balance} + ${commission}`,
          updatedAt: new Date(),
        })
        .where(eq(walletsTable.id, Number(walletId)));
    }

    // Insert referral record
    await db.insert(referralsTable).values({
      referrerId:    user.referredBy,
      referredId:    traderId,
      bonusCredited: true,
      bonusAmount:   String(commission),
      level,
      sourceType,
    }).catch(() => null); // Ignore unique-constraint duplicates gracefully

    logger.debug(
      { referrerId: user.referredBy, level, commission, traderId, sourceType },
      "trading-fee-referral: commission credited",
    );

    currentId = user.referredBy;
  }
}
