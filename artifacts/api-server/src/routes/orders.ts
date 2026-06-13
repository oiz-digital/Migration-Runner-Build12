import { Router, type IRouter } from "express";
import { eq, and, or, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { db, ordersTable, tradesTable, pairsTable, walletsTable, coinsTable, usersTable, settingsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { rZadd, rZrem, rPublish, rLpush, rSet } from "../lib/redis";
import { tryMatch, getDepth, getRecentTrades } from "../lib/matching-engine";
import { getSpotFeeRates, loadFeeSettings } from "./fees";
import { COMPANY_CIN, COMPANY_GST, COMPANY_PAN, COMPANY_ADDRESS } from "../lib/company";
import { creditTradingFeeReferralChain } from "../lib/trading-fee-referral";

// ─── Zod schemas ─────────────────────────────────────────────────────────
// Stricter than the historical placeSpotOrder() guard — we validate types &
// finiteness here so a bad client sees a clean 400 instead of a 500 bubbling
// up from the inner engine. .strict() blocks mass-assignment of fields the
// engine doesn't expect (status, userId, fee overrides, etc).
const PlaceOrderBody = z.object({
  pairId: z.coerce.number().int().positive(),
  side: z.enum(["buy", "sell"]),
  type: z.enum(["limit", "market"]),
  qty: z.coerce.number().finite().positive(),
  price: z.coerce.number().finite().positive().optional(),
}).strict().superRefine((data, ctx) => {
  // Limit orders REQUIRE a price; market orders MUST NOT carry one (otherwise
  // the engine would silently ignore it and the user might think their limit
  // price was respected).
  if (data.type === "limit" && data.price == null) {
    ctx.addIssue({ code: "custom", path: ["price"], message: "price required for limit orders" });
  }
  if (data.type === "market" && data.price != null) {
    ctx.addIssue({ code: "custom", path: ["price"], message: "price not allowed for market orders" });
  }
});

async function pushOrderToRedis(o: any, pair: any, action: "new" | "cancel" | "fill") {
  const symbol = pair?.symbol ?? `pair-${o.pairId}`;
  const score = (o.side === "buy" ? -1 : 1) * Number(o.price);
  const member = JSON.stringify({ id: o.id, userId: o.userId, side: o.side, type: o.type, price: Number(o.price), qty: Number(o.qty), filledQty: Number(o.filledQty ?? 0), status: o.status, ts: Date.now() });
  if (action === "new" && o.status === "open" && o.type === "limit") {
    await rZadd(`orderbook:${symbol}:${o.side}`, score, String(o.id));
    await rSet(`orderbook:${symbol}:order:${o.id}`, member, 86400);
  }
  if (action === "cancel" || action === "fill") {
    await rZrem(`orderbook:${symbol}:${o.side}`, String(o.id));
  }
  await rLpush(`orders:user:${o.userId}`, member);
  await rPublish(`orders.${symbol}`, { action, order: JSON.parse(member) });
  await rPublish(`orders.user.${o.userId}`, { action, order: JSON.parse(member) });
}

async function pushTradeToRedis(trade: any, pair: any) {
  const symbol = pair?.symbol ?? `pair-${trade.pairId}`;
  const payload = JSON.stringify({ id: trade.id, pairId: trade.pairId, side: trade.side, price: Number(trade.price), qty: Number(trade.qty), fee: Number(trade.fee), userId: trade.userId, ts: Date.now() });
  await rLpush(`trades:${symbol}`, payload);
  await rLpush(`trades:user:${trade.userId}`, payload);
  await rPublish(`trades.${symbol}`, JSON.parse(payload));
}

const router: IRouter = Router();

async function ensureWallet(tx: any, userId: number, coinId: number, walletType: string) {
  const [w] = await tx.select().from(walletsTable)
    .where(and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, coinId), eq(walletsTable.walletType, walletType)))
    .for("update").limit(1);
  if (w) return w;
  const [created] = await tx.insert(walletsTable).values({
    userId, coinId, walletType, balance: "0", locked: "0",
  }).returning();
  // Re-lock the just-created row
  const [locked] = await tx.select().from(walletsTable).where(eq(walletsTable.id, created.id)).for("update").limit(1);
  return locked;
}

