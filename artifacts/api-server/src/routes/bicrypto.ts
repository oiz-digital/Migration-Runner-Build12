// Bicrypto v5 API contract adapter for Flutter mobile app.
// Maps the Bicrypto-shaped endpoints onto the existing Node API server,
// returning real data where we have it and safe empty stubs elsewhere
// so the Flutter UI can mount every screen without crashing.

import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, or, and, desc, gt, sql } from "drizzle-orm";
import {
  db, usersTable, loginLogsTable, walletsTable, coinsTable, pairsTable, sessionsTable, otpCodesTable,
  networksTable, cryptoWithdrawalsTable, inrWithdrawalsTable, bankAccountsTable,
  cryptoDepositsTable, inrDepositsTable,
  ordersTable, tradesTable, futuresTradesTable,
  walletAddressesTable,
} from "@workspace/db";
import { deriveEvmWallet } from "../lib/hd-wallet";
import { encryptSecret } from "../lib/crypto-vault";
import {
  hashPassword, verifyPassword, generateReferralCode, generateUid,
  readSessionCookie, getUserBySession,
} from "../lib/auth";
import { signJwt, verifyJwt, newCsrfToken, newSessionId, powHash } from "../lib/jwt";
import { getCache, getInrRate } from "../lib/price-service";
import { getHistory as getPriceHistory } from "../lib/price-history";
import { rGet, rSet, getRedis } from "../lib/redis";
import Busboy from "busboy";
import { createWriteStream, mkdirSync, existsSync, createReadStream, statSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { consumeVerifiedOtp, dispatchOtp } from "./otp";
import { placeSpotOrder, cancelSpotOrderById } from "./orders";
import { getSpotFeeRates, loadVipTiers, type VipTier } from "./fees";

// Allow operators to relocate KYC uploads to a persistent directory
// (e.g. /var/lib/zebvix/kyc-uploads) via the KYC_UPLOAD_DIR env var.
// Falls back to /tmp/kyc-uploads for local dev / Replit.
const KYC_UPLOAD_DIR = process.env["KYC_UPLOAD_DIR"] ?? "/tmp/kyc-uploads";
if (!existsSync(KYC_UPLOAD_DIR)) {
  try { mkdirSync(KYC_UPLOAD_DIR, { recursive: true }); } catch { /* ignore */ }
}

const r: IRouter = Router();

// ──────────────────────────────────────────────────────────────────────────
// Bicrypto-style auth: JWT in cookie + Authorization: Bearer header.
// ──────────────────────────────────────────────────────────────────────────

const ACCESS_COOKIE = "accessToken";
const SESSION_COOKIE = "sessionId";
const CSRF_COOKIE = "csrfToken";

function cookieOpts() {
  return {
    httpOnly: true as const,
    // strict: blocks the cookie on cross-site requests — defense-in-depth
    // alongside the originGuard middleware. Bicrypto's mobile clients use
    // Bearer tokens (Authorization header) and aren't affected by cookies.
    sameSite: "strict" as const,
    path: "/",
    maxAge: 14 * 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === "production",
  };
}

function setAuthCookies(res: Response, accessToken: string, sessionId: string, csrfToken: string) {
  res.cookie(ACCESS_COOKIE, accessToken, cookieOpts());
  res.cookie(SESSION_COOKIE, sessionId, cookieOpts());
  res.cookie(CSRF_COOKIE, csrfToken, { ...cookieOpts(), httpOnly: false });
}
function clearAuthCookies(res: Response) {
  for (const c of [ACCESS_COOKIE, SESSION_COOKIE, CSRF_COOKIE]) res.clearCookie(c, { path: "/" });
}

function readBearer(req: Request): string | undefined {
  const h = req.headers.authorization;
  if (h && h.startsWith("Bearer ")) return h.slice(7);
  const cookies = (req as any).cookies as Record<string, string> | undefined;
  return cookies?.[ACCESS_COOKIE];
}

async function bicryptoAuth(req: Request, res: Response, next: NextFunction) {
  // Bicrypto/Flutter clients send a JWT (Bearer or accessToken cookie). The
  // React user-portal logs in via /auth/login which sets the cx_session cookie
  // backed by the `sessions` table. Accept either so both clients can hit
  // these endpoints with one auth flow.
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

const optionalAuth = async (req: Request, _res: Response, next: NextFunction) => {
  const tok = readBearer(req);
  if (tok) {
    const decoded = verifyJwt(tok);
    if (decoded?.sub?.id) {
      const id = Number(decoded.sub.id);
      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
      if (u) (req as any).bcUser = u;
    }
  }
  next();
};

function userToBicrypto(u: any) {
  const [first, ...rest] = String(u.name || "").split(" ");
  return {
    id: String(u.id),
    firstName: first || "User",
    lastName: rest.join(" ") || "",
    email: u.email,
    phone: u.phone || null,
    avatar: u.avatarUrl || null,
    emailVerified: true,
    status: u.status === "active" ? "ACTIVE" : "SUSPENDED",
    role: String(u.role === "admin" || u.role === "superadmin" ? 2 : u.role === "support" ? 1 : 0),
    emailVerifiedAt: u.createdAt,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt ?? u.createdAt,
    twoFactor: u.twoFaEnabled
      ? { id: String(u.id), userId: String(u.id), type: "EMAIL", enabled: true }
      : null,
    author: null,
  };
}

function makeAuthBundle(user: any) {
  const accessToken = signJwt({ id: String(user.id), role: user.role === "admin" || user.role === "superadmin" ? 2 : 0, email: user.email });
  const sessionId = newSessionId();
  const csrfToken = newCsrfToken();
  return { accessToken, sessionId, csrfToken };
}

/** Persist a session row so we can rotate / revoke refresh tokens.
 *  The cookie carries the session id; the DB row is the source of truth.
 *  Default lifetime: 14 days (same as cookie maxAge). */
async function persistSession(userId: number, sessionId: string, req: Request) {
  const ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || null;
  const ua = (req.headers["user-agent"] as string) || null;
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  try {
    await db.insert(sessionsTable).values({ userId, token: sessionId, ip, userAgent: ua, expiresAt });
  } catch {
    // unique-violation on token: extremely unlikely with random 256 bits, ignore.
  }
}

async function rotateSession(oldSessionId: string | undefined, userId: number, req: Request, newSessionId: string) {
  if (oldSessionId) {
    try { await db.delete(sessionsTable).where(eq(sessionsTable.token, oldSessionId)); } catch {}
  }
  await persistSession(userId, newSessionId, req);
}

// ──────────────────────────────────────────────────────────────────────────
// PoW captcha — trivial difficulty so client solves instantly
// ──────────────────────────────────────────────────────────────────────────

const POW_DIFFICULTY = 1; // leading zeros required in hex hash
const powIssued = new Map<string, number>(); // challenge -> issuedAt
function purgePow() {
  const cutoff = Date.now() - 10 * 60_000;
  for (const [k, v] of powIssued) if (v < cutoff) powIssued.delete(k);
}

r.get("/auth/pow/challenge", (_req, res) => {
  purgePow();
  const challenge = randomBytes(16).toString("hex");
  powIssued.set(challenge, Date.now());
  res.json({ challenge, difficulty: POW_DIFFICULTY });
});

function verifyPow(solution: any): boolean {
  if (!solution?.challenge || solution.nonce === undefined) return false;
  if (!powIssued.has(solution.challenge)) return false;
  const hash = powHash(solution.challenge, solution.nonce);
  const need = "0".repeat(POW_DIFFICULTY);
  if (!hash.startsWith(need)) return false;
  powIssued.delete(solution.challenge);
  return true;
}

// ──────────────────────────────────────────────────────────────────────────
// Auth: login (Flutter), register, logout, refresh, 2FA, password reset
// ──────────────────────────────────────────────────────────────────────────

r.post("/auth/login/flutter", async (req, res): Promise<void> => {
  const { email, password } = req.body ?? {};
  if (!email || !password) { res.status(400).json({ message: "Email and password required" }); return; }
  const ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || null;
  const ua = req.headers["user-agent"] || null;

  const [user] = await db.select().from(usersTable)
    .where(or(eq(usersTable.email, String(email).toLowerCase()), eq(usersTable.phone, String(email))))
    .limit(1);

  if (!user) {
    await db.insert(loginLogsTable).values({ email, ip, userAgent: ua, success: "false", reason: "no_user" });
    res.status(401).json({ message: "Invalid credentials" }); return;
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    await db.insert(loginLogsTable).values({ userId: user.id, email, ip, userAgent: ua, success: "false", reason: "bad_password" });
    res.status(401).json({ message: "Invalid credentials" }); return;
  }
  if (user.status !== "active") { res.status(403).json({ message: "Account suspended" }); return; }

  // 2FA gate
  if (user.twoFaEnabled) {
    res.json({
      id: String(user.id),
      message: "Two-factor verification required",
      twoFactor: { enabled: true, type: "EMAIL" },
    });
    return;
  }

  await db.insert(loginLogsTable).values({ userId: user.id, email, ip, userAgent: ua, success: "true" });
  const bundle = makeAuthBundle(user);
  await persistSession(user.id, bundle.sessionId, req);
  setAuthCookies(res, bundle.accessToken, bundle.sessionId, bundle.csrfToken);
  res.json({ message: "Login successful", cookies: bundle, user: userToBicrypto(user) });
});

r.post("/auth/register", async (req, res, next): Promise<void> => {
  const { firstName, lastName, email, password, ref, powSolution } = req.body ?? {};
  // If no PoW solution is present this is a web-portal (non-Flutter) request —
  // fall through to the regular authRouter which handles it with full
  // policy/OTP support and strict Zod validation.
  if (!powSolution) { next(); return; }
  if (!email || !password || password.length < 6) {
    res.status(400).json({ message: "Email and a 6+ char password are required" }); return;
  }
  if (!verifyPow(powSolution)) {
    res.status(400).json({ message: "Invalid PoW solution" }); return;
  }
  const lower = String(email).toLowerCase();
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, lower)).limit(1);
  if (existing) { res.status(409).json({ message: "User already exists" }); return; }

  let referredBy: number | null = null;
  if (ref) {
    const [refUser] = await db.select().from(usersTable).where(eq(usersTable.referralCode, ref)).limit(1);
    if (refUser) referredBy = refUser.id;
  }
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const passwordHash = await hashPassword(password);
  const [user] = await db.insert(usersTable).values({
    email: lower,
    passwordHash,
    name: fullName || lower.split("@")[0],
    referralCode: generateReferralCode(),
    uid: generateUid(),
    referredBy,
    role: "user",
  }).returning();
  if (!user) { res.status(500).json({ message: "Failed to create user" }); return; }

  // Initialize default wallets at zero
  const inrCoin = await db.select().from(coinsTable).where(eq(coinsTable.symbol, "INR")).limit(1);
  const usdtCoin = await db.select().from(coinsTable).where(eq(coinsTable.symbol, "USDT")).limit(1);
  const btcCoin = await db.select().from(coinsTable).where(eq(coinsTable.symbol, "BTC")).limit(1);
  const inits: any[] = [];
  if (inrCoin[0]) {
    inits.push({ userId: user.id, walletType: "inr", coinId: inrCoin[0].id, balance: "0" });
  }
  if (usdtCoin[0]) {
    inits.push({ userId: user.id, walletType: "spot", coinId: usdtCoin[0].id, balance: "0" });
    inits.push({ userId: user.id, walletType: "futures", coinId: usdtCoin[0].id, balance: "0" });
  }
  if (btcCoin[0]) {
    inits.push({ userId: user.id, walletType: "spot", coinId: btcCoin[0].id, balance: "0" });
  }
  if (inits.length) await db.insert(walletsTable).values(inits);

  const bundle = makeAuthBundle(user);
  await persistSession(user.id, bundle.sessionId, req);
  setAuthCookies(res, bundle.accessToken, bundle.sessionId, bundle.csrfToken);
  res.json({ message: "Registration successful", cookies: bundle, user: userToBicrypto(user) });
});

r.post("/auth/logout", async (req, res) => {
  // Destroy the server-side session row so the refresh-token cycle can't
  // be resurrected with a stolen sessionId cookie.
  const cookies = (req as any).cookies as Record<string, string> | undefined;
  const sid = cookies?.[SESSION_COOKIE];
  if (sid) {
    try { await db.delete(sessionsTable).where(eq(sessionsTable.token, sid)); } catch {}
  }
  // The React user-portal uses /auth/login (auth.ts) which sets a separate
  // `cx_session` cookie backed by the same `sessions` table. Destroy that
  // row + clear the cookie too, otherwise the next /auth/me re-authenticates
  // the user and "logout" appears to do nothing.
  const cxSid = cookies?.["cx_session"];
  if (cxSid) {
    try { await db.delete(sessionsTable).where(eq(sessionsTable.token, cxSid)); } catch {}
  }
  clearAuthCookies(res);
  res.clearCookie("cx_session", { path: "/" });
  // Also clear the legacy admin SESSION cookie for compatibility.
  res.clearCookie("session", { path: "/" });
  res.json({ message: "Logged out" });
});

