import { eq, sql, and, or, desc } from "drizzle-orm";
import { db, ordersTable, tradesTable, walletsTable, pairsTable, usersTable, walletLedgerTable } from "@workspace/db";
import { logger } from "./logger";
import { getRedis, rZadd, rZrem, rSet, rDel, rLpush, rPublish, rGet } from "./redis";
import { getSpotFeeRates } from "../routes/fees";

let engineEnabled = true;
let engineStats = {
  matchesAttempted: 0,
  tradesExecuted: 0,
  totalVolumeQuote: 0,
  lastMatchAt: 0 as number,
  lastError: "" as string,
  perSymbol: {} as Record<string, { trades: number; volume: number; lastTs: number }>,
};

export function setEngineEnabled(on: boolean) { engineEnabled = on; }
export function getEngineStats() {
  return { enabled: engineEnabled, ...engineStats };
}
export function resetEngineStats() {
  engineStats = { matchesAttempted: 0, tradesExecuted: 0, totalVolumeQuote: 0, lastMatchAt: 0, lastError: "", perSymbol: {} };
}

async function bestOpposite(symbol: string, side: "buy" | "sell", limitPrice: number, _isMarket: boolean) {
  const r = getRedis();
  if (!r) return null;
  // Buy taker hits SELL book (lowest ask). Sell taker hits BUY book (highest bid = most-negative score).
  const bookSide = side === "buy" ? "sell" : "buy";
  const key = `orderbook:${symbol}:${bookSide}`;
  const top = await r.zrange(key, 0, 0, "WITHSCORES");
  if (!top || top.length < 2) return null;
  const oppId = Number(top[0]);
  const oppScore = Number(top[1]);
  const oppPrice = bookSide === "sell" ? oppScore : -oppScore;
  // Always honour `limitPrice` as the worst-acceptable price.
  // For LIMIT orders this is the user's chosen price.
  // For MARKET orders the order's `price` column is set at placement to the
  // ±10% slippage cap from the last traded price (see placeSpotOrder), so
  // markets stop sweeping if the book is thin / manipulated past the cap.
  if (side === "buy" && oppPrice > limitPrice) return null;
  if (side === "sell" && oppPrice < limitPrice) return null;
  return { id: oppId, price: oppPrice };
}

async function getOrderForUpdate(tx: any, id: number) {
  const [o] = await tx.select().from(ordersTable).where(eq(ordersTable.id, id)).for("update").limit(1);
  return o;
}

async function ensureWallet(tx: any, userId: number, coinId: number) {
  const [w] = await tx.select().from(walletsTable)
    .where(and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, coinId), eq(walletsTable.walletType, "spot")))
    .for("update").limit(1);
  if (w) return w;
  const [c] = await tx.insert(walletsTable).values({ userId, coinId, walletType: "spot", balance: "0", locked: "0" }).returning();
  const [locked] = await tx.select().from(walletsTable).where(eq(walletsTable.id, c.id)).for("update").limit(1);
  return locked;
}