// SECURITY: User-facing "My Orders" / "My Trades" must NEVER include bot rows.
// Bot orders are inserted under a real user_id (currently the admin's id) so the
// userId scope alone is not enough to keep them out of a user's personal view —
// without an explicit `is_bot = 0` filter, an admin (or any user that shares an
// id with the bot account) would see all market-making bot orders as if they
// placed them. Bot rows remain visible only via the admin endpoints in admin.ts.
router.get("/orders", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const status = (req.query.status as string) || "all";
  const conds = [eq(ordersTable.userId, userId), eq(ordersTable.isBot, 0)];
  if (status !== "all") conds.push(eq(ordersTable.status, status));
  const rows = await db.select().from(ordersTable)
    .where(and(...conds))
    .orderBy(desc(ordersTable.createdAt))
    .limit(200);
  res.json(rows);
});

router.get("/trades", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
  // Optional symbol filter — accepts both "BTCUSDT" and "BTC/USDT" forms so
  // mobile + web can share the same call. Resolve to pairId server-side.
  const symbolRaw = String(req.query.symbol || "").toUpperCase().trim();
  const conds: any[] = [
    eq(tradesTable.userId, userId),
    // tradesTable has no is_bot column; filter via the parent order. NOT EXISTS
    // is faster than a subselect IN (...) because it short-circuits per row.
    sql`NOT EXISTS (SELECT 1 FROM ${ordersTable} WHERE ${ordersTable.id} = ${tradesTable.orderId} AND ${ordersTable.isBot} = 1)`,
  ];
  if (symbolRaw) {
    // Match the pair regardless of whether the DB stores "BTCINR" or "BTC/INR".
    // Strip slashes from BOTH sides at the SQL layer so we don't have to guess
    // the quote-asset length (INR is 3 chars, USDT is 4 — heuristic splitting
    // would mis-cleave 3-char quotes).
    const symCompact = symbolRaw.replace(/\//g, "");
    if (!/^[A-Z0-9]{2,20}$/.test(symCompact)) { res.json([]); return; }
    const [p] = await db.select().from(pairsTable)
      .where(sql`upper(replace(${pairsTable.symbol}, '/', '')) = ${symCompact}`)
      .limit(1);
    if (!p) { res.json([]); return; }
    conds.push(eq(tradesTable.pairId, p.id));
  }
  const rows = await db.select().from(tradesTable)
    .where(and(...conds))
    .orderBy(desc(tradesTable.createdAt))
    .limit(limit);
  res.json(rows);
});

