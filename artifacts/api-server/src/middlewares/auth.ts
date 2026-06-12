import type { Request, Response, NextFunction } from "express";
import { getUserBySession, readSessionCookie } from "../lib/auth";
import type { User } from "@workspace/db";

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/**
 * Block any session whose owning account is not `active`. Mirrors the login-time
 * check in routes/auth.ts so that:
 *   1. sessions issued before a freeze stop working immediately on the next call
 *   2. operator freeze actions take effect platform-wide without waiting for
 *      the user to log out and back in.
 *
 * Admin/superadmin are also gated by status — if you suspend an operator you
 * want them locked out too. Recovery requires a still-active admin to flip
 * the status back via PATCH /admin/users/:id (DB direct fix as last resort).
 */
function blockIfNotActive(user: User, res: Response): boolean {
  if (user.status !== "active") {
    res.status(403).json({ error: "Account suspended", status: user.status });
    return true;
  }
  return false;
}

function readToken(req: Request): string | undefined {
  const cookie = readSessionCookie(req);
  if (cookie) return cookie;
  const auth = req.headers["authorization"] ?? req.headers["Authorization"];
  if (typeof auth === "string" && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return undefined;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = readToken(req);
  const user = await getUserBySession(token);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (blockIfNotActive(user, res)) return;
  req.user = user;
  next();
}

/**
 * Best-effort auth: hydrates `req.user` if a valid session cookie or Bearer
 * token is present but never short-circuits to 401.
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = readToken(req);
    const user = await getUserBySession(token);
    if (user) req.user = user;
  } catch { /* ignore — request continues unauthenticated */ }
  next();
}

export function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = readToken(req);
    const user = await getUserBySession(token);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (blockIfNotActive(user, res)) return;
    req.user = user;
    next();
  };
}
