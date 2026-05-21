import React, { forwardRef } from "react";

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Error state styling */
  error?: boolean;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error = false, className = "", disabled, ...props }, ref) => {
    const baseClasses = `
      w-full min-h-[100px]
      bg-white dark:bg-neutral-900
      border rounded-lg
      text-neutral-900 dark:text-neutral-100
      placeholder-neutral-400 dark:placeholder-neutral-500
      transition-all duration-150 ease-out
      focus:outline-none
      disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-neutral-100 dark:disabled:bg-neutral-800
      resize-y
    `;

    const stateClasses = error
      ? "border-red-500 dark:border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
      : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 focus:border-primary-500 dark:focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20 dark:focus:ring-primary-400/20";

    return (
      <textarea
        ref={ref}
        disabled={disabled}
        className={`
          ${baseClasses}
          ${stateClasses}
          p-3
          ${className}
        `}
        {...props}
      />
    );
  }
);

Textarea.displayName = "Textarea";

export default Textarea;