// Per-order fill breakdown — exposes every individual maker fill that
// composed the user's order, so the UI can render a Pro-style "trades
// inside this order" view (VWAP, total fee, per-fill price/qty).
//
// A single market or aggressive limit order can fill across many makers at
// different prices; the matching engine writes one trades row per fill (see
// matching-engine.ts ~L232). This endpoint pulls them back in chronological
// order plus summary aggregates so the client doesn't have to recompute
// VWAP / totals on every render.
router.get("/orders/:id/fills", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const orderId = Number(req.params.id);
  if (!Number.isFinite(orderId) || orderId <= 0) {
    res.status(400).json({ message: "Invalid order id" });
    return;
  }
  // Scope to caller's own orders so a user can't probe another user's fills.
  const [order] = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.userId, userId), eq(ordersTable.isBot, 0)))
    .limit(1);
  if (!order) { res.status(404).json({ message: "Order not found" }); return; }

  const [pair] = await db.select().from(pairsTable).where(eq(pairsTable.id, order.pairId)).limit(1);
  let baseSym = "";
  let quoteSym = "";
  if (pair) {
    const cs = await db.select().from(coinsTable);
    baseSym = cs.find(c => c.id === pair.baseCoinId)?.symbol ?? "";
    quoteSym = cs.find(c => c.id === pair.quoteCoinId)?.symbol ?? "";
  }

  const fills = await db.select().from(tradesTable)
    .where(eq(tradesTable.orderId, orderId))
    .orderBy(tradesTable.createdAt);

  // Aggregate so the client doesn't need to re-iterate just to render a header.
  let totalQty = 0, totalQuote = 0, totalFee = 0;
  for (const f of fills) {
    const q = Number(f.qty);
    const p = Number(f.price);
    totalQty += q;
    totalQuote += q * p;
    totalFee += Number(f.fee || 0);
  }
  const vwap = totalQty > 0 ? totalQuote / totalQty : 0;

  res.json({
    order: {
      id: order.id,
      pairId: order.pairId,
      symbol: pair?.symbol ?? "",
      base: baseSym,
      quote: quoteSym,
      side: order.side,
      type: order.type,
      status: order.status,
      price: Number(order.price ?? 0),
      qty: Number(order.qty),
      filledQty: Number(order.filledQty || 0),
      avgPrice: Number(order.avgPrice || 0),
      fee: Number(order.fee || 0),
      tds: Number(order.tds || 0),
      feeCurrency: quoteSym,
      tdsCurrency: quoteSym,
      createdAt: order.createdAt,
    },
    fills: fills.map(f => ({
      id: f.id,
      uid: f.uid,
      side: f.side,
      price: Number(f.price),
      qty: Number(f.qty),
      fee: Number(f.fee || 0),
      tds: Number(f.tds || 0),
      feeCurrency: quoteSym,
      tdsCurrency: quoteSym,
      createdAt: f.createdAt,
    })),
    summary: {
      count: fills.length,
      totalQty: Math.round(totalQty * 1e8) / 1e8,
      totalQuote: Math.round(totalQuote * 1e8) / 1e8,
      vwap: Math.round(vwap * 1e8) / 1e8,
      totalFee: Math.round(totalFee * 1e8) / 1e8,
      base: baseSym,
      quote: quoteSym,
    },
  });
});

/**
 * Shared spot-order placement. Used by `/api/orders` (modern client / admin) and
 * `/api/exchange/order` (Bicrypto Flutter mobile/web bridge). All param values
 * MUST be normalized lowercase strings; numeric `qty`/`price` finite > 0.
 *
 * Returns either a fully filled (market or auto-matched limit) order, or a
 * resting open/partial limit order. Throws an Error with `.code` (HTTP status)
 * on validation failure — callers should map to HTTP responses.
 */
