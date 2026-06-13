import React, { forwardRef } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Error state styling */
  error?: boolean;
  /** Icon to display on the left */
  leftIcon?: React.ReactNode;
  /** Icon to display on the right */
  rightIcon?: React.ReactNode;
  /** Size variant */
  inputSize?: "sm" | "md" | "lg";
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    { error = false, leftIcon, rightIcon, inputSize = "md", className = "", disabled, ...props },
    ref
  ) => {
    // iPad/desktop hardening for numeric fields [G67]:
    // - blur on wheel so a scroll over a focused number input can't silently
    //   change a money value;
    // - default inputMode="decimal" so touch keyboards show a numeric pad.
    // Explicitly passed onWheel/inputMode always win over these defaults.
    const isNumber = props.type === "number";
    const inputMode = props.inputMode ?? (isNumber ? "decimal" : undefined);
    const onWheel =
      props.onWheel ??
      (isNumber
        ? (e: React.WheelEvent<HTMLInputElement>) => {
            e.currentTarget.blur();
          }
        : undefined);
    // Dealer Trust: 1px borders, 6px corners, opaque surfaces, denser padding.
    const sizeClasses = {
      sm: "px-3 py-1.5 text-xs",
      md: "px-3 py-2 text-sm",
      lg: "px-4 py-2.5 text-base",
    };

    const baseClasses = `
      w-full
      bg-white dark:bg-[var(--color-bg-subtle)]
      border rounded
      text-[var(--color-text)]
      placeholder-[var(--color-text-subtle)]
      transition-colors duration-[120ms]
      focus:outline-none
      disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[var(--color-bg-subtle)]
    `;

    const stateClasses = error
      ? "border-[var(--color-danger)] focus:border-[var(--color-danger)] focus:ring-2 focus:ring-[var(--color-danger-subtle)]"
      : "border-[var(--color-border)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-subtle)]";

    const iconPadding = {
      left: leftIcon ? "pl-11" : "",
      right: rightIcon ? "pr-11" : "",
    };

    return (
      <div className="relative">
        {/* Left Icon */}
        {leftIcon && (
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none">
            {leftIcon}
          </span>
        )}

        <input
          ref={ref}
          disabled={disabled}
          // Announce the invalid state to assistive tech. Callers can still pass
          // aria-invalid/aria-describedby explicitly to override. [a11y]
          aria-invalid={error || undefined}
          className={`
            ${baseClasses}
            ${stateClasses}
            ${sizeClasses[inputSize]}
            ${iconPadding.left}
            ${iconPadding.right}
            ${className}
          `}
          {...props}
          inputMode={inputMode}
          onWheel={onWheel}
        />

        {/* Right Icon */}
        {rightIcon && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none">
            {rightIcon}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export default Input;
