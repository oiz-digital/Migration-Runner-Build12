/**
 * Invoices — full-detail tax invoice for a filled spot order (Indian compliance)
 * GET /api/orders/:id/invoice
 * Returns: fills, GST breakdown, TDS, brand details — used by Invoice.tsx page
 */
import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, ordersTable, usersTable, tradesTable, pairsTable, coinsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { getInrRate } from "../lib/price-service";
import { COMPANY_NAME, COMPANY_SHORT, COMPANY_CIN, COMPANY_GST, COMPANY_ADDRESS } from "../lib/company";

const router: IRouter = Router();

const GST_RATE = 0.18;  // 18% GST on trading fee (Indian regulation)
const TDS_RATE = 0.01;  // 1%  TDS on sell proceeds (Sec 194S)

router.get("/orders/:id/invoice", requireAuth, async (req: any, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid order id" }); return; }

  const [order] = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, id), eq(ordersTable.userId, req.user!.id))).limit(1);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (order.status !== "filled" && order.status !== "partially_filled") {
    res.status(400).json({ error: "Invoice only available for filled / partially-filled orders" }); return;
  }

  // Fetch individual fills for the order
  const fills = await db.select().from(tradesTable)
    .where(and(eq(tradesTable.orderId, id), eq(tradesTable.userId, req.user!.id)))
    .orderBy(tradesTable.createdAt);

  // Fetch pair → coin symbols
  const [pair] = order.pairId
    ? await db.select({ id: pairsTable.id, symbol: pairsTable.symbol, baseCoinId: pairsTable.baseCoinId, quoteCoinId: pairsTable.quoteCoinId })
        .from(pairsTable).where(eq(pairsTable.id, order.pairId)).limit(1)
    : [undefined];

  const [baseCoin]  = pair?.baseCoinId  ? await db.select({ symbol: coinsTable.symbol }).from(coinsTable).where(eq(coinsTable.id, pair.baseCoinId)).limit(1)  : [undefined];
  const [quoteCoin] = pair?.quoteCoinId ? await db.select({ symbol: coinsTable.symbol }).from(coinsTable).where(eq(coinsTable.id, pair.quoteCoinId)).limit(1) : [undefined];

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);

  const filledQty     = parseFloat(order.filledQty ?? "0");
  const avgPrice      = parseFloat(order.avgPrice ?? order.price ?? "0");
  const grossNotional = filledQty * avgPrice;

  // Fee: prefer stored order.fee; fallback to sum of fill fees; fallback to estimate
  const fillFeeSum  = fills.reduce((s, f) => s + parseFloat(f.fee ?? "0"), 0);
  const tradingFee  = parseFloat(order.fee ?? String(fillFeeSum || (grossNotional * 0.001)));
  const gstAmount   = +(tradingFee * GST_RATE).toFixed(8);
  const totalFee    = +(tradingFee + gstAmount).toFixed(8);

  // TDS: from fill rows; fallback to calculate for sell orders
  const fillTdsSum  = fills.reduce((s, f) => s + parseFloat(f.tds ?? "0"), 0);
  const tdsAmount   = +(fillTdsSum > 0 ? fillTdsSum : order.side === "sell" ? grossNotional * TDS_RATE : 0).toFixed(8);

  const netAmount   = order.side === "buy"
    ? +(grossNotional + totalFee + tdsAmount).toFixed(8)
    : +(grossNotional - totalFee - tdsAmount).toFixed(8);

  const inrRate = getInrRate();
  const toInr   = (v: number) => +(v * inrRate).toFixed(2);

  const symbol  = pair?.symbol  ?? `PAIR${order.pairId}`;
  const base    = baseCoin?.symbol  ?? "BASE";
  const quote   = quoteCoin?.symbol ?? "USDT";

  res.json({
    invoiceNo: `INV-${String(order.id).padStart(8, "0")}`,
    issuedAt:  new Date().toISOString(),
    currency:  quote,
    brand: {
      legalName:    COMPANY_NAME,
      tradingName:  COMPANY_SHORT,
      address:      COMPANY_ADDRESS,
      gstin:        COMPANY_GST,
      cin:          COMPANY_CIN,
      pan:          process.env.COMPANY_PAN     ?? "AAAAZ0000Z",
      supportEmail: process.env.COMPANY_EMAIL   ?? "support@zebvix.com",
      website:      process.env.COMPANY_WEBSITE ?? "zebvix.com",
    },
    customer: {
      name:   user?.name ?? user?.email ?? "Customer",
      email:  user?.email ?? "",
      userId: user?.id ?? req.user!.id,
    },
    order: {
      id:        order.id,
      symbol,
      base,
      quote,
      side:      order.side,
      type:      order.type,
      status:    order.status,
      qty:       parseFloat(order.qty),
      filledQty,
      avgPrice,
      placedAt:  order.createdAt instanceof Date ? order.createdAt.toISOString() : order.createdAt,
    },
    breakdown: {
      grossNotional:  +grossNotional.toFixed(8),
      tradingFee:     +tradingFee.toFixed(8),
      gstPercent:     GST_RATE * 100,
      gstAmount:      +gstAmount.toFixed(8),
      totalFee:       +totalFee.toFixed(8),
      tdsPercent:     TDS_RATE * 100,
      tdsAmount:      +tdsAmount.toFixed(8),
      netAmount:      +netAmount.toFixed(8),
      netInr:         toInr(netAmount),
      inrRate,
      direction:      order.side === "sell" ? "credit" : "debit",
    },
    fills: fills.map(f => ({
      id:         f.id,
      uid:        f.uid,
      price:      parseFloat(f.price),
      qty:        parseFloat(f.qty),
      subtotal:   +(parseFloat(f.price) * parseFloat(f.qty)).toFixed(8),
      fee:        parseFloat(f.fee ?? "0"),
      tds:        parseFloat(f.tds ?? "0"),
      executedAt: f.createdAt instanceof Date ? f.createdAt.toISOString() : String(f.createdAt),
    })),
  });
});

export default router;
