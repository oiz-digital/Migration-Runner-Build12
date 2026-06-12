import { Router, type IRouter } from "express";
import { eq, and, gte, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db, ordersTable, tradesTable, pairsTable, coinsTable, usersTable, settingsTable } from "@workspace/db";
import { requireAuth, optionalAuth, requireRole } from "../middlewares/auth";
import { logAdminAction } from "../lib/audit";

const router: IRouter = Router();

export interface VipTier {
  level: number; name: string; minVolume: number;
  spotMaker: number; spotTaker: number;
  futuresMaker: number; futuresTaker: number;
  /** Convert flow fee % (flat, no GST overlay) charged on the OUT side. */
  convertFee: number;
  withdrawDiscount: number;
}

export const DEFAULT_VIP_TIERS: VipTier[] = [
  { level: 0, name: "Regular", minVolume: 0,        spotMaker: 0.20, spotTaker: 0.25, futuresMaker: 0.05, futuresTaker: 0.07, convertFee: 0.300, withdrawDiscount: 0 },
  { level: 1, name: "VIP 1",   minVolume: 100000,   spotMaker: 0.16, spotTaker: 0.20, futuresMaker: 0.04, futuresTaker: 0.06, convertFee: 0.250, withdrawDiscount: 5 },
  { level: 2, name: "VIP 2",   minVolume: 500000,   spotMaker: 0.12, spotTaker: 0.15, futuresMaker: 0.03, futuresTaker: 0.05, convertFee: 0.200, withdrawDiscount: 10 },
  { level: 3, name: "VIP 3",   minVolume: 2500000,  spotMaker: 0.08, spotTaker: 0.10, futuresMaker: 0.02, futuresTaker: 0.04, convertFee: 0.150, withdrawDiscount: 15 },
  { level: 4, name: "VIP 4",   minVolume: 10000000, spotMaker: 0.06, spotTaker: 0.08, futuresMaker: 0.015,futuresTaker: 0.03, convertFee: 0.100, withdrawDiscount: 20 },
  { level: 5, name: "VIP 5",   minVolume: 50000000, spotMaker: 0.04, spotTaker: 0.06, futuresMaker: 0.01, futuresTaker: 0.025,convertFee: 0.075, withdrawDiscount: 25 },
];

const TIERS_KEY = "fees.vip_tiers";

export async function loadVipTiers(): Promise<VipTier[]> {
  try {
    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, TIERS_KEY)).limit(1);
    if (row?.value) {
      const arr = JSON.parse(row.value);
      if (Array.isArray(arr) && arr.length > 0 && arr.every((t: any) => typeof t.level === "number")) {
        // Backfill convertFee for tiers persisted before this field existed.
        const sorted = (arr as VipTier[]).sort((a, b) => a.level - b.level);
        return sorted.map((t) => {
          if (typeof t.convertFee === "number" && Number.isFinite(t.convertFee) && t.convertFee >= 0) return t;
          const def = DEFAULT_VIP_TIERS.find((d) => d.level === t.level);
          return { ...t, convertFee: def?.convertFee ?? 0.30 };
        });
      }
    }
  } catch (e) { /* fallthrough */ }
  return DEFAULT_VIP_TIERS;
}

// Back-compat re-export (kept for any imports of VIP_TIERS — now async source)
export const VIP_TIERS = DEFAULT_VIP_TIERS;

export interface FeeSettings {
  spotFeePercent: number;       // base spot fee % override (0 = use VIP tier)
  spotGstPercent: number;       // GST applied on spot fee
  tdsPercent: number;           // TDS % on sell quote received
  futuresFeePercent: number;
  futuresGstPercent: number;
  referralCommission: number;
}
const DEFAULT_FEE_SETTINGS: FeeSettings = {
  spotFeePercent: 0, spotGstPercent: 18, tdsPercent: 1,
  futuresFeePercent: 0, futuresGstPercent: 18, referralCommission: 20,
};
export async function loadFeeSettings(): Promise<FeeSettings> {
  try {
    const keys = ["spot.fee_percent","spot.gst_percent","tds.percent","futures.fee_percent","futures.gst_percent","referral.commission"];
    const rows = await db.select().from(settingsTable);
    const map = new Map(rows.map(r => [r.key, r.value]));
    const num = (k: string, d: number) => { const v = map.get(k); const n = v ? Number(v) : NaN; return Number.isFinite(n) ? n : d; };
    return {
      spotFeePercent: num("spot.fee_percent", DEFAULT_FEE_SETTINGS.spotFeePercent),
      spotGstPercent: num("spot.gst_percent", DEFAULT_FEE_SETTINGS.spotGstPercent),
      tdsPercent: num("tds.percent", DEFAULT_FEE_SETTINGS.tdsPercent),
      futuresFeePercent: num("futures.fee_percent", DEFAULT_FEE_SETTINGS.futuresFeePercent),
      futuresGstPercent: num("futures.gst_percent", DEFAULT_FEE_SETTINGS.futuresGstPercent),
      referralCommission: num("referral.commission", DEFAULT_FEE_SETTINGS.referralCommission),
    };
  } catch { return DEFAULT_FEE_SETTINGS; }
}

