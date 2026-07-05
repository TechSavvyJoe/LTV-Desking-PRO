/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BlobDownloadError,
  assertDownloadBlob,
  downloadBlob,
  sanitizeDownloadFilename,
} from "./downloadBlob";

describe("downloadBlob", () => {
  const createObjectURL = vi.fn(() => "blob:deal-sheet");
  const revokeObjectURL = vi.fn();
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    clickSpy.mockRestore();
    vi.useRealTimers();
  });

  it("sanitizes filenames and appends a PDF extension", () => {
    expect(sanitizeDownloadFilename(' Deal Sheet: "STK/5101" ')).toBe("Deal_Sheet_STK_5101.pdf");
  });

  it("validates empty and wrong-type blobs", () => {
    expect(() => assertDownloadBlob(new Blob(["x"], { type: "application/pdf" }))).toThrow(
      BlobDownloadError
    );
    expect(() =>
      assertDownloadBlob(new Blob([new Uint8Array(600)], { type: "text/plain" }))
    ).toThrow(BlobDownloadError);
  });

  it("clicks a hidden anchor and keeps the fallback object URL alive for 60 seconds", () => {
    const blob = new Blob([new Uint8Array(600)], { type: "application/pdf" });

    const result = downloadBlob(blob, "Deal Sheet 5101.pdf");

    expect(result).toMatchObject({
      status: "download-triggered",
      filename: "Deal_Sheet_5101.pdf",
      url: "blob:deal-sheet",
    });
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60_000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:deal-sheet");
  });
});
