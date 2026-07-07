import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface SessionPayload {
  email: string;
  exp: number;
}

/**
 * Admin API gate. Set ADMIN_SECRET (or PARIGRADO_ADMIN_KEY) on Render for signing
 * session tokens and optional script/API access. Set ADMIN_PASSWORD for the login UI.
 */
export function getAdminSecret(): string | null {
  const secret = process.env.ADMIN_SECRET ?? process.env.PARIGRADO_ADMIN_KEY;
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") return "dev-admin-key";
  return null;
}

export function getAdminEmails(): string[] {
  const raw =
    process.env.ADMIN_EMAILS ?? process.env.ADMIN_EMAIL ?? "larry@hoaloanservices.com";
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function getAdminPassword(): string | null {
  const password = process.env.ADMIN_PASSWORD;
  if (password) return password;
  if (process.env.NODE_ENV !== "production") return "dev-admin-password";
  return null;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, Buffer.alloc(bufA.length));
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function signSession(payload: SessionPayload, secret: string): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

function verifySessionToken(token: string, secret: string): SessionPayload | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;

  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expectedSig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");

  if (!timingSafeEqualStr(sig, expectedSig)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8"),
    ) as SessionPayload;
    if (!payload.email || typeof payload.exp !== "number") return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createAdminSessionToken(email: string): string | null {
  const secret = getAdminSecret();
  if (!secret) return null;
  const payload: SessionPayload = {
    email: email.toLowerCase(),
    exp: Date.now() + SESSION_TTL_MS,
  };
  return signSession(payload, secret);
}

export function getSessionEmailFromToken(token: string): string | null {
  const secret = getAdminSecret();
  if (!secret) return null;
  return verifySessionToken(token, secret)?.email ?? null;
}

function isValidAdminToken(provided: string, secret: string): boolean {
  if (timingSafeEqualStr(provided, secret)) return true;
  return verifySessionToken(provided, secret) !== null;
}

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  const adminKey = req.headers["x-admin-key"];
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  if (typeof adminKey === "string") return adminKey;
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

  const provided = extractBearerToken(req);
  if (!provided || !isValidAdminToken(provided, secret)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}

export function handleAdminLogin(req: Request, res: Response): void {
  const secret = getAdminSecret();
  const password = getAdminPassword();
  if (!secret || !password) {
    res.status(503).json({ error: "Admin login is not configured on this server." });
    return;
  }

  const body = req.body ?? {};
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const providedPassword = typeof body.password === "string" ? body.password : "";

  if (!email || !providedPassword) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const allowed = getAdminEmails();
  if (!allowed.includes(email) || !timingSafeEqualStr(providedPassword, password)) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const token = createAdminSessionToken(email);
  if (!token) {
    res.status(503).json({ error: "Admin login is not configured on this server." });
    return;
  }

  res.json({ token, email });
}

export function handleAdminLogout(_req: Request, res: Response): void {
  res.json({ ok: true });
}
