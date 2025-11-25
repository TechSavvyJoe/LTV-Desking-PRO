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
        className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
      >
        Deal Notes & Scratchpad
      </label>
      <textarea
        id="scratchpad"
        className="flex-1 w-full p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none font-mono text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400"
        placeholder="Type your notes here..."
        value={notes}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Notes are automatically saved with the deal.
      </p>
    </div>
  );
};

export default ScratchPad;
