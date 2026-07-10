import React, { useState } from "react";

interface CopyToClipboardProps {
  children: React.ReactNode;
  valueToCopy: string | number | "N/A" | "Error";
  className?: string;
}

const CopyToClipboard: React.FC<CopyToClipboardProps> = ({
  children,
  valueToCopy,
  className = "",
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault(); // Essential to stop propagation to row
    e.stopPropagation();

    // Validate value before processing
    if (
      valueToCopy === "N/A" ||
      valueToCopy === "Error" ||
      valueToCopy === null ||
      valueToCopy === undefined ||
      Number.isNaN(valueToCopy)
    )
      return;

    const textToCopy =
      typeof valueToCopy === "number"
        ? String(valueToCopy)
        : typeof valueToCopy === "string"
          ? valueToCopy
          : String(valueToCopy);
    if (textToCopy === "") return;

    // Gracefully skip if Clipboard API is unavailable (prevents crashes in unsupported browsers/iframes).
    if (!navigator?.clipboard?.writeText) {
      // Clipboard API unavailable (non-secure context or old browser); silent fail ok for UX.
      return;
    }

    navigator.clipboard
      .writeText(textToCopy)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch((err) => {
        // Swallow; caller can surface toast if desired.
      });
  };

  return (
    <div
      onClick={handleCopy}
      className={`relative cursor-pointer group inline-block ${className}`}
      title="Click to copy value"
      role="button"
      tabIndex={0}
    >
      {children}
      {copied && (
        <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[var(--color-text)] text-[var(--color-bg)] text-xs font-medium px-2 py-1 rounded shadow-md z-50 whitespace-nowrap pointer-events-none">
          Copied!
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[var(--color-text)]"></span>
        </span>
      )}
    </div>
  );
};

export default CopyToClipboard;