/** Compute effective spot maker/taker rates (as fractions, e.g. 0.0025) including GST.
 *  feeRate = max(VIP tier rate, admin spot.fee_percent override) × (1 + gst%/100)
 *  Returned values are multiplied directly on notional. TDS is separate (sell only). */
export async function getSpotFeeRates(vipTier: number): Promise<{ maker: number; taker: number; tds: number; gstPercent: number }> {
  const tiers = await loadVipTiers();
  const settings = await loadFeeSettings();
  const t = tiers[Math.max(0, Math.min(tiers.length - 1, vipTier ?? 0))] ?? tiers[0];
  const baseMaker = Math.max(t.spotMaker, settings.spotFeePercent) / 100;
  const baseTaker = Math.max(t.spotTaker, settings.spotFeePercent) / 100;
  const gstMul = 1 + settings.spotGstPercent / 100;
  return {
    maker: baseMaker * gstMul,
    taker: baseTaker * gstMul,
    tds: settings.tdsPercent / 100,
    gstPercent: settings.spotGstPercent,
  };
}

router.get("/fees/tiers", async (_req, res) => { res.json(await loadVipTiers()); });

/**
 * Resolve the effective convert fee rate for a user's VIP tier. Pure read
 * — kept here (next to the spot/futures resolvers) so all three fee paths
 * share one source of truth: the JSON tier ladder in `app_settings`.
 *
 * Returns the rate as a fraction (e.g. 0.003 = 0.30%) plus the same value
 * in basis points so the UI can display "30 bps" without re-converting.
 */
export async function getConvertFeeRate(vipTier: number): Promise<{ rate: number; bps: number; tier: VipTier }> {
  const tiers = await loadVipTiers();
  const idx = Math.max(0, Math.min(tiers.length - 1, vipTier ?? 0));
  const t = tiers[idx] ?? tiers[0];
  const pct = Number(t.convertFee ?? 0);
  const safe = Number.isFinite(pct) && pct >= 0 ? pct : 0;
  return { rate: safe / 100, bps: Math.round(safe * 100), tier: t };
}

// ─── Admin: edit the VIP tier matrix (audit-logged) ──────────────────────

const AdminTierSchema = z.object({
  level: z.number().int().min(0).max(50),
  name: z.string().trim().min(1).max(40),
  minVolume: z.number().min(0).max(1e15),
  spotMaker: z.number().min(0).max(5),
  spotTaker: z.number().min(0).max(5),
  futuresMaker: z.number().min(0).max(5),
  futuresTaker: z.number().min(0).max(5),
  convertFee: z.number().min(0).max(5),
  withdrawDiscount: z.number().min(0).max(100),
});
const AdminTiersBody = z.object({
  tiers: z.array(AdminTierSchema).min(1).max(20),
});

router.get("/admin/fees/tiers", requireAuth, requireRole("admin", "superadmin"), async (req, res): Promise<void> => {
  req.log.debug({ userId: req.user!.id }, "admin list vip tiers");
  res.json(await loadVipTiers());
});

router.put("/admin/fees/tiers", requireAuth, requireRole("admin", "superadmin"), async (req, res): Promise<void> => {
  const parsed = AdminTiersBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid tiers payload" });
    return;
  }
  // Ensure tiers form a strictly-increasing ladder (level + minVolume) so the
  // resolver's "find by index" logic stays predictable.
  const sorted = [...parsed.data.tiers].sort((a, b) => a.level - b.level);
  const levels = new Set<number>();
  for (let i = 0; i < sorted.length; i++) {
    if (levels.has(sorted[i].level)) {
      res.status(400).json({ error: `Duplicate level ${sorted[i].level}` }); return;
    }
    levels.add(sorted[i].level);
    if (i > 0 && sorted[i].minVolume < sorted[i - 1].minVolume) {
      res.status(400).json({ error: "minVolume must be non-decreasing across tiers" }); return;
    }
  }
  const value = JSON.stringify(sorted);
  await db.insert(settingsTable).values({ key: TIERS_KEY, value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: new Date() } });
  await logAdminAction(req, {
    action: "fees.tiers.update",
    entity: "vip_tiers",
    payload: { count: sorted.length, levels: sorted.map((t) => t.level) },
  });
  res.json({ ok: true, tiers: sorted });
});

