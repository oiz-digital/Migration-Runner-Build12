import { Router, type IRouter } from "express";
import { db, aiTradingPlansTable, aiTradingSubscriptionsTable, aiTradingEarningsTable, walletsTable, coinsTable, usersTable, walletLedgerTable } from "@workspace/db";
import { eq, and, desc, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getInrRate } from "../lib/price-service";
import { COMPANY_NAME, COMPANY_SHORT, COMPANY_CIN, COMPANY_GST, COMPANY_ADDRESS } from "../lib/company";

const AI_TDS_RATE = 0.01; // 1% India VDA TDS, applied to realized profit only

/* ── Public rate endpoint ── */

const router: IRouter = Router();

/* ── helpers ── */

async function getSpotWallet(userId: number, symbol: string) {
  const [coin] = await db.select({ id: coinsTable.id }).from(coinsTable).where(eq(coinsTable.symbol, symbol)).limit(1);
  if (!coin) return null;
  const [wallet] = await db.select().from(walletsTable)
    .where(and(eq(walletsTable.userId, userId), eq(walletsTable.walletType, "spot"), eq(walletsTable.coinId, coin.id)))
    .limit(1);
  return wallet ? { ...wallet, coinId: coin.id } : { coinId: coin.id, balance: "0", locked: "0", id: null };
}

async function upsertSpotWallet(userId: number, symbol: string, balance: string, locked: string) {
  const [coin] = await db.select({ id: coinsTable.id }).from(coinsTable).where(eq(coinsTable.symbol, symbol)).limit(1);
  if (!coin) return;
  const [existing] = await db.select({ id: walletsTable.id }).from(walletsTable)
    .where(and(eq(walletsTable.userId, userId), eq(walletsTable.walletType, "spot"), eq(walletsTable.coinId, coin.id)))
    .limit(1);
  if (existing) {
    await db.update(walletsTable).set({ balance, locked, updatedAt: new Date() })
      .where(eq(walletsTable.id, existing.id));
  } else {
    await db.insert(walletsTable).values({ userId, walletType: "spot", coinId: coin.id, balance, locked });
  }
}

function serializePlan(p: any, investors = 0) {
  return {
    id: p.id, name: p.name, description: p.description ?? null,
    dailyReturnPercent: parseFloat(p.dailyReturnPercent),
    minInvestment: parseFloat(p.minInvestment), maxInvestment: parseFloat(p.maxInvestment),
    durationDays: p.durationDays, riskLevel: p.riskLevel,
    isActive: p.isActive, totalInvestors: investors,
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
  };
}

function serializeSub(s: any, plan: any) {
  const invested = parseFloat(s.investedAmount);
  const dailyPct = parseFloat(plan.dailyReturnPercent);
  const noExpire = s.expiresAt == null;
  // Authoritative earnings come from the credit engine (persisted on the row).
  // Using the stored value freezes accrual when a bot is stopped/completed,
  // instead of growing forever from elapsed wall-clock time.
  const totalEarned = parseFloat(s.totalEarned ?? "0");
  return {
    id: s.id, planId: s.planId, planName: plan.name, riskLevel: plan.riskLevel,
    investedAmount: invested, currentValue: parseFloat((invested + totalEarned).toFixed(2)),
    startedAt: s.startedAt instanceof Date ? s.startedAt.toISOString() : s.startedAt,
    expiresAt: s.expiresAt instanceof Date ? s.expiresAt.toISOString() : (s.expiresAt ?? null),
    noExpire,
    durationDays: plan.durationDays,
    dailyReturnPercent: dailyPct,
    status: s.status, totalEarned: parseFloat(totalEarned.toFixed(2)),
    dailyReturn: parseFloat((invested * dailyPct / 100).toFixed(2)),
  };
}

/* ── routes ── */

router.get("/rates", (_req, res): void => {
  res.json({ inrRate: getInrRate() });
});

router.get("/ai-trading/plans", async (_req, res): Promise<void> => {
  const plans = await db.select().from(aiTradingPlansTable)
    .where(eq(aiTradingPlansTable.isActive, true))
    .orderBy(desc(aiTradingPlansTable.dailyReturnPercent));
  const out = await Promise.all(plans.map(async p => {
    const [r] = await db.select({ count: count() }).from(aiTradingSubscriptionsTable)
      .where(and(eq(aiTradingSubscriptionsTable.planId, p.id), eq(aiTradingSubscriptionsTable.status, "active")));
    return serializePlan(p, r.count);
  }));
  res.json(out);
});

router.get("/ai-trading/subscriptions", requireAuth, async (req, res): Promise<void> => {
  const subs = await db.select().from(aiTradingSubscriptionsTable)
    .where(eq(aiTradingSubscriptionsTable.userId, req.user!.id))
    .orderBy(desc(aiTradingSubscriptionsTable.createdAt));
  const out = await Promise.all(subs.map(async s => {
    const [plan] = await db.select().from(aiTradingPlansTable).where(eq(aiTradingPlansTable.id, s.planId));
    return plan ? serializeSub(s, plan) : null;
  }));
  res.json(out.filter(Boolean));
});

