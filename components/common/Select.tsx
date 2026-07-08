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
      sm: "px-3 py-2 text-sm",
      md: "px-4 py-2.5 text-base",
      lg: "px-4 py-3.5 text-lg",
    };

    const baseClasses = `
      w-full
      appearance-none
      bg-white dark:bg-[var(--color-bg-subtle)]
      border rounded
      text-[var(--color-text)]
      transition-colors duration-[var(--duration-fast)]
      focus:outline-none
      cursor-pointer
      disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[var(--color-bg-subtle)]
      pr-10
    `;

    const stateClasses = error
      ? "border-[var(--color-danger)] focus:border-[var(--color-danger)] focus:ring-2 focus:ring-[var(--color-danger-subtle)]"
      : "border-[var(--color-border)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-subtle)]";

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
        <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--color-text-subtle)]">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </div>
    );
  }
);

Select.displayName = "Select";

export default React.memo(Select);
