import { describe, it, expect, beforeEach } from "vitest";
import {
  checkRateLimit,
  enforceAiRateLimit,
  pruneRateLimits,
  __resetRateLimits,
  type RateLimitRule,
} from "./rateLimit";
import type { AuthContext } from "./auth";

const rule: RateLimitRule = { limit: 3, windowMs: 1000 };

describe("rateLimit", () => {
  beforeEach(() => __resetRateLimits());

  it("allows up to the limit then blocks within the window", () => {
    const t = 1_000_000;
    expect(checkRateLimit("k", rule, t).ok).toBe(true);
    expect(checkRateLimit("k", rule, t).ok).toBe(true);
    expect(checkRateLimit("k", rule, t).ok).toBe(true);
    const blocked = checkRateLimit("k", rule, t);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("resets after the window elapses", () => {
    const t = 2_000_000;
    checkRateLimit("k", rule, t);
    checkRateLimit("k", rule, t);
    checkRateLimit("k", rule, t);
    expect(checkRateLimit("k", rule, t).ok).toBe(false);
    expect(checkRateLimit("k", rule, t + 1001).ok).toBe(true);
  });

  it("keys are independent", () => {
    const t = 3_000_000;
    checkRateLimit("a", rule, t);
    checkRateLimit("a", rule, t);
    checkRateLimit("a", rule, t);
    expect(checkRateLimit("a", rule, t).ok).toBe(false);
    expect(checkRateLimit("b", rule, t).ok).toBe(true);
  });

  it("enforceAiRateLimit throttles a single user across many calls", () => {
    const auth: AuthContext = { userId: "u1", role: "user", dealerId: "d1" };
    const t = 4_000_000;
    let blockedAt = -1;
    for (let i = 0; i < 200; i++) {
      const r = enforceAiRateLimit(auth, t);
      if (!r.ok) {
        blockedAt = i;
        break;
      }
    }
    // Must block well before 200 unbounded calls.
    expect(blockedAt).toBeGreaterThan(0);
    expect(blockedAt).toBeLessThan(100);
  });

  it("pruneRateLimits cleans expired entries (defensive for long-lived instances)", () => {
    const t = 10_000_000;
    checkRateLimit("prune-me", { limit: 1, windowMs: 100 }, t);
    expect(checkRateLimit("prune-me", { limit: 1, windowMs: 100 }, t).ok).toBe(false);
    pruneRateLimits(t + 200);
    // bucket expired and pruned; new check at future time starts fresh window
    expect(checkRateLimit("prune-me", { limit: 1, windowMs: 100 }, t + 200).ok).toBe(true);
  });

  it("enforceAiRateLimit allows superadmin without dealerId (no dealer bucket)", () => {
    const auth: AuthContext = { userId: "sa1", role: "superadmin", dealerId: null };
    const t = 5_000_000;
    // PER_USER is 20/min; should allow first 20
    for (let i = 0; i < 20; i++) {
      expect(enforceAiRateLimit(auth, t).ok).toBe(true);
    }
    expect(enforceAiRateLimit(auth, t).ok).toBe(false);
  });

  it("enforceAiRateLimit applies both user and dealer limits and returns first violation", () => {
    const auth: AuthContext = { userId: "u2", role: "user", dealerId: "d2" };
    const t = 6_000_000;
    // Exhaust user (20) then dealer should still allow? but actually exhaust user first
    let lastOk = true;
    for (let i = 0; i < 25; i++) {
      lastOk = enforceAiRateLimit(auth, t).ok;
    }
    expect(lastOk).toBe(false);
  });

  it("checkRateLimit retryAfterSec is accurate within window", () => {
    const t = 7_000_000;
    const tight = { limit: 1, windowMs: 5000 };
    checkRateLimit("tight", tight, t);
    const blocked = checkRateLimit("tight", tight, t + 1000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBe(4); // ~4s left
  });

  it("prune + check combination allows reuse of key after prune", () => {
    const t = 8_000_000;
    checkRateLimit("p1", { limit: 1, windowMs: 50 }, t);
    pruneRateLimits(t + 60);
    expect(checkRateLimit("p1", { limit: 1, windowMs: 50 }, t + 60).ok).toBe(true);
  });

  it("enforceAiRateLimit uses prune internally so expired user limits free up", () => {
    const auth: AuthContext = { userId: "u3", role: "user", dealerId: "d3" };
    const t = 9_000_000;
    // use up some
    enforceAiRateLimit(auth, t);
    enforceAiRateLimit(auth, t);
    // advance past window by calling with future time (enforce prunes)
    const future = t + 70_000;
    expect(enforceAiRateLimit(auth, future).ok).toBe(true); // fresh window
  });

  it("checkRateLimit handles concurrent checks on same key without overcount [AI-rate-races]", () => {
    const t = 10_000_000;
    const rule = { limit: 5, windowMs: 1000 };
    // Simulate rapid concurrent (sync here, models real race window)
    const results = Array.from({ length: 10 }, () => checkRateLimit("conc", rule, t));
    const oks = results.filter((r) => r.ok).length;
    expect(oks).toBe(5); // first 5 ok, rest block
    expect(results[5]!.ok).toBe(false);
    expect(results[5]!.retryAfterSec).toBeGreaterThan(0);
  });

  it("enforceAiRateLimit for superadmin with dealerId=null does not apply dealer bucket [AI-rate-auth-edge]", () => {
    const auth: AuthContext = { userId: "sa2", role: "superadmin", dealerId: null };
    const t = 11_000_000;
    for (let i = 0; i < 20; i++) {
      expect(enforceAiRateLimit(auth, t).ok).toBe(true);
    }
    // 21st blocks on user
    expect(enforceAiRateLimit(auth, t).ok).toBe(false);
  });

  it("rate limit recovers exactly after window boundary using injected time [AI-rate-recovery]", () => {
    const rule = { limit: 1, windowMs: 200 };
    const t0 = 12_000_000;
    expect(checkRateLimit("recov", rule, t0).ok).toBe(true);
    expect(checkRateLimit("recov", rule, t0 + 50).ok).toBe(false);
    // exact boundary
    expect(checkRateLimit("recov", rule, t0 + 200).ok).toBe(true);
  });
});