// `takerInBook` tells the engine that the taker order is already a resting
// member of the Redis ZSET orderbook (true for bot-service paths that match
// already-placed orders, false for placeSpotOrder which manages its own
// post-match Redis reconciliation). When true, the engine maintains the
// taker's ZSET/payload state inside the same FOR-UPDATE-locked transaction
// as the maker update — this prevents a race where a concurrent placement
// hitting the taker as a maker writes the new payload, and a separate post-
// match reconciliation by the original caller then overwrites it with the
// older snapshot.
export async function tryMatch(takerOrderId: number, opts?: { takerVipTier?: number; takerInBook?: boolean }): Promise<{ trades: number; remainingQty: number; status: string }> {
  if (!engineEnabled) return { trades: 0, remainingQty: 0, status: "disabled" };
  const r = getRedis();
  if (!r) return { trades: 0, remainingQty: 0, status: "no-redis" };

  let totalTrades = 0;
  let finalStatus = "open";
  let finalRemaining = 0;

  // Cap iterations to avoid infinite loops on weird data, but keep it
  // generous so a single market or limit order can fully sweep many price
  // levels of bot/maker liquidity in one placement.
  for (let iter = 0; iter < 200; iter++) {
    engineStats.matchesAttempted++;
    let matchExecuted = false;
    let stop = false;
    let symbolForPub = "";

    try {
      await db.transaction(async (tx) => {
        const taker = await getOrderForUpdate(tx, takerOrderId);
        if (!taker) { stop = true; return; }
        if (taker.status !== "open" && taker.status !== "partial") { stop = true; finalStatus = taker.status; return; }
        const remaining = Number(taker.qty) - Number(taker.filledQty ?? 0);
        if (remaining <= 0) { stop = true; finalStatus = "filled"; return; }
        finalRemaining = remaining;

        const [pair] = await tx.select().from(pairsTable).where(eq(pairsTable.id, taker.pairId)).limit(1);
        if (!pair) { stop = true; return; }
        const symbol = pair.symbol; symbolForPub = symbol;
        const isMarket = taker.type === "market";
        const limitPrice = Number(taker.price);

        const opp = await bestOpposite(symbol, taker.side as any, limitPrice, isMarket);
        if (!opp) { stop = true; return; }

        const maker = await getOrderForUpdate(tx, opp.id);
        if (!maker || (maker.status !== "open" && maker.status !== "partial")) {
          // Stale entry; drop and continue
          await rZrem(`orderbook:${symbol}:${maker?.side ?? (taker.side === "buy" ? "sell" : "buy")}`, String(opp.id));
          return;
        }
        if (maker.userId === taker.userId) {
          // Self-trade prevention: cancel the resting maker, refund, continue loop.
          // Bot makers are synthetic and never had funds locked at placement, so
          // skip the wallet refund — otherwise we'd credit ghost balance and
          // push locked negative.
          const makerRem = Number(maker.qty) - Number(maker.filledQty ?? 0);
          if ((maker.isBot ?? 0) !== 1) {
            if (maker.side === "buy") {
              const release = makerRem * Number(maker.price);
              const w = await ensureWallet(tx, maker.userId, pair.quoteCoinId);
              await tx.update(walletsTable).set({
                balance: sql`${walletsTable.balance} + ${release}`,
                locked: sql`${walletsTable.locked} - ${release}`,
                updatedAt: new Date(),
              }).where(eq(walletsTable.id, w.id));
            } else {
              const w = await ensureWallet(tx, maker.userId, pair.baseCoinId);
              await tx.update(walletsTable).set({
                balance: sql`${walletsTable.balance} + ${makerRem}`,
                locked: sql`${walletsTable.locked} - ${makerRem}`,
                updatedAt: new Date(),
              }).where(eq(walletsTable.id, w.id));
            }
          }
          await tx.update(ordersTable).set({ status: "cancelled", updatedAt: new Date() }).where(eq(ordersTable.id, maker.id));
          await rZrem(`orderbook:${symbol}:${maker.side}`, String(maker.id));
          await rDel(`orderbook:${symbol}:order:${maker.id}`);
          return;
        }

        const makerRem = Number(maker.qty) - Number(maker.filledQty ?? 0);
        const fillQty = Math.min(remaining, makerRem);
        const tradePrice = Number(maker.price); // price-time priority: maker price
        const notional = fillQty * tradePrice;

        // Load admin-configured fees (with GST baked in) for both taker and maker
        const takerRates = await getSpotFeeRates(opts?.takerVipTier ?? 0);
        const [makerUserRow] = await tx.select({ vipTier: usersTable.vipTier }).from(usersTable).where(eq(usersTable.id, maker.userId)).limit(1);
        const makerVipTier = Number(makerUserRow?.vipTier ?? 0);
        const makerRates = await getSpotFeeRates(makerVipTier);
        const takerFeeRate = takerRates.taker;
        const makerFeeRate = makerRates.maker;
        const tdsRate = takerRates.tds;
        const takerFee = notional * takerFeeRate;
        const makerFee = notional * makerFeeRate;
        const takerTds = taker.side === "sell" ? notional * tdsRate : 0;
        const makerTds = maker.side === "sell" ? notional * tdsRate : 0;

        // Bot orders are synthetic liquidity — they're inserted into the
        // book without locking any funds at placement time. Settling
        // their wallet on a fill would push locked negative and credit
        // ghost balances. Skip wallet ops for both sides if either party
        // is a bot; only real (isBot===0) orders move money.
        const takerIsBot = (taker.isBot ?? 0) === 1;
        const makerIsBot = (maker.isBot ?? 0) === 1;

        // Capture pre-update wallet balances for ledger entries
        let takerBaseBalBefore = 0, takerQuoteBalBefore = 0;
        let makerBaseBalBefore = 0, makerQuoteBalBefore = 0;

        if (taker.side === "buy") {
          // Taker BUY: pays quote, receives base. Locked quote on taker reduces by notional.
          // Maker SELL: locked base reduces by fillQty, receives quote (notional - makerFee).
          // For LIMIT taker, locked = remaining * limitPrice; effective spend = notional. Refund (limitPrice - tradePrice)*fillQty.
          if (!takerIsBot) {
            // Locked-per-fill is uniformly derived from the order's `price`
            // column. For LIMIT this is the user's price; for MARKET we
            // store the +10% slippage cap there at placement, so both
            // paths share the same accounting and any over-lock is refunded
            // immediately on each fill.
            const takerQuoteLocked = isMarket
              ? fillQty * limitPrice * (1 + takerFeeRate)
              : fillQty * limitPrice;
            const takerSpend = notional + takerFee; // what we actually take from locked
            const takerRefund = takerQuoteLocked - takerSpend; // ≥0 by construction (limitPrice ≥ tradePrice)
            const tQuote = await ensureWallet(tx, taker.userId, pair.quoteCoinId);
            takerQuoteBalBefore = parseFloat(tQuote.balance ?? "0");
            await tx.update(walletsTable).set({
              locked: sql`${walletsTable.locked} - ${takerQuoteLocked}`,
              balance: takerRefund > 0 ? sql`${walletsTable.balance} + ${takerRefund}` : walletsTable.balance,
              updatedAt: new Date(),
            }).where(eq(walletsTable.id, tQuote.id));
            const tBase = await ensureWallet(tx, taker.userId, pair.baseCoinId);
            takerBaseBalBefore = parseFloat(tBase.balance ?? "0");
            await tx.update(walletsTable).set({
              balance: sql`${walletsTable.balance} + ${fillQty}`,
              updatedAt: new Date(),
            }).where(eq(walletsTable.id, tBase.id));
          }
          if (!makerIsBot) {
            // Maker sell: release locked base, credit quote
            const mBase = await ensureWallet(tx, maker.userId, pair.baseCoinId);
            makerBaseBalBefore = parseFloat(mBase.balance ?? "0");
            await tx.update(walletsTable).set({
              locked: sql`${walletsTable.locked} - ${fillQty}`,
              updatedAt: new Date(),
            }).where(eq(walletsTable.id, mBase.id));
            const mQuote = await ensureWallet(tx, maker.userId, pair.quoteCoinId);
            makerQuoteBalBefore = parseFloat(mQuote.balance ?? "0");
            await tx.update(walletsTable).set({
              balance: sql`${walletsTable.balance} + ${notional - makerFee - makerTds}`,
              updatedAt: new Date(),
            }).where(eq(walletsTable.id, mQuote.id));
          }
        } else {
          // Taker SELL: locked base = remaining (qty units). Spend fillQty base, get notional - takerFee quote.
          if (!takerIsBot) {
            const tBase = await ensureWallet(tx, taker.userId, pair.baseCoinId);
            takerBaseBalBefore = parseFloat(tBase.balance ?? "0");
            await tx.update(walletsTable).set({
              locked: sql`${walletsTable.locked} - ${fillQty}`,
              updatedAt: new Date(),
            }).where(eq(walletsTable.id, tBase.id));
            const tQuote = await ensureWallet(tx, taker.userId, pair.quoteCoinId);
            takerQuoteBalBefore = parseFloat(tQuote.balance ?? "0");
            await tx.update(walletsTable).set({
              balance: sql`${walletsTable.balance} + ${notional - takerFee - takerTds}`,
              updatedAt: new Date(),
            }).where(eq(walletsTable.id, tQuote.id));
          }
          if (!makerIsBot) {
            // Maker buy: locked quote = makerRem * makerPrice; spend = notional + makerFee; refund leftover lock for this slice = (makerPrice * fillQty) - (notional + makerFee) = -makerFee since tradePrice = makerPrice
            const makerLockSlice = fillQty * tradePrice;
            // Negative refund means we need to take fee from balance because we pre-locked exact notional only.
            // Strategy: reduce locked by makerLockSlice (release), then debit fee from balance.
            const mQuote = await ensureWallet(tx, maker.userId, pair.quoteCoinId);
            makerQuoteBalBefore = parseFloat(mQuote.balance ?? "0");
            await tx.update(walletsTable).set({
              locked: sql`${walletsTable.locked} - ${makerLockSlice}`,
              balance: sql`${walletsTable.balance} - ${makerFee}`,
              updatedAt: new Date(),
            }).where(eq(walletsTable.id, mQuote.id));
            const mBase = await ensureWallet(tx, maker.userId, pair.baseCoinId);
            makerBaseBalBefore = parseFloat(mBase.balance ?? "0");
            await tx.update(walletsTable).set({
              balance: sql`${walletsTable.balance} + ${fillQty}`,
              updatedAt: new Date(),
            }).where(eq(walletsTable.id, mBase.id));
          }
        }

        // Insert two trade rows — one per side — for per-user accounting.
        // isTaker=1 marks the aggressive (incoming) side; isTaker=0 marks the
        // resting maker. Admin trade tape filters on isTaker=1 so exactly one
        // row per match appears, even when both sides are real users (not bots).
        const [trade] = await tx.insert(tradesTable).values({
          orderId: taker.id, userId: taker.userId, pairId: pair.id,
          side: taker.side, price: String(tradePrice), qty: String(fillQty),
          fee: String(takerFee), tds: String(takerTds), isTaker: 1,
        }).returning();
        await tx.insert(tradesTable).values({
          orderId: maker.id, userId: maker.userId, pairId: pair.id,
          side: maker.side, price: String(tradePrice), qty: String(fillQty),
          fee: String(makerFee), tds: String(makerTds), isTaker: 0,
        });

        // Write wallet ledger entries for both sides (real users only, never bots).
        // These power the /ledger page so users can see all trade activity.
        const tradeRefId = String(trade?.id ?? "");
        const tradeNote = `${pair.symbol} @ ${tradePrice}`;
        const ledgerRows: any[] = [];
        if (!takerIsBot) {
          if (taker.side === "buy") {
            // Taker received base coin
            ledgerRows.push({
              userId: taker.userId, coinId: pair.baseCoinId, walletType: "spot",
              type: "trade_buy", amount: String(fillQty),
              balanceBefore: String(takerBaseBalBefore),
              balanceAfter: String(takerBaseBalBefore + fillQty),
              refType: "trade", refId: tradeRefId,
              note: `Buy ${tradeNote}`,
            });
            // Taker paid fee in quote
            if (takerFee > 0) ledgerRows.push({
              userId: taker.userId, coinId: pair.quoteCoinId, walletType: "spot",
              type: "trade_fee", amount: String(-takerFee),
              balanceBefore: String(takerQuoteBalBefore),
              balanceAfter: String(takerQuoteBalBefore - takerFee),
              refType: "trade", refId: tradeRefId,
              note: `Fee ${tradeNote}`,
            });
          } else {
            // Taker sold base coin, received quote
            const takerCredit = notional - takerFee - takerTds;
            ledgerRows.push({
              userId: taker.userId, coinId: pair.quoteCoinId, walletType: "spot",
              type: "trade_sell", amount: String(takerCredit),
              balanceBefore: String(takerQuoteBalBefore),
              balanceAfter: String(takerQuoteBalBefore + takerCredit),
              refType: "trade", refId: tradeRefId,
              note: `Sell ${tradeNote}`,
            });
          }
        }
        if (!makerIsBot) {
          if (maker.side === "sell") {
            // Maker sold base coin, received quote
            const makerCredit = notional - makerFee - makerTds;
            ledgerRows.push({
              userId: maker.userId, coinId: pair.quoteCoinId, walletType: "spot",
              type: "trade_sell", amount: String(makerCredit),
              balanceBefore: String(makerQuoteBalBefore),
              balanceAfter: String(makerQuoteBalBefore + makerCredit),
              refType: "trade", refId: tradeRefId,
              note: `Sell ${tradeNote}`,
            });
          } else {
            // Maker bought base coin
            ledgerRows.push({
              userId: maker.userId, coinId: pair.baseCoinId, walletType: "spot",
              type: "trade_buy", amount: String(fillQty),
              balanceBefore: String(makerBaseBalBefore),
              balanceAfter: String(makerBaseBalBefore + fillQty),
              refType: "trade", refId: tradeRefId,
              note: `Buy ${tradeNote}`,
            });
            // Maker paid fee in quote
            if (makerFee > 0) ledgerRows.push({
              userId: maker.userId, coinId: pair.quoteCoinId, walletType: "spot",
              type: "trade_fee", amount: String(-makerFee),
              balanceBefore: String(makerQuoteBalBefore),
              balanceAfter: String(makerQuoteBalBefore - makerFee),
              refType: "trade", refId: tradeRefId,
              note: `Fee ${tradeNote}`,
            });
          }
        }
        if (ledgerRows.length > 0) {
          await tx.insert(walletLedgerTable).values(ledgerRows);
        }

        // Update orders. avgPrice is the volume-weighted average across
        // all fills, so a buy that sweeps multiple lower-priced sells
        // ends up with a true blended cost basis instead of the last
        // tape print.
        const oldTakerFilled = Number(taker.filledQty ?? 0);
        const oldTakerAvg = Number(taker.avgPrice ?? 0);
        const newTakerFilled = oldTakerFilled + fillQty;
        const newTakerAvg = newTakerFilled > 0
          ? (oldTakerFilled * oldTakerAvg + fillQty * tradePrice) / newTakerFilled
          : tradePrice;
        const takerFinished = newTakerFilled >= Number(taker.qty) - 1e-12;

        const oldMakerFilled = Number(maker.filledQty ?? 0);
        const oldMakerAvg = Number(maker.avgPrice ?? 0);
        const newMakerFilled = oldMakerFilled + fillQty;
        const newMakerAvg = newMakerFilled > 0
          ? (oldMakerFilled * oldMakerAvg + fillQty * tradePrice) / newMakerFilled
          : tradePrice;
        const makerFinished = newMakerFilled >= Number(maker.qty) - 1e-12;

        await tx.update(ordersTable).set({
          filledQty: String(newTakerFilled),
          avgPrice: String(newTakerAvg.toFixed(8)),
          fee: sql`${ordersTable.fee} + ${takerFee}`,
          tds: sql`${ordersTable.tds} + ${takerTds}`,
          status: takerFinished ? "filled" : "partial",
          updatedAt: new Date(),
        }).where(eq(ordersTable.id, taker.id));
        await tx.update(ordersTable).set({
          filledQty: String(newMakerFilled),
          avgPrice: String(newMakerAvg.toFixed(8)),
          fee: sql`${ordersTable.fee} + ${makerFee}`,
          tds: sql`${ordersTable.tds} + ${makerTds}`,
          status: makerFinished ? "filled" : "partial",
          updatedAt: new Date(),
        }).where(eq(ordersTable.id, maker.id));

        // Update pair lastPrice
        await tx.update(pairsTable).set({
          lastPrice: String(tradePrice),
          volume24h: sql`"volume_24h" + ${String(fillQty)}::numeric`,
          quoteVolume24h: sql`"quote_volume_24h" + ${String(notional)}::numeric`,
        }).where(eq(pairsTable.id, pair.id));

        // Update Redis book — maker
        if (makerFinished) {
          await rZrem(`orderbook:${symbol}:${maker.side}`, String(maker.id));
          await rDel(`orderbook:${symbol}:order:${maker.id}`);
        } else {
          await rSet(`orderbook:${symbol}:order:${maker.id}`, JSON.stringify({
            id: maker.id, userId: maker.userId, side: maker.side, type: maker.type,
            price: Number(maker.price), qty: Number(maker.qty), filledQty: newMakerFilled,
            status: "partial", ts: Date.now(),
          }), 86400);
        }

        // Update Redis book — taker (only when caller indicated the taker
        // is already a resting member of the book). Doing this inside the
        // same FOR-UPDATE-locked transaction as the maker write is what
        // makes it race-free against concurrent placements that hit this
        // taker as a maker — both writers serialize on the row lock.
        if (opts?.takerInBook && taker.type === "limit") {
          if (takerFinished) {
            await rZrem(`orderbook:${symbol}:${taker.side}`, String(taker.id));
            await rDel(`orderbook:${symbol}:order:${taker.id}`);
          } else {
            await rSet(`orderbook:${symbol}:order:${taker.id}`, JSON.stringify({
              id: taker.id, userId: taker.userId, side: taker.side, type: taker.type,
              price: Number(taker.price), qty: Number(taker.qty), filledQty: newTakerFilled,
              status: "partial", ts: Date.now(),
            }), 86400);
          }
        }

        // Publish trade
        const tradePayload = JSON.stringify({
          id: trade.id, pairId: pair.id, side: taker.side,
          price: tradePrice, qty: fillQty, ts: Date.now(),
        });
        await rLpush(`trades:${symbol}`, tradePayload);
        await rLpush(`trades:user:${taker.userId}`, tradePayload);
        await rLpush(`trades:user:${maker.userId}`, tradePayload);
        await rPublish(`trades.${symbol}`, JSON.parse(tradePayload));
        await rSet(`pair:${symbol}:lastPrice`, String(tradePrice), 60);

        finalRemaining = remaining - fillQty;
        finalStatus = takerFinished ? "filled" : "partial";
        totalTrades++;
        matchExecuted = true;

        engineStats.tradesExecuted++;
        engineStats.totalVolumeQuote += notional;
        engineStats.lastMatchAt = Date.now();
        const ps = (engineStats.perSymbol[symbol] ||= { trades: 0, volume: 0, lastTs: 0 });
        ps.trades++; ps.volume += notional; ps.lastTs = Date.now();

        if (takerFinished) stop = true;
      });
    } catch (e: any) {
      engineStats.lastError = e?.message ?? String(e);
      logger.warn({ err: engineStats.lastError, takerOrderId }, "matching iteration failed");
      stop = true;
    }

    if (symbolForPub && matchExecuted) {
      await rPublish(`book.${symbolForPub}`, { type: "match", takerOrderId, ts: Date.now() });
    }
    if (stop) break;
    if (!matchExecuted) break; // safety
  }

  return { trades: totalTrades, remainingQty: finalRemaining, status: finalStatus };
}