export async function placeSpotOrder(opts: {
  userId: number;
  vipTier: number;
  pairId: number;
  side: "buy" | "sell";
  type: "limit" | "market";
  qty: number;
  price?: number;
}): Promise<{ order: any; matched: number }> {
  const { userId, vipTier, pairId, side, type, qty, price } = opts;
  if (!pairId || !["buy", "sell"].includes(side) || !["limit", "market"].includes(type)) {
    const e: any = new Error("pairId, side(buy/sell), type(limit/market) required");
    e.code = 400; throw e;
  }
  const qtyNum = Number(qty);
  if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
    const e: any = new Error("qty must be positive"); e.code = 400; throw e;
  }

  // Slippage cap for MARKET orders: a market buy will never sweep above
  // lastPrice * (1 + MARKET_SLIPPAGE_PCT), and a market sell will never
  // hit a bid below lastPrice * (1 - MARKET_SLIPPAGE_PCT). This protects
  // users from manipulated thin books while still letting liquidity-rich
  // markets fill instantly.
  const MARKET_SLIPPAGE_PCT = 0.10;

  const created = await db.transaction(async (tx) => {
      const [pair] = await tx.select().from(pairsTable).where(eq(pairsTable.id, Number(pairId))).limit(1);
      if (!pair) { const e: any = new Error("Pair not found"); e.code = 404; throw e; }
      if (!pair.tradingEnabled || pair.status !== "active") { const e: any = new Error("Trading disabled for this pair"); e.code = 400; throw e; }
      if (pair.tradingStartAt && pair.tradingStartAt.getTime() > Date.now()) {
        const e: any = new Error("Trading not yet started"); e.code = 400; throw e;
      }
      const minQty = Number(pair.minQty);
      if (minQty > 0 && qtyNum < minQty) { const e: any = new Error(`Min qty is ${minQty}`); e.code = 400; throw e; }

      const fees = await getSpotFeeRates(vipTier);
      const isMarket = type === "market";
      const feeRate = isMarket ? fees.taker : fees.maker;

      // Determine the price stored on the order row.
      //  - LIMIT  → the user's chosen price (matching engine respects it)
      //  - MARKET → the slippage cap, also used as the engine's worst-acceptable
      //             price so it never crosses past ±10% of lastPrice.
      let effPrice: number;
      if (isMarket) {
        const lastPx = Number(pair.lastPrice);
        if (!Number.isFinite(lastPx) || lastPx <= 0) { const e: any = new Error("Market price unavailable"); e.code = 400; throw e; }
        effPrice = side === "buy"
          ? lastPx * (1 + MARKET_SLIPPAGE_PCT)
          : lastPx * (1 - MARKET_SLIPPAGE_PCT);
      } else {
        effPrice = Number(price);
        if (!Number.isFinite(effPrice) || effPrice <= 0) { const e: any = new Error("limit price required"); e.code = 400; throw e; }
      }

      // Lock balances against the WORST-CASE settlement.
      //  - BUY (market or limit): qty * price * (1 + takerFee)
      //    Limit buys lock fee upfront so the matching engine can always deduct
      //    the fee from the pre-locked slice without touching free balance.
      //    Any over-lock (price improvement + fee difference) is refunded per fill.
      //  - SELL ANY   : qty (base coin)
      let baseW: any = null, quoteW: any = null;
      if (side === "buy") {
        const lockQuote = qtyNum * effPrice * (1 + fees.taker);
        quoteW = await ensureWallet(tx, userId, pair.quoteCoinId, "spot");
        const bal = Number(quoteW.balance);
        if (bal < lockQuote) { const e: any = new Error(`Insufficient quote balance (have ${bal.toFixed(8)}, need ${lockQuote.toFixed(8)})`); e.code = 400; throw e; }
        await tx.update(walletsTable).set({
          balance: sql`${walletsTable.balance} - ${lockQuote}`,
          locked: sql`${walletsTable.locked} + ${lockQuote}`,
          updatedAt: new Date(),
        }).where(eq(walletsTable.id, quoteW.id));
      } else {
        baseW = await ensureWallet(tx, userId, pair.baseCoinId, "spot");
        const bal = Number(baseW.balance);
        if (bal < qtyNum) { const e: any = new Error(`Insufficient base balance (have ${bal.toFixed(8)}, need ${qtyNum.toFixed(8)})`); e.code = 400; throw e; }
        await tx.update(walletsTable).set({
          balance: sql`${walletsTable.balance} - ${qtyNum}`,
          locked: sql`${walletsTable.locked} + ${qtyNum}`,
          updatedAt: new Date(),
        }).where(eq(walletsTable.id, baseW.id));
      }

      const [o] = await tx.insert(ordersTable).values({
        userId, pairId: pair.id, side, type,
        price: String(effPrice), qty: String(qtyNum),
        status: "open",
      }).returning();
      return { order: o, pair };
    });
  const { order, pair } = created as any;

  // LIMIT orders rest in the book; MARKET orders never do (they may not be
  // fully filled inside the slippage cap, in which case the leftover is
  // refunded below).
  if (order.type !== "market") {
    await pushOrderToRedis(order, pair, "new");
  }

  // Run the matching engine for both market and limit. The engine honours
  // `order.price` as the worst-acceptable price for either side, so market
  // orders stop sweeping past their slippage cap.
  const matchRes = await tryMatch(order.id, { takerVipTier: vipTier });

  // Refresh the order row to see what actually filled.
  const [refreshed] = await db.select().from(ordersTable).where(eq(ordersTable.id, order.id)).limit(1);
  let final = refreshed ?? order;

  // For MARKET orders: if there's leftover quantity (not enough liquidity
  // within the slippage cap), cancel the rest and refund the unused lock so
  // the user doesn't keep money frozen against a non-resting order.
  if (final.type === "market" && final.status !== "filled") {
    const remainingQty = Number(final.qty) - Number(final.filledQty ?? 0);
    if (remainingQty > 1e-12) {
      await db.transaction(async (tx) => {
        const fees = await getSpotFeeRates(vipTier);
        if (final.side === "buy") {
          const refund = remainingQty * Number(final.price) * (1 + fees.taker);
          const w = await ensureWallet(tx, userId, pair.quoteCoinId, "spot");
          await tx.update(walletsTable).set({
            balance: sql`${walletsTable.balance} + ${refund}`,
            locked: sql`${walletsTable.locked} - ${refund}`,
            updatedAt: new Date(),
          }).where(eq(walletsTable.id, w.id));
        } else {
          const w = await ensureWallet(tx, userId, pair.baseCoinId, "spot");
          await tx.update(walletsTable).set({
            balance: sql`${walletsTable.balance} + ${remainingQty}`,
            locked: sql`${walletsTable.locked} - ${remainingQty}`,
            updatedAt: new Date(),
          }).where(eq(walletsTable.id, w.id));
        }
        const newStatus = Number(final.filledQty ?? 0) > 0 ? "partial" : "cancelled";
        const [u] = await tx.update(ordersTable).set({
          status: newStatus,
          updatedAt: new Date(),
        }).where(eq(ordersTable.id, final.id)).returning();
        final = u ?? final;
      });
    }
  }

  if (final.status === "filled" || final.status === "cancelled" || final.status === "partial") {
    await pushOrderToRedis(final, pair, "fill");
  } else if (final.type !== "market") {
    // Resting limit order with no/partial fill — keep redis member up to date.
    await rSet(`orderbook:${pair.symbol}:order:${final.id}`, JSON.stringify({
      id: final.id, userId: final.userId, side: final.side, type: final.type,
      price: Number(final.price), qty: Number(final.qty),
      filledQty: Number(final.filledQty ?? 0), status: final.status, ts: Date.now(),
    }), 86400);
  }

  // ── 5-level trading-fee referral commission (fire-and-forget) ────────────
  if (matchRes.trades > 0) {
    const feeAmt = parseFloat(final.fee ?? "0");
    if (feeAmt > 0) {
      creditTradingFeeReferralChain(userId, feeAmt, pair.quoteCoinId, "trading_fee")
        .catch(() => null); // never block the order response
    }
  }

  return { order: final, matched: matchRes.trades };
}

