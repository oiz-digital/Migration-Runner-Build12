// Futures trading endpoints — Bicrypto v5 contract for the Flutter mobile UI
// and admin panel. The matching itself runs in the Go service (see
// artifacts/go-service); this router is responsible for:
//
//   - validating + persisting the order in `futures_orders`,
//   - locking margin in the user's futures wallet,
//   - asking Go to match it,
//   - atomically applying the resulting fills (insert futures_trades,
//     advance the order, upsert the user's per-pair position, settle wallets),
//   - exposing list / cancel / leverage / close-position endpoints.
//
// Funding + risk + auto-liquidation continue to live in lib/futures-engine.ts
// (60s/30s/5s ticks). This module is NOT responsible for those.

import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, and, or, desc, sql, inArray } from "drizzle-orm";
import {
  db,
  usersTable,
  pairsTable,
  coinsTable,
  walletsTable,
  futuresPositionsTable,
  futuresOrdersTable,
  futuresTradesTable,
  walletLedgerTable,
} from "@workspace/db";
import { verifyJwt } from "../lib/jwt";
import { readSessionCookie, getUserBySession } from "../lib/auth";
import { logger } from "../lib/logger";
import { getInrRate } from "../lib/price-service";
import { getFuturesFeeRates } from "./fees";
import { creditTradingFeeReferralChain } from "../lib/trading-fee-referral";

const r: IRouter = Router();

// ── Auth (Bicrypto-style: Bearer/JWT for Flutter, cx_session cookie for the
// React user-portal). Accept either so both clients share one auth flow.
function readBearer(req: Request): string | undefined {
  const h = req.headers.authorization;
  if (h && h.startsWith("Bearer ")) return h.slice(7);
  const cookies = (req as any).cookies as Record<string, string> | undefined;
  return cookies?.["accessToken"];
}
async function bicryptoAuth(req: Request, res: Response, next: NextFunction) {
  const tok = readBearer(req);
  if (tok) {
    const decoded = verifyJwt(tok);
    const id = Number(decoded?.sub?.id);
    if (Number.isFinite(id)) {
      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
      if (!u) { res.status(401).json({ message: "User not found" }); return; }
      if (u.status !== "active") { res.status(403).json({ message: "Account suspended" }); return; }
      (req as any).bcUser = u;
      next();
      return;
    }
  }
  const sessionTok = readSessionCookie(req);
  if (sessionTok) {
    const u = await getUserBySession(sessionTok);
    if (u) {
      if (u.status !== "active") { res.status(403).json({ message: "Account suspended" }); return; }
      (req as any).bcUser = u;
      next();
      return;
    }
  }
  res.status(401).json({ message: "Unauthorized" });
}

// ── Helpers ─────────────────────────────────────────────────────────────
const GO_BASE = process.env.GO_SERVICE_URL || "http://127.0.0.1:8090";
const GO_INTERNAL_SECRET = process.env.INTERNAL_SECRET;

