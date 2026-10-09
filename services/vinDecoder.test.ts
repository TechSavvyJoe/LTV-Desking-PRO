import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeVin } from "./vinDecoder";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("VIN lookup validation and timeout", () => {
  it("rejects invalid VINs before contacting NHTSA", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(decodeVin("bad/vin")).rejects.toThrow("Invalid VIN");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("normalizes the VIN and clears its timer after success", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        Results: [{ ErrorCode: "0", Make: "FORD", Model: "F-150", ModelYear: "2024" }],
      }),
    });
    vi.stubGlobal("fetch", fetch);
    await expect(decodeVin(" 1hgcm82633a004352 ")).resolves.toMatchObject({
      make: "FORD",
      year: 2024,
    });
    expect(fetch.mock.calls[0]![0]).toContain("/1HGCM82633A004352?");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps the timeout active while the response body is loading", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url, { signal }) => ({
        ok: true,
        json: () =>
          new Promise((_resolve, reject) =>
            signal.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError"))
            )
          ),
      }))
    );
    const result = expect(decodeVin("1HGCM82633A004352")).rejects.toThrow("VIN lookup timed out");
    await vi.advanceTimersByTimeAsync(8000);
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });
});
