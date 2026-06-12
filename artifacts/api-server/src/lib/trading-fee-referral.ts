/**
 * trading-fee-referral.ts
 * Distributes a portion of each spot/futures/earn trade fee to up to 5 levels
 * of the referral chain. Called fire-and-forget after every matched trade.
 *
 * Commission rates (% of the fee/profit collected):
 *   Trading fee  — Level 1: 30%  Level 2: 15%  Level 3: 8%  Level 4: 4%  Level 5: 2%
 *   Earn reward  — Level 1: 3%   Level 2: 2%   Level 3: 1%  Level 4: 0.5%  Level 5: 0.25%
 */

import {
  db, usersTable, walletsTable, referralsTable, settingsTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "./logger";

const DEFAULT_TRADING_RATES: Record<number, number> = { 1: 30, 2: 15, 3: 8, 4: 4, 5: 2 };
const EARN_RATES: Record<number, number>             = { 1: 3, 2: 2, 3: 1, 4: 0.5, 5: 0.25 };

async function loadTradingRates(): Promise<Record<number, number>> {
  try {
    const [row] = await db.select().from(settingsTable)
      .where(eq(settingsTable.key, "referral.trading_fee_rates")).limit(1);
    if (row?.value) {
      const parsed = JSON.parse(row.value);
      if (parsed && typeof parsed === "object") return { ...DEFAULT_TRADING_RATES, ...parsed };
    }
  } catch { /* fallback */ }
  return DEFAULT_TRADING_RATES;
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
 * Generic 5-level referral chain creditor.
 * Walks up the referral chain from `originUserId` and credits each ancestor
 * with `amount * (levelRates[level] / 100)` in `coinId`.
 */
export async function creditReferralChain(
  originUserId: number,
  amount: number,
  coinId: number,
  sourceType: string,
  levelRates: Record<number, number>,
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

    const pct = levelRates[level] ?? 0;
    const commission = parseFloat((amount * pct / 100).toFixed(8));
    if (commission < 0.000001) { currentId = user.referredBy; continue; }

    const walletId = await ensureSpotWallet(user.referredBy, coinId);
    if (walletId) {
      await db.update(walletsTable)
        .set({ balance: sql`${walletsTable.balance} + ${commission}`, updatedAt: new Date() })
        .where(eq(walletsTable.id, Number(walletId)));
    }

    await db.insert(referralsTable).values({
      referrerId: user.referredBy, referredId: originUserId,
      bonusCredited: true, bonusAmount: String(commission),
      level, sourceType,
    }).catch(() => null);

    logger.debug(
      { referrerId: user.referredBy, level, commission, originUserId, sourceType },
      "referral-chain: commission credited",
    );

    currentId = user.referredBy;
  }
}

/**
 * Walk up to 5 levels of the referral chain and credit each referrer
 * with their tier commission from the `feeAmount` in `quoteCoinId`.
 *
 * @param traderId    — The user who placed the order (taker)
 * @param feeAmount   — Total fee collected in quote currency (already in DB units)
 * @param quoteCoinId — The quote coin's ID (e.g. USDT coin id)
 * @param sourceType  — "trading_fee" | "futures_fee" | "earn_plan"
 */
export async function creditTradingFeeReferralChain(
  traderId: number,
  feeAmount: number,
  quoteCoinId: number,
  sourceType: "trading_fee" | "futures_fee" | "earn_plan" = "trading_fee",
): Promise<void> {
  const rates = sourceType === "earn_plan"
    ? EARN_RATES
    : await loadTradingRates();
  return creditReferralChain(traderId, feeAmount, quoteCoinId, sourceType, rates);
}