async function goRpc(path: string, body: any, timeoutMs = 5000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (GO_INTERNAL_SECRET) headers["X-Internal-Secret"] = GO_INTERNAL_SECRET;
    const res = await fetch(`${GO_BASE}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`go ${path} ${res.status}: ${txt}`);
    }
    return await res.json();
  } finally { clearTimeout(t); }
}

interface ResolvedPair {
  id: number; baseSymbol: string; quoteSymbol: string;
  baseCoinId: number; quoteCoinId: number;
  pricePrecision: number; qtyPrecision: number;
  minQty: number; maxLeverage: number;
  mmRate: number; takerFeeRate: number; makerFeeRate: number;
  futuresEnabled: boolean; futuresStartAt: Date | null;
  lastPrice: number;
}

// Keep a tiny in-process pair cache (1s TTL) keyed by "BASE/QUOTE" so the
// hot order path doesn't hit Postgres twice per request just to resolve a
// symbol. Mark price changes are picked up by lib/pair-stats / futures-engine.
type CacheEntry = { ts: number; pair: ResolvedPair };
const pairCache = new Map<string, CacheEntry>();
const PAIR_TTL = 1000;

async function resolvePair(currency: string, quote: string): Promise<ResolvedPair | null> {
  const key = `${currency}/${quote}`.toUpperCase();
  const cached = pairCache.get(key);
  if (cached && Date.now() - cached.ts < PAIR_TTL) return cached.pair;

  const base = String(currency).toUpperCase();
  const quoteSym = String(quote).toUpperCase();
  const [baseCoin] = await db.select().from(coinsTable).where(eq(coinsTable.symbol, base)).limit(1);
  const [quoteCoin] = await db.select().from(coinsTable).where(eq(coinsTable.symbol, quoteSym)).limit(1);
  if (!baseCoin || !quoteCoin) return null;
  const [pair] = await db.select().from(pairsTable).where(and(
    eq(pairsTable.baseCoinId, baseCoin.id),
    eq(pairsTable.quoteCoinId, quoteCoin.id),
  )).limit(1);
  if (!pair) return null;
  const out: ResolvedPair = {
    id: pair.id,
    baseSymbol: base,
    quoteSymbol: quoteSym,
    baseCoinId: baseCoin.id,
    quoteCoinId: quoteCoin.id,
    pricePrecision: Number(pair.pricePrecision ?? 2),
    qtyPrecision: Number(pair.qtyPrecision ?? 4),
    minQty: Number(pair.minQty ?? 0),
    maxLeverage: Number(pair.maxLeverage ?? 100),
    mmRate: Number(pair.mmRate ?? 0.005),
    takerFeeRate: Number(pair.takerFee ?? 0.0006),
    makerFeeRate: Number(pair.makerFee ?? 0.0002),
    futuresEnabled: Boolean(pair.futuresEnabled),
    futuresStartAt: pair.futuresStartAt ?? null,
    lastPrice: Number(pair.lastPrice ?? 0),
  };
  pairCache.set(key, { ts: Date.now(), pair: out });
  return out;
}

// Order side (buy/sell) → corresponding implied position side (long/short).
function impliedPosSide(orderSide: "buy" | "sell"): "long" | "short" {
  return orderSide === "buy" ? "long" : "short";
}

function calcLiqPrice(side: "long" | "short", entry: number, qty: number, margin: number, mmRate: number): number {
  // Closed-form isolated liq price (matches lib/futures-engine.ts).
  if (qty <= 0) return 0;
  if (side === "long") return Math.max(0, (entry * qty - margin) / (qty * (1 - mmRate)));
  return (entry * qty + margin) / (qty * (1 + mmRate));
}

// ── Output shape (Bicrypto / Flutter contract) ──────────────────────────
function orderToFlutter(o: any, pair: ResolvedPair): any {
  return {
    id: String(o.uid ?? o.id),
    referenceId: String(o.id),
    symbol: `${pair.baseSymbol}/${pair.quoteSymbol}`,
    currency: pair.baseSymbol,
    pair: pair.quoteSymbol,
    type: String(o.type || "limit").toUpperCase(),
    side: String(o.side || "buy").toUpperCase(),
    amount: Number(o.qty),
    filled: Number(o.filledQty ?? 0),
    price: o.price !== null ? Number(o.price) : 0,
    avgFillPrice: Number(o.avgFillPrice ?? 0),
    leverage: Number(o.leverage ?? 1),
    stopLossPrice: o.stopLoss !== null ? Number(o.stopLoss) : null,
    takeProfitPrice: o.takeProfit !== null ? Number(o.takeProfit) : null,
    reduceOnly: Boolean(o.reduceOnly),
    status: String(o.status || "OPEN").toUpperCase(),
    fee: Number(o.fee ?? 0),
    createdAt: (o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt)).toISOString(),
    updatedAt: (o.updatedAt instanceof Date ? o.updatedAt : new Date(o.updatedAt ?? o.createdAt)).toISOString(),
  };
}

function positionToFlutter(p: any, pair: ResolvedPair, markPx: number): any {
  const entry = Number(p.entryPrice);
  const qty = Number(p.qty);
  const upnl = p.side === "long" ? (markPx - entry) * qty : (entry - markPx) * qty;
  return {
    id: String(p.uid ?? p.id),
    referenceId: String(p.id),
    symbol: `${pair.baseSymbol}/${pair.quoteSymbol}`,
    currency: pair.baseSymbol,
    pair: pair.quoteSymbol,
    side: String(p.side || "long").toUpperCase(),
    amount: qty,
    entryPrice: entry,
    markPrice: markPx,
    leverage: Number(p.leverage ?? 1),
    margin: Number(p.marginAmount ?? 0),
    marginType: p.marginType,
    unrealisedPnl: upnl,
    unrealizedPnl: upnl,           // both spellings — Bicrypto historically used the US one
    realizedPnl: Number(p.realizedPnl ?? 0),
    liquidationPrice: Number(p.liquidationPrice ?? 0),
    status: String(p.status || "open").toUpperCase(),
    createdAt: (p.openedAt instanceof Date ? p.openedAt : new Date(p.openedAt)).toISOString(),
    updatedAt: (p.updatedAt instanceof Date ? p.updatedAt : new Date(p.updatedAt ?? p.openedAt)).toISOString(),
    closedAt: p.closedAt ? (p.closedAt instanceof Date ? p.closedAt : new Date(p.closedAt)).toISOString() : null,
  };
}

// ── Wallet helpers (futures wallet only — quote coin) ───────────────────

/** Lock `amount` of the futures wallet's quote-coin balance.
 *  Throws when the user doesn't have enough free balance. */
async function lockMargin(tx: any, userId: number, quoteCoinId: number, amount: number): Promise<number> {
  // Find or create the futures wallet row, then SELECT FOR UPDATE inside the
  // same tx so concurrent orders cannot double-spend the same balance.
  const [w] = await tx.select().from(walletsTable).where(and(
    eq(walletsTable.userId, userId),
    eq(walletsTable.coinId, quoteCoinId),
    eq(walletsTable.walletType, "futures"),
  )).limit(1);
  let walletId: number;
  if (!w) {
    const [created] = await tx.insert(walletsTable).values({
      userId, coinId: quoteCoinId, walletType: "futures", balance: "0", locked: "0",
    }).returning();
    walletId = created.id;
  } else {
    walletId = w.id;
  }
  const [locked] = await tx.select().from(walletsTable).where(eq(walletsTable.id, walletId)).for("update").limit(1);
  const bal = Number(locked.balance);
  if (bal < amount - 1e-12) {
    const e: any = new Error(`Insufficient futures margin (have ${bal.toFixed(8)} ${''}, need ${amount.toFixed(8)})`);
    e.code = 400;
    throw e;
  }
  await tx.update(walletsTable).set({
    balance: sql`${walletsTable.balance} - ${amount}`,
    locked:  sql`${walletsTable.locked}  + ${amount}`,
    updatedAt: new Date(),
  }).where(eq(walletsTable.id, walletId));
  return walletId;
}

async function releaseMargin(tx: any, userId: number, quoteCoinId: number, amount: number): Promise<void> {
  if (amount <= 0) return;
  const [w] = await tx.select().from(walletsTable).where(and(
    eq(walletsTable.userId, userId),
    eq(walletsTable.coinId, quoteCoinId),
    eq(walletsTable.walletType, "futures"),
  )).for("update").limit(1);
  if (!w) return;
  await tx.update(walletsTable).set({
    balance: sql`${walletsTable.balance} + ${amount}`,
    locked:  sql`GREATEST(0, ${walletsTable.locked} - ${amount})`,
    updatedAt: new Date(),
  }).where(eq(walletsTable.id, w.id));
}

/** Apply realized PnL by directly adding to balance (margin already released). */
async function applyPnl(tx: any, userId: number, quoteCoinId: number, pnl: number, fee: number): Promise<void> {
  const net = pnl - fee;
  if (net === 0) return;
  const [w] = await tx.select().from(walletsTable).where(and(
    eq(walletsTable.userId, userId),
    eq(walletsTable.coinId, quoteCoinId),
    eq(walletsTable.walletType, "futures"),
  )).for("update").limit(1);
  if (!w) return;
  await tx.update(walletsTable).set({
    balance: sql`GREATEST(0, ${walletsTable.balance} + ${net})`,
    updatedAt: new Date(),
  }).where(eq(walletsTable.id, w.id));
  const settledBal = Math.max(0, Number(w.balance) + net);
  await tx.insert(walletLedgerTable).values({
    userId, coinId: quoteCoinId, walletType: "futures", type: "futures_pnl",
    amount: net.toFixed(8),
    balanceBefore: w.balance,
    balanceAfter: settledBal.toFixed(8),
    refType: "futures_trade",
    note: `Futures PnL settled — pnl=${pnl.toFixed(8)}, fee=${fee.toFixed(8)}`,
  });
}

// ── Position upsert helpers ─────────────────────────────────────────────

interface FillCtx {
  pair: ResolvedPair;
  userId: number;
  fillPrice: number;
  fillQty: number;
  orderSide: "buy" | "sell";
  leverage: number;
  isMaker: boolean;
  isBot: boolean;
}

/**
 * Apply a single fill to the user's per-pair position. Handles all four
 * cases (open new / increase same side / partial-reduce opposite side /
 * fully reverse opposite side). Wallet-side effects are delegated to the
 * caller via the returned `walletDelta` so it can be batched.
 *
 * Returns the position id (existing or freshly inserted) and the wallet
 * deltas in quote-coin units.
 */
async function applyFillToPosition(tx: any, ctx: FillCtx): Promise<{
  positionId: number;
  marginToLock: number;       // new margin we should LOCK now (open/increase)
  marginToRelease: number;    // margin we should RELEASE back (reduce/close)
  realizedPnl: number;        // PnL to credit/debit
  fee: number;
}> {
  const { pair, userId, fillPrice, fillQty, orderSide, leverage, isMaker, isBot } = ctx;
  const targetSide = impliedPosSide(orderSide);

  // Find any open position for this (user, pair).
  const [existing] = await tx.select().from(futuresPositionsTable).where(and(
    eq(futuresPositionsTable.userId, userId),
    eq(futuresPositionsTable.pairId, pair.id),
    eq(futuresPositionsTable.status, "open"),
  )).for("update").limit(1);

  // Bots skip wallets entirely (synthetic liquidity).
  const feeRate = isMaker ? pair.makerFeeRate : pair.takerFeeRate;
  const fee = isBot ? 0 : Math.max(0, fillQty * fillPrice * feeRate);

  if (!existing) {
    // Open a brand new position.
    const notional = fillPrice * fillQty;
    const margin = notional / leverage;
    const liq = calcLiqPrice(targetSide, fillPrice, fillQty, margin, pair.mmRate);
    const [pos] = await tx.insert(futuresPositionsTable).values({
      userId, pairId: pair.id, side: targetSide,
      leverage, qty: String(fillQty),
      entryPrice: String(fillPrice), markPrice: String(fillPrice),
      marginAmount: String(margin), marginType: "isolated",
      liquidationPrice: String(liq), status: "open",
    }).returning();
    return { positionId: pos.id, marginToLock: isBot ? 0 : margin, marginToRelease: 0, realizedPnl: 0, fee };
  }

  const oldQty = Number(existing.qty);
  const oldEntry = Number(existing.entryPrice);
  const oldMargin = Number(existing.marginAmount);
  const oldSide = String(existing.side) as "long" | "short";

  if (oldSide === targetSide) {
    // Same side — increase position (weighted average entry).
    const newQty = oldQty + fillQty;
    const newEntry = (oldQty * oldEntry + fillQty * fillPrice) / newQty;
    const addMargin = (fillPrice * fillQty) / leverage;
    const newMargin = oldMargin + addMargin;
    const liq = calcLiqPrice(oldSide, newEntry, newQty, newMargin, pair.mmRate);
    await tx.update(futuresPositionsTable).set({
      qty: String(newQty), entryPrice: String(newEntry),
      markPrice: String(fillPrice),
      marginAmount: String(newMargin), liquidationPrice: String(liq),
      // Lift leverage to whichever is higher so limits/UI match user intent.
      leverage: Math.max(Number(existing.leverage), leverage),
      updatedAt: new Date(),
    }).where(eq(futuresPositionsTable.id, existing.id));
    return { positionId: existing.id, marginToLock: isBot ? 0 : addMargin, marginToRelease: 0, realizedPnl: 0, fee };
  }

  // Opposite side — reduce or reverse.
  const reduceQty = Math.min(fillQty, oldQty);
  const pnl = oldSide === "long"
    ? (fillPrice - oldEntry) * reduceQty
    : (oldEntry - fillPrice) * reduceQty;
  const releasedMargin = (oldMargin * reduceQty) / oldQty;

  const remainingQty = oldQty - reduceQty;
  if (remainingQty > 1e-12) {
    // Partial reduce — keep the position open with smaller size.
    const newMargin = oldMargin - releasedMargin;
    const liq = calcLiqPrice(oldSide, oldEntry, remainingQty, newMargin, pair.mmRate);
    await tx.update(futuresPositionsTable).set({
      qty: String(remainingQty),
      marginAmount: String(newMargin),
      markPrice: String(fillPrice),
      liquidationPrice: String(liq),
      realizedPnl: sql`${futuresPositionsTable.realizedPnl} + ${pnl}`,
      updatedAt: new Date(),
    }).where(eq(futuresPositionsTable.id, existing.id));
    return { positionId: existing.id, marginToLock: 0, marginToRelease: isBot ? 0 : releasedMargin, realizedPnl: isBot ? 0 : pnl, fee };
  }

  // Position fully closed by this fill (and possibly a flip in fillQty > oldQty).
  await tx.update(futuresPositionsTable).set({
    qty: "0", marginAmount: "0",
    markPrice: String(fillPrice),
    realizedPnl: sql`${futuresPositionsTable.realizedPnl} + ${pnl}`,
    status: "closed", closedAt: new Date(), closeReason: "user_close",
    updatedAt: new Date(),
  }).where(eq(futuresPositionsTable.id, existing.id));

  let positionId = existing.id;
  let openMargin = 0;
  // Flip: the order qty exceeds the existing position. Open a new opposite
  // position with the remainder.
  const flipQty = fillQty - reduceQty;
  if (flipQty > 1e-12) {
    const notional = fillPrice * flipQty;
    const margin = notional / leverage;
    const liq = calcLiqPrice(targetSide, fillPrice, flipQty, margin, pair.mmRate);
    const [npos] = await tx.insert(futuresPositionsTable).values({
      userId, pairId: pair.id, side: targetSide,
      leverage, qty: String(flipQty),
      entryPrice: String(fillPrice), markPrice: String(fillPrice),
      marginAmount: String(margin), marginType: "isolated",
      liquidationPrice: String(liq), status: "open",
    }).returning();
    positionId = npos.id;
    openMargin = isBot ? 0 : margin;
  }
  return { positionId, marginToLock: openMargin, marginToRelease: isBot ? 0 : releasedMargin, realizedPnl: isBot ? 0 : pnl, fee };
}

// ── POST /futures/order ──────────────────────────────────────────────────
r.post("/futures/order", bicryptoAuth, async (req: any, res: Response): Promise<void> => {
  const u = req.bcUser;
  const b = req.body ?? {};
  const currency = String(b.currency || "");
  const pairSym = String(b.pair || "");
  const type = String(b.type || "limit").toLowerCase();
  const side = String(b.side || "buy").toLowerCase();
  if (!currency || !pairSym) { res.status(400).json({ message: "currency and pair required" }); return; }
  if (type !== "limit" && type !== "market") { res.status(400).json({ message: "type must be 'limit' or 'market'" }); return; }
  if (side !== "buy" && side !== "sell") { res.status(400).json({ message: "side must be 'buy' or 'sell'" }); return; }
  const qty = Number(b.amount);
  const price = b.price !== undefined && b.price !== null ? Number(b.price) : null;
  const leverage = Math.max(1, Math.min(125, Number(b.leverage ?? 10)));
  if (!Number.isFinite(qty) || qty <= 0) { res.status(400).json({ message: "amount must be > 0" }); return; }
  if (type === "limit" && (!Number.isFinite(price as number) || (price as number) <= 0)) {
    res.status(400).json({ message: "limit order requires price > 0" }); return;
  }
  const pair = await resolvePair(currency, pairSym);
  if (!pair) { res.status(404).json({ message: "Pair not found" }); return; }
  if ((u.kycLevel ?? 0) < 2) { res.status(403).json({ message: "KYC Level 2 required to trade futures" }); return; }
  if (!pair.futuresEnabled) { res.status(400).json({ message: "Futures not enabled for this pair" }); return; }
  if (pair.futuresStartAt && pair.futuresStartAt.getTime() > Date.now()) {
    res.status(400).json({ message: "Futures not yet started for this pair" }); return;
  }
  if (leverage > pair.maxLeverage) { res.status(400).json({ message: `Max leverage is ${pair.maxLeverage}x` }); return; }
  if (qty < pair.minQty - 1e-12) { res.status(400).json({ message: `Min qty is ${pair.minQty}` }); return; }

  // Reference price for margin lock + market orders.
  const refPrice = type === "limit" ? (price as number) : pair.lastPrice;
  if (!Number.isFinite(refPrice) || refPrice <= 0) { res.status(400).json({ message: "Mark price unavailable" }); return; }
  const marginToLock = (qty * refPrice) / leverage;

  let orderRow: any;
  try {
    orderRow = await db.transaction(async (tx) => {
      // Lock the margin upfront. Released later for the unfilled remainder.
      await lockMargin(tx, u.id, pair.quoteCoinId, marginToLock);
      const [o] = await tx.insert(futuresOrdersTable).values({
        userId: u.id, pairId: pair.id,
        side, type,
        price: type === "limit" ? String(price) : null,
        qty: String(qty),
        leverage, marginType: "isolated",
        marginLocked: String(marginToLock),
        reduceOnly: Boolean(b.reduceOnly),
        stopLoss: b.stopLossPrice != null ? String(Number(b.stopLossPrice)) : null,
        takeProfit: b.takeProfitPrice != null ? String(Number(b.takeProfitPrice)) : null,
        status: "OPEN",
        isBot: u.role === "bot" || (u.email || "").endsWith("@bot.local") ? 1 : 0,
      }).returning();
      return o;
    });
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ message: e.message }); return; }
    logger.error({ err: String(e) }, "futures order pre-match failed");
    res.status(500).json({ message: e?.message || "order failed" }); return;
  }

  // Hand off to the matching engine.
  let match: any;
  try {
    match = await goRpc("/internal/futures/place", {
      orderId: orderRow.id,
      userId: u.id,
      pairId: pair.id,
      side, type,
      price: type === "limit" ? Number(price) : 0,
      qty,
      isBot: orderRow.isBot === 1,
    });
  } catch (e: any) {
    // Go service unavailable — for limit orders keep the order OPEN (resting
    // in the book so it can fill when a counterpart arrives). For market orders
    // we cannot rest them, so refund the margin and reject.
    if (type === "market") {
      await db.transaction(async (tx) => {
        await releaseMargin(tx, u.id, pair.quoteCoinId, marginToLock);
        await tx.update(futuresOrdersTable).set({
          status: "REJECTED", updatedAt: new Date(),
        }).where(eq(futuresOrdersTable.id, orderRow.id));
      });
      logger.error({ err: String(e) }, "futures matching engine unreachable — market order rejected");
      res.status(503).json({ message: "Matching engine unavailable for market orders. Use limit orders." }); return;
    }
    // Limit order: leave it OPEN and return success. It will match when the
    // engine comes online or a counterpart is placed.
    logger.warn({ err: String(e) }, "futures matching engine unreachable — limit order resting as OPEN");
    match = { trades: [], status: "OPEN" };
  }

  // Apply fills atomically.
  let finalOrder = orderRow;
  if (Array.isArray(match?.trades) && match.trades.length > 0) {
    finalOrder = await applyFills(orderRow, match, pair);
    // 5-level futures trading-fee referral commission (fire-and-forget)
    const futuresFeeAmt = parseFloat(finalOrder?.fee ?? "0");
    if (futuresFeeAmt > 0) {
      creditTradingFeeReferralChain(u.id, futuresFeeAmt, pair.quoteCoinId, "futures_fee")
        .catch(() => null);
    }
  } else if (match?.status) {
    // No fills — just stamp the status (REJECTED / OPEN).
    if (match.status === "REJECTED") {
      await db.transaction(async (tx) => {
        await releaseMargin(tx, u.id, pair.quoteCoinId, marginToLock);
        await tx.update(futuresOrdersTable).set({ status: "REJECTED", updatedAt: new Date() })
          .where(eq(futuresOrdersTable.id, orderRow.id));
      });
      finalOrder = { ...orderRow, status: "REJECTED" };
    }
  }

  res.json(orderToFlutter(finalOrder, pair));
});

/**
 * Apply the trades returned by the Go matcher in a single DB transaction:
 *   - INSERT one futures_trades row per fill (taker + maker bookkeeping)
 *   - UPDATE both orders' filled_qty / status / avg_fill_price / fee
 *   - UPSERT both users' positions (open / increase / reduce / flip / close)
 *   - Settle wallets:
 *       * locked margin moves with the position (no balance change),
 *       * any unfilled remainder of a market order is REFUNDED,
 *       * any released margin from reducing/closing returns to balance,
 *       * realized PnL credits/debits balance net of fees.
 */
async function applyFills(taker: any, match: any, pair: ResolvedPair): Promise<any> {
  // Pre-load VIP tiers for all involved users (outside the tx to avoid long-lived reads).
  const allUserIds = Array.from(new Set<number>([
    Number(taker.userId),
    ...match.trades.map((t: any) => Number(t.makerUserId)),
  ]));
  const userVipRows = await db.select({ id: usersTable.id, vipTier: usersTable.vipTier })
    .from(usersTable).where(inArray(usersTable.id, allUserIds));
  const vipByUser = new Map<number, number>(userVipRows.map((u: any) => [Number(u.id), Number(u.vipTier ?? 0)]));

  // Pre-load futures fee rates for each unique VIP tier.
  const uniqueVips = Array.from(new Set(Array.from(vipByUser.values())));
  const ratesByVip = new Map<number, { maker: number; taker: number }>();
  for (const vip of uniqueVips) {
    ratesByVip.set(vip, await getFuturesFeeRates(vip));
  }
  const defaultRates = { maker: pair.makerFeeRate, taker: pair.takerFeeRate };

  return await db.transaction(async (tx) => {
    // Lookup all maker order rows in one shot.
    const makerIds: number[] = Array.from(new Set(match.trades.map((t: any) => Number(t.makerOrderId))));
    const makers = makerIds.length > 0
      ? await tx.select().from(futuresOrdersTable).where(inArray(futuresOrdersTable.id, makerIds)).for("update")
      : [];
    const makerById = new Map<number, any>(makers.map((m: any) => [m.id, m]));

    let takerFilledTotal = Number(taker.filledQty ?? 0);
    let takerNotional = Number(taker.avgFillPrice ?? 0) * takerFilledTotal;
    let takerFeeTotal = Number(taker.fee ?? 0);
    let lastTakerPosId: number | null = null;

    // Per-fill, the order's proportional pre-lock = (fillQty / origQty) * marginLocked.
    // We release that pre-lock and then re-lock the actual position margin (open/increase)
    // or release the closed position's margin (reduce/close). This keeps wallet.locked
    // exactly equal to sum(open positions' marginAmount) and avoids leaks.
    const takerOrigQty = Number(taker.qty);
    const takerOrderLock = Number(taker.marginLocked ?? 0);
    const takerLockPerUnit = takerOrigQty > 0 ? takerOrderLock / takerOrigQty : 0;

    for (const tr of match.trades as any[]) {
      const fillQty = Number(tr.qty);
      const fillPrice = Number(tr.price);
      const maker = makerById.get(Number(tr.makerOrderId));
      if (!maker) continue;

      // Per-fill fees using VIP-tier-adjusted rates (GST-inclusive).
      // Bots use 0 fee (handled inside applyFillToPosition via isBot flag).
      const tradeNotional = fillPrice * fillQty;
      const takerVip = vipByUser.get(Number(tr.takerUserId)) ?? 0;
      const makerVip = vipByUser.get(Number(tr.makerUserId)) ?? 0;
      const takerFeeRates = ratesByVip.get(takerVip) ?? defaultRates;
      const makerFeeRates = ratesByVip.get(makerVip) ?? defaultRates;
      const tradeTakerFee = tradeNotional * takerFeeRates.taker;
      const tradeMakerFee = tradeNotional * makerFeeRates.maker;

      // Persist the trade itself.
      await tx.insert(futuresTradesTable).values({
        pairId: pair.id,
        takerOrderId: taker.id,
        makerOrderId: maker.id,
        takerUserId: Number(tr.takerUserId),
        makerUserId: Number(tr.makerUserId),
        takerSide: tr.takerSide,
        price: String(fillPrice),
        qty: String(fillQty),
        takerFee: String(tradeTakerFee),
        makerFee: String(tradeMakerFee),
      });

      // Apply fill to the taker's position.
      const takerCtx: FillCtx = {
        pair, userId: Number(tr.takerUserId),
        fillPrice, fillQty,
        orderSide: tr.takerSide as "buy" | "sell",
        leverage: Number(taker.leverage),
        isMaker: false,
        isBot: Boolean(tr.takerIsBot),
      };
      const takerEffect = await applyFillToPosition(tx, takerCtx);
      lastTakerPosId = takerEffect.positionId;
      // 1) Release this fill's share of the taker order's pre-lock.
      //    (Bots have no wallet so skip.)
      const takerPreLockRelease = Boolean(tr.takerIsBot) ? 0 : takerLockPerUnit * fillQty;
      if (takerPreLockRelease > 0) {
        await releaseMargin(tx, Number(tr.takerUserId), pair.quoteCoinId, takerPreLockRelease);
      }
      // 2) Lock the actual position margin needed for OPEN / INCREASE / FLIP-open.
      if (takerEffect.marginToLock > 0) {
        await lockMargin(tx, Number(tr.takerUserId), pair.quoteCoinId, takerEffect.marginToLock);
      }
      // 3) Release the closed/reduced portion of the position's prior margin.
      if (takerEffect.marginToRelease > 0) {
        await releaseMargin(tx, Number(tr.takerUserId), pair.quoteCoinId, takerEffect.marginToRelease);
      }
      // 4) Apply realized PnL and trading fee against free balance.
      if (takerEffect.realizedPnl !== 0 || takerEffect.fee !== 0) {
        await applyPnl(tx, Number(tr.takerUserId), pair.quoteCoinId, takerEffect.realizedPnl, takerEffect.fee);
      }

      // Apply fill to the maker's position. Maker's order also pre-locked
      // its margin at placement, so it's symmetric to the taker path.
      const makerCtx: FillCtx = {
        pair, userId: Number(tr.makerUserId),
        fillPrice, fillQty,
        orderSide: maker.side as "buy" | "sell",
        leverage: Number(maker.leverage),
        isMaker: true,
        isBot: Boolean(tr.makerIsBot),
      };
      const makerEffect = await applyFillToPosition(tx, makerCtx);
      // Same symmetric pre-lock release / position re-lock pattern as taker.
      const makerOrigQty = Number(maker.qty);
      const makerOrderLock = Number(maker.marginLocked ?? 0);
      const makerLockPerUnit = makerOrigQty > 0 ? makerOrderLock / makerOrigQty : 0;
      const makerPreLockRelease = Boolean(tr.makerIsBot) ? 0 : makerLockPerUnit * fillQty;
      if (makerPreLockRelease > 0) {
        await releaseMargin(tx, Number(tr.makerUserId), pair.quoteCoinId, makerPreLockRelease);
      }
      if (makerEffect.marginToLock > 0) {
        await lockMargin(tx, Number(tr.makerUserId), pair.quoteCoinId, makerEffect.marginToLock);
      }
      if (makerEffect.marginToRelease > 0) {
        await releaseMargin(tx, Number(tr.makerUserId), pair.quoteCoinId, makerEffect.marginToRelease);
      }
      if (makerEffect.realizedPnl !== 0 || makerEffect.fee !== 0) {
        await applyPnl(tx, Number(tr.makerUserId), pair.quoteCoinId, makerEffect.realizedPnl, makerEffect.fee);
      }

      // Bump maker order progress.
      const makerNewFilled = Number(maker.filledQty) + fillQty;
      const makerNotional = Number(maker.avgFillPrice) * Number(maker.filledQty) + fillPrice * fillQty;
      const makerNewAvg = makerNewFilled > 0 ? makerNotional / makerNewFilled : 0;
      const makerNewStatus = makerNewFilled + 1e-12 >= Number(maker.qty) ? "FILLED" : "PARTIAL";
      await tx.update(futuresOrdersTable).set({
        filledQty: String(makerNewFilled),
        avgFillPrice: String(makerNewAvg),
        status: makerNewStatus,
        positionId: makerEffect.positionId,
        fee: sql`${futuresOrdersTable.fee} + ${makerEffect.fee}`,
        updatedAt: new Date(),
      }).where(eq(futuresOrdersTable.id, maker.id));
      // Keep the in-memory copy in sync so subsequent trades use fresh data.
      maker.filledQty = String(makerNewFilled);
      maker.avgFillPrice = String(makerNewAvg);
      maker.status = makerNewStatus;

      takerFilledTotal += fillQty;
      takerNotional += fillPrice * fillQty;
      takerFeeTotal += takerEffect.fee;
    }

    // Propagate SL/TP from the taker order to the resulting position.
    // This ensures the futures-engine risk tick can trigger SL/TP correctly.
    if (lastTakerPosId && (taker.stopLoss || taker.takeProfit)) {
      const slUpdate: Record<string, unknown> = { updatedAt: new Date() };
      if (taker.stopLoss) slUpdate.stopLoss = String(taker.stopLoss);
      if (taker.takeProfit) slUpdate.takeProfit = String(taker.takeProfit);
      await tx.update(futuresPositionsTable).set(slUpdate)
        .where(eq(futuresPositionsTable.id, lastTakerPosId));
    }

    // Final taker order update.
    const takerAvg = takerFilledTotal > 0 ? takerNotional / takerFilledTotal : 0;
    const takerStatus =
      takerFilledTotal + 1e-12 >= Number(taker.qty) ? "FILLED" :
      Number(match.remaining ?? 0) > 0 && taker.type === "limit" ? "PARTIAL" :
      takerFilledTotal > 0 && taker.type === "market" ? "PARTIAL" :
      "OPEN";

    // For market orders, refund margin on the unfilled remainder.
    const takerRefund = (() => {
      if (taker.type !== "market") return 0;
      const refundQty = Number(taker.qty) - takerFilledTotal;
      if (refundQty <= 0) return 0;
      const refPrice = Number(taker.price ?? 0) > 0 ? Number(taker.price) : pair.lastPrice;
      if (!(refPrice > 0)) return 0;
      return (refundQty * refPrice) / Number(taker.leverage);
    })();
    if (takerRefund > 0) {
      await releaseMargin(tx, Number(taker.userId), pair.quoteCoinId, takerRefund);
    }

    const positionIdForTaker = match.trades[match.trades.length - 1] ? undefined : taker.positionId;

    const [updated] = await tx.update(futuresOrdersTable).set({
      filledQty: String(takerFilledTotal),
      avgFillPrice: String(takerAvg),
      status: takerStatus,
      fee: String(takerFeeTotal),
      positionId: positionIdForTaker ?? taker.positionId,
      updatedAt: new Date(),
    }).where(eq(futuresOrdersTable.id, taker.id)).returning();
    return updated;
  });
}

// ── GET /futures/order ────────────────────────────────────────────────
r.get("/futures/order", bicryptoAuth, async (req: any, res: Response): Promise<void> => {
  const u = req.bcUser;
  const currency = String(req.query.currency || "");
  const pairSym = String(req.query.pair || "");
  const status = req.query.status ? String(req.query.status).toUpperCase() : null;
  // SECURITY: same defence-in-depth as spot — never surface bot rows in a
  // user's personal futures order list, regardless of which user_id the bot
  // currently runs under. Bot futures rows remain visible via admin endpoints.
  const conds = [eq(futuresOrdersTable.userId, u.id), eq(futuresOrdersTable.isBot, 0)];
  let pair: ResolvedPair | null = null;
  if (currency && pairSym) {
    pair = await resolvePair(currency, pairSym);
    if (!pair) { res.json({ data: [] }); return; }
    conds.push(eq(futuresOrdersTable.pairId, pair.id));
  }
  if (status === "OPEN") {
    conds.push(or(eq(futuresOrdersTable.status, "OPEN"), eq(futuresOrdersTable.status, "PARTIAL"))!);
  } else if (status === "CLOSED" || status === "FILLED" || status === "CANCELLED" || status === "REJECTED") {
    conds.push(eq(futuresOrdersTable.status, status === "CLOSED" ? "FILLED" : status));
  }
  const rows = await db.select().from(futuresOrdersTable).where(and(...conds)).orderBy(desc(futuresOrdersTable.createdAt)).limit(200);

  if (rows.length === 0) { res.json({ data: [] }); return; }

  // Resolve pairs per row when no symbol filter was passed.
  if (!pair) {
    const pairIds = Array.from(new Set(rows.map((r) => r.pairId)));
    const pairs = await db.select().from(pairsTable).where(inArray(pairsTable.id, pairIds));
    const coinIds = Array.from(new Set(pairs.flatMap((p: any) => [p.baseCoinId, p.quoteCoinId])));
    const coins = await db.select().from(coinsTable).where(inArray(coinsTable.id, coinIds));
    const coinById = new Map<number, any>(coins.map((c) => [c.id, c]));
    const pairById = new Map<number, ResolvedPair>(pairs.map((p: any) => [p.id, {
      id: p.id,
      baseSymbol: coinById.get(p.baseCoinId)?.symbol || "",
      quoteSymbol: coinById.get(p.quoteCoinId)?.symbol || "",
      baseCoinId: p.baseCoinId, quoteCoinId: p.quoteCoinId,
      pricePrecision: Number(p.pricePrecision ?? 2),
      qtyPrecision: Number(p.qtyPrecision ?? 4),
      minQty: Number(p.minQty ?? 0), maxLeverage: Number(p.maxLeverage ?? 100),
      mmRate: Number(p.mmRate ?? 0.005),
      takerFeeRate: Number(p.takerFeeRate ?? 0.0006),
      makerFeeRate: Number(p.makerFeeRate ?? 0.0002),
      futuresEnabled: Boolean(p.futuresEnabled),
      futuresStartAt: p.futuresStartAt ?? null,
      lastPrice: Number(p.lastPrice ?? 0),
    }]));
    res.json({ data: rows.map((r) => orderToFlutter(r, pairById.get(r.pairId)!)).filter(Boolean) });
    return;
  }
  res.json({ data: rows.map((r) => orderToFlutter(r, pair!)) });
});

// ── DELETE /futures/order/:id ─────────────────────────────────────────
r.delete("/futures/order/:id", bicryptoAuth, async (req: any, res: Response): Promise<void> => {
  const u = req.bcUser;
  const idParam = String(req.params.id);
  // Accept either numeric id or uid.
  const numericId = /^\d+$/.test(idParam) ? Number(idParam) : null;
  let row: any;
  if (numericId !== null) {
    [row] = await db.select().from(futuresOrdersTable).where(and(
      eq(futuresOrdersTable.id, numericId),
      eq(futuresOrdersTable.userId, u.id),
    )).limit(1);
  } else {
    [row] = await db.select().from(futuresOrdersTable).where(and(
      eq(futuresOrdersTable.uid, idParam),
      eq(futuresOrdersTable.userId, u.id),
    )).limit(1);
  }
  if (!row) { res.status(404).json({ message: "Order not found" }); return; }
  if (row.status === "FILLED" || row.status === "CANCELLED" || row.status === "REJECTED") {
    res.status(400).json({ message: `Cannot cancel — status is ${row.status}` }); return;
  }
  const pair = await db.select().from(pairsTable).where(eq(pairsTable.id, row.pairId)).limit(1).then((r) => r[0]);
  if (!pair) { res.status(500).json({ message: "Pair missing" }); return; }

  // Step 1: yank it out of the Go book so no NEW fills can arrive after this.
  // applyFills() that's already mid-flight will still complete and update the
  // row — we'll observe the up-to-date filledQty under the FOR UPDATE below.
  try { await goRpc("/internal/futures/cancel", { pairId: row.pairId, orderId: row.id }, 2000); } catch {}

  // Step 2: lock the order row, re-read fresh filledQty, refund only the
  // *unfilled* pre-lock share, then status-guard the cancel. This is the
  // critical race fix: any in-flight fill tx that already released pre-lock
  // for filled units will have updated row.filledQty before we get the lock.
  const updated = await db.transaction(async (tx) => {
    const [fresh] = await tx.select().from(futuresOrdersTable)
      .where(eq(futuresOrdersTable.id, row.id))
      .for("update").limit(1);
    if (!fresh) return null;
    if (fresh.status !== "OPEN" && fresh.status !== "PARTIAL") {
      // Someone (matcher / liquidator) already terminated it — no-op.
      return fresh;
    }
    const filled = Number(fresh.filledQty);
    const total = Number(fresh.qty);
    const unfilled = Math.max(0, total - filled);
    const refund = total > 0 ? (Number(fresh.marginLocked) * unfilled) / total : 0;
    if (refund > 0) await releaseMargin(tx, u.id, pair.quoteCoinId, refund);
    const [u2] = await tx.update(futuresOrdersTable).set({
      status: "CANCELLED", updatedAt: new Date(),
    }).where(and(
      eq(futuresOrdersTable.id, row.id),
      eq(futuresOrdersTable.status, fresh.status),     // <-- belt + suspenders
    )).returning();
    return u2 ?? fresh;
  });
  if (!updated) { res.status(404).json({ message: "Order not found" }); return; }

  // Look up coin symbols for response shape.
  const coins = await db.select().from(coinsTable).where(inArray(coinsTable.id, [pair.baseCoinId, pair.quoteCoinId]));
  const cMap = new Map<number, any>(coins.map((c) => [c.id, c]));
  const resolved: ResolvedPair = {
    id: pair.id,
    baseSymbol: cMap.get(pair.baseCoinId)?.symbol || "",
    quoteSymbol: cMap.get(pair.quoteCoinId)?.symbol || "",
    baseCoinId: pair.baseCoinId, quoteCoinId: pair.quoteCoinId,
    pricePrecision: Number(pair.pricePrecision ?? 2),
    qtyPrecision: Number(pair.qtyPrecision ?? 4),
    minQty: Number(pair.minQty ?? 0), maxLeverage: Number(pair.maxLeverage ?? 100),
    mmRate: Number(pair.mmRate ?? 0.005),
    takerFeeRate: Number(pair.takerFee ?? 0.0006),
    makerFeeRate: Number(pair.makerFee ?? 0.0002),
    futuresEnabled: Boolean(pair.futuresEnabled),
    futuresStartAt: pair.futuresStartAt ?? null,
    lastPrice: Number(pair.lastPrice ?? 0),
  };
  res.json(orderToFlutter(updated, resolved));
});

// ── GET /futures/position ─────────────────────────────────────────────
r.get("/futures/position", bicryptoAuth, async (req: any, res: Response): Promise<void> => {
  const u = req.bcUser;
  const currency = String(req.query.currency || "");
  const pairSym = String(req.query.pair || "");
  const conds = [eq(futuresPositionsTable.userId, u.id), eq(futuresPositionsTable.status, "open")];
  let pair: ResolvedPair | null = null;
  if (currency && pairSym) {
    pair = await resolvePair(currency, pairSym);
    if (!pair) { res.json({ data: [] }); return; }
    conds.push(eq(futuresPositionsTable.pairId, pair.id));
  }
  const rows = await db.select().from(futuresPositionsTable).where(and(...conds)).orderBy(desc(futuresPositionsTable.openedAt)).limit(200);
  if (rows.length === 0) { res.json({ data: [] }); return; }

  // Resolve pairs for symbol display + mark price.
  if (!pair) {
    const pairIds = Array.from(new Set(rows.map((r) => r.pairId)));
    const pairs = await db.select().from(pairsTable).where(inArray(pairsTable.id, pairIds));
    const coinIds = Array.from(new Set(pairs.flatMap((p: any) => [p.baseCoinId, p.quoteCoinId])));
    const coins = await db.select().from(coinsTable).where(inArray(coinsTable.id, coinIds));
    const coinById = new Map<number, any>(coins.map((c) => [c.id, c]));
    const pairById = new Map<number, ResolvedPair>();
    for (const p of pairs as any[]) {
      pairById.set(p.id, {
        id: p.id,
        baseSymbol: coinById.get(p.baseCoinId)?.symbol || "",
        quoteSymbol: coinById.get(p.quoteCoinId)?.symbol || "",
        baseCoinId: p.baseCoinId, quoteCoinId: p.quoteCoinId,
        pricePrecision: Number(p.pricePrecision ?? 2),
        qtyPrecision: Number(p.qtyPrecision ?? 4),
        minQty: Number(p.minQty ?? 0), maxLeverage: Number(p.maxLeverage ?? 100),
        mmRate: Number(p.mmRate ?? 0.005),
        takerFeeRate: Number(p.takerFeeRate ?? 0.0006),
        makerFeeRate: Number(p.makerFeeRate ?? 0.0002),
        futuresEnabled: Boolean(p.futuresEnabled),
        futuresStartAt: p.futuresStartAt ?? null,
        lastPrice: Number(p.lastPrice ?? 0),
      });
    }
    res.json({ data: rows.flatMap((r) => {
      const p = pairById.get(r.pairId);
      if (!p) return [];
      return [positionToFlutter(r, p, p.lastPrice ?? Number(r.markPrice))];
    }) });
    return;
  }
  res.json({ data: rows.map((r) => positionToFlutter(r, pair!, pair!.lastPrice || Number(r.markPrice))) });
});

// ── PATCH /futures/position/:id/sltp ─────────────────────────────────
// Update Stop Loss / Take Profit on an existing open position.
r.patch("/futures/position/:id/sltp", bicryptoAuth, async (req: any, res: Response): Promise<void> => {
  const u = req.bcUser;
  const idParam = String(req.params.id);
  const b = req.body ?? {};
  const numId = /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [pos] = numId !== null
    ? await db.select().from(futuresPositionsTable).where(and(eq(futuresPositionsTable.id, numId), eq(futuresPositionsTable.userId, u.id), eq(futuresPositionsTable.status, "open"))).limit(1)
    : await db.select().from(futuresPositionsTable).where(and(eq(futuresPositionsTable.uid, idParam), eq(futuresPositionsTable.userId, u.id), eq(futuresPositionsTable.status, "open"))).limit(1);
  if (!pos) { res.status(404).json({ message: "Open position not found" }); return; }

  const upd: Record<string, unknown> = {};
  // Accept explicit null to CLEAR an existing SL/TP.
  if ("stopLossPrice" in b) {
    upd.stopLoss = b.stopLossPrice != null ? String(Number(b.stopLossPrice)) : null;
  }
  if ("takeProfitPrice" in b) {
    upd.takeProfit = b.takeProfitPrice != null ? String(Number(b.takeProfitPrice)) : null;
  }
  if (Object.keys(upd).length === 0) {
    res.status(400).json({ message: "stopLossPrice or takeProfitPrice required" }); return;
  }

  const [updated] = await db.update(futuresPositionsTable)
    .set(upd)
    .where(and(eq(futuresPositionsTable.id, pos.id), eq(futuresPositionsTable.status, "open")))
    .returning();
  if (!updated) { res.status(409).json({ message: "Position no longer open" }); return; }

  res.json({ ok: true, stopLoss: updated.stopLoss, takeProfit: updated.takeProfit });
});

// ── DELETE /futures/position ──────────────────────────────────────────
r.delete("/futures/position", bicryptoAuth, async (req: any, res: Response): Promise<void> => {
  const u = req.bcUser;
  const b = req.body ?? {};
  const currency = String(b.currency || "");
  const pairSym = String(b.pair || "");
  const sideArg = String(b.side || "").toLowerCase();
  if (!currency || !pairSym) { res.status(400).json({ message: "currency and pair required" }); return; }
  const pair = await resolvePair(currency, pairSym);
  if (!pair) { res.status(404).json({ message: "Pair not found" }); return; }
  const sideFilter = sideArg === "long" || sideArg === "short" ? sideArg : null;

  const conds = [
    eq(futuresPositionsTable.userId, u.id),
    eq(futuresPositionsTable.pairId, pair.id),
    eq(futuresPositionsTable.status, "open"),
  ];
  if (sideFilter) conds.push(eq(futuresPositionsTable.side, sideFilter));
  const [pos] = await db.select().from(futuresPositionsTable).where(and(...conds)).limit(1);
  if (!pos) { res.status(404).json({ message: "Open position not found" }); return; }

  // Close at current mark price by sending a market order in the opposite
  // direction. This routes through the matching engine like any other trade,
  // so PnL/fees/wallets are settled by applyFills().
  const closeSide: "buy" | "sell" = pos.side === "long" ? "sell" : "buy";
  const refPrice = pair.lastPrice;
  if (!(refPrice > 0)) { res.status(400).json({ message: "Mark price unavailable" }); return; }
  const qty = Number(pos.qty);
  const marginToLock = (qty * refPrice) / Number(pos.leverage);

  let orderRow: any;
  let actualLocked = 0;
  try {
    orderRow = await db.transaction(async (tx) => {
      // Try to lock collateral for adverse fills. If the user is fully
      // drained, fall through with actualLocked=0 (the order's recorded
      // marginLocked must match what we actually locked, otherwise applyFills
      // would over-release on fill — see takerLockPerUnit math).
      try {
        await lockMargin(tx, u.id, pair.quoteCoinId, marginToLock);
        actualLocked = marginToLock;
      } catch (_e) {
        actualLocked = 0;
      }
      const [o] = await tx.insert(futuresOrdersTable).values({
        userId: u.id, pairId: pair.id,
        side: closeSide, type: "market",
        price: null, qty: String(qty),
        leverage: Number(pos.leverage), marginType: "isolated",
        marginLocked: String(actualLocked),       // <- record what we ACTUALLY locked
        reduceOnly: true,
        status: "OPEN",
      }).returning();
      return o;
    });
  } catch (e: any) {
    res.status(500).json({ message: e?.message || "close failed" }); return;
  }

  let match: any;
  try {
    match = await goRpc("/internal/futures/place", {
      orderId: orderRow.id, userId: u.id, pairId: pair.id,
      side: closeSide, type: "market", price: 0, qty, isBot: false,
    });
  } catch (e: any) {
    // Go service unavailable — keep close order OPEN so it fills when engine returns.
    logger.warn({ err: String(e) }, "futures matching engine unreachable — close order resting as OPEN");
    match = { trades: [], status: "OPEN" };
  }

  if (Array.isArray(match?.trades) && match.trades.length > 0) {
    const closedOrder = await applyFills(orderRow, match, pair);
    // 5-level futures trading-fee referral commission on close (fire-and-forget)
    const closeFeeAmt = parseFloat(closedOrder?.fee ?? "0");
    if (closeFeeAmt > 0) {
      creditTradingFeeReferralChain(u.id, closeFeeAmt, pair.quoteCoinId, "futures_fee")
        .catch(() => null);
    }
  } else {
    // No counterparty available — refund and report.
    await db.transaction(async (tx) => {
      if (actualLocked > 0) await releaseMargin(tx, u.id, pair.quoteCoinId, actualLocked);
      await tx.update(futuresOrdersTable).set({ status: "REJECTED", updatedAt: new Date() })
        .where(eq(futuresOrdersTable.id, orderRow.id));
    });
    res.status(400).json({ message: "No liquidity to close at market" }); return;
  }

  // Re-read the (now updated) position to return current state to the client.
  const [after] = await db.select().from(futuresPositionsTable).where(eq(futuresPositionsTable.id, pos.id)).limit(1);
  res.json(positionToFlutter(after ?? pos, pair, pair.lastPrice || Number((after ?? pos).markPrice)));
});

// ── PUT/POST /futures/leverage ────────────────────────────────────────
const setLeverage = async (req: any, res: Response): Promise<void> => {
  const u = req.bcUser;
  const b = req.body ?? {};
  const currency = String(b.currency || "");
  const pairSym = String(b.pair || "");
  const lev = Math.max(1, Math.min(125, Number(b.leverage ?? 10)));
  if (!currency || !pairSym) { res.status(400).json({ message: "currency and pair required" }); return; }
  const pair = await resolvePair(currency, pairSym);
  if (!pair) { res.status(404).json({ message: "Pair not found" }); return; }
  if (lev > pair.maxLeverage) { res.status(400).json({ message: `Max leverage is ${pair.maxLeverage}x` }); return; }

  // Find any open position to reflect the new leverage in the response. If
  // there isn't one, we still echo the chosen leverage so the UI stores it.
  const [pos] = await db.select().from(futuresPositionsTable).where(and(
    eq(futuresPositionsTable.userId, u.id),
    eq(futuresPositionsTable.pairId, pair.id),
    eq(futuresPositionsTable.status, "open"),
  )).limit(1);

  if (pos) {
    // Recompute liq price under the new leverage; margin stays put because
    // we charge no extra collateral for a higher leverage on an open
    // position (matches Bicrypto's behaviour).
    const newLiq = calcLiqPrice(pos.side as any, Number(pos.entryPrice), Number(pos.qty), Number(pos.marginAmount), pair.mmRate);
    await db.update(futuresPositionsTable).set({
      leverage: lev, liquidationPrice: String(newLiq),
    }).where(eq(futuresPositionsTable.id, pos.id));
    const [after] = await db.select().from(futuresPositionsTable).where(eq(futuresPositionsTable.id, pos.id)).limit(1);
    res.json(positionToFlutter(after, pair, pair.lastPrice || Number(after.markPrice)));
    return;
  }

  // No open position — return a synthetic shape so the UI can persist its
  // chosen leverage for the next order.
  res.json({
    id: `lev-${pair.id}`,
    referenceId: String(pair.id),
    symbol: `${pair.baseSymbol}/${pair.quoteSymbol}`,
    currency: pair.baseSymbol, pair: pair.quoteSymbol,
    side: "LONG", amount: 0,
    entryPrice: 0, markPrice: pair.lastPrice,
    leverage: lev, margin: 0,
    marginType: "isolated",
    unrealisedPnl: 0, unrealizedPnl: 0,
    realizedPnl: 0,
    liquidationPrice: 0,
    status: "OPEN",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    closedAt: null,
  });
};
r.put("/futures/leverage", bicryptoAuth, setLeverage);
r.post("/futures/leverage", bicryptoAuth, setLeverage);

// ── POST /futures/position ────────────────────────────────────────────
// Some Flutter screens call POST /futures/position with the same body shape
// as POST /futures/order. Forward to the order handler so behaviour is
// identical (one source of truth).
r.post("/futures/position", bicryptoAuth, (req, res, next) => {
  // Re-route to /futures/order — express doesn't expose a clean rerun, so
  // we re-dispatch via the router's match table.
  req.url = "/futures/order";
  next("route");
}, (req, res) => {
  // Should never reach here — express skips to next matching route.
  res.status(500).json({ message: "internal routing error" });
});

// ── Boot helper: re-seed Go's in-memory book from OPEN/PARTIAL limit orders
export async function restoreBooksOnBoot(): Promise<void> {
  try {
    const rows = await db.select().from(futuresOrdersTable).where(and(
      eq(futuresOrdersTable.type, "limit"),
      or(eq(futuresOrdersTable.status, "OPEN"), eq(futuresOrdersTable.status, "PARTIAL"))!,
    ));
    if (rows.length === 0) {
      logger.info("[futures] no open orders to restore");
      return;
    }
    const byPair = new Map<number, any[]>();
    for (const r of rows) {
      const remaining = Number(r.qty) - Number(r.filledQty);
      if (remaining <= 0) continue;
      const arr = byPair.get(r.pairId) || [];
      arr.push({
        id: r.id, userId: r.userId, side: r.side,
        price: Number(r.price ?? 0), qty: remaining,
        isBot: r.isBot === 1, ts: 0,
      });
      byPair.set(r.pairId, arr);
    }
    let total = 0;
    for (const [pairId, orders] of byPair) {
      try {
        // reset:true wipes the pair's book before re-seeding so reboots are
        // idempotent even when the Go process out-lives the Node process.
        await goRpc("/internal/futures/seed", { pairId, orders, reset: true }, 5000);
        total += orders.length;
      } catch (e: any) {
        logger.warn({ pairId, err: String(e) }, "[futures] book restore failed");
      }
    }
    logger.info(`[futures] restored ${total} orders into ${byPair.size} pair books`);
  } catch (e: any) {
    logger.warn({ err: String(e) }, "[futures] restoreBooksOnBoot failed");
  }
}

// ── GET /futures/positions/:id/invoice ────────────────────────────────────
r.get("/futures/positions/:id/invoice", bicryptoAuth, async (req: any, res: Response): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid position id" }); return; }
  const u = req.bcUser;

  const [pos] = await db.select().from(futuresPositionsTable)
    .where(and(eq(futuresPositionsTable.id, id), eq(futuresPositionsTable.userId, u.id))).limit(1);
  if (!pos) { res.status(404).json({ error: "Position not found" }); return; }

  const [pair] = await db.select().from(pairsTable).where(eq(pairsTable.id, pos.pairId)).limit(1);
  let symbol = `POS-${id}`;
  if (pair) {
    const [base] = await db.select().from(coinsTable).where(eq(coinsTable.id, (pair as any).baseCoinId)).limit(1);
    const [quote] = await db.select().from(coinsTable).where(eq(coinsTable.id, (pair as any).quoteCoinId)).limit(1);
    if (base && quote) symbol = `${(base as any).symbol}${(quote as any).symbol}`;
  }

  const qty        = Number(pos.qty ?? 0);
  const entryPrice = Number(pos.entryPrice ?? 0);
  const markPrice  = Number(pos.markPrice ?? entryPrice);
  const leverage   = Number(pos.leverage ?? 1);
  const margin     = Number(pos.marginAmount ?? 0);
  const realizedPnl = Number((pos as any).realizedPnl ?? 0);
  const TAKER_FEE  = 0.0006; // 0.06% each side
  const openNotional  = qty * entryPrice;
  const closeNotional = qty * markPrice;
  const feeUsdt    = +((openNotional + closeNotional) * TAKER_FEE).toFixed(8);
  const netPnlUsdt = +(realizedPnl - feeUsdt).toFixed(8);

  const inrRate = getInrRate();
  const toInr   = (v: number) => +(v * inrRate).toFixed(2);
  const iso     = (d: any) => d instanceof Date ? d.toISOString() : (d ?? null);

  res.json({
    invoiceNo: `FUT-${String(pos.id).padStart(8, "0")}`,
    issuedAt:  new Date().toISOString(),
    type:      "futures_position",
    exchange: {
      name:    "Zebvix Exchange",
      short:   "ZBX",
      legal:   "Zebvix Exchange — Futures Position Settlement Invoice",
      cin:     "U74999KA2020PTC123456",
      address: "Bangalore, India",
    },
    user: { id: u.id, name: u.name ?? u.email ?? "Customer", email: u.email ?? "" },
    position: {
      id: pos.id, symbol,
      side:        pos.side,
      qty,         leverage,
      entryPrice,  markPrice,
      margin,      status: pos.status,
      openedAt:    iso((pos as any).openedAt ?? (pos as any).createdAt),
      closedAt:    iso((pos as any).closedAt),
      closeReason: (pos as any).closeReason ?? null,
    },
    charges: { feeRatePct: TAKER_FEE * 100, feeNote: "Taker fee on open + close notional" },
    totals: {
      openNotionalUsdt:  +openNotional.toFixed(4),
      closeNotionalUsdt: +closeNotional.toFixed(4),
      marginUsdt:        +margin.toFixed(4),
      grossPnlUsdt:      +realizedPnl.toFixed(4),
      feeUsdt:           +feeUsdt.toFixed(4),
      netPnlUsdt,
      openNotionalInr:   toInr(openNotional),
      marginInr:         toInr(margin),
      grossPnlInr:       toInr(realizedPnl),
      feeInr:            toInr(feeUsdt),
      netPnlInr:         toInr(netPnlUsdt),
      inrRate,
    },
    legend: realizedPnl >= 0
      ? "Net P&L = Gross P&L − Taker Fee (profit)"
      : "Net P&L = Gross P&L − Taker Fee (loss)",
  });
});

export default r;
