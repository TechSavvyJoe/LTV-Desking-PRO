import { describe, expect, it } from "vitest";
import { PdfGenerationError, assertGeneratedPdfBlob, assertRenderedCanvas } from "./pdfGenerator";

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