// ─── /orders/:id/invoice — printable tax invoice for a filled order ──────
// Returns a self-contained JSON payload the user-portal renders into a
// print-friendly invoice page (the user can then "Save as PDF" from the
// browser print dialog). Only orders with at least one fill are eligible —
// open / fully-cancelled orders have nothing to invoice.
//
// Fee breakdown: the stored `fee` includes GST baked in (matching engine
// applies `baseRate * (1 + gstPct/100)`), so we back it out here so the
// invoice can show "Trading fee" and "GST 18%" on separate lines as
// required for Indian tax compliance.
router.get("/orders/:id/invoice", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const orderId = Number(req.params.id);
  if (!Number.isFinite(orderId) || orderId <= 0) {
    res.status(400).json({ message: "Invalid order id" });
    return;
  }

  const [order] = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.userId, userId), eq(ordersTable.isBot, 0)))
    .limit(1);
  if (!order) { res.status(404).json({ message: "Order not found" }); return; }
  if (Number(order.filledQty || 0) <= 0) {
    res.status(400).json({ message: "No fills yet — invoice is generated only after at least one match." });
    return;
  }

  const [pair] = await db.select().from(pairsTable).where(eq(pairsTable.id, order.pairId)).limit(1);
  let baseSym = "", quoteSym = "";
  if (pair) {
    const cs = await db.select().from(coinsTable);
    baseSym = cs.find(c => c.id === pair.baseCoinId)?.symbol ?? "";
    quoteSym = cs.find(c => c.id === pair.quoteCoinId)?.symbol ?? "";
  }

  const fills = await db.select().from(tradesTable)
    .where(eq(tradesTable.orderId, orderId))
    .orderBy(tradesTable.createdAt);

  // Aggregate exactly what's persisted on the order row — we don't recompute
  // from the live fee/GST settings because those may have changed since the
  // trade was executed and the invoice MUST match the wallet movements.
  const grossFee = Number(order.fee || 0);                    // already includes GST
  const tdsAmount = Number(order.tds || 0);
  let totalQty = 0, totalQuote = 0;
  for (const f of fills) {
    totalQty += Number(f.qty);
    totalQuote += Number(f.qty) * Number(f.price);
  }
  const vwap = totalQty > 0 ? totalQuote / totalQty : 0;

  // Read GST % at the time of invoicing (best-effort — the historical rate
  // isn't snapshotted on each fill yet). If it differs from the rate used
  // at fill-time, the split shown on the invoice is approximate but the
  // grand totals (gross fee + TDS + net) still match what was settled.
  const feeSettings = await loadFeeSettings();
  const gstPct = Number(feeSettings.spotGstPercent || 0);
  const baseFee = gstPct > 0 ? grossFee / (1 + gstPct / 100) : grossFee;
  const gstAmount = grossFee - baseFee;

  // For SELL the user RECEIVES (notional - fee - tds).
  // For BUY  the user PAYS    (notional + fee). TDS doesn't apply on buys.
  const isSell = order.side === "sell";
  const grandTotal = isSell ? (totalQuote - grossFee - tdsAmount) : (totalQuote + grossFee);

  const [u] = await db.select({ name: usersTable.name, email: usersTable.email })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  // Brand / company info — admin can override any of these from /admin/settings
  // raw key editor. Defaults are placeholders that look plausible on a real
  // tax invoice without leaking anything sensitive.
  const settingsRows = await db.select().from(settingsTable);
  const brandMap = new Map(settingsRows.map(r => [r.key, r.value]));
  const brand = {
    legalName:    brandMap.get("brand.legal_name")    || "Zebvix Technologies Private Limited",
    tradingName:  brandMap.get("brand.trading_name")  || "Zebvix Exchange",
    address:      brandMap.get("brand.address")       || COMPANY_ADDRESS,
    gstin:        brandMap.get("brand.gstin")         || COMPANY_GST,
    pan:          brandMap.get("brand.pan")           || COMPANY_PAN,
    cin:          brandMap.get("brand.cin")           || COMPANY_CIN,
    supportEmail: brandMap.get("brand.support_email") || "support@zebvix.com",
    website:      brandMap.get("brand.website")       || "https://zebvix.com",
  };

  const invoiceNo = `INV-${String(order.id).padStart(8, "0")}`;
  const lastFillAt = fills[fills.length - 1]?.createdAt ?? order.createdAt;

  res.json({
    invoiceNo,
    issuedAt: lastFillAt,
    currency: quoteSym,
    brand,
    customer: {
      name: u?.name || "—",
      email: u?.email || "—",
      userId,
    },
    order: {
      id: order.id,
      symbol: pair?.symbol ?? "",
      base: baseSym,
      quote: quoteSym,
      side: order.side,
      type: order.type,
      status: order.status,
      qty: Number(order.qty),
      filledQty: totalQty,
      avgPrice: vwap,
      placedAt: order.createdAt,
    },
    breakdown: {
      grossNotional: +totalQuote.toFixed(8),
      tradingFee: +baseFee.toFixed(8),
      gstPercent: gstPct,
      gstAmount: +gstAmount.toFixed(8),
      totalFee: +grossFee.toFixed(8),
      tdsPercent: totalQuote > 0 ? +((tdsAmount / totalQuote) * 100).toFixed(4) : 0,
      tdsAmount: +tdsAmount.toFixed(8),
      netAmount: +grandTotal.toFixed(8),
      direction: isSell ? "credit" : "debit",
    },
    fills: fills.map(f => ({
      id: f.id,
      uid: f.uid,
      price: Number(f.price),
      qty: Number(f.qty),
      subtotal: +(Number(f.qty) * Number(f.price)).toFixed(8),
      fee: Number(f.fee || 0),
      tds: Number(f.tds || 0),
      executedAt: f.createdAt,
    })),
  });
});