/** Refresh-token rotation. The current sessionId cookie acts as the refresh
 *  token. To make rotation race-safe we use a single ATOMIC delete with a
 *  RETURNING clause: at most one concurrent caller can claim the old row.
 *  The losing caller gets a 401 (reuse-detection). Only after we've claimed
 *  the row do we insert a new session and mint cookies. */
r.post("/auth/refresh", async (req, res): Promise<void> => {
  const cookies = (req as any).cookies as Record<string, string> | undefined;
  const oldSid = cookies?.[SESSION_COOKIE];
  if (!oldSid) { res.status(401).json({ message: "No session cookie" }); return; }

  // Atomic single-shot consume: only succeeds if the row exists AND is unexpired.
  // Postgres serialises the DELETE so a second concurrent request finds 0 rows.
  const consumed = await db.delete(sessionsTable)
    .where(and(
      eq(sessionsTable.token, oldSid),
      gt(sessionsTable.expiresAt, new Date()),
    ))
    .returning({ id: sessionsTable.id, userId: sessionsTable.userId });

  if (consumed.length === 0) {
    // Either expired, never existed, or another request already rotated it
    // (reuse detection — for extra safety we could nuke ALL sessions for this
    //  user here, but that punishes users behind flaky networks too hard).
    res.status(401).json({ message: "Session invalid or already rotated" }); return;
  }

  const userId = consumed[0]!.userId;
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!u || u.status !== "active") {
    res.status(401).json({ message: "User unavailable" }); return;
  }

  const bundle = makeAuthBundle(u);
  await persistSession(u.id, bundle.sessionId, req);
  setAuthCookies(res, bundle.accessToken, bundle.sessionId, bundle.csrfToken);
  res.json({ message: "Token refreshed", cookies: bundle });
});

// ─── 2FA ───────────────────────────────────────────────────────────────
// Flow:
//   1. Client POSTs /otp/send  with channel=email, purpose="2fa", recipient=email
//   2. Client POSTs /otp/verify with otpId + 6-digit code → { otpId } (verified)
//   3. Client POSTs /auth/2fa  with { id: <userId>, otpId }
//        → server uses consumeVerifiedOtp() to atomically burn the OTP
//          and only then mints auth cookies for that user.
//      This means no caller can mint cookies without first proving they
//      received the OTP delivered to the *user's* recipient.

r.post("/auth/otp/login", async (req, res): Promise<void> => {
  // Same as /auth/2fa — both endpoints exist in the Bicrypto contract.
  await handle2faLogin(req, res);
});
r.post("/auth/2fa", async (req, res): Promise<void> => {
  await handle2faLogin(req, res);
});

async function handle2faLogin(req: Request, res: Response): Promise<void> {
  const { id, otpId } = req.body ?? {};
  if (!id || !otpId) { res.status(400).json({ message: "id and otpId required" }); return; }
  const userId = Number(id);
  if (!Number.isFinite(userId)) { res.status(400).json({ message: "Invalid id" }); return; }

  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!u) { res.status(401).json({ message: "Invalid credentials" }); return; }
  if (u.status !== "active") { res.status(403).json({ message: "Account suspended" }); return; }
  if (!u.twoFaEnabled) { res.status(400).json({ message: "2FA not enabled for this user" }); return; }

  const consumed = await consumeVerifiedOtp({ otpId: Number(otpId), purpose: "2fa", userId });
  if (!consumed.ok) { res.status(400).json({ message: consumed.error }); return; }

  const bundle = makeAuthBundle(u);
  await persistSession(u.id, bundle.sessionId, req);
  setAuthCookies(res, bundle.accessToken, bundle.sessionId, bundle.csrfToken);
  res.json({ message: "2FA verified", cookies: bundle, user: userToBicrypto(u) });
}

// Enable 2FA on the account: requires the user to first prove they can
// receive OTPs at their email (otp/send + otp/verify with purpose=2fa).
r.post("/auth/2fa/enable", bicryptoAuth, async (req: any, res): Promise<void> => {
  const { otpId } = req.body ?? {};
  if (!otpId) { res.status(400).json({ message: "otpId required (verify an email OTP first)" }); return; }
  const consumed = await consumeVerifiedOtp({ otpId: Number(otpId), purpose: "2fa", userId: req.bcUser.id });
  if (!consumed.ok) { res.status(400).json({ message: consumed.error }); return; }
  await db.update(usersTable).set({ twoFaEnabled: true, updatedAt: new Date() }).where(eq(usersTable.id, req.bcUser.id));
  res.json({ message: "2FA enabled", twoFactor: { enabled: true, type: "EMAIL" } });
});

r.post("/auth/2fa/disable", bicryptoAuth, async (req: any, res): Promise<void> => {
  const { otpId } = req.body ?? {};
  if (!otpId) { res.status(400).json({ message: "otpId required" }); return; }
  const consumed = await consumeVerifiedOtp({ otpId: Number(otpId), purpose: "2fa", userId: req.bcUser.id });
  if (!consumed.ok) { res.status(400).json({ message: consumed.error }); return; }
  await db.update(usersTable).set({ twoFaEnabled: false, updatedAt: new Date() }).where(eq(usersTable.id, req.bcUser.id));
  res.json({ message: "2FA disabled", twoFactor: { enabled: false } });
});

r.post("/auth/otp/resend", (_req, res) => res.json({ message: "Use POST /otp/send with channel/purpose/recipient" }));

// ─── Forgot-password flow ──────────────────────────────────────────────
// 1. POST /auth/reset { email } — silently returns OK regardless of
//    whether the email exists (account-enumeration defence). If the user
//    DOES exist, we kick off an email OTP with purpose="reset".
// 2. POST /auth/reset/confirm { email, otpId, newPassword } — verifies
//    the OTP atomically and updates the password.

r.post("/auth/reset", async (req, res): Promise<void> => {
  const { email } = req.body ?? {};
  if (!email) { res.status(400).json({ message: "email required" }); return; }
  const lower = String(email).toLowerCase();
  const [u] = await db.select().from(usersTable).where(eq(usersTable.email, lower)).limit(1);
  // Always respond with a safe payload to prevent account enumeration.
  if (!u) {
    res.json({ ok: true, message: "If that account exists, a reset code has been sent." });
    return;
  }
  const result = await dispatchOtp({ channel: "email", purpose: "reset", recipient: lower, log: req.log });
  if (!result.ok) {
    res.status(result.status).json({ message: result.error }); return;
  }
  req.log.info({ recipient: lower, otpId: result.otpId }, "password reset OTP dispatched");
  const payload: Record<string, unknown> = {
    ok: true,
    otpId: result.otpId,
    expiresInSec: result.expiresInSec,
    message: "Reset code sent to your email",
  };
  if (result.devCode) payload.devCode = result.devCode;
  res.json(payload);
});

r.post("/auth/reset/confirm", async (req, res): Promise<void> => {
  const { email, otpId, code, newPassword } = req.body ?? {};
  if (!email || !otpId || !code || !newPassword || String(newPassword).length < 8) {
    res.status(400).json({ message: "email, otpId, code and newPassword (8+ chars) required" }); return;
  }
  const lower = String(email).toLowerCase();
  const [u] = await db.select().from(usersTable).where(eq(usersTable.email, lower)).limit(1);
  if (!u) { res.status(400).json({ message: "Invalid reset request" }); return; }

  // Inline OTP verification (same logic as /otp/verify but purpose-locked to "reset")
  const { createHash: ch } = await import("node:crypto");
  const codeHash = ch("sha256").update(String(code).trim()).digest("hex");
  const [otp] = await db.select().from(otpCodesTable)
    .where(eq(otpCodesTable.id, Number(otpId)))
    .limit(1);
  if (!otp) { res.status(404).json({ message: "Reset code not found or already used" }); return; }
  if (otp.purpose !== "reset") { res.status(400).json({ message: "Invalid reset code" }); return; }
  if (otp.userId !== u.id) { res.status(400).json({ message: "Invalid reset request" }); return; }
  if (new Date(otp.expiresAt).getTime() <= Date.now()) {
    res.status(410).json({ message: "Reset code expired — request a new one" }); return;
  }
  const attempts = (otp.attempts ?? 0) + 1;
  if (attempts > 5) { res.status(429).json({ message: "Too many attempts — request a new code" }); return; }
  if (otp.code !== codeHash) {
    await db.update(otpCodesTable).set({ attempts }).where(eq(otpCodesTable.id, otp.id));
    res.status(400).json({ message: `Wrong code — ${5 - attempts} attempt${5 - attempts === 1 ? "" : "s"} left` }); return;
  }
  // Burn OTP + update password atomically
  await db.update(otpCodesTable)
    .set({ verifiedAt: new Date(), expiresAt: new Date() })
    .where(eq(otpCodesTable.id, otp.id));
  await db.update(usersTable)
    .set({ passwordHash: await hashPassword(String(newPassword)), updatedAt: new Date() })
    .where(eq(usersTable.id, u.id));
  // Invalidate every existing session — old tokens are now stale
  try { await db.delete(sessionsTable).where(eq(sessionsTable.userId, u.id)); } catch {}
  req.log.info({ userId: u.id }, "password reset confirmed");
  res.json({ ok: true, message: "Password reset successful" });
});

r.post("/auth/change-password", bicryptoAuth, async (req: any, res): Promise<void> => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword || newPassword.length < 6) {
    res.status(400).json({ message: "Both passwords required (newPassword 6+ chars)" }); return;
  }
  const u = req.bcUser;
  if (!(await verifyPassword(currentPassword, u.passwordHash))) {
    res.status(400).json({ message: "Current password wrong" }); return;
  }
  await db.update(usersTable).set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() }).where(eq(usersTable.id, u.id));
  res.json({ message: "Password changed" });
});

// Email verification: status check (GET) + send a fresh code (POST resend).
// The actual "verify with code" is just a normal /otp/verify call from the
// client. Email verification isn't gating any feature today, but the
// endpoints exist so the Flutter UI doesn't 404.
r.get("/auth/verify", optionalAuth, (req: any, res) => {
  const u = req.bcUser;
  res.json({ verified: !!u, email: u?.email ?? null });
});
r.post("/auth/verify", (_req, res) => res.json({ message: "Email verified" }));
r.post("/auth/verify/resend", bicryptoAuth, (req: any, res) =>
  res.json({ message: "Use POST /otp/send with channel=email purpose=signup", recipient: req.bcUser.email }));

r.post("/auth/login/google", (_req, res) => res.status(501).json({ message: "Google login not configured" }));
r.post("/auth/register/google", (_req, res) => res.status(501).json({ message: "Google register not configured" }));

// ──────────────────────────────────────────────────────────────────────────
// User: profile, settings, notifications, watchlist, support
// ──────────────────────────────────────────────────────────────────────────

r.get("/user/profile", bicryptoAuth, (req: any, res) => res.json(userToBicrypto(req.bcUser)));
r.put("/user/profile", bicryptoAuth, async (req: any, res): Promise<void> => {
  const { firstName, lastName, phone, avatar } = req.body ?? {};
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  const fields: any = {};
  if (name) fields.name = name;
  if (phone !== undefined) fields.phone = phone;
  if (avatar !== undefined) fields.avatarUrl = avatar;
  if (Object.keys(fields).length === 0) { res.json(userToBicrypto(req.bcUser)); return; }
  fields.updatedAt = new Date();
  const [u] = await db.update(usersTable).set(fields).where(eq(usersTable.id, req.bcUser.id)).returning();
  res.json(userToBicrypto(u));
});

r.get("/user/settings", bicryptoAuth, (_req, res) =>
  res.json({ theme: "dark", language: "en", notifications: { email: true, push: true } }));
r.put("/user/settings", bicryptoAuth, (req, res) => res.json(req.body ?? {}));

r.get("/user/notification", bicryptoAuth, (_req, res) =>
  res.json({ items: [], pagination: emptyPg() }));
r.post("/user/notification/:id/read", bicryptoAuth, (req, res) =>
  res.json({ id: req.params.id, read: true, readAt: new Date().toISOString() }));
r.delete("/user/notification/:id", bicryptoAuth, (_req, res) => res.json({ message: "Deleted" }));

r.get("/user/watchlist", bicryptoAuth, async (req: any, res): Promise<void> => {
  const redis = getRedis();
  const userId: number = req.bcUser.id;
  if (!redis) { res.json({ items: [], pagination: emptyPg() }); return; }
  const symbols = await redis.smembers(`zebvix:watchlist:${userId}`);
  const items = symbols.sort().map((s) => ({ symbol: s, createdAt: new Date().toISOString() }));
  res.json({
    items,
    pagination: { count: items.length, perPage: 200, page: 1, pages: 1, lastPage: 1, nextPage: null, prevPage: null },
  });
});
r.post("/user/watchlist", bicryptoAuth, async (req: any, res): Promise<void> => {
  const redis = getRedis();
  const userId: number = req.bcUser.id;
  const symbol = (req.body?.symbol as string | undefined)?.toUpperCase();
  if (!symbol) { res.status(400).json({ message: "symbol is required" }); return; }
  if (redis) await redis.sadd(`zebvix:watchlist:${userId}`, symbol);
  res.json({ message: "Added", symbol });
});
r.delete("/user/watchlist/:symbol", bicryptoAuth, async (req: any, res): Promise<void> => {
  const redis = getRedis();
  const userId: number = req.bcUser.id;
  const symbol = req.params.symbol?.toUpperCase();
  if (redis && symbol) await redis.srem(`zebvix:watchlist:${userId}`, symbol);
  res.json({ message: "Removed", symbol });
});