// Pairs are stored as BTCUSDT (no slash) in DB; matching engine writes
// orderbook keys with that exact symbol. Normalize incoming "BTC/USDT" to
// "BTCUSDT" so REST/WS callers using either form hit the right ZSET.
function normalizeSymbol(s: string): string {
  return (s || "").replace("/", "").toUpperCase();
}

// Read aggregated depth for a symbol (top N levels)
export async function getDepth(symbol: string, levels = 20) {
  const r = getRedis();
  if (!r) return { bids: [], asks: [] };
  symbol = normalizeSymbol(symbol);
  const [buys, sells] = await Promise.all([
    r.zrange(`orderbook:${symbol}:buy`, 0, 200, "WITHSCORES"),
    r.zrange(`orderbook:${symbol}:sell`, 0, 200, "WITHSCORES"),
  ]);
  const aggBids: Record<string, number> = {};
  const aggAsks: Record<string, number> = {};
  for (let i = 0; i < buys.length; i += 2) {
    const id = buys[i]; const score = Number(buys[i + 1]);
    const price = -score;
    const raw = await r.get(`orderbook:${symbol}:order:${id}`);
    if (!raw) continue;
    const o = JSON.parse(raw);
    const rem = Number(o.qty) - Number(o.filledQty ?? 0);
    if (rem <= 0) continue;
    const k = price.toString();
    aggBids[k] = (aggBids[k] ?? 0) + rem;
  }
  for (let i = 0; i < sells.length; i += 2) {
    const id = sells[i]; const score = Number(sells[i + 1]);
    const price = score;
    const raw = await r.get(`orderbook:${symbol}:order:${id}`);
    if (!raw) continue;
    const o = JSON.parse(raw);
    const rem = Number(o.qty) - Number(o.filledQty ?? 0);
    if (rem <= 0) continue;
    const k = price.toString();
    aggAsks[k] = (aggAsks[k] ?? 0) + rem;
  }
  const bids = Object.entries(aggBids).map(([p, q]) => [Number(p), q] as [number, number]).sort((a, b) => b[0] - a[0]).slice(0, levels);
  const asks = Object.entries(aggAsks).map(([p, q]) => [Number(p), q] as [number, number]).sort((a, b) => a[0] - b[0]).slice(0, levels);
  return { bids, asks };
}

export async function getRecentTrades(symbol: string, limit = 50) {
  const r = getRedis();
  if (!r) return [];
  symbol = normalizeSymbol(symbol);
  const raws = await r.lrange(`trades:${symbol}`, 0, limit - 1);
  return raws.map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
}