router.post("/orders", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  if ((req.user!.kycLevel ?? 0) < 1) {
    res.status(403).json({ error: "KYC Level 1 required to place orders. Please complete KYC verification." });
    return;
  }
  const vipTier = Math.max(0, Math.min(5, req.user!.vipTier ?? 0));
  const parsed = PlaceOrderBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    res.status(400).json({
      error: first?.message || "Invalid order",
      field: first?.path?.join(".") || "body",
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
    return;
  }
  const { pairId, side, type, price, qty } = parsed.data;
  try {
    const result = await placeSpotOrder({
      userId, vipTier, pairId, side, type, qty, price,
    });
    res.status(201).json(result.matched > 0 ? { ...result.order, matched: result.matched } : result.order);
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    throw e;
  }
});

/**
 * Shared spot-order cancellation. Releases locked balance, marks order
 * cancelled, pushes redis update. Throws Error with `.code` on failure.
 */
export async function cancelSpotOrderById(userId: number, id: number): Promise<any> {
  if (!id) { const e: any = new Error("id required"); e.code = 400; throw e; }
  const cancelled = await db.transaction(async (tx) => {
      // SECURITY: never let a real-user request mutate a bot order, even when
      // the bot account currently runs under the same user_id (e.g. admin).
      // Bot orders must only be cancelled by the bot lifecycle / admin tools.
      const [o] = await tx.select().from(ordersTable).where(and(
        eq(ordersTable.id, id),
        eq(ordersTable.userId, userId),
        eq(ordersTable.isBot, 0),
      )).for("update").limit(1);
      if (!o) { const e: any = new Error("Order not found"); e.code = 404; throw e; }
      if (o.status !== "open" && o.status !== "partial") { const e: any = new Error(`Cannot cancel — status is ${o.status}`); e.code = 400; throw e; }
      const [pair] = await tx.select().from(pairsTable).where(eq(pairsTable.id, o.pairId)).limit(1);
      if (!pair) { const e: any = new Error("Pair missing"); e.code = 500; throw e; }
      const remainingQty = Number(o.qty) - Number(o.filledQty);
      const remainingPrice = Number(o.price);
      if (o.side === "buy") {
        // Released amount = remainingQty * price (limit orders don't pre-pay maker fee)
        const release = remainingQty * remainingPrice;
        const w = await ensureWallet(tx, userId, pair.quoteCoinId, "spot");
        await tx.update(walletsTable).set({
          balance: sql`${walletsTable.balance} + ${release}`,
          locked: sql`${walletsTable.locked} - ${release}`,
          updatedAt: new Date(),
        }).where(eq(walletsTable.id, w.id));
      } else {
        const w = await ensureWallet(tx, userId, pair.baseCoinId, "spot");
        await tx.update(walletsTable).set({
          balance: sql`${walletsTable.balance} + ${remainingQty}`,
          locked: sql`${walletsTable.locked} - ${remainingQty}`,
          updatedAt: new Date(),
        }).where(eq(walletsTable.id, w.id));
      }
      const [updated] = await tx.update(ordersTable).set({ status: "cancelled", updatedAt: new Date() }).where(eq(ordersTable.id, id)).returning();
      return { order: updated, pair };
  });
  const { order, pair } = cancelled as any;
  await pushOrderToRedis(order, pair, "cancel");
  return order;
}

