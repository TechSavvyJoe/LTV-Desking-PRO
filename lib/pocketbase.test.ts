import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withPbRetry } from "./pocketbase";

describe("withPbRetry", () => {
  it("retries transient PocketBase read failures", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce({ status: 0, message: "Failed to fetch" })
      .mockResolvedValueOnce("loaded");

    await expect(withPbRetry(operation, { delaysMs: [0] })).resolves.toBe("loaded");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not retry validation/auth style failures", async () => {
    const operation = vi.fn<() => Promise<string>>().mockRejectedValue({ status: 400 });
    await expect(withPbRetry(operation, { delaysMs: [0] })).rejects.toEqual({ status: 400 });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("retries 5xx and network transient errors (realtime refetch races) [realtime-races]", async () => {
    const op = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce({ status: 503, message: "service unavailable" })
      .mockRejectedValueOnce({ status: 0, message: "Failed to fetch" })
      .mockResolvedValueOnce("realtime-data");
    await expect(withPbRetry(op, { retries: 2, delaysMs: [0, 0] })).resolves.toBe("realtime-data");
    expect(op).toHaveBeenCalledTimes(3);
  });

  it("does not retry on abort (isAbort) even if transient-like [realtime-races]", async () => {
    const op = vi.fn().mockRejectedValue({ isAbort: true, status: 0 });
    await expect(withPbRetry(op, { delaysMs: [0] })).rejects.toEqual({ isAbort: true, status: 0 });
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("handles concurrent retry operations without shared state corruption [realtime-races]", async () => {
    const makeOp = (id: string) =>
      vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce({ status: 500, message: "server err" + id })
        .mockResolvedValueOnce("ok-" + id);

    const opA = makeOp("A");
    const opB = makeOp("B");
    const [resA, resB] = await Promise.all([
      withPbRetry(opA, { delaysMs: [0] }),
      withPbRetry(opB, { delaysMs: [0] }),
    ]);
    expect(resA).toBe("ok-A");
    expect(resB).toBe("ok-B");
    expect(opA).toHaveBeenCalledTimes(2);
    expect(opB).toHaveBeenCalledTimes(2);
  });

  it("retries exactly the configured number and throws last transient after exhaustion [realtime-races]", async () => {
    const op = vi.fn<() => Promise<string>>().mockRejectedValue({ status: 429, message: "rate" });
    await expect(withPbRetry(op, { retries: 1, delaysMs: [0] })).rejects.toEqual({
      status: 429,
      message: "rate",
    });
    expect(op).toHaveBeenCalledTimes(2); // initial + 1 retry
  });
});
