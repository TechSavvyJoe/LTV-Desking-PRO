import React, { useState, useRef } from "react";
import Button from "./common/Button";
import * as Icons from "./common/Icons";

// tesseract.js + its English language data add ~250 KB JS + ~5 MB WASM/data
// to the bundle. Defer until the user actually picks a file to scan; loaded
// once per session and cached after.
const loadTesseract = () => import("tesseract.js").then((m) => m.default);

interface DocumentScannerProps {
  onIncomeExtracted: (income: number) => void;
  onClose: () => void;
}

// tesseract.js cannot OCR a PDF and can hang/crash on very large images.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

export const DocumentScanner: React.FC<DocumentScannerProps> = ({ onIncomeExtracted, onClose }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Show the detected amount for confirmation rather than auto-applying a number
  // that OCR may have grabbed from the wrong line.
  const [detected, setDetected] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Guard: PDFs are unsupported by the image OCR path.
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      setError("PDF pay stubs aren't supported yet — upload a photo or screenshot (JPG/PNG).");
      return;
    }
    // Guard: oversized images can hang the OCR worker.
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Image is too large (max 10 MB). Please upload a smaller photo or screenshot.");
      return;
    }

    setIsScanning(true);
    setProgress(0);
    setError(null);
    setDetected(null);

    try {
      const Tesseract = await loadTesseract();
      const result = await Tesseract.recognize(file, "eng", {
        logger: (m) => {
          if (m.status === "recognizing text") {
            setProgress(Math.round(m.progress * 100));
          }
        },
      });

      const text = result.data.text;
      // Development-only logging
      if (import.meta.env.DEV) {
        console.log("Scanned text:", text);
      }

      // Prefer specific labels first; require word boundaries on the bare
      // "Net"/"Gross" fallbacks so "Network"/"Gross Receipts" don't false-match.
      const patterns = [
        /(?:Net Pay|Gross Pay|Total Pay|Take[\s-]?Home Pay|Take[\s-]?Home)[\s\S]{0,30}?\$?([\d,]+\.\d{2})/i,
        /\b(?:Net|Gross)\b[\s\S]{0,20}?\$?([\d,]+\.\d{2})/i,
      ];
      let income: number | null = null;
      for (const re of patterns) {
        const match = text.match(re);
        if (match && match[1]) {
          const value = parseFloat(match[1].replace(/,/g, ""));
          // Sanity range for a pay-period figure; reject obvious mis-grabs.
          if (Number.isFinite(value) && value >= 50 && value <= 1_000_000) {
            income = value;
            break;
          }
        }
      }

      if (income !== null) {
        setDetected(income);
      } else {
        setError("Could not detect income automatically. Please enter manually.");
      }
    } catch (err) {
      console.error("OCR Error:", err);
      setError("Failed to scan document. Please try again or enter manually.");
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-2xl max-w-md w-full border border-slate-200 dark:border-slate-700">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Icons.DocumentTextIcon className="w-6 h-6 text-blue-500" />
            Scan Pay Stub
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-500"
            title="Close scanner"
            aria-label="Close document scanner"
          >
            <Icons.XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-4">
          <div
            className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-8 text-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            onClick={() => !isScanning && fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                !isScanning && fileInputRef.current?.click();
              }
            }}
            aria-label="Click to upload or take a photo of pay stub"
          >
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*"
              onChange={handleFileChange}
              disabled={isScanning}
              title="Upload pay stub image"
              aria-label="Upload pay stub image"
            />
            {isScanning ? (
              <Icons.SpinnerIcon className="w-12 h-12 text-blue-500 mx-auto mb-2 animate-spin" />
            ) : (
              <Icons.CameraIcon className="w-12 h-12 text-slate-400 mx-auto mb-2" />
            )}
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {isScanning ? "Scanning document..." : "Click to upload or take a photo"}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              JPG or PNG, up to 10 MB. PDFs aren&apos;t supported.
            </p>
          </div>

          {detected !== null && !isScanning && (
            <div className="p-3 bg-[var(--color-primary-subtle)] rounded-lg space-y-2">
              <p className="text-sm text-[var(--color-text)]">
                Detected monthly income:{" "}
                <span className="font-semibold tabular-nums">
                  ${detected.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">
                Confirm this is correct before applying — OCR can misread.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    onIncomeExtracted(detected);
                    onClose();
                  }}
                >
                  Apply ${detected.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDetected(null)}>
                  Rescan
                </Button>
              </div>
            </div>
          )}

          {isScanning && (
            <div className="space-y-2">
              <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-center text-slate-500">Processing... {progress}%</p>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg flex items-center gap-2">
              <Icons.ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} disabled={isScanning}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
