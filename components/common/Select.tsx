import React, { forwardRef } from "react";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Error state styling */
  error?: boolean;
  /** Size variant */
  selectSize?: "sm" | "md" | "lg";
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ error = false, selectSize = "md", className = "", disabled, children, ...props }, ref) => {
    const sizeClasses = {
      sm: "px-3 py-1.5 text-sm",
      md: "px-3 py-2 text-sm",
      lg: "px-4 py-2.5 text-base",
    };

    const baseClasses = `
      w-full
      appearance-none
      bg-white dark:bg-neutral-900
      border rounded-lg
      text-neutral-900 dark:text-neutral-100
      transition-all duration-150 ease-out
      focus:outline-none
      cursor-pointer
      disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-neutral-100 dark:disabled:bg-neutral-800
      pr-10
    `;

    const stateClasses = error
      ? "border-red-500 dark:border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
      : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 focus:border-primary-500 dark:focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20 dark:focus:ring-primary-400/20";

    return (
      <div className="relative">
        <select
          ref={ref}
          disabled={disabled}
          className={`
            ${baseClasses}
            ${stateClasses}
            ${sizeClasses[selectSize]}
            ${className}
          `}
          {...props}
        >
          {children}
        </select>

        {/* Custom Arrow */}
        <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400 dark:text-neutral-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </div>
    );
  }
);

Select.displayName = "Select";

export default Select;