router.get("/ai-trading/earnings", requireAuth, async (req, res): Promise<void> => {
  const limit  = Math.min(100, parseInt(req.query.limit  as string ?? "50", 10) || 50);
  const offset =               parseInt(req.query.offset as string ?? "0",  10) || 0;
  const rows = await db.select().from(aiTradingEarningsTable)
    .where(eq(aiTradingEarningsTable.userId, req.user!.id))
    .orderBy(desc(aiTradingEarningsTable.creditedAt))
    .limit(limit).offset(offset);
  const [{ total }] = await db.select({ total: count() }).from(aiTradingEarningsTable)
    .where(eq(aiTradingEarningsTable.userId, req.user!.id));
  res.json({
    earnings: rows.map(r => ({
      id:             r.id,
      subscriptionId: r.subscriptionId,
      planName:       r.planName,
      amountUsdt:     parseFloat(r.amountUsdt),
      creditedAt:     r.creditedAt instanceof Date ? r.creditedAt.toISOString() : r.creditedAt,
    })),
    total,
    limit,
    offset,
  });
});

router.post("/ai-trading/subscribe", requireAuth, async (req, res): Promise<void> => {
  const { planId, amount, currency, noExpire } = req.body;
  if (!planId || !amount || amount <= 0) { res.status(400).json({ error: "Invalid input" }); return; }

  const [plan] = await db.select().from(aiTradingPlansTable)
    .where(and(eq(aiTradingPlansTable.id, planId), eq(aiTradingPlansTable.isActive, true)));
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }

  const min = parseFloat(plan.minInvestment), max = parseFloat(plan.maxInvestment);
  // No-expire bots run indefinitely until the user stops them.
  const expiresAt = noExpire ? null : new Date(Date.now() + plan.durationDays * 86400000);
  const userId = req.user!.id;

  if (currency === "INR") {
    const inrRate   = getInrRate();
    const usdtEquiv = amount / inrRate;
    if (usdtEquiv < min || usdtEquiv > max) {
      res.status(400).json({ error: `USDT equivalent must be between $${min}–$${max} (₹${(min * inrRate).toFixed(0)}–₹${(max * inrRate).toFixed(0)})` });
      return;
    }
    const inrWallet = await getSpotWallet(userId, "INR");
    const inrAvail  = parseFloat(inrWallet?.balance ?? "0");
    if (inrAvail < amount) {
      res.status(400).json({ error: `Insufficient INR balance. Need ₹${amount.toFixed(2)}, have ₹${inrAvail.toFixed(2)}` });
      return;
    }
    await upsertSpotWallet(userId, "INR",
      String(inrAvail - amount),
      String(parseFloat(inrWallet?.locked ?? "0") + amount));

    const usdtWallet = await getSpotWallet(userId, "USDT");
    await upsertSpotWallet(userId, "USDT",
      usdtWallet?.balance ?? "0",
      String(parseFloat(usdtWallet?.locked ?? "0") + usdtEquiv));

    const [sub] = await db.insert(aiTradingSubscriptionsTable).values({
      userId, planId,
      investedAmount: String(usdtEquiv.toFixed(8)),
      expiresAt, status: "active", totalEarned: "0",
    }).returning();
    res.status(201).json(serializeSub(sub, plan));
    return;
  }

  if (amount < min || amount > max) { res.status(400).json({ error: `Amount must be between $${min} and $${max}` }); return; }
  const wallet = await getSpotWallet(userId, "USDT");
  const avail  = parseFloat(wallet?.balance ?? "0");
  if (avail < amount) { res.status(400).json({ error: "Insufficient USDT balance" }); return; }
  await upsertSpotWallet(userId, "USDT",
    String(avail - amount),
    String(parseFloat(wallet?.locked ?? "0") + amount));

  const [sub] = await db.insert(aiTradingSubscriptionsTable).values({
    userId, planId, investedAmount: String(amount),
    expiresAt, status: "active", totalEarned: "0",
  }).returning();

  if (wallet?.coinId) {
    await db.insert(walletLedgerTable).values({
      userId, coinId: wallet.coinId, walletType: "spot", type: "ai_principal_lock",
      amount: String(-amount), balanceBefore: wallet.balance, balanceAfter: String(avail - amount),
      refType: "ai_subscription", refId: String(sub.id), note: `AI plan: ${plan.name}`,
    });
  }

  res.status(201).json(serializeSub(sub, plan));
});

router.post("/ai-trading/subscriptions/:id/cancel", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  const userId = req.user!.id;
  const [sub] = await db.select().from(aiTradingSubscriptionsTable)
    .where(and(eq(aiTradingSubscriptionsTable.id, id), eq(aiTradingSubscriptionsTable.userId, userId)));
  if (!sub || sub.status !== "active") { res.status(404).json({ error: "Not found" }); return; }
  const invested    = parseFloat(sub.investedAmount);
  const wallet      = await getSpotWallet(userId, "USDT");
  const balBefore   = wallet?.balance ?? "0";
  await upsertSpotWallet(userId, "USDT",
    String(parseFloat(balBefore) + invested),
    String(Math.max(0, parseFloat(wallet?.locked ?? "0") - invested)));
  await db.update(aiTradingSubscriptionsTable).set({ status: "cancelled" })
    .where(eq(aiTradingSubscriptionsTable.id, id));

  if (wallet?.coinId) {
    await db.insert(walletLedgerTable).values({
      userId, coinId: wallet.coinId, walletType: "spot", type: "ai_principal_return",
      amount: String(invested), balanceBefore: balBefore, balanceAfter: String(parseFloat(balBefore) + invested),
      refType: "ai_subscription", refId: String(id), note: "AI plan cancelled — principal returned",
    });
  }

  res.json({ success: true });
});

