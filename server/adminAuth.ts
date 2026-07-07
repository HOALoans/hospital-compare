import type { Request, Response, NextFunction } from "express";

/**
 * Admin API gate. Set ADMIN_SECRET (or PARIGRADO_ADMIN_KEY) on Render and other
 * production hosts — see render.yaml. Without it, admin routes return 503 in production.
 */
export function getAdminSecret(): string | null {
  const secret = process.env.ADMIN_SECRET ?? process.env.PARIGRADO_ADMIN_KEY;
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") return "dev-admin-key";
  return null;
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const secret = getAdminSecret();
  if (!secret) {
    res.status(503).json({
      error: "Admin not configured. Set ADMIN_SECRET in the server environment.",
    });
    return;
  }

  const authHeader = req.headers.authorization;
  const adminKey = req.headers["x-admin-key"];
  const provided =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : typeof adminKey === "string"
        ? adminKey
        : null;

  if (!provided || provided !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