// KYC
r.get("/user/kyc/status", bicryptoAuth, (req: any, res) => res.json({
  status: req.bcUser.kycLevel ? "APPROVED" : "NOT_STARTED",
  level: req.bcUser.kycLevel ?? 0,
  applications: [],
}));
r.get("/user/kyc/level", (_req, res) => res.json({ items: [], pagination: emptyPg() }));
r.get("/user/kyc/level/:id", (_req, res) => res.status(404).json({ message: "Not found" }));
r.get("/user/kyc/application", bicryptoAuth, (_req, res) => res.json({ items: [], pagination: emptyPg() }));
r.post("/user/kyc/application", bicryptoAuth, (req: any, res) => res.json({
  message: "Submitted",
  id: `kyc-${Date.now()}`,
  userId: String(req.bcUser.id),
  status: "PENDING",
  createdAt: new Date().toISOString(),
}));
r.put("/user/kyc/application/:id", bicryptoAuth, (req, res) => res.json({
  message: "Updated",
  id: req.params.id,
  status: "PENDING",
  updatedAt: new Date().toISOString(),
}));

// Support tickets + chat
r.get("/user/support/ticket", bicryptoAuth, (_req, res) => res.json({ items: [], pagination: emptyPg() }));
r.post("/user/support/ticket", bicryptoAuth, (req: any, res) => res.json({
  message: "Ticket created",
  id: `tkt-${Date.now()}`,
  userId: String(req.bcUser.id),
  subject: req.body?.subject ?? "(no subject)",
  status: "OPEN",
  createdAt: new Date().toISOString(),
}));
r.get("/user/support/chat", bicryptoAuth, (_req, res) => res.json({ items: [], pagination: emptyPg() }));
r.get("/user/support/chat/:id", bicryptoAuth, (_req, res) => res.json({ messages: [], status: "OPEN" }));
r.post("/user/support/chat/:id", bicryptoAuth, (req, res) => res.json({
  message: "Sent", id: `msg-${Date.now()}`, ticketId: req.params.id,
  body: req.body?.message ?? "", createdAt: new Date().toISOString(),
}));

// ──────────────────────────────────────────────────────────────────────────
// Settings (public)
// ──────────────────────────────────────────────────────────────────────────

r.get("/settings", (_req, res) => {
  res.json({
    settings: [
      { key: "siteName", value: "Zebvix" },
      { key: "siteDescription", value: "Crypto Exchange" },
      { key: "logo", value: "/flutter/icons/Icon-192.png" },
      { key: "defaultCurrency", value: "USDT" },
      { key: "kycEnabled", value: "true" },
      { key: "p2pEnabled", value: "true" },
      { key: "stakingEnabled", value: "true" },
      { key: "icoEnabled", value: "false" },
      { key: "ecommerceEnabled", value: "false" },
      { key: "blogEnabled", value: "false" },
      { key: "mlmEnabled", value: "false" },
      { key: "futuresEnabled", value: "true" },
      { key: "spotEnabled", value: "true" },
      { key: "depositsEnabled", value: "true" },
      { key: "withdrawalsEnabled", value: "true" },
      { key: "googleAuthStatus", value: "false" },
      { key: "registrationEnabled", value: "true" },
      { key: "twoFactorEnabled", value: "true" },
    ],
    extensions: [],
  });
});
// Flutter posts to /settings; admin clients PUT. Accept both.
const upsertSettings = (req: Request, res: Response) =>
  res.json(req.body ?? { settings: [], extensions: [] });
r.put("/settings", bicryptoAuth, upsertSettings);
r.post("/settings", bicryptoAuth, upsertSettings);

// ──────────────────────────────────────────────────────────────────────────
// Wallets — paginated grouped by type
// ──────────────────────────────────────────────────────────────────────────

function emptyPg(perPage = 10) {
  return { total: 0, page: 1, perPage, totalPages: 0 };
}

function walletTypeOut(t: string): "FIAT" | "SPOT" | "FUTURES" | "ECO" {
  switch (t) {
    case "inr": return "FIAT";
    case "futures": return "FUTURES";
    case "earn": return "ECO";
    default: return "SPOT";
  }
}
function walletTypeIn(t: string): "spot" | "futures" | "earn" | "inr" {
  switch ((t || "").toUpperCase()) {
    case "FIAT": return "inr";
    case "FUTURES": return "futures";
    case "ECO": return "earn";
    default: return "spot";
  }
}

function walletToBicrypto(w: any, coin: any) {
  return {
    id: String(w.id),
    userId: String(w.userId),
    type: walletTypeOut(w.walletType),
    currency: coin?.symbol || "UNKNOWN",
    balance: Number(w.balance ?? 0),
    inOrder: Number(w.locked ?? 0),
    address: null,
    icon: coin?.logoUrl || null,
    status: true,
    createdAt: (w.updatedAt ?? new Date()).toISOString?.() ?? String(w.updatedAt),
    updatedAt: (w.updatedAt ?? new Date()).toISOString?.() ?? String(w.updatedAt),
  };
}

// Per-symbol USD price using the live price-service cache.
// Stable currencies map to 1; INR uses live inr_usdt_rate; everything else
// reads from the same tick cache the WS broadcasts.
function usdPriceFor(symbol: string, ticks: any[], inrRate: number): number {
  const s = (symbol || "").toUpperCase();
  if (s === "USDT" || s === "USDC" || s === "USD" || s === "BUSD" || s === "DAI") return 1;
  if (s === "INR") return inrRate > 0 ? 1 / inrRate : 0;
  const t = ticks.find((tk: any) => String(tk.symbol).toUpperCase() === s);
  return t?.usdt ? Number(t.usdt) : 0;
}

r.get("/finance/wallet", bicryptoAuth, async (req: any, res): Promise<void> => {
  const userId = req.bcUser.id;
  const inrRate = getInrRate() || 84;

  // PnL summary mode — uses a daily Redis snapshot of the user's USD value
  // (key TTL 8 days) so the 24h change is real, not a hard-coded 0.
  if (req.query.pnl === "true") {
    const today = await sumUsd(userId);
    const yKey = `pnl:snap:${userId}:${ymd(new Date(Date.now() - 86400000))}`;
    const tKey = `pnl:snap:${userId}:${ymd(new Date())}`;
    let yesterday = today;
    try {
      const ySnap = await rGet(yKey);
      if (ySnap !== null) yesterday = Number(ySnap) || today;
      // Seed today's snapshot once per UTC day so tomorrow can compare.
      const tSnap = await rGet(tKey);
      if (tSnap === null) await rSet(tKey, String(today), 8 * 86400);
    } catch { /* redis offline → fall back to today=yesterday, pnl=0 */ }
    const pnl = Math.round((today - yesterday) * 100) / 100;
    const pnlPct = yesterday > 0 ? Math.round((pnl / yesterday) * 10000) / 100 : 0;
    const [fees, discount] = await Promise.all([getUserFees(userId), getUserDiscount(userId)]);
    res.json({
      today, yesterday, pnl, pnlPct, inrRate, fees, discount,
      chart: Array.from({ length: 28 }, (_, i) => ({ t: Date.now() - (27 - i) * 86400000, v: today })),
    });
    return;
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(200, Math.max(1, Number(req.query.perPage) || 100));

  const wallets = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId));
  const coinIds = Array.from(new Set(wallets.map(w => w.coinId)));
  const coins = coinIds.length
    ? await db.select().from(coinsTable).where(or(...coinIds.map(id => eq(coinsTable.id, id)))!)
    : [];
  const coinById = new Map(coins.map(c => [c.id, c]));
  const ticks = getCache();

  // Enrich each wallet with server-side live valuation so the client doesn't
  // need to subscribe to every ticker just to render its own balance.
  const items = wallets.map(w => {
    const c = coinById.get(w.coinId);
    const base = walletToBicrypto(w, c);
    const sym = (c?.symbol || base.currency || "").toUpperCase();
    const px = usdPriceFor(sym, ticks, inrRate);
    const usdValue = (Number(base.balance) + Number(base.inOrder)) * px;
    return { ...base, usdPrice: px, usdValue: Math.round(usdValue * 1e6) / 1e6 };
  });

  const totalUsd = Math.round(items.reduce((acc, it) => acc + (it.usdValue || 0), 0) * 100) / 100;
  const totalInr = Math.round(totalUsd * inrRate * 100) / 100;

  const start = (page - 1) * perPage;
  const slice = items.slice(start, start + perPage);
  const [fees, discount] = await Promise.all([getUserFees(userId), getUserDiscount(userId)]);
  res.json({
    items: slice,
    totals: { usd: totalUsd, inr: totalInr, count: items.length, nonZero: items.filter(i => (i.balance || 0) + (i.inOrder || 0) > 0).length },
    inrRate,
    fees,
    discount,
    pagination: { total: items.length, page, perPage, totalPages: Math.ceil(items.length / perPage) },
  });
});

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

// Aggregate the user's spot + futures trading fees and convert into both USD
// and INR using the same live ticker cache as the wallet valuation. Today's
// window is "since UTC midnight" so a single-day reset is predictable across
// time zones — same convention as the daily PnL snapshot above.
//
// Spot fee is in the QUOTE coin of the trade's pair. For futures the user can
// be either the taker or the maker on a given fill, so we sum both columns
// gated by their respective user_id.
async function getUserFees(userId: number): Promise<{
  today: { usd: number; inr: number };
  total: { usd: number; inr: number };
}> {
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const inrRate = getInrRate() || 84;
  const ticks = getCache();

  let totalUsd = 0;
  let todayUsd = 0;

  try {
    const spot = await db.execute(sql`
      SELECT c.symbol AS quote_symbol,
             COALESCE(SUM(t.fee::numeric), 0)::text AS total,
             COALESCE(SUM(CASE WHEN t.created_at >= ${startOfToday} THEN t.fee::numeric ELSE 0 END), 0)::text AS today
      FROM ${tradesTable} t
      JOIN ${ordersTable} o ON o.id = t.order_id
      JOIN ${pairsTable} p ON p.id = t.pair_id
      JOIN ${coinsTable} c ON c.id = p.quote_coin_id
      WHERE t.user_id = ${userId} AND o.is_bot = 0
      GROUP BY c.symbol
    `);
    for (const r of (spot.rows as any[])) {
      const sym = String(r.quote_symbol || "").toUpperCase();
      const px = usdPriceFor(sym, ticks, inrRate);
      totalUsd += Number(r.total) * px;
      todayUsd += Number(r.today) * px;
    }
  } catch { /* trades empty or schema mismatch — leave fees at 0 */ }

  try {
    const fut = await db.execute(sql`
      SELECT c.symbol AS quote_symbol,
             COALESCE(SUM(CASE WHEN ft.taker_user_id = ${userId} THEN ft.taker_fee::numeric ELSE 0 END), 0)
           + COALESCE(SUM(CASE WHEN ft.maker_user_id = ${userId} THEN ft.maker_fee::numeric ELSE 0 END), 0)::numeric AS total,
             COALESCE(SUM(CASE WHEN ft.created_at >= ${startOfToday} AND ft.taker_user_id = ${userId} THEN ft.taker_fee::numeric ELSE 0 END), 0)
           + COALESCE(SUM(CASE WHEN ft.created_at >= ${startOfToday} AND ft.maker_user_id = ${userId} THEN ft.maker_fee::numeric ELSE 0 END), 0)::numeric AS today
      FROM ${futuresTradesTable} ft
      JOIN ${pairsTable} p ON p.id = ft.pair_id
      JOIN ${coinsTable} c ON c.id = p.quote_coin_id
      WHERE ft.taker_user_id = ${userId} OR ft.maker_user_id = ${userId}
      GROUP BY c.symbol
    `);
    for (const r of (fut.rows as any[])) {
      const sym = String(r.quote_symbol || "").toUpperCase();
      const px = usdPriceFor(sym, ticks, inrRate);
      totalUsd += Number(r.total) * px;
      todayUsd += Number(r.today) * px;
    }
  } catch { /* futures trades absent — leave fees at 0 */ }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    today: { usd: r2(todayUsd), inr: r2(todayUsd * inrRate) },
    total: { usd: r2(totalUsd), inr: r2(totalUsd * inrRate) },
  };
}

