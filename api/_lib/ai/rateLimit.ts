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
 * Enforce both the per-user and per-dealer limits for a metered AI request.
 * Returns the first limit that trips (so the response can set Retry-After).
 */
export const enforceAiRateLimit = (
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
