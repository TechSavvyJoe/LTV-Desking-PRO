import { afterEach, describe, expect, it, vi } from "vitest";

const sentryMocks = vi.hoisted(() => ({
  captureException: vi.fn().mockResolvedValue(undefined),
  captureMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./sentry", () => ({
  captureException: sentryMocks.captureException,
  captureMessage: sentryMocks.captureMessage,
}));

import { __resetExternalLogRateLimiterForTests, createLogger } from "./logger";

describe("logger external forwarding", () => {
  afterEach(() => {
    vi.clearAllMocks();
    __resetExternalLogRateLimiterForTests();
  });

  it("forwards errors to Sentry via captureException", async () => {
    const log = createLogger("test");
    const err = new Error("save failed");
    log.error("Deal save failed", err, { vin: "TESTVIN123456" });

    await vi.waitFor(() => expect(sentryMocks.captureException).toHaveBeenCalledOnce());
    expect(sentryMocks.captureException).toHaveBeenCalledWith(
      err,
      expect.objectContaining({
        extra: expect.objectContaining({ message: "Deal save failed", vin: "TESTVIN123456" }),
      })
    );
  });

  it("forwards warnings to Sentry via captureMessage", async () => {
    const log = createLogger("test");
    log.warn("Settings sync lagging", { dealerId: "d1" });

    await vi.waitFor(() => expect(sentryMocks.captureMessage).toHaveBeenCalledOnce());
    expect(sentryMocks.captureMessage).toHaveBeenCalledWith(
      "Settings sync lagging",
      expect.objectContaining({ dealerId: "d1" })
    );
  });

  it("rate-limits external forwarding to protect the Sentry quota", async () => {
    const log = createLogger("test");
    for (let i = 0; i < 15; i++) {
      log.error(`burst ${i}`, new Error(`e${i}`));
    }

    await vi.waitFor(() =>
      expect(sentryMocks.captureException.mock.calls.length).toBeGreaterThan(0)
    );
    expect(sentryMocks.captureException.mock.calls.length).toBeLessThanOrEqual(10);
  });
});