// VIP tier + fee-discount snapshot for the wallet header. Returns the user's
// effective spot maker/taker rate (already including GST) plus the equivalent
// rate at the base "Regular" tier so the client can render a single
// "you're saving X%" badge without re-fetching the tier ladder.
//
// Withdraw discount and the tier ladder are returned as-is for the wallet
// page to show "Tier 0 → next tier needs $X volume".
async function getUserDiscount(userId: number): Promise<{
  vipTier: number;
  vipName: string;
  spot: { maker: number; taker: number };           // effective rates (fractions, GST included)
  spotBase: { maker: number; taker: number };       // tier-0 rates for the same gst (fractions)
  futures: { maker: number; taker: number };        // tier rates as fractions (no GST in trade ledger)
  futuresBase: { maker: number; taker: number };
  withdrawDiscountPct: number;                      // 0..100 — % off withdraw fee at this tier
  gstPercent: number;
  tdsPercent: number;                               // shown as "1%" etc.
  discountPct: { spotMaker: number; spotTaker: number; futuresMaker: number; futuresTaker: number }; // 0..100
}> {
  // Defaults so the endpoint never fails just because of the discount block.
  const fallback = {
    vipTier: 0,
    vipName: "Regular",
    spot: { maker: 0.002, taker: 0.0025 },
    spotBase: { maker: 0.002, taker: 0.0025 },
    futures: { maker: 0.0005, taker: 0.0007 },
    futuresBase: { maker: 0.0005, taker: 0.0007 },
    withdrawDiscountPct: 0,
    gstPercent: 18,
    tdsPercent: 1,
    discountPct: { spotMaker: 0, spotTaker: 0, futuresMaker: 0, futuresTaker: 0 },
  };
  try {
    const [u] = await db.select({ vipTier: usersTable.vipTier }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    const tierLevel = Math.max(0, Number(u?.vipTier ?? 0));
    const tiers = await loadVipTiers();
    const tier: VipTier = tiers[Math.min(tierLevel, tiers.length - 1)] ?? tiers[0];
    const baseTier: VipTier = tiers[0];
    const [me, base] = await Promise.all([getSpotFeeRates(tierLevel), getSpotFeeRates(0)]);

    const pct = (cur: number, ref: number) =>
      ref > 0 ? Math.max(0, Math.round(((ref - cur) / ref) * 10000) / 100) : 0;

    return {
      vipTier: tier.level,
      vipName: tier.name,
      spot: { maker: me.maker, taker: me.taker },
      spotBase: { maker: base.maker, taker: base.taker },
      futures: { maker: tier.futuresMaker / 100, taker: tier.futuresTaker / 100 },
      futuresBase: { maker: baseTier.futuresMaker / 100, taker: baseTier.futuresTaker / 100 },
      withdrawDiscountPct: Number(tier.withdrawDiscount || 0),
      gstPercent: me.gstPercent,
      tdsPercent: Math.round(me.tds * 10000) / 100,
      discountPct: {
        spotMaker: pct(me.maker, base.maker),
        spotTaker: pct(me.taker, base.taker),
        futuresMaker: pct(tier.futuresMaker, baseTier.futuresMaker),
        futuresTaker: pct(tier.futuresTaker, baseTier.futuresTaker),
      },
    };
  } catch {
    return fallback;
  }
}

async function sumUsd(userId: number): Promise<number> {
  const wallets = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId));
  if (!wallets.length) return 0;
  const coinIds = Array.from(new Set(wallets.map(w => w.coinId)));
  const coins = await db.select().from(coinsTable).where(or(...coinIds.map(id => eq(coinsTable.id, id)))!);
  const ticks = getCache();
  const inrRate = getInrRate() || 84;
  let total = 0;
  for (const w of wallets) {
    const c = coins.find(x => x.id === w.coinId);
    if (!c) continue;
    const bal = Number(w.balance) + Number(w.locked);
    total += bal * usdPriceFor(c.symbol, ticks, inrRate);
  }
  return Math.round(total * 100) / 100;
}

r.get("/finance/wallet/:type/:currency", bicryptoAuth, async (req: any, res): Promise<void> => {
  const wt = walletTypeIn(req.params.type);
  const sym = String(req.params.currency).toUpperCase();
  const [coin] = await db.select().from(coinsTable).where(eq(coinsTable.symbol, sym)).limit(1);
  if (!coin) { res.status(404).json({ message: "Currency not found" }); return; }
  const [w] = await db.select().from(walletsTable).where(and(
    eq(walletsTable.userId, req.bcUser.id), eq(walletsTable.coinId, coin.id), eq(walletsTable.walletType, wt),
  )).limit(1);
  if (!w) {
    // Auto-create
    const [created] = await db.insert(walletsTable).values({
      userId: req.bcUser.id, coinId: coin.id, walletType: wt, balance: "0", locked: "0",
    }).returning();
    res.json(walletToBicrypto(created, coin)); return;
  }
  res.json(walletToBicrypto(w, coin));
});

r.get("/finance/wallet/symbol", bicryptoAuth, async (req: any, res): Promise<void> => {
  const wt = walletTypeIn(String(req.query.type || "SPOT"));
  const cur = String(req.query.currency || "").toUpperCase();
  const pair = String(req.query.pair || "").toUpperCase();
  const [c1] = await db.select().from(coinsTable).where(eq(coinsTable.symbol, cur)).limit(1);
  const [c2] = await db.select().from(coinsTable).where(eq(coinsTable.symbol, pair)).limit(1);
  let CURRENCY = 0, PAIR = 0;
  if (c1) {
    const [w] = await db.select().from(walletsTable).where(and(
      eq(walletsTable.userId, req.bcUser.id), eq(walletsTable.coinId, c1.id), eq(walletsTable.walletType, wt),
    )).limit(1);
    if (w) CURRENCY = Number(w.balance);
  }
  if (c2) {
    const [w] = await db.select().from(walletsTable).where(and(
      eq(walletsTable.userId, req.bcUser.id), eq(walletsTable.coinId, c2.id), eq(walletsTable.walletType, wt),
    )).limit(1);
    if (w) PAIR = Number(w.balance);
  }
  res.json({ CURRENCY, PAIR });
});

r.get("/finance/wallet/transfer-options", bicryptoAuth, (_req, res) =>
  // ECO removed — ecosystem feature is disabled.
  res.json({ from: ["FIAT", "SPOT", "FUTURES"], to: ["FIAT", "SPOT", "FUTURES"] }));

