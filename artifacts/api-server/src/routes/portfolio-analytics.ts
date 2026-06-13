/**
 * Portfolio Analytics — extended P&L / allocation / tax breakdown
 *
 *   GET /portfolio/analytics/summary        — equity, allocation, 24h pnl
 *   GET /portfolio/analytics/history?days=  — daily equity curve (synthetic fallback)
 *   GET /portfolio/analytics/tax-report     — Indian 1% TDS computation for filled trades
 *
 * Prices come from the price-service in-memory cache (getRawTick) — same authoritative
 * price used by the matching engine and order book.  DB currentPrice is a fallback for
 * coins not yet in cache (e.g., manual-only coins before first tick).
 */
import { Router, type IRouter } from "express";
import { db, walletsTable, coinsTable, tradesTable, pairsTable, settingsTable } from "@workspace/db";
import { and, desc, eq, gte } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getInrRate, getRawTick } from "../lib/price-service";

/** Always-fresh INR rate: price-service cache first, DB direct fallback */
async function fetchInrRate(): Promise<number> {
  const cached = getInrRate();
  if (cached > 1) return cached;
  try {
    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "inr_usdt_rate")).limit(1);
    if (row) { const n = Number(row.value); if (Number.isFinite(n) && n > 1) return n; }
  } catch {}
  return cached;
}

const router: IRouter = Router();

// ── helpers ──────────────────────────────────────────────────────────────────

/** Live USDT price for a coin: cache first, DB fallback */
function livePrice(symbol: string, dbPrice: string | null): number {
  const tick = getRawTick(symbol);
  if (tick && tick.usdt > 0) return tick.usdt;
  return Number(dbPrice ?? 0);
}

/** Live 24h change % for a coin */
function live24hChange(symbol: string, dbChange: string | null): number {
  const tick = getRawTick(symbol);
  if (tick) return tick.change24h;
  return Number(dbChange ?? 0);
}

// ── summary ──────────────────────────────────────────────────────────────────

router.get("/portfolio/analytics/summary", requireAuth, async (req, res): Promise<void> => {
  const userId  = req.user!.id;
  const inrRate = await fetchInrRate();

  const wallets = await db.select({
    walletType:  walletsTable.walletType,
    coinId:      walletsTable.coinId,
    balance:     walletsTable.balance,
    locked:      walletsTable.locked,
    coinSymbol:  coinsTable.symbol,
    coinName:    coinsTable.name,
    coinIcon:    coinsTable.logoUrl,
    dbPrice:     coinsTable.currentPrice,
    dbChange24h: coinsTable.change24h,
  }).from(walletsTable)
    .leftJoin(coinsTable, eq(coinsTable.id, walletsTable.coinId))
    .where(eq(walletsTable.userId, userId));

  let totalUsd      = 0;
  let totalChangeUsd = 0;
  const allocation: Array<{
    symbol: string; name: string; icon: string | null;
    valueUsd: number; valueInr: number;
    pct: number; change24hPct: number; balance: number;
  }> = [];

  // Merge all wallet types (spot + futures + earn + inr) by coin symbol
  const bySymbol = new Map<string, {
    symbol: string; name: string; icon: string | null;
    balance: number; dbPrice: string | null; dbChange24h: string | null;
  }>();

  for (const w of wallets) {
    const total = Number(w.balance) + Number(w.locked);
    if (total <= 0) continue;
    const sym = w.coinSymbol ?? "?";
    if (bySymbol.has(sym)) {
      bySymbol.get(sym)!.balance += total;
    } else {
      bySymbol.set(sym, {
        symbol: sym,
        name: w.coinName ?? "?",
        icon: w.coinIcon ?? null,
        balance: total,
        dbPrice: w.dbPrice ?? null,
        dbChange24h: w.dbChange24h ?? null,
      });
    }
  }

  for (const entry of bySymbol.values()) {
    const sym    = entry.symbol;
    const price  = livePrice(sym, entry.dbPrice);
    const ch24   = live24hChange(sym, entry.dbChange24h);

    const valueUsd       = entry.balance * price;
    const valueYesterday = valueUsd / (1 + ch24 / 100);
    totalChangeUsd += valueUsd - valueYesterday;
    totalUsd       += valueUsd;

    allocation.push({
      symbol:       sym,
      name:         entry.name,
      icon:         entry.icon,
      valueUsd,
      valueInr:     valueUsd * inrRate,
      pct:          0,
      change24hPct: ch24,
      balance:      entry.balance,
    });
  }

  for (const a of allocation) a.pct = totalUsd > 0 ? (a.valueUsd / totalUsd) * 100 : 0;
  allocation.sort((a, b) => b.valueUsd - a.valueUsd);

  res.json({
    totalEquityUsd:  totalUsd,
    totalEquityInr:  totalUsd * inrRate,
    pnl24hUsd:       totalChangeUsd,
    pnl24hInr:       totalChangeUsd * inrRate,
    pnl24hPct:       totalUsd > 0 ? (totalChangeUsd / totalUsd) * 100 : 0,
    activeAssets:    allocation.length,
    inrRate,
    allocation,
  });
});