/* ── Invoice / statement for an AI-trading bot subscription ──
 * Covers the full lifecycle of one bot: the BUY (principal invested),
 * its current STATUS (active / cancelled / completed) and realized
 * PROFIT & LOSS (total earned, TDS on profit, net). Returns figures in
 * both USDT and INR, mirroring the spot order invoice. */
router.get("/ai-trading/subscriptions/:id/invoice", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid subscription id" }); return; }
  const userId = req.user!.id;

  const [sub] = await db.select().from(aiTradingSubscriptionsTable)
    .where(and(eq(aiTradingSubscriptionsTable.id, id), eq(aiTradingSubscriptionsTable.userId, userId))).limit(1);
  if (!sub) { res.status(404).json({ error: "Subscription not found" }); return; }

  const [plan] = await db.select().from(aiTradingPlansTable).where(eq(aiTradingPlansTable.id, sub.planId)).limit(1);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const [{ payouts }] = await db.select({ payouts: count() }).from(aiTradingEarningsTable)
    .where(and(eq(aiTradingEarningsTable.subscriptionId, id), eq(aiTradingEarningsTable.userId, userId)));

  const principalUsdt   = parseFloat(sub.investedAmount);
  const grossProfitUsdt = parseFloat(sub.totalEarned ?? "0");
  const tdsUsdt         = grossProfitUsdt > 0 ? +(grossProfitUsdt * AI_TDS_RATE).toFixed(8) : 0;
  const netProfitUsdt   = +(grossProfitUsdt - tdsUsdt).toFixed(8);
  const roiPct          = principalUsdt > 0 ? +((grossProfitUsdt / principalUsdt) * 100).toFixed(2) : 0;
  // Principal is returned to the wallet only once the bot is no longer active.
  const principalReturned = sub.status !== "active";
  const payoutUsdt        = +((principalReturned ? principalUsdt : 0) + netProfitUsdt).toFixed(8);

  const inrRate = getInrRate();
  const toInr   = (v: number) => +(v * inrRate).toFixed(2);
  const iso     = (d: any) => (d instanceof Date ? d.toISOString() : (d ?? null));

  const statusLabel =
    sub.status === "cancelled" ? "Bot Stopped (Cancelled)" :
    sub.status === "completed" ? "Bot Completed (Matured)"  :
    "Bot Active";

  res.json({
    invoiceNo: `AIT-${String(sub.id).padStart(8, "0")}`,
    issuedAt:  new Date().toISOString(),
    type:      "ai_trading",
    exchange: {
      name:  COMPANY_NAME,
      short: COMPANY_SHORT,
      legal: `${COMPANY_NAME} — AI Trading Statement & Tax Invoice`,
      cin:   COMPANY_CIN,
      gst:   COMPANY_GST,
      address: COMPANY_ADDRESS,
    },
    user: {
      id:    user?.id,
      name:  user?.name ?? user?.email ?? "Customer",
      email: user?.email ?? "",
    },
    bot: {
      subscriptionId:     sub.id,
      planName:           plan?.name ?? "AI Trading Bot",
      riskLevel:          plan?.riskLevel ?? null,
      dailyReturnPercent: plan ? parseFloat(plan.dailyReturnPercent) : null,
      durationDays:       plan?.durationDays ?? null,
      status:             sub.status,
      statusLabel,
      payouts,
      startedAt:          iso(sub.startedAt),
      expiresAt:          iso(sub.expiresAt),
      lastCreditedAt:     iso(sub.lastCreditedAt),
    },
    charges: {
      tdsEnabled: true,
      tdsRatePct: AI_TDS_RATE * 100,
      tdsNote:    "TDS applies on realized profit only",
    },
    totals: {
      principalUsdt:    +principalUsdt.toFixed(8),
      grossProfitUsdt:  +grossProfitUsdt.toFixed(8),
      tdsUsdt,
      netProfitUsdt,
      principalReturned,
      payoutUsdt,
      roiPct,
      principalInr:   toInr(principalUsdt),
      grossProfitInr: toInr(grossProfitUsdt),
      tdsInr:         toInr(tdsUsdt),
      netProfitInr:   toInr(netProfitUsdt),
      payoutInr:      toInr(payoutUsdt),
      inrRate,
    },
    legend: grossProfitUsdt >= 0
      ? "Net Profit = Gross Profit − TDS. Payout = Returned Principal + Net Profit."
      : "Loss recorded on this bot. Net = Gross Profit (no TDS on losses).",
  });
});

export default router;