// Unified transaction history for Flutter wallet/history screens. Aggregates
// the user's trades, INR + crypto deposits, and INR + crypto withdrawals into
// a single list shaped for TransactionModel.fromJson. Sorted by createdAt
// desc and paginated. Filters supported via query: type=DEPOSIT|WITHDRAW|TRADE,
// status, currency, page, perPage.
r.get("/finance/transaction", bicryptoAuth, async (req: any, res): Promise<void> => {
  const userId = req.bcUser.id as number;
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(100, Math.max(1, Number(req.query.perPage) || 20));
  const typeFilter = String(req.query.type || "").toUpperCase();
  const statusFilter = String(req.query.status || "").toUpperCase();
  const currencyFilter = String(req.query.currency || "").toUpperCase();

  const want = (t: string) => !typeFilter || typeFilter === "ALL" || typeFilter === t;

  // Pull recent rows from each source. We cap each side at 200 then merge.
  const [trades, inrDeps, cryptoDeps, inrWdrs, cryptoWdrs, coins, pairs] = await Promise.all([
    // SECURITY: exclude bot-originated trades from the user's transaction
    // history. See orders.ts GET /trades for the same NOT EXISTS pattern.
    want("TRADE")
      ? db.select().from(tradesTable).where(and(
          eq(tradesTable.userId, userId),
          sql`NOT EXISTS (SELECT 1 FROM ${ordersTable} WHERE ${ordersTable.id} = ${tradesTable.orderId} AND ${ordersTable.isBot} = 1)`,
        )).orderBy(desc(tradesTable.createdAt)).limit(200)
      : Promise.resolve([] as any[]),
    want("DEPOSIT")
      ? db.select().from(inrDepositsTable).where(eq(inrDepositsTable.userId, userId)).orderBy(desc(inrDepositsTable.createdAt)).limit(200)
      : Promise.resolve([] as any[]),
    want("DEPOSIT")
      ? db.select().from(cryptoDepositsTable).where(eq(cryptoDepositsTable.userId, userId)).orderBy(desc(cryptoDepositsTable.createdAt)).limit(200)
      : Promise.resolve([] as any[]),
    want("WITHDRAW")
      ? db.select().from(inrWithdrawalsTable).where(eq(inrWithdrawalsTable.userId, userId)).orderBy(desc(inrWithdrawalsTable.createdAt)).limit(200)
      : Promise.resolve([] as any[]),
    want("WITHDRAW")
      ? db.select().from(cryptoWithdrawalsTable).where(eq(cryptoWithdrawalsTable.userId, userId)).orderBy(desc(cryptoWithdrawalsTable.createdAt)).limit(200)
      : Promise.resolve([] as any[]),
    db.select().from(coinsTable),
    db.select().from(pairsTable),
  ]);

  const coinById = new Map(coins.map(c => [c.id, c.symbol]));
  const pairById = new Map(pairs.map(p => [p.id, p.symbol]));
  // Resolve each pair's quote coin so the row can advertise the correct
  // fee currency. Spot fee is taken from the QUOTE coin (e.g. INR for
  // BTCINR, USDT for BTCUSDT) — not the base coin the trade qty is in.
  const pairQuoteById = new Map(pairs.map(p => [p.id, coinById.get(p.quoteCoinId) ?? ""]));

  const rows: any[] = [];

  for (const t of trades) {
    const sym = pairById.get(t.pairId) ?? "";
    // Symbol like SOL/INR or SOLINR — base currency is the first chunk.
    const base = sym.includes("/") ? sym.split("/")[0] : sym.replace(/INR$|USDT$/i, "");
    const quote = pairQuoteById.get(t.pairId) || (sym.includes("/") ? sym.split("/")[1] : sym.replace(base, ""));
    rows.push({
      id: `trade-${t.id}`,
      userId: String(userId),
      walletId: "",
      type: "TRADE",
      status: "COMPLETED",
      amount: Number(t.qty),
      fee: Number(t.fee || 0),
      // Spot fees settle in the quote coin; surface this so clients can
      // render "1.72 INR" instead of mistakenly labelling it as base coin.
      feeCurrency: quote,
      description: `${String(t.side).toUpperCase()} ${sym} @ ${Number(t.price)}`,
      metadata: { pair: sym, side: t.side, price: Number(t.price), orderId: t.orderId, quote },
      referenceId: t.uid,
      trxId: t.uid,
      createdAt: t.createdAt,
      updatedAt: t.createdAt,
      wallet: { currency: base, type: "SPOT" },
    });
  }

  const pushDeposit = (d: any, currency: string, walletType: string) => {
    rows.push({
      id: `dep-${walletType.toLowerCase()}-${d.id}`,
      userId: String(userId),
      walletId: "",
      type: "DEPOSIT",
      status: String(d.status || "pending").toUpperCase(),
      amount: Number(d.amount),
      fee: Number(d.fee || 0),
      // Deposit/withdraw fee is in the same coin as the amount.
      feeCurrency: currency,
      description: `Deposit ${currency}`,
      metadata: { refId: d.refId ?? d.txHash ?? null },
      referenceId: d.refId ?? d.txHash ?? null,
      trxId: d.uid,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt ?? d.createdAt,
      wallet: { currency, type: walletType },
    });
  };

  for (const d of inrDeps) pushDeposit(d, "INR", "FIAT");
  for (const d of cryptoDeps) pushDeposit(d, coinById.get(d.coinId) ?? "", "SPOT");

  const pushWithdrawal = (w: any, currency: string, walletType: string) => {
    rows.push({
      id: `wd-${walletType.toLowerCase()}-${w.id}`,
      userId: String(userId),
      walletId: "",
      type: "WITHDRAW",
      status: String(w.status || "pending").toUpperCase(),
      amount: Number(w.amount),
      fee: Number(w.fee || 0),
      feeCurrency: currency,
      description: `Withdraw ${currency}`,
      metadata: { refId: w.refId ?? w.txHash ?? null },
      referenceId: w.refId ?? w.txHash ?? null,
      trxId: w.uid,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt ?? w.createdAt,
      wallet: { currency, type: walletType },
    });
  };

  for (const w of inrWdrs) pushWithdrawal(w, "INR", "FIAT");
  for (const w of cryptoWdrs) pushWithdrawal(w, coinById.get(w.coinId) ?? "", "SPOT");

  // Apply optional currency / status filters and sort newest first.
  const filtered = rows.filter(r => {
    if (currencyFilter && r.wallet.currency.toUpperCase() !== currencyFilter) return false;
    if (statusFilter && statusFilter !== "ALL" && r.status.toUpperCase() !== statusFilter) return false;
    return true;
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  const start = (page - 1) * perPage;
  const items = filtered.slice(start, start + perPage);

  res.json({
    items,
    pagination: { totalItems, currentPage: page, perPage, totalPages },
  });
});
r.get("/finance/transaction/stats", bicryptoAuth, async (req: any, res): Promise<void> => {
  const userId: number = req.bcUser.id;
  const [depInr]  = await db.select({ n: sql<string>`count(*)` }).from(inrDepositsTable).where(eq(inrDepositsTable.userId, userId));
  const [depCry]  = await db.select({ n: sql<string>`count(*)` }).from(cryptoDepositsTable).where(eq(cryptoDepositsTable.userId, userId));
  const [wdInr]   = await db.select({ n: sql<string>`count(*)` }).from(inrWithdrawalsTable).where(eq(inrWithdrawalsTable.userId, userId));
  const [wdCry]   = await db.select({ n: sql<string>`count(*)` }).from(cryptoWithdrawalsTable).where(eq(cryptoWithdrawalsTable.userId, userId));
  const [trd]     = await db.select({ n: sql<string>`count(*)` }).from(tradesTable).where(eq(tradesTable.userId, userId));
  res.json({
    totalDeposits:    Number(depInr?.n ?? 0) + Number(depCry?.n ?? 0),
    totalWithdrawals: Number(wdInr?.n ?? 0)  + Number(wdCry?.n ?? 0),
    totalTrades:      Number(trd?.n ?? 0),
    totalFees: 0,
    byCurrency: [],
    byMonth: [],
  });
});
r.get("/finance/transaction/:id", bicryptoAuth, (req, res) =>
  res.status(404).json({ message: `Transaction ${req.params.id} not found` }));

// ─── Currency listings (only enabled coins / networks) ──────────────────
// Stable, per-user deterministic deposit address (matches public.ts logic
// for placeholder/non-EVM chains). Used only for the listing endpoint —
// /api/deposit-address is the canonical mint-an-EVM-address route.
function detAddr(userId: number | null, chain: string): { address: string; memo: string | null } {
  const seed = createHash("sha256").update(`cx:${userId ?? 0}:${chain}`).digest("hex");
  const c = chain.toLowerCase();
  if (c.includes("btc") || c === "bitcoin") return { address: "bc1q" + seed.slice(0, 38), memo: null };
  if (c.includes("trc")) return { address: "T" + Buffer.from(seed.slice(0, 30), "hex").toString("base64").replace(/[+/=]/g, "").slice(0, 33), memo: null };
  if (c.includes("sol")) return { address: Buffer.from(seed.slice(0, 32), "hex").toString("base64").replace(/[+/=]/g, "").slice(0, 44), memo: null };
  if (c.includes("xrp") || c.includes("ripple")) return { address: "r" + seed.slice(0, 33), memo: String(parseInt(seed.slice(0, 8), 16)) };
  return { address: "0x" + seed.slice(0, 40), memo: null };
}

// EVM chain detection — same address (m/44'/60'/0'/0/userId) works for all these
function isEvm(chain: string): boolean {
  return ["ETH","BNB","BSC","POLYGON","MATIC","ARBITRUM","BASE","AVAX","OP","OPTIMISM","ARB"].includes(chain.toUpperCase());
}

// Coin is enabled when listed AND status='active'
function isCoinEnabled(c: { isListed: boolean; status: string }): boolean {
  return c.isListed === true && c.status === "active";
}

r.get("/finance/currency", async (req, res): Promise<void> => {
  const action = String(req.query.action || "deposit");
  const walletType = walletTypeIn(String(req.query.walletType || "SPOT"));
  const coins = await db.select().from(coinsTable);
  const items = coins
    .filter(isCoinEnabled)
    .filter(c => walletType === "inr" ? c.symbol === "INR" : c.symbol !== "INR")
    .map(c => ({
      id: String(c.id), currency: c.symbol, name: c.name, icon: c.logoUrl,
      precision: c.decimals ?? 8, status: true,
      action,
    }));
  res.json(items);
});

r.get("/finance/currency/:type", async (req, res): Promise<void> => {
  const walletType = walletTypeIn(req.params.type);
  const action = String(req.query.action || "deposit").toLowerCase();
  const coins = await db.select().from(coinsTable);
  const eligible = coins
    .filter(isCoinEnabled)
    .filter(c => walletType === "inr" ? c.symbol === "INR" : c.symbol !== "INR");

  // Pull all networks once and group by coinId for efficiency
  const allNets = await db.select().from(networksTable).where(eq(networksTable.status, "active"));
  const byCoin = new Map<number, typeof allNets>();
  for (const n of allNets) {
    if (action === "withdraw" && !n.withdrawEnabled) continue;
    if (action !== "withdraw" && !n.depositEnabled) continue;
    const arr = byCoin.get(n.coinId) ?? [];
    arr.push(n);
    byCoin.set(n.coinId, arr);
  }

  const items = eligible
    .map(c => {
      const nets = byCoin.get(c.id) ?? [];
      // For non-INR crypto, hide a coin if it has zero usable networks
      if (c.symbol !== "INR" && nets.length === 0) return null;
      return {
        currency: c.symbol, name: c.name, icon: c.logoUrl,
        networks: nets.map(n => n.chain),
        status: true,
      };
    })
    .filter(Boolean);
  res.json(items);
});

r.get("/finance/currency/:type/:currency", async (req: any, res): Promise<void> => {
  const sym = String(req.params.currency).toUpperCase();
  const action = String(req.query.action || "deposit").toLowerCase();
  const [c] = await db.select().from(coinsTable).where(eq(coinsTable.symbol, sym)).limit(1);
  if (!c || !isCoinEnabled(c)) { res.status(404).json({ message: "Not found" }); return; }

  // INR has no on-chain networks
  if (sym === "INR") {
    res.json({ currency: c.symbol, name: c.name, icon: c.logoUrl, networks: [], status: true });
    return;
  }

  // Try to identify the user (best-effort) so we can return a stable per-user address
  let userId: number | null = null;
  try {
    // 1. Bearer token (bicrypto Flutter / API clients)
    const bearer = readBearer(req);
    if (bearer) {
      const claims = verifyJwt(bearer);
      const idStr = claims?.sub?.id;
      if (idStr != null && Number.isFinite(Number(idStr))) userId = Number(idStr);
    }
    // 2. Bicrypto sessionId cookie
    if (userId == null) {
      const sid = req.cookies?.[SESSION_COOKIE];
      if (sid) {
        const u = await getUserBySession(sid);
        if (u) userId = u.id;
      }
    }
    // 3. Standard portal cx_session cookie (set by auth.ts /auth/login)
    if (userId == null) {
      const cxSid = readSessionCookie(req);
      if (cxSid) {
        const u = await getUserBySession(cxSid);
        if (u) userId = u.id;
      }
    }
  } catch { /* anonymous fallback */ }

  const nets = await db.select().from(networksTable).where(
    and(eq(networksTable.coinId, c.id), eq(networksTable.status, "active")),
  );
  const filtered = nets.filter(n =>
    action === "withdraw" ? n.withdrawEnabled : n.depositEnabled,
  );

  // Pre-derive the universal EVM wallet address ONCE for this user.
  // All EVM chains (ETH, BNB, Polygon…) share the same BIP44 m/44'/60'/0'/0/userId path,
  // so they always produce the same 0x address. We upsert each EVM network row with
  // this single address, correcting any stale entries from previous server runs.
  let evmAddress: string | null = null;
  let evmPkEnc: string | null = null;
  let evmPath: string | null = null;
  let evmIndex: number | null = null;

  if (userId && action === "deposit" && filtered.some(n => isEvm(n.chain))) {
    const w = await deriveEvmWallet(userId);
    evmAddress = w.address;
    evmPkEnc = encryptSecret(w.privateKey);
    evmPath = w.path;
    evmIndex = w.index;
  }

  // Persist universal EVM address for every EVM network in one batch
  if (userId && evmAddress) {
    const evmNets = filtered.filter(n => isEvm(n.chain));
    await Promise.all(evmNets.map(n =>
      db.insert(walletAddressesTable).values({
        userId: userId!, networkId: n.id, address: evmAddress!,
        privateKeyEnc: evmPkEnc, derivationPath: evmPath, derivationIndex: evmIndex, status: "active",
      }).onConflictDoUpdate({
        target: [walletAddressesTable.userId, walletAddressesTable.networkId],
        set: { address: evmAddress!, privateKeyEnc: evmPkEnc },
      })
    ));
  }

  // Build the final network list
  const networkResults = filtered.map(n => {
    let address: string;
    let memo: string | null = null;

    if (evmAddress && isEvm(n.chain)) {
      address = evmAddress;
    } else {
      const a = detAddr(userId, n.chain);
      address = a.address;
      memo = a.memo;
    }

    return {
      id: n.id,
      chain: n.chain,
      name: n.name,
      fee: Number(n.withdrawFee),
      minWithdraw: Number(n.minWithdraw),
      minDeposit: Number(n.minDeposit),
      confirmations: n.confirmations,
      memoRequired: n.memoRequired,
      address,
      memo,
      isEvm: isEvm(n.chain),
    };
  });

  res.json({
    currency: c.symbol, name: c.name, icon: c.logoUrl,
    networks: networkResults,
    status: true,
  });
});

r.post("/finance/deposit/spot", bicryptoAuth, (_req, res) => res.json({ message: "Use one of the listed deposit addresses" }));

// ─── Bank accounts (needed by INR withdraw + admin) ──────────────────────
r.get("/finance/bank/accounts", bicryptoAuth, async (req: any, res): Promise<void> => {
  const rows = await db.select().from(bankAccountsTable)
    .where(eq(bankAccountsTable.userId, req.bcUser.id))
    .orderBy(desc(bankAccountsTable.createdAt));
  res.json(rows);
});

r.post("/finance/bank/accounts", bicryptoAuth, async (req: any, res): Promise<void> => {
  const { bankName, accountNumber, ifsc, holderName } = req.body ?? {};
  if (!bankName || !accountNumber || !ifsc || !holderName) {
    res.status(400).json({ message: "bankName, accountNumber, ifsc, holderName required" }); return;
  }
  const [row] = await db.insert(bankAccountsTable).values({
    userId: req.bcUser.id,
    bankName: String(bankName).trim(),
    accountNumber: String(accountNumber).trim(),
    ifsc: String(ifsc).trim().toUpperCase(),
    holderName: String(holderName).trim(),
  }).returning();
  res.status(201).json(row);
});

// ─── Crypto withdrawal (SPOT wallet → external chain address) ────────────
// Atomic, race-safe debit: a guarded UPDATE on the wallet only succeeds
// when balance >= amount, so two concurrent requests cannot both pass and
// overdraw. Funds move from `balance` → `locked` until the admin approves
// or rejects (see admin.ts /admin/crypto-withdrawals/:id PATCH).
r.post("/finance/withdraw/spot", bicryptoAuth, async (req: any, res): Promise<void> => {
  const { currency, amount, address, network, memo } = req.body ?? {};
  const amt = Number(amount);
  if (!currency || !address || !network || !Number.isFinite(amt) || amt <= 0) {
    res.status(400).json({ message: "currency, amount, address, network required" }); return;
  }
  const sym = String(currency).toUpperCase();
  if (sym === "INR") { res.status(400).json({ message: "Use /finance/withdraw/fiat for INR" }); return; }

  const [coin] = await db.select().from(coinsTable).where(eq(coinsTable.symbol, sym)).limit(1);
  if (!coin) { res.status(404).json({ message: "Currency not supported" }); return; }

  // Resolve network: accept either numeric id or chain name (e.g. "TRC20")
  const netKey = String(network).toUpperCase();
  const nets = await db.select().from(networksTable).where(eq(networksTable.coinId, coin.id));
  const net = nets.find(n =>
    String(n.id) === String(network) || n.chain.toUpperCase() === netKey || n.name.toUpperCase() === netKey
  );
  if (!net) { res.status(404).json({ message: `Network ${network} not enabled for ${sym}` }); return; }
  if (!net.withdrawEnabled || net.status !== "active") {
    res.status(403).json({ message: "Withdrawals temporarily disabled for this network" }); return;
  }
  if (amt < Number(net.minWithdraw)) {
    res.status(400).json({ message: `Minimum withdrawal is ${net.minWithdraw} ${sym}` }); return;
  }
  if (net.memoRequired && !memo) {
    res.status(400).json({ message: "Memo / tag is required for this network" }); return;
  }

  // Fee = max(flatFee + amount*pct, feeMin)
  const flat = Number(net.withdrawFee);
  const pct = Number(net.withdrawFeePercent) / 100;
  const fee = Math.max(flat + amt * pct, Number(net.withdrawFeeMin));
  if (fee >= amt) {
    res.status(400).json({ message: "Amount must exceed network fee" }); return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const debited = await tx.update(walletsTable).set({
        balance: sql`${walletsTable.balance} - ${amt}`,
        locked: sql`${walletsTable.locked} + ${amt}`,
        updatedAt: new Date(),
      }).where(and(
        eq(walletsTable.userId, req.bcUser.id),
        eq(walletsTable.coinId, coin.id),
        eq(walletsTable.walletType, "spot"),
        sql`${walletsTable.balance} >= ${amt}`,
      )).returning();
      if (debited.length === 0) {
        const e: any = new Error("Insufficient balance"); e.code = 400; throw e;
      }
      const [wd] = await tx.insert(cryptoWithdrawalsTable).values({
        userId: req.bcUser.id,
        coinId: coin.id,
        networkId: net.id,
        amount: String(amt.toFixed(8)),
        fee: String(fee.toFixed(8)),
        toAddress: String(address).trim(),
        memo: memo ? String(memo).trim() : null,
        status: "pending",
      }).returning();
      return wd;
    });
    res.status(201).json({
      id: result.uid,
      currency: sym,
      amount: result.amount,
      fee: result.fee,
      toAddress: result.toAddress,
      status: result.status,
      createdAt: result.createdAt,
      message: "Withdrawal submitted — pending admin approval",
    });
  } catch (e: any) {
    if (e?.code === 400) { res.status(400).json({ message: e.message }); return; }
    throw e;
  }
});

