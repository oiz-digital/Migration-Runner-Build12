import { Router, type IRouter } from "express";
import { db, referralsTable, usersTable } from "@workspace/db";
import { eq, desc, count, sum } from "drizzle-orm";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();
const requireAdmin = requireRole("admin", "superadmin");

router.get("/admin/referrals", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select({
    id:            referralsTable.id,
    referrerId:    referralsTable.referrerId,
    referredId:    referralsTable.referredId,
    bonusCredited: referralsTable.bonusCredited,
    bonusAmount:   referralsTable.bonusAmount,
    level:         referralsTable.level,
    sourceType:    referralsTable.sourceType,
    createdAt:     referralsTable.createdAt,
    referrerEmail: usersTable.email,
    referrerName:  usersTable.name,
  }).from(referralsTable)
    .leftJoin(usersTable, eq(referralsTable.referrerId, usersTable.id))
    .orderBy(desc(referralsTable.createdAt))
    .limit(500);

  res.json(rows.map(r => ({
    ...r,
    bonusAmount: parseFloat(r.bonusAmount ?? "0"),
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  })));
});

router.get("/admin/referrals/stats", requireAdmin, async (_req, res): Promise<void> => {
  const [total]   = await db.select({ count: count() }).from(referralsTable);
  const [bonuses] = await db.select({ total: sum(referralsTable.bonusAmount) }).from(referralsTable);
  const byLevel   = await Promise.all([1,2,3,4,5].map(async level => {
    const [r] = await db.select({ count: count() }).from(referralsTable).where(eq(referralsTable.level, level));
    return { level, count: r.count };
  }));
  res.json({
    totalReferrals: total.count,
    totalBonusPaid: parseFloat(bonuses.total ?? "0"),
    byLevel,
  });
});

export default router;
