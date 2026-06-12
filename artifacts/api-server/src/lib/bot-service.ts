import { db, marketBotsTable, ordersTable, pairsTable, coinsTable, tradesTable, usersTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { logger } from "./logger";
import { getRawTick } from "./price-service";
import { rZadd, rZrem, rSet, rDel, rLpush, rPublish } from "./redis";
import { tryMatch } from "./matching-engine";

// Mirror an order to Redis ZSET orderbook (same shape used by /api/orders)
async function bookAdd(symbol: string, o: any) {
  if (o.status !== "open" || o.type !== "limit") return;
  const score = (o.side === "buy" ? -1 : 1) * Number(o.price);
  const member = JSON.stringify({
    id: o.id, userId: o.userId, side: o.side, type: o.type,
    price: Number(o.price), qty: Number(o.qty), filledQty: Number(o.filledQty ?? 0),
    status: o.status, ts: Date.now(), bot: true,
  });
  await rZadd(`orderbook:${symbol}:${o.side}`, score, String(o.id));
  await rSet(`orderbook:${symbol}:order:${o.id}`, member, 86400);
  await rPublish(`orders.${symbol}`, { action: "new", order: JSON.parse(member) });
}

async function bookRemove(symbol: string, o: { id: number; side: string; userId?: number; price?: any; qty?: any; type?: string; filledQty?: any; status?: string }, action: "cancel" | "fill" = "cancel") {
  await rZrem(`orderbook:${symbol}:${o.side}`, String(o.id));
  await rDel(`orderbook:${symbol}:order:${o.id}`);
  const payload = {
    action,
    order: {
      id: o.id, userId: o.userId, side: o.side, type: o.type ?? "limit",
      price: Number(o.price ?? 0), qty: Number(o.qty ?? 0),
      filledQty: Number(o.filledQty ?? 0), status: o.status ?? action,
      ts: Date.now(), bot: true,
    },
  };
  await rPublish(`orders.${symbol}`, payload);
}

let started = false;
let ticking = false;
let botUserId: number | null = null;

async function getBotUserId(): Promise<number | null> {
  if (botUserId) return botUserId;
  const admins = await db.select().from(usersTable).where(sql`${usersTable.role} IN ('admin','superadmin')`).limit(1);
  if (!admins[0]) return null;
  botUserId = admins[0].id;
  return botUserId;
}

// ─── INDEX PRICE (authoritative external reference) ─────────────────────────
//
// "Index price" = external market price from CoinGecko / Binance via price-service.
// It is NEVER sourced from pair.lastPrice (which is written by the matching engine
// on every fill and can drift when local trades happen at off-feed prices).
// We use getRawTick() — the non-jittered cache — so UI display jitter (±0.03%)
// cannot pollute bot pricing or spread calculations.
//
// Quote-currency routing:
//   BTC/INR  → bTick.inr  (direct, no division needed, full INR precision)
//   BTC/USDT → bTick.usdt (direct)
//   BTC/BNB  → bTick.usdt / qTick.usdt  (cross-rate via USDT)
//
function indexPriceForPair(pair: { _baseSymbol: string; _quoteSymbol: string }): number {
  const bTick = getRawTick(pair._baseSymbol);
  if (!bTick || bTick.usdt <= 0) return 0;
  const q = pair._quoteSymbol.toUpperCase();
  if (q === "INR")  return bTick.inr;   // e.g. BTC/INR → ₹7,500,000
  if (q === "USDT") return bTick.usdt;  // e.g. BTC/USDT → $95,000
  // Cross-rate: base/quote = base.usdt / quote.usdt
  const qTick = getRawTick(pair._quoteSymbol);
  if (!qTick || qTick.usdt <= 0) return 0;
  return bTick.usdt / qTick.usdt;
}

// Round order price to a sensible tick size based on magnitude.
// Avoids 8-decimal-place noise on large INR prices (₹7,500,000.12345678).
function roundPrice(price: number): string {
  if (price >= 1_000_000) return price.toFixed(1);   // BTC/INR ₹7,500,000.0
  if (price >= 10_000)    return price.toFixed(2);   // ETH/INR  ₹220,000.00
  if (price >= 100)       return price.toFixed(3);   // BNB ₹38,000.000
  if (price >= 1)         return price.toFixed(4);   // mid-range tokens
  if (price >= 0.001)     return price.toFixed(6);
  return price.toFixed(8);
}

// Dynamic spread multiplier: if the external price has moved significantly
// since the last bot run, widen the spread to avoid being picked off.
// Returns a multiplier ≥ 1. Max 3× normal spread.
function dynamicSpreadMult(currentMid: number, lastMid: number): number {
  if (lastMid <= 0) return 1;
  const moveBps = Math.abs(currentMid - lastMid) / lastMid * 10_000;
  if (moveBps < 10)  return 1.0;   //  < 0.10% move → normal spread
  if (moveBps < 30)  return 1.3;   // 0.10–0.30% → 1.3× spread
  if (moveBps < 80)  return 1.8;   // 0.30–0.80% → 1.8×
  return 2.5;                      // > 0.80% move → 2.5× spread (volatile)
}

// Note: `settleUserFill` and `ensureSpotWallet` were removed — those helpers
// only existed to support the synthetic mid-price fill path that bypassed
// the matching engine. All user fills now go through `tryMatch`, which has
// its own per-fill wallet settlement (with proper VIP-tier fees, GST/TDS,
// and over-lock refunds for limit orders).

async function runBotForPair(bot: any, uid: number) {
  const [pair] = await db.select().from(pairsTable).where(eq(pairsTable.id, bot.pairId));
  if (!pair) return;
  const baseCoin = (await db.select().from(coinsTable).where(eq(coinsTable.id, pair.baseCoinId)))[0];
  const quoteCoin = (await db.select().from(coinsTable).where(eq(coinsTable.id, pair.quoteCoinId)))[0];
  if (!baseCoin || !quoteCoin) return;

  const enriched = { ...pair, _baseSymbol: baseCoin.symbol, _quoteSymbol: quoteCoin.symbol };
  // Index price from external feed (CoinGecko/Binance) — never from pair.lastPrice
  const mid = indexPriceForPair(enriched);
  if (!(mid > 0)) {
    await db.update(marketBotsTable).set({ status: "no_price", lastError: `index price unavailable for ${baseCoin.symbol}/${quoteCoin.symbol}`, lastRunAt: new Date() }).where(eq(marketBotsTable.id, bot.id));
    return;
  }
  // Dynamic spread: widen when the external price has moved since last tick
  const lastMid = bot.lastMidPrice ? Number(bot.lastMidPrice) : 0;
  const spreadMult = dynamicSpreadMult(mid, lastMid);

  // 1) Cancel stale bot orders (older than maxOrderAgeSec) — DB + Redis cleanup
  const ageMs = bot.maxOrderAgeSec * 1000;
  const cutoff = new Date(Date.now() - ageMs);
  const stale = await db.select().from(ordersTable).where(and(
    eq(ordersTable.botId, bot.id),
    eq(ordersTable.status, "open"),
    sql`${ordersTable.createdAt} < ${cutoff}`,
  ));
  if (stale.length) {
    await db.update(ordersTable).set({ status: "cancelled", updatedAt: new Date() }).where(and(
      eq(ordersTable.botId, bot.id),
      eq(ordersTable.status, "open"),
      sql`${ordersTable.createdAt} < ${cutoff}`,
    ));
    for (const s of stale) {
      try { await bookRemove(pair.symbol, s as any, "cancel"); } catch (e: any) {
        logger.warn({ err: e?.message, orderId: s.id }, "bot: failed to remove stale from redis");
      }
    }
  }

  // 1b) Cancel WRONG-SIDE bot orders relative to the current external mid.
  //
  // Bot quotes are placed around `mid` at tick T1, but external price moves
  // between ticks. By tick T2 a previously-correct quote can end up on the
  // wrong side of the new mid — e.g. a bot BUY at 100 placed when mid was
  // 99.5, but mid is now 99.0 → that BUY is sitting ABOVE the external
  // price, violating the "buy < external < sell" invariant the user wants.
  // Worse, if not cancelled, a new bot SELL placed below it would cross
  // and bot would trade with itself at a phantom price.
  //
  // We cancel ANY bot quote that is now on the wrong side of mid; step 3
  // will repopulate the level around the new mid in this same tick.
  const liveBot = await db.select().from(ordersTable).where(and(
    eq(ordersTable.botId, bot.id),
    eq(ordersTable.status, "open"),
  ));
  const wrongSide = liveBot.filter(o => {
    const px = Number(o.price);
    if (o.side === "buy")  return px >= mid; // buy must sit strictly BELOW mid
    if (o.side === "sell") return px <= mid; // sell must sit strictly ABOVE mid
    return false;
  });
  if (wrongSide.length) {
    const ids = wrongSide.map(o => o.id);
    await db.update(ordersTable).set({ status: "cancelled", updatedAt: new Date() }).where(and(
      eq(ordersTable.botId, bot.id),
      eq(ordersTable.status, "open"),
      inArray(ordersTable.id, ids),
    ));
    for (const o of wrongSide) {
      try { await bookRemove(pair.symbol, o as any, "cancel"); } catch (e: any) {
        logger.warn({ err: e?.message, orderId: o.id }, "bot: failed to remove wrong-side from redis");
      }
    }
    logger.info({ botId: bot.id, symbol: pair.symbol, count: wrongSide.length, mid }, "bot: cancelled wrong-side quotes");
  }

  // 2) Re-match any open user orders that may now cross the live book.
  //
  // Previous behaviour synthetically marked user orders as `filled` at `mid`
  // whenever the mid price crossed the order price — without checking that
  // an actual maker existed in Redis. That created phantom fills (the user
  // saw a fill at a price no real counter-party had quoted) and broke the
  // "only fill from real orderbook liquidity" invariant.
  //
  // The correct behaviour is to route any potentially-crossing user order
  // back through `tryMatch`, which only consumes resting maker orders that
  // genuinely sit in the Redis ZSET. If there is no opposing depth, the
  // order stays open — exactly as on a real exchange.
  if (bot.fillOnCross) {
    const openUser = await db.select().from(ordersTable).where(and(
      eq(ordersTable.pairId, pair.id),
      eq(ordersTable.status, "open"),
      eq(ordersTable.isBot, 0),
    ));
    for (const o of openUser) {
      const px = Number(o.price);
      const crosses = (o.side === "buy" && mid <= px) || (o.side === "sell" && mid >= px);
      if (!crosses) continue;
      try {
        // Look up VIP tier so fees match what placeSpotOrder would charge.
        const [u] = await db.select({ vipTier: usersTable.vipTier })
          .from(usersTable).where(eq(usersTable.id, o.userId)).limit(1);
        // takerInBook=true → engine maintains the taker's ZSET/payload too,
        // atomically with the maker write (no cross-module race window).
        await tryMatch(o.id, { takerVipTier: Number(u?.vipTier ?? 0), takerInBook: true });
      } catch (e: any) {
        logger.warn({ err: e?.message, orderId: o.id }, "bot: tryMatch failed");
      }
    }
  }

  // 3) Count current open bot orders, top-up to `levels` per side (with top-of-book boost on level 0)
  const existing = await db.select().from(ordersTable).where(and(
    eq(ordersTable.botId, bot.id), eq(ordersTable.status, "open"),
  ));
  const buyCount = existing.filter(o => o.side === "buy").length;
  const sellCount = existing.filter(o => o.side === "sell").length;
  const stepFrac = bot.priceStepBps / 10_000;
  // Apply dynamic spread multiplier — widens spread in volatile market
  const halfSpread = (bot.spreadBps / 20_000) * spreadMult;
  const baseSize = Number(bot.orderSize);
  const boostMult = 1 + (Number(bot.topOfBookBoostPct ?? 0) / 100);
  const sizeForLevel = (i: number) => i === 0 ? baseSize * boostMult : baseSize;
  const newOrders: any[] = [];
  for (let i = buyCount; i < bot.levels; i++) {
    // Buy below index price (never at or above — would cross maker invariant)
    const px = mid * (1 - halfSpread - stepFrac * i);
    if (px > 0) newOrders.push({
      userId: uid, pairId: pair.id, side: "buy", type: "limit",
      price: roundPrice(px),                          // tick-size precision
      qty: String(sizeForLevel(i).toFixed(8)),
      status: "open", isBot: 1, botId: bot.id,
    });
  }
  for (let i = sellCount; i < bot.levels; i++) {
    // Sell above index price
    const px = mid * (1 + halfSpread + stepFrac * i);
    newOrders.push({
      userId: uid, pairId: pair.id, side: "sell", type: "limit",
      price: roundPrice(px),                          // tick-size precision
      qty: String(sizeForLevel(i).toFixed(8)),
      status: "open", isBot: 1, botId: bot.id,
    });
  }
  if (newOrders.length) {
    const inserted = await db.insert(ordersTable).values(newOrders).returning();
    for (const o of inserted) {
      try { await bookAdd(pair.symbol, o); } catch (e: any) {
        logger.warn({ err: e?.message, orderId: o.id }, "bot: failed to add to redis book");
      }
      // Drive the new bot quote through the real matching engine so it
      // consumes any resting user orders that cross. Without this step,
      // user limit orders that cross the bot's freshly-placed quote would
      // sit forever — the engine only runs on order placement, and bot
      // placements that bypass `placeSpotOrder` were not triggering it.
      // takerInBook=true → engine reconciles the bot quote's own ZSET state.
      try {
        await tryMatch(o.id, { takerInBook: true });
      } catch (e: any) {
        logger.warn({ err: e?.message, orderId: o.id }, "bot: tryMatch on new quote failed");
      }
    }
  }

  // 4) MARKET-TAKER: fire synthetic market orders on price moves or against big user orders
  let marketReason: string | null = null;
  let marketSide: "buy" | "sell" | null = null;
  let marketQty = 0;
  if (bot.marketTakerEnabled) {
    const cooldownMs = bot.marketTakerCooldownSec * 1000;
    const lastMkt = bot.lastMarketOrderAt ? new Date(bot.lastMarketOrderAt).getTime() : 0;
    const cooledDown = Date.now() - lastMkt >= cooldownMs;
    const lastMid = bot.lastMidPrice ? Number(bot.lastMidPrice) : 0;

    // (a) Big-order detection: scan opposite-side user orders for any single qty exceeding threshold
    const bigThreshold = Number(bot.bigOrderTriggerQty ?? 0);
    if (cooledDown && bigThreshold > 0) {
      const opposite = await db.select().from(ordersTable).where(and(
        eq(ordersTable.pairId, pair.id),
        eq(ordersTable.status, "open"),
        eq(ordersTable.isBot, 0),
        sql`(CAST(${ordersTable.qty} AS DECIMAL) - CAST(${ordersTable.filledQty} AS DECIMAL)) >= ${bigThreshold}`,
      )).limit(5);
      if (opposite.length > 0) {
        // Aggregate biggest order; pick a side that absorbs it
        const biggest = opposite.reduce((a, b) => (Number(a.qty) - Number(a.filledQty)) > (Number(b.qty) - Number(b.filledQty)) ? a : b);
        // If user has big SELL → bot fires market BUY to absorb (price goes up). And vice versa.
        marketSide = biggest.side === "sell" ? "buy" : "sell";
        marketQty = baseSize * Number(bot.bigOrderAbsorbMult);
        marketReason = `absorb big ${biggest.side} #${biggest.id} qty=${(Number(biggest.qty) - Number(biggest.filledQty)).toFixed(4)}`;
      }
    }

    // (b) Price-move trigger: if mid moved beyond threshold since last tick → chase market in direction of move
    if (!marketSide && cooledDown && lastMid > 0 && bot.priceMoveTriggerBps > 0) {
      const moveBps = Math.abs(mid - lastMid) / lastMid * 10_000;
      if (moveBps >= bot.priceMoveTriggerBps) {
        marketSide = mid > lastMid ? "buy" : "sell"; // chase momentum
        marketQty = baseSize * Number(bot.marketTakerSizeMult);
        marketReason = `chase ${moveBps.toFixed(1)}bps move (${lastMid.toFixed(8)} → ${mid.toFixed(8)})`;
      }
    }

    if (marketSide && marketQty > 0) {
      // Synthetic market trade at index price (no wallet movements; pure tape print + order record)
      const indexPx = roundPrice(mid); // index price in quote currency, tick-size precision
      const [mktOrder] = await db.insert(ordersTable).values({
        userId: uid, pairId: pair.id, side: marketSide, type: "market",
        price: indexPx, qty: String(marketQty.toFixed(8)),
        filledQty: String(marketQty.toFixed(8)), avgPrice: indexPx,
        status: "filled", isBot: 1, botId: bot.id,
      }).returning();
      const [trade] = await db.insert(tradesTable).values({
        orderId: mktOrder.id, userId: uid, pairId: pair.id, side: marketSide,
        price: indexPx, qty: String(marketQty.toFixed(8)), fee: "0",
      }).returning();
      try {
        const tradePayload = JSON.stringify({
          id: trade.id, pairId: pair.id, side: marketSide,
          price: Number(mid.toFixed(8)), qty: Number(marketQty.toFixed(8)),
          ts: Date.now(), bot: true, market: true,
        });
        await rLpush(`trades:${pair.symbol}`, tradePayload);
        await rPublish(`trades.${pair.symbol}`, JSON.parse(tradePayload));
      } catch (e: any) {
        logger.warn({ err: e?.message }, "bot: failed to publish market trade");
      }
      logger.info({ botId: bot.id, symbol: pair.symbol, side: marketSide, qty: marketQty, reason: marketReason }, "bot: fired market order");
    }
  }

  await db.update(marketBotsTable).set({
    status: "running",
    lastError: marketReason ? `market: ${marketReason}` : null,
    lastRunAt: new Date(),
    lastMidPrice: String(mid.toFixed(8)),
    ...(marketSide ? { lastMarketOrderAt: new Date() } : {}),
  }).where(eq(marketBotsTable.id, bot.id));
}

async function tick() {
  const bots = await db.select().from(marketBotsTable).where(eq(marketBotsTable.enabled, true));
  if (!bots.length) return;
  const uid = await getBotUserId();
  if (!uid) { logger.warn("bot: no admin user available, skipping tick"); return; }
  for (const bot of bots) {
    if (bot.startAt && new Date(bot.startAt).getTime() > Date.now()) {
      await db.update(marketBotsTable).set({ status: "scheduled", lastError: null }).where(eq(marketBotsTable.id, bot.id));
      continue;
    }
    if (!bot.spotEnabled && !bot.futuresEnabled) {
      await db.update(marketBotsTable).set({ status: "disabled", lastError: "neither spot nor futures enabled" }).where(eq(marketBotsTable.id, bot.id));
      continue;
    }
    const last = bot.lastRunAt ? new Date(bot.lastRunAt).getTime() : 0;
    if (Date.now() - last < bot.refreshSec * 1000) continue;
    try { await runBotForPair(bot, uid); }
    catch (e: any) {
      logger.warn({ err: e?.message, botId: bot.id }, "bot tick failed");
      await db.update(marketBotsTable).set({ status: "error", lastError: String(e?.message || e), lastRunAt: new Date() }).where(eq(marketBotsTable.id, bot.id));
    }
  }
}

async function safeTick() {
  // Multi-server safety: only the leader runs market-maker bots — otherwise
  // each replica would place duplicate maker orders.
  const { isLeader } = await import("./leader");
  if (!isLeader()) return;
  if (ticking) return;
  ticking = true;
  try { await tick(); }
  catch (e: any) { logger.warn({ err: e?.message, stack: e?.stack }, "bot tick uncaught"); }
  finally { ticking = false; }
}

export function startBotService(intervalMs = 3000) {
  if (started) return;
  started = true;
  setInterval(() => { void safeTick(); }, intervalMs);
  logger.info({ intervalMs }, "bot service started");
}
