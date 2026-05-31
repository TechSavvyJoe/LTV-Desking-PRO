import { describe, it, expect, beforeEach } from "vitest";
import {
  checkRateLimit,
  enforceAiRateLimit,
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
});
