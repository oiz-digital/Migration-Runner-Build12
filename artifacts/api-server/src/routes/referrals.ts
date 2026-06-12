import { Router, type IRouter } from "express";
import { db, referralsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { randomBytes } from "node:crypto";

const router: IRouter = Router();

const DEFAULT_COMMISSION_RATES = [
  { level: 1, regBonus: "1.00 USDT", aiPercent: "5%", tradingFeePercent: "30%", earnPercent: "3%" },
  { level: 2, regBonus: "0.50 USDT", aiPercent: "3%", tradingFeePercent: "15%", earnPercent: "2%" },
  { level: 3, regBonus: "0.25 USDT", aiPercent: "2%", tradingFeePercent: "8%",  earnPercent: "1%" },
  { level: 4, regBonus: "0.10 USDT", aiPercent: "1%", tradingFeePercent: "4%",  earnPercent: "0.5%" },
  { level: 5, regBonus: "0.05 USDT", aiPercent: "0.5%", tradingFeePercent: "2%", earnPercent: "0.25%" },
];

function makeCode(name: string): string {
  const suffix = randomBytes(3).toString("hex").toUpperCase();
  return ((name || "USER").slice(0, 4).toUpperCase() + suffix).slice(0, 8);
}

router.get("/referrals", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  let code = user.referralCode;
  if (!code) {
    code = makeCode(user.name);
    let attempts = 0;
    while (attempts < 5) {
      const [conflict] = await db.select().from(usersTable).where(eq(usersTable.referralCode, code)).limit(1);
      if (!conflict) break;
      code = makeCode(user.name);
      attempts++;
    }
    await db.update(usersTable).set({ referralCode: code }).where(eq(usersTable.id, userId));
  }

  const allRows = await db.select().from(referralsTable).where(eq(referralsTable.referrerId, userId));

  const levels = [1, 2, 3, 4, 5].map(level => {
    const levelRows        = allRows.filter(r => r.level === level);
    const regRows          = levelRows.filter(r => r.sourceType === "registration");
    const aiRows           = levelRows.filter(r => r.sourceType === "ai_trading");
    const tradingFeeRows   = levelRows.filter(r => r.sourceType === "trading_fee");
    const earnRows         = levelRows.filter(r => r.sourceType === "earn_plan");
    const sumBonus = (rows: typeof levelRows) =>
      rows.reduce((s, r) => s + parseFloat(r.bonusAmount ?? "0"), 0);
    const regBonus        = sumBonus(regRows);
    const aiBonus         = sumBonus(aiRows);
    const tradingFeeBonus = sumBonus(tradingFeeRows);
    const earnBonus       = sumBonus(earnRows);
    return {
      level,
      referralCount:    regRows.length,
      regBonus:         parseFloat(regBonus.toFixed(4)),
      aiBonus:          parseFloat(aiBonus.toFixed(4)),
      tradingFeeBonus:  parseFloat(tradingFeeBonus.toFixed(4)),
      earnBonus:        parseFloat(earnBonus.toFixed(4)),
      total:            parseFloat((regBonus + aiBonus + tradingFeeBonus + earnBonus).toFixed(4)),
    };
  });

  const totalReferrals = levels.reduce((s, l) => s + l.referralCount, 0);
  const totalBonus     = allRows.reduce((s, r) => s + parseFloat(r.bonusAmount ?? "0"), 0);
  const origin         = req.headers.origin ?? "https://zebvix.io";

  res.json({
    referralCode:    code,
    referralLink:    `${origin}/signup?ref=${code}`,
    welcomeBonus:    "0.50",
    totalReferrals,
    totalBonusUsdt:  parseFloat(totalBonus.toFixed(4)),
    levels,
    commissionRates: DEFAULT_COMMISSION_RATES,
    recentReferrals: allRows
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50)
      .map(r => ({
        id:            r.id,
        level:         r.level,
        bonusAmount:   r.bonusAmount,
        bonusCredited: r.bonusCredited,
        sourceType:    r.sourceType,
        createdAt:     r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      })),
  });
});

export default router;
