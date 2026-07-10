import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PdfGenerationError,
  assertGeneratedPdfBlob,
  assertRenderedCanvas,
  PdfGenerationErrorCode,
} from "./pdfGenerator";

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
      "invalid_blob",
    ];
    expect(codes.length).toBe(5);
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
});