// ─── INR withdrawal (FIAT wallet → user's verified bank account) ─────────
r.post("/finance/withdraw/fiat", bicryptoAuth, async (req: any, res): Promise<void> => {
  const { bankId, amount } = req.body ?? {};
  const amt = Number(amount);
  if (!bankId || !Number.isFinite(amt) || amt <= 0) {
    res.status(400).json({ message: "bankId and amount required" }); return;
  }
  if (amt < 100) {
    res.status(400).json({ message: "Minimum withdrawal is ₹100" }); return;
  }

  const bid = Number(bankId);
  const [bank] = await db.select().from(bankAccountsTable).where(and(
    eq(bankAccountsTable.id, bid),
    eq(bankAccountsTable.userId, req.bcUser.id),
  )).limit(1);
  if (!bank) { res.status(404).json({ message: "Bank account not found" }); return; }
  if (bank.status !== "verified") {
    res.status(403).json({ message: "Bank account not yet verified" }); return;
  }

  const [inrCoin] = await db.select().from(coinsTable).where(eq(coinsTable.symbol, "INR")).limit(1);
  if (!inrCoin) { res.status(500).json({ message: "INR coin not configured" }); return; }

  // Flat ₹10 + 0.5% of amount, with a ₹10 floor.
  const fee = Math.max(10, Math.round((10 + amt * 0.005) * 100) / 100);
  if (fee >= amt) { res.status(400).json({ message: "Amount must exceed fee" }); return; }

  const refId = "WDR" + Date.now().toString(36).toUpperCase() + randomBytes(3).toString("hex").toUpperCase();

  try {
    const result = await db.transaction(async (tx) => {
      const debited = await tx.update(walletsTable).set({
        balance: sql`${walletsTable.balance} - ${amt}`,
        locked: sql`${walletsTable.locked} + ${amt}`,
        updatedAt: new Date(),
      }).where(and(
        eq(walletsTable.userId, req.bcUser.id),
        eq(walletsTable.coinId, inrCoin.id),
        eq(walletsTable.walletType, "inr"),
        sql`${walletsTable.balance} >= ${amt}`,
      )).returning();
      if (debited.length === 0) {
        const e: any = new Error("Insufficient INR balance"); e.code = 400; throw e;
      }
      const [wd] = await tx.insert(inrWithdrawalsTable).values({
        userId: req.bcUser.id,
        bankId: bank.id,
        amount: String(amt.toFixed(2)),
        fee: String(fee.toFixed(2)),
        refId,
        status: "pending",
      }).returning();
      return wd;
    });
    res.status(201).json({
      id: result.uid,
      refId: result.refId,
      amount: result.amount,
      fee: result.fee,
      bankAccount: { id: bank.id, bankName: bank.bankName, accountNumber: bank.accountNumber },
      status: result.status,
      createdAt: result.createdAt,
      message: "Withdrawal submitted — pending admin approval",
    });
  } catch (e: any) {
    if (e?.code === 400) { res.status(400).json({ message: e.message }); return; }
    throw e;
  }
});

// Generic /finance/withdraw — routes to spot or fiat based on currency
r.post("/finance/withdraw", bicryptoAuth, (req, res, next) => {
  const sym = String(req.body?.currency || "").toUpperCase();
  req.url = sym === "INR" ? "/finance/withdraw/fiat" : "/finance/withdraw/spot";
  next();
});

/** Internal transfer between SPOT/FUTURES/FIAT/ECO wallets, atomic.
 *  This is a DB-level transaction that decrements one wallet and credits the
 *  other. The Flutter UI sends `{ from, to, currency, amount }`. */
r.post("/finance/transfer", bicryptoAuth, async (req: any, res): Promise<void> => {
  const { from, to, currency, amount } = req.body ?? {};
  const amt = Number(amount);
  if (!from || !to || !currency || !Number.isFinite(amt) || amt <= 0) {
    res.status(400).json({ message: "from, to, currency, amount required" }); return;
  }
  if (from === to) { res.status(400).json({ message: "from and to must differ" }); return; }
  const fromType = walletTypeIn(String(from));
  const toType = walletTypeIn(String(to));
  const sym = String(currency).toUpperCase();
  const [coin] = await db.select().from(coinsTable).where(eq(coinsTable.symbol, sym)).limit(1);
  if (!coin) { res.status(404).json({ message: "Currency not found" }); return; }

  try {
    await db.transaction(async (tx) => {
      // Race-safe debit: a single guarded UPDATE that only succeeds when
      // the wallet exists AND has enough balance. Two concurrent transfers
      // can no longer both pass an in-app `>= amt` check and overdraw —
      // the second one returns 0 rows and we throw.
      const debited = await tx.update(walletsTable)
        .set({
          balance: sql`${walletsTable.balance} - ${amt}`,
          updatedAt: new Date(),
        })
        .where(and(
          eq(walletsTable.userId, req.bcUser.id),
          eq(walletsTable.coinId, coin.id),
          eq(walletsTable.walletType, fromType),
          sql`${walletsTable.balance} >= ${amt}`,
        ))
        .returning({ id: walletsTable.id });

      if (debited.length === 0) throw new Error("Insufficient balance");

      // Credit destination — try to update first, then upsert if missing.
      // The unique index (userId, walletType, coinId) makes the insert path
      // safe; if another tx created the dest concurrently we'd get a unique
      // violation and the outer transaction will roll back.
      const credited = await tx.update(walletsTable)
        .set({
          balance: sql`${walletsTable.balance} + ${amt}`,
          updatedAt: new Date(),
        })
        .where(and(
          eq(walletsTable.userId, req.bcUser.id),
          eq(walletsTable.coinId, coin.id),
          eq(walletsTable.walletType, toType),
        ))
        .returning({ id: walletsTable.id });

      if (credited.length === 0) {
        await tx.insert(walletsTable).values({
          userId: req.bcUser.id, coinId: coin.id, walletType: toType,
          balance: String(amt), locked: "0",
        });
      }
    });
    res.json({ message: "Transfer successful", from, to, currency: sym, amount: amt });
  } catch (e: any) {
    res.status(400).json({ message: e?.message || "Transfer failed" });
  }
});

r.post("/finance/transfer/validate", bicryptoAuth, async (req: any, res): Promise<void> => {
  const { from, currency, amount } = req.body ?? {};
  const amt = Number(amount);
  if (!from || !currency || !Number.isFinite(amt) || amt <= 0) {
    res.json({ valid: false, message: "Invalid input" }); return;
  }
  const fromType = walletTypeIn(String(from));
  const sym = String(currency).toUpperCase();
  const [coin] = await db.select().from(coinsTable).where(eq(coinsTable.symbol, sym)).limit(1);
  if (!coin) { res.json({ valid: false, message: "Currency not found" }); return; }
  const [w] = await db.select().from(walletsTable).where(and(
    eq(walletsTable.userId, req.bcUser.id),
    eq(walletsTable.coinId, coin.id),
    eq(walletsTable.walletType, fromType),
  )).limit(1);
  const have = w ? Number(w.balance) : 0;
  res.json({ valid: have >= amt, available: have, needed: amt });
});

// ──────────────────────────────────────────────────────────────────────────
// Exchange: market, ticker, orderbook, trades, chart
// ──────────────────────────────────────────────────────────────────────────

function pairToMarket(p: any, coinById: Map<number, any>, tickByBase?: Map<string, any>) {
  const base = coinById.get(p.baseCoinId)?.symbol || "BTC";
  const quote = coinById.get(p.quoteCoinId)?.symbol || "USDT";
  const tk = tickByBase?.get(base);
  const tickPx = tk ? Number(quote === "INR" ? tk.inr : tk.usdt) || 0 : 0;
  // Overlay real DB stats once the pair has any fills, mirroring tickerEntry().
  const hasFills = Number(p.trades24h ?? 0) > 0;
  const px = hasFills ? Number(p.lastPrice ?? tickPx) || tickPx : tickPx;
  const pctRaw = hasFills ? Number(p.change24h ?? 0) : (tk ? Number(tk.change24h ?? 0) : 0);
  const pct = pctRaw <= -100 ? -99.99 : pctRaw;
  const baseVol = hasFills ? Number(p.volume24h ?? 0) : (tk ? Number(tk.volume24h ?? 0) : 0);
  const quoteVol = hasFills ? Number(p.quoteVolume24h ?? 0) : baseVol * px;
  const high = hasFills ? Number(p.high24h ?? 0) || px : px * (1 + Math.max(pct, 0) / 100);
  const low = hasFills ? Number(p.low24h ?? 0) || px : px * (1 + Math.min(pct, 0) / 100);
  return {
    id: String(p.id),
    symbol: `${base}/${quote}`,
    currency: base,
    pair: quote,
    price: px,
    last: px,
    change: pct,
    changePercent: pct,
    percentage: pct,
    baseVolume: baseVol,
    quoteVolume: quoteVol,
    high,
    low,
    open: pct === 0 ? px : px / (1 + pct / 100),
    close: px,
    isTrending: false,
    isHot: false,
    status: p.status === "active",
    isEco: false,
    icon: null,
    metadata: {
      taker: 0.001, maker: 0.001,
      precision: { price: Number(p.pricePrecision ?? 2), amount: Number(p.qtyPrecision ?? 4) },
      limits: {
        amount: { min: Number(p.minQty ?? 0), max: null },
        price: { min: 0, max: null },
        cost: { min: 0, max: null },
        leverage: p.futuresEnabled ? { min: 1, max: Number(p.maxLeverage ?? 100) } : null,
      },
    },
  };
}

async function loadCoinMap(): Promise<Map<number, any>> {
  const coins = await db.select().from(coinsTable);
  return new Map(coins.map(c => [c.id, c]));
}

r.get("/exchange/market", async (_req, res): Promise<void> => {
  const pairs = await db.select().from(pairsTable).where(
    and(
      eq(pairsTable.status, "active"),
      or(eq(pairsTable.tradingEnabled, true), eq(pairsTable.futuresEnabled, true)),
    ),
  );
  const coinMap = await loadCoinMap();
  const ticks = getCache() as any[];
  const tickByBase = new Map<string, any>(ticks.map(t => [String(t.symbol), t]));
  res.json(pairs.map(p => pairToMarket(p, coinMap, tickByBase)));
});

// Build a ticker entry from a Tick + the quote symbol (USDT or INR).
// `change` is exposed as a percentage to match the Bicrypto/Flutter contract
// (TickerModel reads it as a percent-style value). `change24h <= -100` is
// guarded to avoid divide-by-zero / inverted prices in synthetic OHLC.
// Build ticker entry. When the pair has any real fills (trades_24h > 0) we
// surface authoritative DB values (volume / change / hi-lo / last) so the
// mobile UI shows what users actually traded; otherwise fall back to the
// synthetic external-feed tick.
function tickerEntry(t: any, quote: string, pair?: any) {
  const tickPx = quote === "INR" ? Number(t.inr ?? 0) : Number(t.usdt ?? 0);
  const hasFills = pair && Number(pair.trades24h ?? 0) > 0;
  const px = hasFills ? Number(pair.lastPrice ?? tickPx) || tickPx : tickPx;
  const pctRaw = hasFills ? Number(pair.change24h ?? 0) : Number(t.change24h ?? 0);
  const pct = pctRaw <= -100 ? -99.99 : pctRaw;
  const baseVol = hasFills ? Number(pair.volume24h ?? 0) : Number(t.volume24h ?? 0);
  const quoteVol = hasFills ? Number(pair.quoteVolume24h ?? 0) : baseVol * px;
  const high = hasFills ? Number(pair.high24h ?? 0) || px : px * (1 + Math.max(pct, 0) / 100);
  const low = hasFills ? Number(pair.low24h ?? 0) || px : px * (1 + Math.min(pct, 0) / 100);
  const openSafe = px / (1 + pct / 100);
  return {
    last: px, bid: px * 0.999, ask: px * 1.001,
    high, low,
    open: openSafe, close: px,
    change: pct,
    percentage: pct,
    baseVolume: baseVol,
    quoteVolume: quoteVol,
    timestamp: Number(t.ts ?? Date.now()),
  };
}

// ── Platform aggregate stats (DB-backed, INR-normalised) ──────────────
r.get("/exchange/stats", async (_req, res): Promise<void> => {
  const { getAllPairStats } = await import("../lib/pair-stats");
  const allStats = getAllPairStats();
  const ticks = getCache() as any[];

  // Live USDT→INR rate (from price-service cache; fallback ~83)
  const usdtTick = ticks.find((t: any) => t.symbol === "USDT");
  const inrRate = Number(usdtTick?.inr ?? 0) || 83;

  let totalVolumeInr = 0;
  let totalTrades24h = 0;
  let activePairs = 0;

  for (const ps of allStats) {
    totalTrades24h += ps.trades24h;
    if (ps.quoteVolume <= 0) continue;
    activePairs++;
    const quote = (ps.symbol.split("/")[1] ?? "").toUpperCase();
    if (quote === "INR") {
      totalVolumeInr += ps.quoteVolume;
    } else if (quote === "USDT" || quote === "USDC" || quote === "USD" || quote === "BUSD") {
      totalVolumeInr += ps.quoteVolume * inrRate;
    } else {
      // BTC, ETH, BNB etc → find their USDT price then convert to INR
      const quoteTick = ticks.find((t: any) => t.symbol === quote);
      const quoteUsdt = Number(quoteTick?.usdt ?? 0);
      if (quoteUsdt > 0) totalVolumeInr += ps.quoteVolume * quoteUsdt * inrRate;
    }
  }

  res.json({
    totalVolumeInr: Math.round(totalVolumeInr),
    totalTrades24h,
    activePairs,
    inrRate: Math.round(inrRate * 100) / 100,
    ts: Date.now(),
  });
});