router.get("/fees/my", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const since = new Date(Date.now() - 30 * 86400_000);

  // Volume in quote currency. Sum per quote coin then convert to USDT-ish using current price of quote.
  // Simpler: sum (price*qty) grouped by quoteCoinId, multiply by quote.currentPrice (USDT).
  const rows = await db
    .select({
      quoteSymbol: coinsTable.symbol,
      quotePrice: coinsTable.currentPrice,
      vol: sql<string>`COALESCE(SUM(${tradesTable.price} * ${tradesTable.qty}), '0')`,
      feeQuote: sql<string>`COALESCE(SUM(${tradesTable.fee}), '0')`,
    })
    .from(tradesTable)
    .innerJoin(pairsTable, eq(tradesTable.pairId, pairsTable.id))
    .innerJoin(coinsTable, eq(pairsTable.quoteCoinId, coinsTable.id))
    // SECURITY/CORRECTNESS: bot-originated trades must NOT inflate a real user's
    // 30-day VIP volume — a user that happens to share an id with the bot would
    // otherwise jump tiers based on synthetic liquidity they never produced.
    .where(and(
      eq(tradesTable.userId, userId),
      gte(tradesTable.createdAt, since),
      sql`NOT EXISTS (SELECT 1 FROM ${ordersTable} WHERE ${ordersTable.id} = ${tradesTable.orderId} AND ${ordersTable.isBot} = 1)`,
    ))
    .groupBy(coinsTable.symbol, coinsTable.currentPrice);

  let volumeUsdt = 0, totalFeeUsdt = 0;
  for (const r of rows) {
    const px = r.quoteSymbol === "USDT" ? 1 : Number(r.quotePrice) || 0;
    volumeUsdt += Number(r.vol) * px;
    totalFeeUsdt += Number(r.feeQuote) * px;
  }

  // Find tier — ladder using user vipTier (admin-overridable) max with volume-based
  const tiers = await loadVipTiers();
  const [u] = await db.select({ vipTier: usersTable.vipTier }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const adminTier = u?.vipTier ?? 0;
  const volTier = [...tiers].reverse().find(t => volumeUsdt >= t.minVolume) ?? tiers[0];
  const finalTier = adminTier >= volTier.level ? tiers[adminTier] ?? volTier : volTier;

  res.json({
    volume30dUsdt: +volumeUsdt.toFixed(2),
    totalFeesUsdt: +totalFeeUsdt.toFixed(4),
    currentTier: finalTier,
    nextTier: tiers[finalTier.level + 1] ?? null,
    tiers,
  });
});

/**
 * Live fee/GST/TDS quote for the trading form. Public so the form can render
 * the breakdown before the user is logged in (still uses tier 0 for guests).
 *
 * Query: side=buy|sell, notional=number (qty * price in QUOTE units)
 * Returns: { feeRate, feePercent, gstPercent, tdsPercent, fee, gstAmount, tds,
 *           totalDeducted, netReceive, vipTier }
 *
 * For SELL: trader receives `notional - fee - tds`
 * For BUY:  trader pays    `notional + fee` (TDS not applied on buy side)
 */
router.get("/fees/quote", optionalAuth, async (req, res): Promise<void> => {
  const side = String(req.query.side || "sell").toLowerCase();
  const orderType = String(req.query.type || "market").toLowerCase();
  const notional = Math.max(0, Number(req.query.notional) || 0);
  let vipTier = 0;
  try {
    const userId = (req as any).user?.id;
    if (userId) {
      const [u] = await db.select({ vipTier: usersTable.vipTier }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      vipTier = u?.vipTier ?? 0;
    }
  } catch { /* tier 0 */ }

  const rates = await getSpotFeeRates(vipTier);
  // Limit orders rest in the book → maker rate; market/stop orders cross →
  // taker rate. Both already include GST multiplier from getSpotFeeRates.
  const feeRate = orderType === "limit" ? rates.maker : rates.taker;
  const fee = notional * feeRate;
  const gstMul = 1 + rates.gstPercent / 100;
  const baseFeeRate = feeRate / gstMul; // GST-exclusive trading fee rate
  const baseFee = fee / gstMul;
  const gstAmount = fee - baseFee;
  const tds = side === "sell" ? notional * rates.tds : 0;
  const totalDeducted = fee + tds;
  const netReceive = side === "sell" ? notional - totalDeducted : notional + fee;

  res.json({
    side,
    type: orderType,
    notional: +notional.toFixed(8),
    vipTier,
    feeRate,
    feePercent: +(feeRate * 100).toFixed(4),       // GST-inclusive (matches `fee`)
    baseFeePercent: +(baseFeeRate * 100).toFixed(4), // GST-exclusive (matches `baseFee`)
    gstPercent: rates.gstPercent,
    tdsPercent: +(rates.tds * 100).toFixed(4),
    baseFee: +baseFee.toFixed(8),
    gstAmount: +gstAmount.toFixed(8),
    fee: +fee.toFixed(8),
    tds: +tds.toFixed(8),
    totalDeducted: +totalDeducted.toFixed(8),
    netReceive: +netReceive.toFixed(8),
  });
});

export default router;
