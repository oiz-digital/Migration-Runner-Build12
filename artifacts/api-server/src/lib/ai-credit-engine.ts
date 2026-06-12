import { db, aiTradingPlansTable, aiTradingSubscriptionsTable, aiTradingEarningsTable, referralsTable, walletsTable, walletLedgerTable, coinsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { isLeader } from "./leader";

const TICK_MS = 60 * 60 * 1000; // 1 hour

const AI_REFERRAL_PERCENT: Record<number, number> = { 1: 5, 2: 3, 3: 2, 4: 1, 5: 0.5 };

/* ── Daily variance — deterministic per (userId, subId, dayKey) ─────────── */
function getDayVariance(userId: number, subId: number, dayKey: number): number {
  const seed = ((userId * 31337 + subId * 7919 + dayKey * 1009) % 10000) / 10000;
  const variance = 0.6 + seed * 0.9; // 0.60 – 1.50 multiplier
  return variance;
}

/* ── Wallet helpers ─────────────────────────────────────────────────────── */
async function getUsdtCoinId(): Promise<number | null> {
  const [coin] = await db.select({ id: coinsTable.id }).from(coinsTable)
    .where(eq(coinsTable.symbol, "USDT")).limit(1);
  return coin?.id ?? null;
}

async function getSpotWallet(userId: number, coinId: number) {
  const [w] = await db.select().from(walletsTable)
    .where(and(eq(walletsTable.userId, userId), eq(walletsTable.walletType, "spot"), eq(walletsTable.coinId, coinId)))
    .limit(1);
  return w;
}

async function updateWalletBalance(walletId: number, balance: string) {
  await db.update(walletsTable).set({ balance, updatedAt: new Date() })
    .where(eq(walletsTable.id, walletId));
}

/* ── Referral commission chain ──────────────────────────────────────────── */
async function creditAIReferralChain(userId: number, creditAmount: number): Promise<void> {
  const usdtCoinId = await getUsdtCoinId();
  if (!usdtCoinId) return;

  let currentId = userId;
  for (let level = 1; level <= 5; level++) {
    const [parentUser] = await db.select({ id: usersTable.id, referredBy: usersTable.referredBy })
      .from(usersTable).where(eq(usersTable.id, currentId)).limit(1);
    if (!parentUser?.referredBy) break;

    const pct        = AI_REFERRAL_PERCENT[level] ?? 0;
    const commission = parseFloat((creditAmount * pct / 100).toFixed(8));
    if (commission <= 0) { currentId = parentUser.referredBy; continue; }

    await db.insert(referralsTable).values({
      referrerId:    parentUser.referredBy,
      referredId:    userId,
      bonusCredited: true,
      bonusAmount:   String(commission),
      level,
      sourceType:    "ai_trading",
    }).catch(() => null);

    const wallet = await getSpotWallet(parentUser.referredBy, usdtCoinId);
    if (wallet) {
      const newBalance = String(parseFloat(wallet.balance ?? "0") + commission);
      await updateWalletBalance(wallet.id, newBalance);
    }

    logger.debug({ referrerId: parentUser.referredBy, level, commission, userId }, "ai-credit: referral commission credited");
    currentId = parentUser.referredBy;
  }
}

/* ── Main tick ──────────────────────────────────────────────────────────── */
async function creditTick(): Promise<void> {
  if (!isLeader()) return;

  const now    = new Date();
  const dayKey = Math.floor(now.getTime() / 86400000);

  const usdtCoinId = await getUsdtCoinId();
  if (!usdtCoinId) { logger.warn("ai-credit: USDT coin not found, skipping tick"); return; }

  const activeSubs = await db.select().from(aiTradingSubscriptionsTable)
    .where(eq(aiTradingSubscriptionsTable.status, "active"));

  for (const sub of activeSubs) {
    try {
      const [plan] = await db.select().from(aiTradingPlansTable)
        .where(eq(aiTradingPlansTable.id, sub.planId));
      if (!plan) continue;

      const invested     = parseFloat(sub.investedAmount);
      const dailyPct     = parseFloat(plan.dailyReturnPercent);
      const hourlyRate   = dailyPct / 100 / 24;
      const lastCredited = sub.lastCreditedAt ?? sub.startedAt;
      const elapsedMs    = now.getTime() - new Date(lastCredited).getTime();
      const elapsedHours = elapsedMs / (1000 * 60 * 60);

      if (elapsedHours < 0.5) continue;

      const baseCredit   = invested * hourlyRate * elapsedHours;
      const variance     = getDayVariance(sub.userId, sub.id, dayKey);
      const rawCredit    = parseFloat((baseCredit * variance).toFixed(8));
      const totalEarned  = parseFloat(sub.totalEarned ?? "0");
      const credit       = rawCredit < 0 ? Math.max(rawCredit, -(totalEarned * 0.15)) : rawCredit;

      if (Math.abs(credit) < 0.00000001) continue;

      const wallet     = await getSpotWallet(sub.userId, usdtCoinId);
      const prevFree   = parseFloat(wallet?.balance ?? "0");
      const newFree    = Math.max(0, prevFree + credit);

      if (wallet) {
        await updateWalletBalance(wallet.id, String(newFree));
      }

      await db.insert(aiTradingEarningsTable).values({
        userId:         sub.userId,
        subscriptionId: sub.id,
        planName:       plan.name,
        amountUsdt:     String(credit),
        creditedAt:     now,
      });

      // Write to unified wallet ledger
      await db.insert(walletLedgerTable).values({
        userId:        sub.userId,
        coinId:        usdtCoinId,
        walletType:    "spot",
        type:          "ai_earning",
        amount:        String(credit),
        balanceBefore: String(prevFree),
        balanceAfter:  String(newFree),
        refType:       "ai_trading_subscription",
        refId:         String(sub.id),
        note:          `AI plan: ${plan.name}`,
        createdAt:     now,
      }).catch(err => logger.warn({ err: err?.message }, "ai-credit: ledger write failed"));

      if (credit > 0) {
        await creditAIReferralChain(sub.userId, credit).catch(err =>
          logger.warn({ err: err?.message, subId: sub.id }, "ai-credit: referral chain error"),
        );
      }

      const newTotalEarned = parseFloat((totalEarned + credit).toFixed(8));
      // No-expire bots (expiresAt == null) run indefinitely until manually stopped.
      const isExpired      = sub.expiresAt != null && now >= new Date(sub.expiresAt);

      await db.update(aiTradingSubscriptionsTable).set({
        totalEarned:    String(newTotalEarned),
        lastCreditedAt: now,
        ...(isExpired ? { status: "completed" } : {}),
      }).where(eq(aiTradingSubscriptionsTable.id, sub.id));

      if (isExpired) {
        const w2 = await getSpotWallet(sub.userId, usdtCoinId);
        if (w2) {
          await db.update(walletsTable).set({
            balance: String(parseFloat(w2.balance ?? "0") + invested),
            locked:  String(Math.max(0, parseFloat(w2.locked ?? "0") - invested)),
            updatedAt: new Date(),
          }).where(eq(walletsTable.id, w2.id));
        }
        logger.info({ subId: sub.id, userId: sub.userId }, "ai-credit: subscription completed, principal returned");
      }

      const tag = credit >= 0 ? "+" : "";
      logger.info(
        { subId: sub.id, userId: sub.userId, credit: `${tag}${credit.toFixed(6)}`, variance: variance.toFixed(3), planName: plan.name },
        credit >= 0 ? "ai-credit: profit credited" : "ai-credit: loss day — small debit",
      );
    } catch (err: unknown) {
      logger.warn({ subId: sub.id, err: (err as Error)?.message }, "ai-credit: tick error on subscription");
    }
  }
}

export function startAICreditEngine(): void {
  setTimeout(() => {
    creditTick().catch(err => logger.warn({ err: err?.message }, "ai-credit: initial tick failed"));
  }, 10_000);

  setInterval(() => {
    creditTick().catch(err => logger.warn({ err: err?.message }, "ai-credit: tick failed"));
  }, TICK_MS);

  logger.info("ai-credit-engine: initialized (1h interval, daily variance, 5-level referral commissions)");
}