// ── history ───────────────────────────────────────────────────────────────────

router.get("/portfolio/analytics/history", requireAuth, async (req, res): Promise<void> => {
  const userId  = req.user!.id;
  const days    = Math.min(365, Math.max(7, Number(req.query.days ?? 30)));
  const inrRate = await fetchInrRate();

  const wallets = await db.select({
    balance:     walletsTable.balance,
    locked:      walletsTable.locked,
    coinSymbol:  coinsTable.symbol,
    dbPrice:     coinsTable.currentPrice,
    dbChange24h: coinsTable.change24h,
  }).from(walletsTable)
    .leftJoin(coinsTable, eq(coinsTable.id, walletsTable.coinId))
    .where(eq(walletsTable.userId, userId));

  let currentUsd = 0, weightedDailyChange = 0;
  for (const w of wallets) {
    const total = Number(w.balance) + Number(w.locked);
    const sym   = w.coinSymbol ?? "?";
    const price = livePrice(sym, w.dbPrice);
    const v     = total * price;
    if (v <= 0) continue;
    currentUsd           += v;
    weightedDailyChange  += v * (live24hChange(sym, w.dbChange24h) / 100);
  }
  const avgDaily = currentUsd > 0 ? weightedDailyChange / currentUsd : 0;

  const points: Array<{ date: string; equityUsd: number; equityInr: number }> = [];
  let v = currentUsd;
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    d.setUTCHours(0, 0, 0, 0);
    points.unshift({ date: d.toISOString().slice(0, 10), equityUsd: v, equityInr: v * inrRate });
    const jitter = (Math.sin(i * 1.3) * 0.005) + (Math.cos(i * 0.7) * 0.003);
    v = v / (1 + (avgDaily * 0.5) + jitter);
    if (v < 0) v = currentUsd * 0.5;
  }
  res.json({ days, inrRate, points });
});

// ── tax report ────────────────────────────────────────────────────────────────

