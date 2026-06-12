import { Router, type Request, type Response, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, walletsTable, coinsTable } from "@workspace/db";
// Importing requireApiKey ALSO loads the `declare module "express-serve-static-core"`
// block in api-key-auth.ts that augments Request with `apiKey`. Without this side
// effect tsc has no idea req.apiKey exists.
import { requireApiKey } from "../middlewares/api-key-auth";
import { sanitizeUser } from "../lib/auth";

const router: IRouter = Router();

// Public, unauthenticated time endpoint. Clients call this once at startup
// to learn the server clock so they can compute a valid X-ZBX-TIMESTAMP
// without depending on local clock accuracy.
router.get("/v1/system/time", (_req: Request, res: Response): void => {
  const now = Date.now();
  res.json({ serverTime: now, iso: new Date(now).toISOString() });
});

// HMAC-authed: minimal account info. "read" permission is sufficient.
router.get("/v1/account/me", requireApiKey("read"), (req: Request, res: Response): void => {
  res.json({
    user: sanitizeUser(req.user!),
    apiKey: {
      id: req.apiKey!.id,
      name: req.apiKey!.name,
      keyId: req.apiKey!.keyId,
      permissions: req.apiKey!.perms,
    },
  });
});

// HMAC-authed: wallet balances for the authenticated user. Returns one row per
// (coin, walletType) the user has ever held — spot, futures, and earn wallets
// are kept separate (matching Binance/Bybit semantics). Coins with no wallet
// row are omitted; callers should treat missing as "0".
router.get("/v1/account/balances", requireApiKey("read"), async (req: Request, res: Response): Promise<void> => {
  const rows = await db
    .select({
      coin:       coinsTable.symbol,
      walletType: walletsTable.walletType,
      balance:    walletsTable.balance,
      locked:     walletsTable.locked,
    })
    .from(walletsTable)
    .innerJoin(coinsTable, eq(coinsTable.id, walletsTable.coinId))
    .where(eq(walletsTable.userId, req.user!.id));
  res.json({
    balances: rows.map((r) => ({
      coin: r.coin,
      walletType: r.walletType,
      free: r.balance,
      locked: r.locked,
    })),
  });
});

export default router;
