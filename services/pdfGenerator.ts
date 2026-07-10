import React from "react";
import ReactDOM from "react-dom/client";
import { PdfTemplate } from "../components/pdf/PdfTemplate";
import { FavoritesPdfTemplate } from "../components/pdf/FavoritesPdfTemplate";
import { LenderCheatSheetTemplate } from "../components/pdf/LenderCheatSheetTemplate";
import { mapDealData } from "../lib/dealMappers";
import { BlobDownloadError, assertDownloadBlob } from "../utils/downloadBlob";
import type { DealPdfData, LenderProfile, Settings } from "../types";

export type PdfGenerationErrorCode =
  | "browser_unsupported"
  | "dependency_load_failed"
  | "render_failed"
  | "blank_canvas"
  | "invalid_blob";

export class PdfGenerationError extends Error {
  readonly code: PdfGenerationErrorCode;

  constructor(code: PdfGenerationErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PdfGenerationError";
    this.code = code;
  }
}

/**
 * Deal data persisted via localStorage can contain "" for cleared numeric
 * fields (DealControls stores "" on clear). Normalize through mapDealData so
 * the PDF templates always receive real numbers — EXCEPT interestRate, where
 * "unset" must stay unset: mapDealData would substitute the default APR, and
 * printing a rate nobody entered is exactly the wrong-number-presented-
 * confidently failure this app must never have. The templates render "—" and
 * the payment is already "N/A" for an unset rate. [G5/C-services]
 */
const normalizePdfData = (data: DealPdfData): DealPdfData => {
  const raw: Record<string, unknown> = data.dealData ? { ...data.dealData } : {};
  const mapped = mapDealData(raw);
  const rawRate = raw.interestRate as unknown;
  // Sentinel "" for unset rate (templates guard for it and render "—"; N/A payment).
  // Avoids polluting with default APR. Use the union type declared in DealData.
  const interestRate: number | "" =
    typeof rawRate === "number" && Number.isFinite(rawRate) ? rawRate : "";
  return { ...data, dealData: { ...mapped, interestRate } };
};

// jspdf + html2canvas combined add ~400 KB gzipped to the initial bundle.
// Defer until the user actually clicks "Download PDF" — they're then loaded
// once per session and the browser caches the chunks for subsequent uses.
const loadPdfDeps = async () => {
  try {
    const [jsPDFModule, html2canvasModule] = await Promise.all([
      import("jspdf"),
      import("html2canvas"),
    ]);
    return {
      jsPDF: jsPDFModule.default,
      html2canvas: html2canvasModule.default,
    };
  } catch (error) {
    throw new PdfGenerationError("dependency_load_failed", "PDF libraries could not be loaded.", {
      cause: error,
    });
  }
};

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 16);
    }
  });

const waitForRenderReady = async (): Promise<void> => {
  await delay(0);
  await nextFrame();
  await nextFrame();
  if (document.fonts?.ready) {
    await Promise.race([document.fonts.ready.then(() => undefined), delay(1_200)]);
  }
  await delay(80);
};

export const assertRenderedCanvas = (
  canvas: Pick<HTMLCanvasElement, "width" | "height">,
  imgData: string
): void => {
  if (!canvas.width || !canvas.height || imgData.length < 256) {
    throw new PdfGenerationError(
      "blank_canvas",
      "The PDF could not be rendered (the page is too large for this device's browser). " +
        "Try fewer vehicles per PDF or generate from a desktop browser."
    );
  }
};

export const assertGeneratedPdfBlob = (blob: Blob): void => {
  try {
    assertDownloadBlob(blob, { expectedType: "application/pdf", minBytes: 512 });
  } catch (error) {
    if (error instanceof BlobDownloadError) {
      throw new PdfGenerationError("invalid_blob", error.message, { cause: error });
    }
    throw error;
  }
};

