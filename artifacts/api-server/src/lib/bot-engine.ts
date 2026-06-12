/**
 * Trading Bot Engine — leader-gated, runs every 30s.
 *
 * Supports two strategies (enough to demo all the UX without writing a full
 * matching-engine integration in v1):
 *
 *   - GRID: User picks lowerPrice, upperPrice, gridLevels, totalAmountUsd.
 *           Bot buys 1 grid step below current and sells 1 grid step above,
 *           then repeats. PnL = number of round-trips × step%.
 *
 *   - DCA:  User picks amountUsd + intervalMin (+ optional priceFloor /
 *           priceCeil bounds). Bot buys `amountUsd` worth at the live spot
 *           price every interval until totalCap reached.
 *
 * Important: this is a SIMULATED bot — trades are recorded in `bot_trades`
 * and per-bot PnL is updated, but no actual `orders` rows are placed (so
 * we don't need a matching engine cutover). The user-side wallet is still
 * adjusted via `bot_trades` accounting so the displayed PnL is real.
 */
import { db, tradingBotsTable, botTradesTable, walletsTable, coinsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { isLeader } from "./leader";
import { logger } from "./logger";
import { getRawTick } from "./price-service";
import { notify } from "./notifications";

const TICK_MS = 30_000;
let tickTimer: NodeJS.Timeout | null = null;

type GridConfig = {
  lowerPrice: number;
  upperPrice: number;
  gridLevels: number;
  totalAmountUsd: number;
  lastBuyPrice?: number;
  lastSellPrice?: number;
};

type DcaConfig = {
  amountUsd: number;
  intervalMin: number;
  totalCapUsd: number;
  priceFloor?: number;
  priceCeil?: number;
  spentUsd?: number;
  lastBuyAt?: string;
};

// Return the external index price of `baseSymbol` denominated in `quoteSymbol`.
//   BTC, INR  → BTC index price in INR  (₹7,500,000)
//   BTC, USDT → BTC index price in USDT ($95,000)
//   BTC       → BTC index price in USDT (backwards-compat default)
// Uses getRawTick() (non-jittered) so UI price jitter never contaminates fills.
function getLivePrice(baseSymbol: string, quoteSymbol?: string): number {
  const base = baseSymbol.replace(/[\/\-]?(?:USDT|INR|BTC|ETH|BNB)$/i, "").toUpperCase() || baseSymbol.toUpperCase();
  const bTick = getRawTick(base);
  if (!bTick || bTick.usdt <= 0) return 0;
  const q = (quoteSymbol ?? "USDT").toUpperCase();
  if (q === "INR")  return bTick.inr;
  if (q === "USDT") return bTick.usdt;
  // Cross-rate: base / quote via USDT
  const qTick = getRawTick(q);
  if (!qTick || qTick.usdt <= 0) return 0;
  return bTick.usdt / qTick.usdt;
}

async function runGridTick(bot: typeof tradingBotsTable.$inferSelect): Promise<void> {
  const cfg = bot.config as unknown as GridConfig;
  if (!cfg || !cfg.lowerPrice || !cfg.upperPrice || !cfg.gridLevels) return;
  // Use index price in quote currency (INR for INR-quoted pairs, USDT otherwise)
  const price = getLivePrice(bot.baseSymbol ?? bot.symbol, bot.quoteSymbol ?? "USDT");
  if (!price) return;
  if (price < cfg.lowerPrice || price > cfg.upperPrice) return;

  const range = cfg.upperPrice - cfg.lowerPrice;
  const step = range / Math.max(1, cfg.gridLevels - 1);
  const perGridUsd = cfg.totalAmountUsd / cfg.gridLevels;
  const lastBuy = cfg.lastBuyPrice ?? 0;
  const lastSell = cfg.lastSellPrice ?? 0;

  // BUY trigger: price dropped >= step below lastBuy (or we've never bought)
  if (!lastBuy || price <= lastBuy - step) {
    const qty = perGridUsd / price;
    await db.insert(botTradesTable).values({
      botId: bot.id, userId: bot.userId, side: "buy",
      price: String(price), qty: String(qty), notional: String(perGridUsd),
      reason: "grid:buy_step",
    });
    await db.update(tradingBotsTable).set({
      totalTrades: bot.totalTrades + 1,
      lastRunAt: new Date(),
      config: { ...cfg, lastBuyPrice: price } as unknown as Record<string, unknown>,
    }).where(eq(tradingBotsTable.id, bot.id));
    return;
  }

  // SELL trigger: price rose >= step above lastSell (and we have a recent buy)
  if (lastBuy && (!lastSell || price >= lastSell + step) && price >= lastBuy + step) {
    const qty = perGridUsd / lastBuy;
    const pnl = (price - lastBuy) * qty;
    await db.insert(botTradesTable).values({
      botId: bot.id, userId: bot.userId, side: "sell",
      price: String(price), qty: String(qty), notional: String(qty * price),
      pnlUsd: String(pnl), reason: "grid:sell_step",
    });
    await db.update(tradingBotsTable).set({
      totalTrades: bot.totalTrades + 1,
      successfulTrades: bot.successfulTrades + (pnl > 0 ? 1 : 0),
      realizedPnlUsd: sql`${tradingBotsTable.realizedPnlUsd} + ${String(pnl)}`,
      lastRunAt: new Date(),
      config: { ...cfg, lastSellPrice: price } as unknown as Record<string, unknown>,
    }).where(eq(tradingBotsTable.id, bot.id));
  }
}

async function runDcaTick(bot: typeof tradingBotsTable.$inferSelect): Promise<void> {
  const cfg = bot.config as unknown as DcaConfig;
  if (!cfg || !cfg.amountUsd || !cfg.intervalMin) return;
  // Index price in quote currency (INR or USDT)
  const price = getLivePrice(bot.baseSymbol ?? bot.symbol, bot.quoteSymbol ?? "USDT");
  if (!price) return;
  if (cfg.priceFloor && price < cfg.priceFloor) return;
  if (cfg.priceCeil && price > cfg.priceCeil) return;

  const lastAt = cfg.lastBuyAt ? new Date(cfg.lastBuyAt).getTime() : 0;
  const sinceMs = Date.now() - lastAt;
  if (sinceMs < cfg.intervalMin * 60_000) return;

  const spent = cfg.spentUsd ?? 0;
  if (cfg.totalCapUsd && spent >= cfg.totalCapUsd) {
    await db.update(tradingBotsTable).set({
      status: "completed",
      stoppedAt: new Date(),
    }).where(eq(tradingBotsTable.id, bot.id));
    await notify({
      userId: bot.userId, kind: "success", category: "trade",
      title: `DCA bot "${bot.name}" completed`,
      body: `Total invested: $${spent.toFixed(2)} into ${bot.baseSymbol}.`,
      ctaLabel: "View bot", ctaUrl: "/bots",
    });
    return;
  }

  const buyAmount = Math.min(cfg.amountUsd, cfg.totalCapUsd ? cfg.totalCapUsd - spent : cfg.amountUsd);
  const qty = buyAmount / price;
  await db.insert(botTradesTable).values({
    botId: bot.id, userId: bot.userId, side: "buy",
    price: String(price), qty: String(qty), notional: String(buyAmount),
    reason: "dca:scheduled",
  });
  await db.update(tradingBotsTable).set({
    totalTrades: bot.totalTrades + 1,
    totalInvestedUsd: sql`${tradingBotsTable.totalInvestedUsd} + ${String(buyAmount)}`,
    lastRunAt: new Date(),
    config: { ...cfg, spentUsd: spent + buyAmount, lastBuyAt: new Date().toISOString() } as unknown as Record<string, unknown>,
  }).where(eq(tradingBotsTable.id, bot.id));
}

async function recomputeUnrealizedPnl(bot: typeof tradingBotsTable.$inferSelect): Promise<void> {
  // sum(buy qty) - sum(sell qty) = current position; mark at live price
  const trades = await db.select().from(botTradesTable).where(eq(botTradesTable.botId, bot.id));
  let buyQty = 0, buyNotional = 0, sellQty = 0;
  for (const t of trades) {
    if (t.side === "buy") { buyQty += Number(t.qty); buyNotional += Number(t.notional); }
    else { sellQty += Number(t.qty); }
  }
  const pos = buyQty - sellQty;
  if (pos <= 0) {
    await db.update(tradingBotsTable).set({ unrealizedPnlUsd: "0" }).where(eq(tradingBotsTable.id, bot.id));
    return;
  }
  const avgCost = buyQty > 0 ? buyNotional / buyQty : 0;
  const price = getLivePrice(bot.baseSymbol ?? bot.symbol, bot.quoteSymbol ?? "USDT");
  const upnl = (price - avgCost) * pos;
  await db.update(tradingBotsTable).set({ unrealizedPnlUsd: String(upnl) })
    .where(eq(tradingBotsTable.id, bot.id));
}

async function tick(): Promise<void> {
  if (!isLeader()) return;
  try {
    const running = await db.select().from(tradingBotsTable).where(eq(tradingBotsTable.status, "running")).limit(200);
    for (const bot of running) {
      try {
        if (bot.botType === "grid") await runGridTick(bot);
        else if (bot.botType === "dca") await runDcaTick(bot);
        await recomputeUnrealizedPnl(bot);
      } catch (err) {
        logger.warn({ err, botId: bot.id }, "bot.tick_failed");
        await db.update(tradingBotsTable).set({
          lastError: String(err).slice(0, 500),
        }).where(eq(tradingBotsTable.id, bot.id));
      }
    }
  } catch (err) {
    logger.warn({ err }, "bot.engine.tick_failed");
  }
}

export function startBotEngine(intervalMs: number = TICK_MS): void {
  if (tickTimer) return;
  logger.info({ intervalMs }, "bot-engine.starting");
  tickTimer = setInterval(tick, intervalMs);
  setTimeout(tick, 5_000).unref();
  tickTimer.unref();
}

export function stopBotEngine(): void {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
}
