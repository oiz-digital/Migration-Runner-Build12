import { Router, type IRouter } from "express";
import { db, referralsTable, usersTable, settingsTable } from "@workspace/db";
import { eq, desc, count, sum } from "drizzle-orm";
import { requireRole } from "../middlewares/auth";
import { z } from "zod/v4";
import { logAdminAction } from "../lib/audit";

const router: IRouter = Router();
const requireAdmin = requireRole("admin", "superadmin");

// ── Unified referral config stored in settingsTable ────────────────────────
export const REFERRAL_CONFIG_KEY = "referral.config";

export interface ReferralConfig {
  enabled: boolean;
  registrationBonus: number;
  trading: Record<string, number>; // level "1"-"5" → % of fee
  ai: Record<string, number>;      // level "1"-"5" → % of AI profit
  earn: Record<string, number>;    // level "1"-"5" → % of earn interest
}

export const DEFAULT_REFERRAL_CONFIG: ReferralConfig = {
  enabled: true,
  registrationBonus: 1.0,
  trading: { "1": 30, "2": 15, "3": 8, "4": 4, "5": 2 },
  ai:      { "1": 5,  "2": 3,  "3": 2, "4": 1, "5": 0.5 },
  earn:    { "1": 3,  "2": 2,  "3": 1, "4": 0.5, "5": 0.25 },
};

export async function loadReferralConfig(): Promise<ReferralConfig> {
  try {
    const [row] = await db.select().from(settingsTable)
      .where(eq(settingsTable.key, REFERRAL_CONFIG_KEY)).limit(1);
    if (row?.value) {
      const parsed = JSON.parse(row.value);
      if (parsed && typeof parsed === "object") {
        return {
          enabled:           typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_REFERRAL_CONFIG.enabled,
          registrationBonus: typeof parsed.registrationBonus === "number" ? parsed.registrationBonus : DEFAULT_REFERRAL_CONFIG.registrationBonus,
          trading:           { ...DEFAULT_REFERRAL_CONFIG.trading, ...(parsed.trading ?? {}) },
          ai:                { ...DEFAULT_REFERRAL_CONFIG.ai,      ...(parsed.ai      ?? {}) },
          earn:              { ...DEFAULT_REFERRAL_CONFIG.earn,    ...(parsed.earn    ?? {}) },
        };
      }
    }
  } catch { /* fallback */ }
  return { ...DEFAULT_REFERRAL_CONFIG };
}

const LevelRatesSchema = z.record(z.string(), z.number().min(0).max(100));
const ReferralConfigSchema = z.object({
  enabled:           z.boolean(),
  registrationBonus: z.number().min(0).max(1000),
  trading:           LevelRatesSchema,
  ai:                LevelRatesSchema,
  earn:              LevelRatesSchema,
});

// ── GET /admin/referral-settings ──────────────────────────────────────────
router.get("/admin/referral-settings", requireAdmin, async (_req, res): Promise<void> => {
  res.json(await loadReferralConfig());
});

// ── PUT /admin/referral-settings ──────────────────────────────────────────
router.put("/admin/referral-settings", requireAdmin, async (req, res): Promise<void> => {
  const parsed = ReferralConfigSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" });
    return;
  }
  const config = parsed.data;
  const value  = JSON.stringify(config);

  await db.insert(settingsTable).values({ key: REFERRAL_CONFIG_KEY, value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: new Date() } });

  await logAdminAction(req as any, {
    action: "referral.config.update",
    entity: "referral_config",
    payload: { enabled: config.enabled, registrationBonus: config.registrationBonus },
  });

  res.json({ ok: true, config });
});

// ── GET /admin/referrals — paged list of all referral records ─────────────
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

// ── GET /admin/referrals/stats ────────────────────────────────────────────
router.get("/admin/referrals/stats", requireAdmin, async (_req, res): Promise<void> => {
  const [total]   = await db.select({ count: count() }).from(referralsTable);
  const [bonuses] = await db.select({ total: sum(referralsTable.bonusAmount) }).from(referralsTable);
  const byLevel   = await Promise.all([1,2,3,4,5].map(async level => {
    const [r] = await db.select({ count: count() }).from(referralsTable).where(eq(referralsTable.level, level));
    return { level, count: r.count };
  }));
  const bySource  = await db
    .select({ sourceType: referralsTable.sourceType, total: sum(referralsTable.bonusAmount), n: count() })
    .from(referralsTable)
    .groupBy(referralsTable.sourceType);

  res.json({
    totalReferrals:  total.count,
    totalBonusPaid:  parseFloat(bonuses.total ?? "0"),
    byLevel,
    bySource: bySource.map(r => ({ sourceType: r.sourceType, total: parseFloat(r.total ?? "0"), count: r.n })),
  });
});

export default router;
