import React, { useState } from "react";

interface CopyToClipboardProps {
  children: React.ReactNode;
  valueToCopy: string | number | "N/A" | "Error";
  className?: string;
}

const isCopyable = (value: CopyToClipboardProps["valueToCopy"]): boolean => {
  if (value === "N/A" || value === "Error" || value === null || value === undefined) return false;
  if (typeof value === "number" && Number.isNaN(value)) return false;
  return String(value) !== "";
};

/**
 * Click-to-copy wrapper for financial cells. A real <button> so Enter/Space
 * work and screen readers get a name ("Copy $24,999"); it is only rendered as
 * a control when there is actually something to copy, so N/A and Error cells
 * don't insert dead focus stops into the table's tab order. [takeover-P0 a11y]
 */
const CopyToClipboard: React.FC<CopyToClipboardProps> = ({
  children,
  valueToCopy,
  className = "",
}) => {
  const [copied, setCopied] = useState(false);

  if (!isCopyable(valueToCopy)) {
    return <span className={className}>{children}</span>;
  }

  const text = String(valueToCopy);

  const handleCopy = (e: React.MouseEvent) => {
    // Stop the row/card click handlers underneath from firing.
    e.preventDefault();
    e.stopPropagation();
    // Clipboard API is unavailable in non-secure contexts / old browsers; fail quietly.
    if (!navigator?.clipboard?.writeText) return;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        // Swallow; the caller can surface a toast if desired.
      });
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") e.stopPropagation();
      }}
      aria-label={`Copy ${text}`}
      title="Copy value"
      className={`relative inline-flex items-center appearance-none bg-transparent border-0 p-0 m-0 text-left cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] ${className}`}
      style={{ font: "inherit", color: "inherit" }}
    >
      {children}
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied to clipboard" : ""}
      </span>
      {copied && (
        <span
          aria-hidden="true"
          className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[var(--color-text)] text-[var(--color-bg)] text-xs font-medium px-2 py-1 rounded shadow-md z-50 whitespace-nowrap pointer-events-none"
        >
          Copied!
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[var(--color-text)]"></span>
        </span>
      )}
    </button>
  );
};

export default CopyToClipboard;
