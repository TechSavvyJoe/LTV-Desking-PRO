import type { IncomingMessage } from "node:http";
import type { AuthContext } from "./auth.js";

/**
 * Lightweight in-memory fixed-window rate limiter for the AI proxy.
 *
 * The metered AI routes spend the owner's shared provider keys, so an
 * authenticated client must not be able to fire them in an unbounded loop. [B3]
 *
 * Keyed by an arbitrary string (user id / dealer id). On Vercel Fluid Compute,
 * function instances are reused across requests, so this meaningfully throttles
 * abusive loops from a single account. It is per-instance, not globally durable
 * — for a hard cross-instance quota, back this with Upstash/Redis or a
 * PocketBase counter (the interface here is intentionally swappable).
 */

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
  statusCode?: 401 | 403 | 503;
  error?: string;
}

interface WindowState {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, WindowState>();

/** Check (and consume) one unit against `key`. `now` is injectable for tests. */
export const checkRateLimit = (
  key: string,
  rule: RateLimitRule,
  now: number = Date.now()
): RateLimitResult => {
  const existing = buckets.get(key);
  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  if (existing.count >= rule.limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }
  existing.count += 1;
  return { ok: true, retryAfterSec: 0 };
};

/** Bound memory by dropping expired windows. Safe to call opportunistically. */
export const pruneRateLimits = (now: number = Date.now()): void => {
  for (const [key, state] of buckets) {
    if (now >= state.resetAt) buckets.delete(key);
  }
};

/** Test-only: clear all state between cases. */
export const __resetRateLimits = (): void => buckets.clear();

// Per-user burst protection and a wider per-dealer ceiling. Tuned for
// interactive F&I use (a handful of AI calls per minute per person).
const PER_USER_RULE: RateLimitRule = { limit: 20, windowMs: 60_000 };
const PER_DEALER_RULE: RateLimitRule = { limit: 80, windowMs: 60_000 };

/**
 * Light IP throttle for the unauthenticated GET /api/ai/models route (SEC-005).
 * Generous enough for UI polling + multi-tab refresh; blocks scrapers that
 * would otherwise re-drive provider-key resolution on every request. Does not
 * touch the 60s keyResolver cache — only the route entrypoint is limited.
 */
const ANON_MODELS_RULE: RateLimitRule = { limit: 30, windowMs: 60_000 };

/** Best-effort client IP for anonymous rate limiting (Vercel / proxies). */
export const clientIpFromRequest = (request: IncomingMessage): string => {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return String(forwarded[0]).split(",")[0]?.trim() || "unknown";
  }
  const realIp = request.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) return realIp.trim();
  return request.socket?.remoteAddress || "unknown";
};

/**
 * Enforce the anonymous models-list limit. Safe to call before auth; keyed by
 * client IP so authenticated users sharing an egress still share one bucket.
 */
export const enforceAnonymousModelsRateLimit = (
  request: IncomingMessage,
  now: number = Date.now()
): RateLimitResult => {
  pruneRateLimits(now);
  return checkRateLimit(`anon-models:${clientIpFromRequest(request)}`, ANON_MODELS_RULE, now);
};

/**
 * Enforce both the per-user and per-dealer limits for a metered AI request.
 * Returns the first limit that trips (so the response can set Retry-After).
 */
export const enforceLocalAiRateLimit = (
  auth: AuthContext,
  now: number = Date.now()
): RateLimitResult => {
  pruneRateLimits(now);
  const userResult = checkRateLimit(`user:${auth.userId}`, PER_USER_RULE, now);
  if (!userResult.ok) return userResult;
  if (auth.dealerId) {
    const dealerResult = checkRateLimit(`dealer:${auth.dealerId}`, PER_DEALER_RULE, now);
    if (!dealerResult.ok) return dealerResult;
  }
  return { ok: true, retryAfterSec: 0 };
};

const getPbUrl = (env: NodeJS.ProcessEnv): string | undefined =>
  env.PB_INTERNAL_URL ?? env.POCKETBASE_URL ?? env.VITE_POCKETBASE_URL;

const routeKey = (request: IncomingMessage): string => {
  const path = (request.url ?? "").split("?")[0]?.split("#")[0] ?? "";
  return path.replace(/^\/api\/ai\//, "").replace(/^\/+|\/+$/g, "");
};

/**
 * Production quota enforcement is centralized in PocketBase so every Vercel
 * instance consumes the same atomic user/dealer buckets. Local development
 * and tests retain the deterministic in-memory implementation above.
 */
export const enforceAiRateLimit = async (
  auth: AuthContext,
  request?: IncomingMessage,
  env: NodeJS.ProcessEnv = process.env,
  now: number = Date.now()
): Promise<RateLimitResult> => {
  const isProduction = env.NODE_ENV === "production";
  const url = getPbUrl(env);
  const authorization = request?.headers.authorization;

  // Local development and unit tests use the deterministic in-memory limiter;
  // only production consults the centralized PocketBase quota service.
  if (!isProduction) {
    return enforceLocalAiRateLimit(auth, now);
  }
  if (!url || !authorization || !request) {
    return {
      ok: false,
      retryAfterSec: 30,
      statusCode: 503,
      error: "AI quota service is not configured.",
    };
  }

  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/api/ltv/ai-rate-limit`, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ route: routeKey(request) }),
      signal: AbortSignal.timeout(4_000),
    });
    const body = (await response.json().catch(() => ({}))) as {
      allowed?: boolean;
      retryAfterSec?: number;
      message?: string;
    };

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        retryAfterSec: 0,
        statusCode: response.status,
        error: body.message ?? "AI quota authorization failed.",
      };
    }
    if (!response.ok || typeof body.allowed !== "boolean") {
      return {
        ok: false,
        retryAfterSec: 30,
        statusCode: 503,
        error: "AI quota service is unavailable.",
      };
    }
    return {
      ok: body.allowed,
      retryAfterSec: body.allowed ? 0 : Math.max(1, body.retryAfterSec ?? 1),
    };
  } catch {
    return {
      ok: false,
      retryAfterSec: 30,
      statusCode: 503,
      error: "AI quota service is unavailable.",
    };
  }
};
