import React, { useState, useRef } from "react";
import Button from "./common/Button";
import Modal from "./common/Modal";
import * as Icons from "./common/Icons";
import { createLogger } from "../lib/logger";
import { roundCents } from "../services/calculator";

const documentScannerLogger = createLogger("document-scanner");

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
  const [payFrequency, setPayFrequency] = useState("");
  const periodsPerYear: Record<string, number> = {
    weekly: 52,
    biweekly: 26,
    semimonthly: 24,
    monthly: 12,
  };
  const monthlyIncome =
    detected !== null && periodsPerYear[payFrequency]
      ? roundCents((detected * periodsPerYear[payFrequency]!) / 12)
      : null;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setDetected(null);
    setPayFrequency("");
    setError(null);

    // Guard: PDFs are unsupported by the image OCR path.
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      setError("PDF pay stubs aren't supported yet — upload a photo or screenshot (JPG/PNG).");
      return;
    }
    // Guard: oversized images can hang the OCR worker.
    if (file.size > MAX_IMAGE_BYTES) {
      setError("This image is over 10 MB. Upload a smaller photo or screenshot.");
      return;
    }
    if (!/^image\/(jpeg|png)$/i.test(file.type) && !/\.(jpe?g|png)$/i.test(file.name)) {
      setError("Upload a JPG or PNG photo of the pay stub.");
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
      // PTI needs gross income. Net pay and a year-to-date total are not a
      // monthly gross figure. Require the user to confirm the current-period
      // amount and its frequency rather than guessing from a pay stub.
      const patterns = [/\bGross\s+(?:Pay|Earnings|Wages)\b[^\d\n]{0,30}\$?([\d,]+\.\d{2})/i];
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
        setError(
          "Couldn't find current gross pay on this pay stub. Enter gross monthly income manually, or try a clearer photo."
        );
      }
    } catch (err) {
      documentScannerLogger.error("OCR Error", err);
      setError("Couldn't scan this image. Try another photo, or type the income in.");
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Scan pay stub"
      size="sm"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4">
        <div
          className="border-2 border-dashed border-[var(--color-border)] rounded-lg p-8 text-center cursor-pointer hover:bg-[var(--color-bg-subtle)] transition-colors"
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
            <Icons.SpinnerIcon className="w-12 h-12 text-[var(--color-primary)] mx-auto mb-2 animate-spin motion-reduce:animate-none" />
          ) : (
            <Icons.CameraIcon className="w-12 h-12 text-[var(--color-text-subtle)] mx-auto mb-2" />
          )}
          <p className="text-sm text-[var(--color-text-muted)]">
            {isScanning ? "Scanning pay stub…" : "Click to upload or take a photo"}
          </p>
          <p className="text-xs text-[var(--color-text-subtle)] mt-1">
            JPG or PNG, up to 10 MB. PDFs aren&apos;t supported.
          </p>
        </div>

        {detected !== null && !isScanning && (
          <div className="p-3 bg-[var(--color-primary-subtle)] rounded-lg space-y-2">
            <p className="text-sm text-[var(--color-text)]">
              Detected gross pay for one pay period:{" "}
              <span className="font-semibold tabular-nums">
                ${detected.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">
              Confirm this is current-period gross pay, not net pay or a year-to-date total. Scans
              can misread.
            </p>
            <label htmlFor="scan-gross-pay" className="block text-sm text-[var(--color-text)]">
              Current-period gross pay ($)
            </label>
            <input
              id="scan-gross-pay"
              type="number"
              min="0"
              step="0.01"
              className="dc-input w-full"
              value={detected}
              onChange={(e) => setDetected(Number(e.target.value))}
            />
            <label htmlFor="scan-pay-frequency" className="block text-sm text-[var(--color-text)]">
              Pay frequency
            </label>
            <select
              id="scan-pay-frequency"
              className="dc-input w-full"
              value={payFrequency}
              onChange={(e) => setPayFrequency(e.target.value)}
            >
              <option value="">Select pay frequency</option>
              <option value="weekly">Weekly (52 per year)</option>
              <option value="biweekly">Every two weeks (26 per year)</option>
              <option value="semimonthly">Twice monthly (24 per year)</option>
              <option value="monthly">Monthly (12 per year)</option>
            </select>
            <p className="text-sm text-[var(--color-text)]">
              Gross monthly income:{" "}
              {monthlyIncome === null
                ? "Select a pay frequency"
                : `$${monthlyIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="primary"
                disabled={
                  monthlyIncome === null || !Number.isFinite(monthlyIncome) || monthlyIncome <= 0
                }
                onClick={() => {
                  if (
                    monthlyIncome === null ||
                    !Number.isFinite(monthlyIncome) ||
                    monthlyIncome <= 0
                  )
                    return;
                  onIncomeExtracted(monthlyIncome);
                  onClose();
                }}
              >
                Apply monthly income
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDetected(null)}>
                Rescan
              </Button>
            </div>
          </div>
        )}

        {isScanning && (
          <div className="space-y-2">
            <div className="h-2 bg-[var(--color-bg-muted)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--color-primary)] transition-[width] duration-300 motion-reduce:transition-none"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-center text-[var(--color-text-muted)]">
              Scanning… {progress}%
            </p>
          </div>
        )}

        {error && (
          <div className="p-3 bg-[var(--color-danger-subtle)] text-[var(--color-danger)] text-sm rounded-lg flex items-center gap-2">
            <Icons.ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
};