r.get("/exchange/ticker", async (_req, res): Promise<void> => {
  const ticks = getCache() as any[];
  const pairs = await db.select().from(pairsTable);
  const coinMap = await loadCoinMap();
  const pairBySym = new Map<string, any>();
  for (const p of pairs) {
    const b = coinMap.get(p.baseCoinId)?.symbol;
    const q = coinMap.get(p.quoteCoinId)?.symbol;
    if (b && q) pairBySym.set(`${b}/${q}`, p);
  }
  const map: Record<string, any> = {};
  for (const t of ticks) {
    if (t.symbol === "USDT" || t.symbol === "INR") continue;
    map[`${t.symbol}/USDT`] = tickerEntry(t, "USDT", pairBySym.get(`${t.symbol}/USDT`));
    if (Number(t.inr) > 0) map[`${t.symbol}/INR`] = tickerEntry(t, "INR", pairBySym.get(`${t.symbol}/INR`));
  }
  res.json(map);
});

r.get("/exchange/ticker/:currency/:pair", async (req, res): Promise<void> => {
  const cur = req.params.currency.toUpperCase();
  const quote = req.params.pair.toUpperCase();
  const ticks = getCache() as any[];
  const t = ticks.find(x => x.symbol === cur);
  if (!t) { res.json({ symbol: `${cur}/${quote}`, last: 0, bid: 0, ask: 0 }); return; }
  const dbSymbol = `${cur}${quote}`;
  const [pair] = await db.select().from(pairsTable).where(eq(pairsTable.symbol, dbSymbol)).limit(1);
  res.json({ symbol: `${cur}/${quote}`, ...tickerEntry(t, quote, pair) });
});

r.get("/exchange/orderbook/:currency/:pair", async (req, res): Promise<void> => {
  const sym = `${req.params.currency.toUpperCase()}/${req.params.pair.toUpperCase()}`;
  const { getDepth } = await import("../lib/matching-engine");
  const depth = await getDepth(sym, 50);
  res.json({ symbol: sym, ...depth, timestamp: Date.now() });
});

r.get("/exchange/trades/:currency/:pair", async (req, res): Promise<void> => {
  const sym = `${req.params.currency.toUpperCase()}/${req.params.pair.toUpperCase()}`;
  const { getRecentTrades } = await import("../lib/matching-engine");
  const trades = await getRecentTrades(sym, 50);
  res.json(trades);
});

function intervalMs(interval: string): number {
  const num = parseInt(interval, 10) || 1;
  const unit = interval.replace(/^\d+/, "").toLowerCase();
  if (unit === "s") return num * 1000;
  if (unit === "m") return num * 60_000;
  if (unit === "h") return num * 3_600_000;
  if (unit === "d") return num * 86_400_000;
  if (unit === "w") return num * 7 * 86_400_000;
  return num * 60_000;
}

// Build OHLCV candles from real fills (tradesTable) for the symbol's pair,
// blended with the live tick buffer. Empty buckets carry forward the last
// close so the chart never has gaps. The latest bucket always reflects the
// current live price so the chart "breathes" in real time.
export async function buildChart(symbol: string, interval: string, limit: number) {
  const stepMs = intervalMs(interval);
  const now = Date.now();
  const bucketStart = (ts: number) => Math.floor(ts / stepMs) * stepMs;
  const lastBucket = bucketStart(now);
  const firstBucket = lastBucket - (limit - 1) * stepMs;

  const ticks = getCache() as any[];
  const base = symbol.split("/")[0]?.toUpperCase() || "BTC";
  const quote = (symbol.split("/")[1] || "USDT").toUpperCase();
  const tick = ticks.find((x) => x?.symbol === base);
  const livePx = tick ? (quote === "INR" ? Number(tick.inr) : Number(tick.usdt)) || 0 : 0;

  // Try to map symbol -> pair_id and pull real trades from DB.
  const dbSymbol = `${base}${quote}`;
  let pairRow: any = null;
  try {
    const [p] = await db.select().from(pairsTable).where(eq(pairsTable.symbol, dbSymbol)).limit(1);
    pairRow = p;
  } catch {}

  // Buckets: ts -> { o,h,l,c,v }
  const buckets = new Map<number, { o: number; h: number; l: number; c: number; v: number }>();
  const addSample = (ts: number, price: number, volume = 0) => {
    if (ts < firstBucket || ts > lastBucket || !(price > 0)) return;
    const b = bucketStart(ts);
    let cur = buckets.get(b);
    if (!cur) { buckets.set(b, { o: price, h: price, l: price, c: price, v: volume }); return; }
    cur.h = Math.max(cur.h, price);
    cur.l = Math.min(cur.l, price);
    cur.c = price;
    cur.v += volume;
  };

  if (pairRow) {
    try {
      const sinceTs = new Date(firstBucket);
      const rows = await db
        .select({
          createdAt: tradesTable.createdAt,
          price: tradesTable.price,
          qty: tradesTable.qty,
        })
        .from(tradesTable)
        .where(and(eq(tradesTable.pairId, pairRow.id), gt(tradesTable.createdAt, sinceTs))!)
        .orderBy(tradesTable.createdAt)
        .limit(5000);
      let convert = 1;
      // Pair prices are stored in the pair's quote currency (e.g. SOLINR -> INR).
      // If caller asked for a different quote (rare), don't try to convert — just
      // serve the pair's native quote since pairs are unique by exact symbol here.
      for (const row of rows) {
        const ts = (row.createdAt as Date).getTime();
        addSample(ts, Number(row.price) * convert, Number(row.qty));
      }
    } catch {}
  }

  // Layer in live tick history (synthetic but real intra-bucket movement).
  // For larger intervals this contributes only to the latest bucket(s); for
  // 1m/5m it gives the chart visible motion even when no trades exist.
  for (const s of getPriceHistory(symbol)) addSample(s.ts, s.price, 0);

  // If still nothing, seed a flat history at the live price so the UI has
  // something coherent (instead of synthetic sin/cos noise).
  if (buckets.size === 0 && livePx > 0) {
    for (let b = firstBucket; b <= lastBucket; b += stepMs) {
      buckets.set(b, { o: livePx, h: livePx, l: livePx, c: livePx, v: 0 });
    }
  }

  // Always pin the most recent bucket to the live price as close so the
  // chart updates the moment the ticker moves, even before a trade prints.
  if (livePx > 0) {
    let cur = buckets.get(lastBucket);
    if (!cur) cur = { o: livePx, h: livePx, l: livePx, c: livePx, v: 0 };
    cur.c = livePx;
    cur.h = Math.max(cur.h, livePx);
    cur.l = Math.min(cur.l, livePx);
    buckets.set(lastBucket, cur);
  }

  // Carry-forward fill so empty buckets show a flat candle at the last close.
  const out: number[][] = [];
  let prevClose = 0;
  // Seed prevClose from the earliest known bucket so leading gaps don't
  // collapse to zero.
  for (let b = firstBucket; b <= lastBucket; b += stepMs) {
    const cur = buckets.get(b);
    if (cur) { prevClose = cur.c; break; }
  }
  if (prevClose === 0 && livePx > 0) prevClose = livePx;

  for (let b = firstBucket; b <= lastBucket; b += stepMs) {
    const cur = buckets.get(b);
    if (cur) {
      out.push([b, cur.o, cur.h, cur.l, cur.c, cur.v]);
      prevClose = cur.c;
    } else if (prevClose > 0) {
      out.push([b, prevClose, prevClose, prevClose, prevClose, 0]);
    } else {
      out.push([b, 0, 0, 0, 0, 0]);
    }
  }
  return out;
}

r.get("/exchange/chart", async (req, res) => {
  const symbol = String(req.query.symbol || "BTC/USDT");
  const interval = String(req.query.interval || "1h");
  const limit = Math.min(500, Number(req.query.limit) || 100);
  try {
    res.json(await buildChart(symbol, interval, limit));
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "chart failed" });
  }
});

// Order list for Flutter trade screen. Flutter sends status `OPEN`/`CLOSED`/
// `ALL` (uppercase) and optional currency+pair filters. DB stores statuses
// lowercase as `open`/`partial`/`filled`/`cancelled`, so we map both ways
// and return rows with `amount`+`symbol` aliases for OrderModel.fromJson.
r.get("/exchange/order", bicryptoAuth, async (req: any, res): Promise<void> => {
  const userId = req.bcUser.id as number;
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const statusRaw = String(req.query.status || "all").toUpperCase();
  const currency = String(req.query.currency || "").toUpperCase();
  const pair = String(req.query.pair || "").toUpperCase();

  // SECURITY: scope to the calling user AND drop bot rows. Without is_bot=0
  // the admin/whichever-user owns the bot account would see all market-making
  // orders in their personal "Open Orders" / "Order History" lists.
  const conds: any[] = [eq(ordersTable.userId, userId), eq(ordersTable.isBot, 0)];
  if (statusRaw === "OPEN") {
    conds.push(or(eq(ordersTable.status, "open"), eq(ordersTable.status, "partial"))!);
  } else if (statusRaw === "CLOSED") {
    conds.push(or(eq(ordersTable.status, "filled"), eq(ordersTable.status, "cancelled"))!);
  } else if (statusRaw !== "ALL") {
    conds.push(eq(ordersTable.status, statusRaw.toLowerCase()));
  }

  // Optional pair filter via base+quote symbol (e.g. SOLINR / SOL/INR).
  if (currency && pair) {
    const symCompact = `${currency}${pair}`;
    const symSlash = `${currency}/${pair}`;
    const [p] = await db.select().from(pairsTable)
      .where(or(eq(pairsTable.symbol, symCompact), eq(pairsTable.symbol, symSlash)))
      .limit(1);
    if (p) conds.push(eq(ordersTable.pairId, p.id));
  }

  const rows = await db.select().from(ordersTable)
    .where(and(...conds))
    .orderBy(desc(ordersTable.createdAt))
    .limit(limit);

  // Decorate with amount + symbol so the Flutter OrderModel decodes cleanly.
  const pairIds = Array.from(new Set(rows.map(r => r.pairId)));
  const pairs = pairIds.length
    ? await db.select().from(pairsTable).where(or(...pairIds.map(id => eq(pairsTable.id, id)))!)
    : [];
  const pairBySym = new Map(pairs.map(p => [p.id, p.symbol]));

  res.json(rows.map(o => {
    const sym = pairBySym.get(o.pairId) ?? "";
    const qtyN = Number(o.qty);
    const filledN = Number(o.filledQty);
    const avgN = Number(o.avgPrice);
    const priceN = Number(o.price);
    // For MARKET orders the stored `price` is the ±10% slippage cap, not a real
    // execution price. If we expose it as-is the mobile/portal "price" column
    // shows a wildly inflated number and `cost = price * qty` is meaningless.
    // Normalize ONLY market rows: surface avgPrice once filled, else 0 ("Market").
    // Limit orders keep their user-chosen `price` unchanged (preserves the
    // historical contract — the user's limit is meaningful even after fill).
    const isMarket = String(o.type).toLowerCase() === "market";
    const displayPrice = isMarket
      ? (filledN > 0 && avgN > 0 ? avgN : 0)
      : priceN;
    const costN = isMarket
      ? (filledN > 0 && avgN > 0 ? avgN * filledN : 0)
      : priceN * qtyN;
    return {
      ...o,
      price: displayPrice,
      symbol: sym,
      amount: qtyN,
      cost: costN,
    };
  }));
});
// Bicrypto Flutter mobile/web posts orders here. Translates the Bicrypto
// payload shape ({currency, pair, side:BUY/SELL, type:LIMIT/MARKET, amount,
// price?}) into the canonical (pairId, side:lowercase, type:lowercase, qty,
// price?) shape consumed by the shared spot engine.
r.post("/exchange/order", bicryptoAuth, async (req: any, res): Promise<void> => {
  const userId = req.bcUser.id as number;
  const vipTier = Math.max(0, Math.min(5, Number(req.bcUser.vipTier ?? 0)));
  const body = req.body ?? {};
  const currency = String(body.currency ?? "").toUpperCase();
  const pair = String(body.pair ?? "").toUpperCase();
  const side = String(body.side ?? "").toLowerCase();
  const type = String(body.type ?? "").toLowerCase();
  const amount = Number(body.amount ?? body.qty);
  const price = body.price != null ? Number(body.price) : undefined;

  if (!currency || !pair) { res.status(400).json({ error: "currency and pair required" }); return; }

  try {
    // pairsTable.symbol is stored without slash (e.g. "SOLUSDT"). Try both
    // formats so we work with either seed convention.
    const symCompact = `${currency}${pair}`;
    const symSlash = `${currency}/${pair}`;
    const [p] = await db.select().from(pairsTable)
      .where(or(eq(pairsTable.symbol, symCompact), eq(pairsTable.symbol, symSlash)))
      .limit(1);
    if (!p) { res.status(404).json({ error: `Pair ${symCompact} not found` }); return; }
    const symbol = p.symbol;

    const result = await placeSpotOrder({
      userId, vipTier,
      pairId: p.id,
      side: side as "buy" | "sell",
      type: type as "limit" | "market",
      qty: amount,
      price,
    });
    // Bicrypto/Flutter `OrderModel.fromJson` reads `amount` (not `qty`) and
    // `cost`; without explicit aliasing the client model decodes amount=0.
    // Normalize ONLY market rows: the stored `price` for market orders is the
    // ±10% slippage cap, not a real execution price — surface avgPrice once
    // filled, else 0 ("Market"). Limit orders keep their user-chosen price.
    const o: any = result.order;
    const isMarket = String(o.type).toLowerCase() === "market";
    const filledNum = Number(o.filledQty ?? 0);
    const avgNum = Number(o.avgPrice ?? 0);
    const limitNum = Number(o.price ?? 0);
    const qtyNum = Number(o.qty ?? amount);
    const displayPrice = isMarket
      ? (filledNum > 0 && avgNum > 0 ? avgNum : 0)
      : limitNum;
    const costN = isMarket
      ? (filledNum > 0 && avgNum > 0 ? avgNum * filledNum : 0)
      : limitNum * qtyNum;
    res.status(201).json({
      ...o,
      price: displayPrice,
      symbol,
      currency,
      pair,
      amount: qtyNum,
      cost: costN,
      matched: result.matched,
    });
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    res.status(500).json({ error: e?.message || "order failed" });
  }
});