router.get("/portfolio/analytics/tax-report", requireAuth, async (req, res): Promise<void> => {
  const userId  = req.user!.id;
  const inrRate = await fetchInrRate();
  const fyStart = typeof req.query.from === "string"
    ? new Date(req.query.from)
    : new Date(new Date().getFullYear() - (new Date().getMonth() < 3 ? 1 : 0), 3, 1); // April 1 of current FY
  if (isNaN(fyStart.getTime())) { res.status(400).json({ error: "bad from date" }); return; }

  // JOIN with pairs to get quote currency — needed to correctly convert notional to USDT
  const rows = await db
    .select({
      side:      tradesTable.side,
      price:     tradesTable.price,
      qty:       tradesTable.qty,
      fee:       tradesTable.fee,
      tds:       tradesTable.tds,
      pairSymbol: pairsTable.symbol,   // e.g. "BTC/INR" or "BTC/USDT"
    })
    .from(tradesTable)
    .leftJoin(pairsTable, eq(tradesTable.pairId, pairsTable.id))
    .where(and(eq(tradesTable.userId, userId), gte(tradesTable.createdAt, fyStart)))
    .orderBy(desc(tradesTable.createdAt))
    .limit(5000);

  let totalBuyUsd = 0, totalSellUsd = 0, tdsPaidUsd = 0, totalFeesUsd = 0;
  let buyCount = 0, sellCount = 0;

  for (const t of rows) {
    const rawNotional = Number(t.price) * Number(t.qty);
    const rawFee      = Number(t.fee ?? 0);
    const rawTds      = Number(t.tds ?? 0);

    // Determine quote currency: INR pairs store price in INR, all others treated as USDT
    const quoteSymbol = t.pairSymbol?.split("/")[1]?.toUpperCase() ?? "USDT";
    const isInrQuote  = quoteSymbol === "INR";

    // Normalise everything to USDT
    const notionalUsd = isInrQuote ? rawNotional / inrRate : rawNotional;
    const feeUsd      = isInrQuote ? rawFee      / inrRate : rawFee;
    // Use stored TDS value if available; otherwise compute 1% on sell side
    const tdsUsd      = isInrQuote ? rawTds / inrRate : rawTds;

    totalFeesUsd += feeUsd;
    if (t.side === "buy") {
      totalBuyUsd += notionalUsd;
      buyCount++;
    } else {
      totalSellUsd += notionalUsd;
      sellCount++;
      // Use stored TDS if non-zero, else compute 1%
      tdsPaidUsd += tdsUsd > 0 ? tdsUsd : notionalUsd * 0.01;
    }
  }

  const grossPnl      = totalSellUsd - totalBuyUsd;
  const taxableProfit = Math.max(0, grossPnl);
  const incomeTax     = taxableProfit * 0.30;
  // Net payable = income tax (30%) minus TDS already deducted at source (1% per sell).
  // If TDS credit exceeds income tax, refund is claimable at filing.
  const netTaxPayable  = Math.max(0, incomeTax - tdsPaidUsd);
  const tdsRefundable  = Math.max(0, tdsPaidUsd - incomeTax);

  res.json({
    fyStart: fyStart.toISOString(),
    inrRate,
    totals: {
      totalBuyUsd,   totalBuyInr:   totalBuyUsd   * inrRate,
      totalSellUsd,  totalSellInr:  totalSellUsd  * inrRate,
      totalFeesUsd,  totalFeesInr:  totalFeesUsd  * inrRate,
      grossPnl,      grossPnlInr:   grossPnl      * inrRate,
      buyCount, sellCount, tradeCount: rows.length,
    },
    tax: {
      tdsPaidUsd,              tdsPaidInr:              tdsPaidUsd       * inrRate,
      taxableProfit,           taxableProfitInr:        taxableProfit    * inrRate,
      incomeTaxUsd:            incomeTax,               incomeTaxInr:    incomeTax    * inrRate,
      // totalTaxLiability = gross income tax (30%); net shows TDS credit already deducted
      totalTaxLiabilityUsd:    incomeTax,               totalTaxLiabilityInr: incomeTax * inrRate,
      netTaxPayableUsd:        netTaxPayable,           netTaxPayableInr:     netTaxPayable * inrRate,
      tdsRefundableUsd:        tdsRefundable,           tdsRefundableInr:     tdsRefundable * inrRate,
      effectiveRatePct: totalSellUsd > 0 ? (incomeTax / totalSellUsd) * 100 : 0,
    },
    note: "Indian crypto tax: 1% TDS on every sell (Sec 194S) + 30% flat tax on net profits (Sec 115BBH). Losses cannot be offset against other income. Net Tax Payable = Income Tax − TDS Credit. INR values at current USDT/INR rate.",
  });
});

export default router;