router.post("/orders/:id/cancel", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const id = Number(req.params.id);
  try {
    const order = await cancelSpotOrderById(userId, id);
    res.json(order);
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    throw e;
  }
});

/**
 * Operator-only force-cancel. Mirrors {@link cancelSpotOrderById} but does
 * NOT enforce userId match and DOES allow cancelling bot orders. The caller
 * (admin route) is responsible for permission gating + audit logging.
 *
 * Returns the cancelled order; throws an Error with `.code` (404 / 400 / 500)
 * for the route handler to translate into a status code.
 */
export async function adminCancelSpotOrderById(id: number): Promise<any> {
  if (!id) { const e: any = new Error("id required"); e.code = 400; throw e; }
  const cancelled = await db.transaction(async (tx) => {
    const [o] = await tx.select().from(ordersTable)
      .where(eq(ordersTable.id, id)).for("update").limit(1);
    if (!o) { const e: any = new Error("Order not found"); e.code = 404; throw e; }
    if (o.status !== "open" && o.status !== "partial") {
      const e: any = new Error(`Cannot cancel — status is ${o.status}`); e.code = 400; throw e;
    }
    const [pair] = await tx.select().from(pairsTable).where(eq(pairsTable.id, o.pairId)).limit(1);
    if (!pair) { const e: any = new Error("Pair missing"); e.code = 500; throw e; }
    const remainingQty = Number(o.qty) - Number(o.filledQty);
    const remainingPrice = Number(o.price);
    if (o.side === "buy") {
      const release = remainingQty * remainingPrice;
      const w = await ensureWallet(tx, o.userId, pair.quoteCoinId, "spot");
      await tx.update(walletsTable).set({
        balance: sql`${walletsTable.balance} + ${release}`,
        locked: sql`${walletsTable.locked} - ${release}`,
        updatedAt: new Date(),
      }).where(eq(walletsTable.id, w.id));
    } else {
      const w = await ensureWallet(tx, o.userId, pair.baseCoinId, "spot");
      await tx.update(walletsTable).set({
        balance: sql`${walletsTable.balance} + ${remainingQty}`,
        locked: sql`${walletsTable.locked} - ${remainingQty}`,
        updatedAt: new Date(),
      }).where(eq(walletsTable.id, w.id));
    }
    const [updated] = await tx.update(ordersTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(ordersTable.id, id)).returning();
    return { order: updated, pair };
  });
  const { order, pair } = cancelled as any;
  await pushOrderToRedis(order, pair, "cancel");
  return order;
}

// ====== Public orderbook + recent trades from Redis ======
router.get("/orderbook/:symbol", async (req, res): Promise<void> => {
  const symbol = String(req.params.symbol || "").toUpperCase();
  const levels = Math.min(100, Math.max(5, Number(req.query.levels) || 20));
  const depth = await getDepth(symbol, levels);
  res.setHeader("X-Cache", "REDIS");
  res.json({ symbol, ...depth, ts: Date.now() });
});

router.get("/trades/:symbol/recent", async (req, res): Promise<void> => {
  const symbol = String(req.params.symbol || "").toUpperCase();
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const trades = await getRecentTrades(symbol, limit);
  res.setHeader("X-Cache", "REDIS");
  res.json({ symbol, trades, ts: Date.now() });
});

void coinsTable;
export default router;