r.delete("/exchange/order/:id", bicryptoAuth, async (req: any, res): Promise<void> => {
  const userId = req.bcUser.id as number;
  const id = Number(req.params.id);
  try {
    const order = await cancelSpotOrderById(userId, id);
    res.json(order);
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    res.status(500).json({ error: e?.message || "cancel failed" });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// Futures
// Order, position, leverage, and cancel endpoints now live in
// artifacts/api-server/src/routes/futures.ts (real matching engine + DB).
// Only the read-only market list and chart helpers stay here.
// ──────────────────────────────────────────────────────────────────────────

r.get("/futures/market", async (_req, res): Promise<void> => {
  const pairs = await db.select().from(pairsTable).where(eq(pairsTable.futuresEnabled, true));
  const coinMap = await loadCoinMap();
  res.json(pairs.map(p => pairToMarket(p, coinMap)));
});

r.get("/futures/chart", (req, res) => {
  const symbol = String(req.query.symbol || "BTC/USDT");
  const interval = String(req.query.interval || "1h");
  const limit = Math.min(500, Number(req.query.limit) || 100);
  res.json(buildChart(symbol, interval, limit));
});

// ──────────────────────────────────────────────────────────────────────────
// Content + payment + every other Bicrypto-only domain → empty stubs
// ──────────────────────────────────────────────────────────────────────────

const okEmptyPg = (_req: Request, res: Response) => res.json({ items: [], pagination: emptyPg() });
const okEmptyArr = (_req: Request, res: Response) => res.json([]);
const okEmptyObj = (_req: Request, res: Response) => res.json({});

// Content
r.get("/content/announcements", okEmptyArr);
r.get("/content/faqs", okEmptyArr);
r.get("/faq", okEmptyArr);
r.get("/faq/category", okEmptyArr);

// Notifications, support extras
r.get("/support", okEmptyPg);
r.get("/support/ticket", bicryptoAuth, okEmptyPg);

// Payment
r.get("/payment/gateway", okEmptyArr);
r.get("/payment/method", okEmptyArr);

// Blog
r.get("/blog/post", okEmptyPg);
r.get("/blog/category", okEmptyArr);
r.get("/blog/tag", okEmptyArr);
r.get("/blog/author", okEmptyPg);
r.get("/blog/author/top", okEmptyArr);
r.get("/blog/comment", okEmptyPg);

// Ecommerce
r.get("/ecommerce/product", okEmptyPg);
r.get("/ecommerce/category", okEmptyArr);
r.get("/ecommerce/order", bicryptoAuth, okEmptyPg);
r.post("/ecommerce/order", bicryptoAuth, (req: any, res) => res.json({
  message: "Order placed",
  id: `ord-${Date.now()}`,
  userId: String(req.bcUser.id),
  status: "PENDING",
  total: Number(req.body?.total ?? 0),
  items: req.body?.items ?? [],
  createdAt: new Date().toISOString(),
}));
r.get("/ecommerce/wishlist", bicryptoAuth, okEmptyArr);
r.post("/ecommerce/wishlist", bicryptoAuth, (req, res) => res.json({
  message: "Added", productId: req.body?.productId ?? null,
}));
r.get("/ecommerce/landing", okEmptyObj);
r.get("/ecommerce/stats", okEmptyObj);
r.get("/ecommerce/shipping", okEmptyArr);

// P2P — read/write stubs (real engine in a future phase)
r.post("/p2p/offer", bicryptoAuth, (req, res) => res.json({
  message: "Offer created", id: `p2p-offer-${Date.now()}`, ...req.body,
  status: "ACTIVE", createdAt: new Date().toISOString(),
}));
r.put("/p2p/offer/:id", bicryptoAuth, (req, res) => res.json({
  id: req.params.id, ...req.body, updatedAt: new Date().toISOString(),
}));
r.delete("/p2p/offer/:id", bicryptoAuth, (req, res) => res.json({
  id: req.params.id, message: "Deleted",
}));
r.post("/p2p/trade", bicryptoAuth, (req, res) => res.json({
  message: "Trade started", id: `p2p-trade-${Date.now()}`, ...req.body,
  status: "PENDING", createdAt: new Date().toISOString(),
}));
r.post("/p2p/trade/:id/confirm", bicryptoAuth, (req, res) => res.json({
  id: req.params.id, status: "COMPLETED", confirmedAt: new Date().toISOString(),
}));
r.post("/p2p/trade/:id/cancel", bicryptoAuth, (req, res) => res.json({
  id: req.params.id, status: "CANCELLED", cancelledAt: new Date().toISOString(),
}));
r.post("/p2p/trade/:id/dispute", bicryptoAuth, (req, res) => res.json({
  id: req.params.id, status: "DISPUTED", reason: req.body?.reason ?? null,
  disputedAt: new Date().toISOString(),
}));

// P2P
r.get("/p2p/offer", okEmptyPg);
r.get("/p2p/offer/popularity", okEmptyArr);
r.get("/p2p/trade", bicryptoAuth, okEmptyPg);
r.get("/p2p/payment-method", okEmptyArr);
r.get("/p2p/market/stats", okEmptyObj);
r.get("/p2p/market/top", okEmptyArr);
r.get("/p2p/market/highlight", okEmptyArr);
r.get("/p2p/location", okEmptyArr);
r.get("/p2p/dashboard", optionalAuth, okEmptyObj);
r.get("/p2p/dashboard/stats", optionalAuth, okEmptyObj);
r.get("/p2p/dashboard/activity", optionalAuth, okEmptyArr);
r.get("/p2p/dashboard/portfolio", optionalAuth, okEmptyObj);
r.get("/p2p/dispute", optionalAuth, okEmptyPg);
r.get("/p2p/user/profile", bicryptoAuth, okEmptyObj);
r.get("/p2p/user/reviews", bicryptoAuth, okEmptyArr);
r.get("/p2p/review", okEmptyPg);

// ICO
r.get("/ico/offer", okEmptyPg);
r.get("/ico/offer/featured", okEmptyArr);
r.get("/ico/blockchain", okEmptyArr);
r.get("/ico/token/type", okEmptyArr);
r.get("/ico/plan", okEmptyArr);
r.get("/ico/stats", okEmptyObj);
r.get("/ico/portfolio", bicryptoAuth, okEmptyObj);
r.get("/ico/transaction", bicryptoAuth, okEmptyPg);
r.get("/ico/creator/token", bicryptoAuth, okEmptyPg);
r.get("/ico/creator/launch/plan", bicryptoAuth, okEmptyArr);
r.get("/ico/creator/investor", bicryptoAuth, okEmptyPg);
r.get("/ico/creator/stat", bicryptoAuth, okEmptyObj);
r.get("/ico/creator/performance", bicryptoAuth, okEmptyObj);

// Affiliate / MLM
r.get("/affiliate", optionalAuth, okEmptyObj);
r.get("/affiliate/landing", okEmptyObj);
r.get("/affiliate/referral", bicryptoAuth, okEmptyPg);
r.get("/affiliate/reward", bicryptoAuth, okEmptyPg);
r.get("/affiliate/network", bicryptoAuth, okEmptyObj);
r.get("/affiliate/condition", okEmptyArr);
r.get("/affiliate/analytics", bicryptoAuth, okEmptyObj);
r.get("/affiliate/performance", bicryptoAuth, okEmptyObj);
r.get("/affiliate/stats", bicryptoAuth, okEmptyObj);
r.get("/affiliate/commission", bicryptoAuth, okEmptyPg);

// Staking
r.get("/staking/pool", okEmptyPg);
r.get("/staking/stats", okEmptyObj);
r.get("/staking/position", bicryptoAuth, okEmptyPg);
r.post("/staking/position", bicryptoAuth, (req, res) => res.json({
  message: "Stake created", id: `stk-${Date.now()}`, ...req.body,
  status: "ACTIVE", createdAt: new Date().toISOString(),
}));
r.post("/staking/position/:id/withdraw", bicryptoAuth, (req, res) => res.json({
  id: req.params.id, message: "Withdrawal queued",
  amount: Number(req.body?.amount ?? 0), status: "PENDING",
  requestedAt: new Date().toISOString(),
}));
r.get("/staking/user/summary", bicryptoAuth, okEmptyObj);
r.get("/staking/user/earnings", bicryptoAuth, okEmptyArr);

// Forex
r.get("/forex/currency", okEmptyArr);
r.get("/forex/plan", okEmptyArr);
r.get("/forex/investment", bicryptoAuth, okEmptyPg);
r.get("/forex/signal", okEmptyArr);

// AI
r.get("/ai/plan", okEmptyArr);
r.get("/ai/investment", bicryptoAuth, okEmptyPg);
r.get("/ai/investment/plan", okEmptyArr);
r.get("/ai/investment/log", bicryptoAuth, okEmptyPg);
r.get("/ai/trade", bicryptoAuth, okEmptyArr);

// Ecosystem feature DISABLED — crypto withdrawals run through the SPOT
// wallet (/finance/withdraw/spot) directly. The Bicrypto ecosystem chain
// adds an extra wallet layer we don't need. Returning 410 Gone tells any
// stale Flutter client this surface is permanently removed (vs 404 which
// could be confused with a routing bug).
const ECOSYSTEM_GONE = (_req: Request, res: Response): void => {
  res.status(410).json({ message: "Ecosystem feature is disabled — use spot wallet" });
};
// Note: Express 5 uses path-to-regexp v8 — bare `*` needs a name, so we use
// `/*splat` for wildcard catch-all.
r.all("/ecosystem", ECOSYSTEM_GONE);
r.all("/ecosystem/*splat", ECOSYSTEM_GONE);

// Upload (KYC etc)
r.post("/upload/kyc-document", bicryptoAuth, (req, res): void => {
  const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
  const EXT_MAP: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png",
    "image/webp": "webp", "application/pdf": "pdf",
  };
  let responded = false;
  const done = (status: number, body: object) => {
    if (!responded) { responded = true; res.status(status).json(body); }
  };

  let bb: ReturnType<typeof Busboy>;
  try { bb = Busboy({ headers: req.headers, limits: { fileSize: 10 * 1024 * 1024 } }); }
  catch { done(400, { message: "Invalid multipart request" }); return; }

  bb.on("file", (_field, file, info) => {
    const { mimeType } = info;
    if (!ALLOWED_MIME.has(mimeType)) {
      file.resume();
      done(415, { message: "Unsupported file type — use JPEG, PNG, WebP or PDF" });
      return;
    }
    const ext = EXT_MAP[mimeType] ?? "bin";
    const filename = `${randomUUID()}.${ext}`;
    const filepath = join(KYC_UPLOAD_DIR, filename);
    const ws = createWriteStream(filepath);
    file.pipe(ws);
    ws.on("close", () => done(200, { url: `/api/uploads/kyc/${filename}` }));
    ws.on("error", () => done(500, { message: "File write failed" }));
  });

  bb.on("error", () => done(400, { message: "Upload parse error" }));
  bb.on("finish", () => {
    if (!responded) done(400, { message: "No file received" });
  });
  req.pipe(bb);
});

// Used by injectable.config (sanity check)
r.get("/healthz", (_req, res) => res.json({ ok: true, layer: "bicrypto" }));

export default r;
