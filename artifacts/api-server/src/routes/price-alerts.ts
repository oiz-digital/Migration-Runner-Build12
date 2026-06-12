import { Router, type IRouter } from "express";
import { db, priceAlertsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

const CreateAlertBody = z.object({
  symbol:      z.string().min(1).max(20).transform(s => s.toUpperCase()),
  condition:   z.enum(["above", "below"]),
  targetPrice: z.number().positive(),
  note:        z.string().max(200).optional(),
});

/* GET /api/price-alerts */
router.get("/price-alerts", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.user!.id;
  const alerts = await db
    .select()
    .from(priceAlertsTable)
    .where(eq(priceAlertsTable.userId, userId))
    .orderBy(desc(priceAlertsTable.createdAt));
  res.json(alerts);
});

/* POST /api/price-alerts */
router.post("/price-alerts", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.user!.id;
  const parsed = CreateAlertBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const { symbol, condition, targetPrice, note } = parsed.data;

  const existing = await db.select({ id: priceAlertsTable.id }).from(priceAlertsTable)
    .where(and(eq(priceAlertsTable.userId, userId), eq(priceAlertsTable.status, "active")));
  if (existing.length >= 20) { res.status(400).json({ error: "Max 20 active alerts" }); return; }

  const [alert] = await db.insert(priceAlertsTable).values({
    userId,
    coinSymbol:  symbol,
    condition,
    targetPrice: String(targetPrice),
    triggerOnce: true,
    status:      "active",
    note:        note ?? null,
  }).returning();
  res.status(201).json(alert);
});

/* DELETE /api/price-alerts/:id */
router.delete("/price-alerts/:id", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.user!.id;
  const id = parseInt(req.params.id as string);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(priceAlertsTable).where(and(eq(priceAlertsTable.id, id), eq(priceAlertsTable.userId, userId)));
  res.json({ success: true });
});

/* PATCH /api/price-alerts/:id/disable */
router.patch("/price-alerts/:id/disable", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.user!.id;
  const id = parseInt(req.params.id as string);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.update(priceAlertsTable)
    .set({ status: "disabled" })
    .where(and(eq(priceAlertsTable.id, id), eq(priceAlertsTable.userId, userId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Alert not found" }); return; }
  res.json(row);
});

export default router;