const renderComponentAsPdfBlob = async (
  component: React.ReactElement,
  orientation: "portrait" | "landscape" = "portrait",
  pageMode: "paginate" | "single-page" = "paginate"
): Promise<Blob> => {
  if (typeof document === "undefined") {
    throw new PdfGenerationError(
      "browser_unsupported",
      "PDF generation is only supported in the browser."
    );
  }

  const { jsPDF, html2canvas } = await loadPdfDeps();

  // Create a container element that will be placed off-screen.
  // This is the most reliable way to ensure the browser renders the content fully.
  const container = document.createElement("div");

  // Style the container
  container.style.position = "absolute";
  container.style.top = "-9999px"; // Move it far off the top of the screen
  container.style.left = "-9999px"; // Move it far off the left of the screen
  container.style.background = "white"; // Ensure a solid background
  // Give it a defined size to help the layout engine
  container.style.width = orientation === "landscape" ? "297mm" : "210mm";
  container.style.height = "auto"; // Allow height to grow based on content

  document.body.appendChild(container);

  const root = ReactDOM.createRoot(container);

  try {
    // Render the component and wait for it to be fully painted in the DOM.
    root.render(component);
    await waitForRenderReady();

    const canvas = await html2canvas(container, {
      scale: 2, // Higher scale for better quality
      useCORS: true,
      backgroundColor: "#ffffff", // Explicitly tell html2canvas to use a white background
      logging: false, // Disable console logging from html2canvas
      windowWidth: container.scrollWidth,
      windowHeight: container.scrollHeight,
    });

    // Guard against silently-blank output: iOS Safari caps canvas area and
    // returns an empty canvas / "data:," past the limit. Fail with a clear
    // message instead of handing the user an empty PDF. [C-services]
    const imageFormat = pageMode === "single-page" ? "JPEG" : "PNG";
    const imgData =
      imageFormat === "JPEG" ? canvas.toDataURL("image/jpeg", 0.92) : canvas.toDataURL("image/png");
    assertRenderedCanvas(canvas, imgData);

    const pdf = new jsPDF({
      orientation,
      unit: "mm",
      // US dealers print Letter; A4 output scales/shifts on every printout. [G69]
      format: "letter",
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgProps = pdf.getImageProperties(imgData);

    // Calculate the height of the image in PDF units, maintaining aspect ratio relative to page width
    const imgHeightInPdf = (imgProps.height * pdfWidth) / imgProps.width;

    if (pageMode === "single-page") {
      const scale = Math.min(1, pdfHeight / imgHeightInPdf);
      const renderWidth = pdfWidth * scale;
      const renderHeight = imgHeightInPdf * scale;
      const x = (pdfWidth - renderWidth) / 2;
      const y = (pdfHeight - renderHeight) / 2;
      pdf.addImage(imgData, imageFormat, x, y, renderWidth, renderHeight);
      const blob = pdf.output("blob");
      assertGeneratedPdfBlob(blob);
      return blob;
    }

    let heightLeft = imgHeightInPdf;
    let position = 0;

    // First page
    pdf.addImage(imgData, imageFormat, 0, position, pdfWidth, imgHeightInPdf);
    heightLeft -= pdfHeight;

    // Subsequent pages
    while (heightLeft > 0) {
      position -= pdfHeight; // Move the image up for the next page
      pdf.addPage();
      pdf.addImage(imgData, imageFormat, 0, position, pdfWidth, imgHeightInPdf);
      heightLeft -= pdfHeight;
    }

    const blob = pdf.output("blob");
    assertGeneratedPdfBlob(blob);
    return blob;
  } catch (error) {
    if (error instanceof PdfGenerationError) throw error;
    throw new PdfGenerationError("render_failed", "Failed to create the PDF.", {
      cause: error,
    });
  } finally {
    // CRITICAL: Always clean up the DOM element and unmount the React component.
    try {
      root.unmount();
      document.body.removeChild(container);
    } catch {
      // Best-effort cleanup; the original PDF error is more useful to callers.
    }
  }
};

export const generateDealPdf = async (data: DealPdfData, settings: Settings): Promise<Blob> => {
  const props = { ...normalizePdfData(data), settings };
  return renderComponentAsPdfBlob(
    React.createElement(PdfTemplate, props),
    "portrait",
    "single-page"
  );
};

export const generateFavoritesPdf = async (
  data: DealPdfData[],
  settings: Settings
): Promise<Blob> => {
  const props = { deals: data.map(normalizePdfData), settings };
  return renderComponentAsPdfBlob(React.createElement(FavoritesPdfTemplate, props), "portrait");
};

export const generateLenderCheatSheetPdf = async (profiles: LenderProfile[]): Promise<Blob> => {
  const props = { profiles };
  return renderComponentAsPdfBlob(
    React.createElement(LenderCheatSheetTemplate, props),
    "landscape"
  );
};
