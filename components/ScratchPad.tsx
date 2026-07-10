import React from "react";

interface ScratchPadProps {
  notes: string;
  onChange: (notes: string) => void;
}

const ScratchPad: React.FC<ScratchPadProps> = ({ notes, onChange }) => {
  return (
    <div className="h-full flex flex-col p-4">
      <label
        htmlFor="scratchpad"
        className="block text-sm font-medium text-[var(--color-text)] mb-2"
      >
        Deal Notes & Scratchpad
      </label>
      <textarea
        id="scratchpad"
        className="flex-1 w-full p-4 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-xl focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] outline-none resize-none font-mono text-sm text-[var(--color-text)] placeholder-[var(--color-text-subtle)]"
        placeholder="Type your notes here..."
        value={notes}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="mt-2 text-xs text-[var(--color-text-subtle)]">
        Notes are automatically saved with the deal.
      </p>
    </div>
  );
};

export default ScratchPad;
