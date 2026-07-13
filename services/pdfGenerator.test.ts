import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PdfGenerationError,
  assertGeneratedPdfBlob,
  assertPdfPageCount,
  assertPrintablePageFits,
  assertRenderedCanvas,
  PdfGenerationErrorCode,
} from "./pdfGenerator";

const canvasWithColor = (rgba: [number, number, number, number]): HTMLCanvasElement =>
  ({
    width: 100,
    height: 100,
    getContext: () => ({
      getImageData: (_x: number, _y: number, width: number) => {
        const data = new Uint8ClampedArray(width * 4);
        for (let offset = 0; offset < data.length; offset += 4) {
          data.set(rgba, offset);
        }
        return { data };
      },
    }),
  }) as unknown as HTMLCanvasElement;

describe("pdfGenerator guards", () => {
  it("throws a typed blank_canvas error for empty canvas output", () => {
    expect(() => assertRenderedCanvas({ width: 0, height: 600 }, "data:,")).toThrow(
      PdfGenerationError
    );

    try {
      assertRenderedCanvas({ width: 0, height: 600 }, "data:,");
    } catch (error) {
      expect(error).toBeInstanceOf(PdfGenerationError);
      expect((error as PdfGenerationError).code).toBe("blank_canvas");
    }
  });

  it("throws a typed invalid_blob error for unsafe PDF blobs", () => {
    try {
      assertGeneratedPdfBlob(new Blob(["x"], { type: "application/pdf" }));
    } catch (error) {
      expect(error).toBeInstanceOf(PdfGenerationError);
      expect((error as PdfGenerationError).code).toBe("invalid_blob");
    }
  });

  it("rejects full-size white and near-white canvases", () => {
    const imgData = "data:image/png;base64," + "x".repeat(300);

    expect(() => assertRenderedCanvas(canvasWithColor([255, 255, 255, 255]), imgData)).toThrow(
      PdfGenerationError
    );
    expect(() => assertRenderedCanvas(canvasWithColor([249, 250, 251, 255]), imgData)).toThrow(
      PdfGenerationError
    );
  });

  it("accepts a canvas containing visible non-white pixels", () => {
    expect(() =>
      assertRenderedCanvas(
        canvasWithColor([17, 24, 39, 255]),
        "data:image/png;base64," + "x".repeat(300)
      )
    ).not.toThrow();
  });
});

describe("pdfGenerator error paths and failures", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("PdfGenerationError constructs with code and optional cause", () => {
    const cause = new Error("root cause");
    const err = new PdfGenerationError("render_failed", "boom", { cause });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("PdfGenerationError");
    expect(err.code).toBe("render_failed");
    expect(err.message).toBe("boom");
    expect(err.cause).toBe(cause);
  });

  it("asserts cover all known error codes in type", () => {
    const codes: PdfGenerationErrorCode[] = [
      "browser_unsupported",
      "dependency_load_failed",
      "render_failed",
      "blank_canvas",
      "content_overflow",
      "page_count_mismatch",
      "invalid_blob",
    ];
    expect(codes.length).toBe(7);
  });

  it("assertGeneratedPdfBlob rejects non-pdf or undersized blobs", () => {
    expect(() => assertGeneratedPdfBlob(new Blob(["tiny"], { type: "application/pdf" }))).toThrow(
      PdfGenerationError
    );
    expect(() =>
      assertGeneratedPdfBlob(new Blob([new Uint8Array(10)], { type: "application/pdf" }))
    ).toThrow(PdfGenerationError);
  });

  it("assertRenderedCanvas accepts good canvas with sufficient imgData", () => {
    expect(() =>
      assertRenderedCanvas({ width: 800, height: 600 }, "data:image/png;base64," + "x".repeat(300))
    ).not.toThrow();
  });

  it("PdfGenerationError supports all defined codes for failure classification [PDF-failures]", () => {
    const codes: PdfGenerationErrorCode[] = [
      "browser_unsupported",
      "dependency_load_failed",
      "render_failed",
      "blank_canvas",
      "content_overflow",
      "page_count_mismatch",
      "invalid_blob",
    ];
    codes.forEach((code) => {
      const err = new PdfGenerationError(code, `test ${code}`);
      expect(err.code).toBe(code);
      expect(err).toBeInstanceOf(PdfGenerationError);
    });
  });

  it("assertGeneratedPdfBlob throws on wrong mime type even if large [PDF-failures]", () => {
    const largeWrong = new Blob([new Uint8Array(1024)], { type: "text/plain" });
    expect(() => assertGeneratedPdfBlob(largeWrong)).toThrow(PdfGenerationError);
    try {
      assertGeneratedPdfBlob(largeWrong);
    } catch (e) {
      expect((e as PdfGenerationError).code).toBe("invalid_blob");
    }
  });

  it("assertRenderedCanvas rejects tiny image data even with size [PDF-failures]", () => {
    expect(() =>
      assertRenderedCanvas({ width: 100, height: 100 }, "data:image/png;base64,short")
    ).toThrow(PdfGenerationError);
  });

  it("enforces the exact two-page deal-sheet contract", () => {
    expect(() => assertPdfPageCount(2, 2)).not.toThrow();
    expect(() => assertPdfPageCount(1, 2)).toThrow(PdfGenerationError);

    try {
      assertPdfPageCount(3, 2);
    } catch (error) {
      expect((error as PdfGenerationError).code).toBe("page_count_mismatch");
    }
  });

  it("rejects content that exceeds an explicit printable page", () => {
    const page = {
      clientHeight: 100,
      scrollHeight: 140,
      clientWidth: 100,
      scrollWidth: 100,
      querySelectorAll: () => [],
    } as unknown as HTMLElement;

    expect(() => assertPrintablePageFits(page)).toThrow(PdfGenerationError);
    try {
      assertPrintablePageFits(page);
    } catch (error) {
      expect((error as PdfGenerationError).code).toBe("content_overflow");
    }
  });

  it("accepts content contained by its printable page", () => {
    const page = {
      clientHeight: 100,
      scrollHeight: 100,
      clientWidth: 100,
      scrollWidth: 100,
      querySelectorAll: () => [],
    } as unknown as HTMLElement;

    expect(() => assertPrintablePageFits(page)).not.toThrow();
  });
});
