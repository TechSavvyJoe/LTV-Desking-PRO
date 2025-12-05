import React, { forwardRef } from "react";

interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Error state styling */
  error?: boolean;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error = false, className = "", disabled, ...props }, ref) => {
    const baseClasses = `
      w-full min-h-[100px]
      bg-white dark:bg-slate-800/80
      border-[1.5px] rounded-xl
      text-slate-900 dark:text-slate-100
      placeholder-slate-400 dark:placeholder-slate-500
      transition-all duration-200 ease-out
      focus:outline-none
      disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800
      resize-y
    `;

    const stateClasses = error
      ? "border-red-400 dark:border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
      : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

    return (
      <textarea
        ref={ref}
        disabled={disabled}
        className={`
          ${baseClasses}
          ${stateClasses}
          p-4
          ${className}
        `}
        {...props}
      />
    );
  }
);

Textarea.displayName = "Textarea";

export default Textarea;
