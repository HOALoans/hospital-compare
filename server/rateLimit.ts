import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * In-memory IP rate limiter for the single Render web process.
 *
 * Env (all optional):
 *   RATE_LIMIT_DISABLED=true          — turn off entirely
 *   RATE_LIMIT_WINDOW_MS=60000        — sliding window (default 60s)
 *   RATE_LIMIT_CMS_MAX=60             — max POSTs to /api/cms/* per IP per window
 *   RATE_LIMIT_HOSPITAL_MAX=180       — max hospital API GETs per IP per window
 *
 * Legitimate mission-tracker loads ~8 CMS calls; compare UI uses a handful of
 * hospital endpoints. Defaults allow normal browsing while stopping scrapers
 * and unbounded CMS proxy abuse.
 */

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

/** Periodic cleanup so idle IPs don't leak memory forever. */
const CLEANUP_EVERY_MS = 60_000;
let lastCleanup = Date.now();

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function rateLimitConfig() {
  return {
    disabled:
      process.env.RATE_LIMIT_DISABLED === "true" ||
      process.env.RATE_LIMIT_DISABLED === "1",
    windowMs: parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
    cmsMax: parsePositiveInt(process.env.RATE_LIMIT_CMS_MAX, 60),
    hospitalMax: parsePositiveInt(process.env.RATE_LIMIT_HOSPITAL_MAX, 180),
  };
}

function clientIp(req: Request): string {
  // Prefer Express's req.ip when trust proxy is enabled (Render sets X-Forwarded-For).
  const ip = req.ip?.trim();
  if (ip) return ip;
  const forwarded = req.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? "unknown";
}

function pruneBucket(bucket: Bucket, windowStart: number): void {
  while (bucket.timestamps.length > 0 && bucket.timestamps[0]! < windowStart) {
    bucket.timestamps.shift();
  }
}

function maybeCleanup(now: number, windowMs: number): void {
  if (now - lastCleanup < CLEANUP_EVERY_MS) return;
  lastCleanup = now;
  const windowStart = now - windowMs;
  for (const [key, bucket] of buckets) {
    pruneBucket(bucket, windowStart);
    if (bucket.timestamps.length === 0) buckets.delete(key);
  }
}

function take(key: string, max: number, windowMs: number): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  maybeCleanup(now, windowMs);
  const windowStart = now - windowMs;
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }
  pruneBucket(bucket, windowStart);
  if (bucket.timestamps.length >= max) {
    const oldest = bucket.timestamps[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return { ok: false, retryAfterSec };
  }
  bucket.timestamps.push(now);
  return { ok: true };
}

export function createRateLimiter(opts: {
  name: string;
  max: number;
  windowMs: number;
}): RequestHandler {
  const { name, max, windowMs } = opts;
  return (req: Request, res: Response, next: NextFunction) => {
    const cfg = rateLimitConfig();
    if (cfg.disabled) {
      next();
      return;
    }
    const ip = clientIp(req);
    const result = take(`${name}:${ip}`, max, windowMs);
    if (!result.ok) {
      res.setHeader("Retry-After", String(result.retryAfterSec));
      res.setHeader("X-RateLimit-Limit", String(max));
      res.status(429).json({
        error: "Too many requests. Please wait a moment and try again.",
        retryAfterSec: result.retryAfterSec,
      });
      return;
    }
    res.setHeader("X-RateLimit-Limit", String(max));
    next();
  };
}

/** Stricter limiter for the CMS upstream proxy (bandwidth / abuse vector). */
export function cmsRateLimiter(): RequestHandler {
  const { windowMs, cmsMax } = rateLimitConfig();
  return createRateLimiter({ name: "cms", max: cmsMax, windowMs });
}

/** Limiter for local hospital search/compare/trend APIs. */
export function hospitalRateLimiter(): RequestHandler {
  const { windowMs, hospitalMax } = rateLimitConfig();
  return createRateLimiter({ name: "hospital", max: hospitalMax, windowMs });
}
