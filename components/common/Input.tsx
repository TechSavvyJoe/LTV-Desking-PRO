import React, { forwardRef } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  inputSize?: "sm" | "md" | "lg";
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    { error = false, leftIcon, rightIcon, inputSize = "md", className = "", disabled, ...props },
    ref
  ) => {
    const sizeClasses = {
      sm: "px-3 py-1.5 text-sm",
      md: "px-3 py-2 text-sm",
      lg: "px-4 py-2.5 text-base",
    };

    const baseClasses = `
      w-full
      bg-white dark:bg-neutral-900
      border rounded-lg
      text-neutral-900 dark:text-neutral-100
      placeholder-neutral-400 dark:placeholder-neutral-500
      transition-all duration-150 ease-out
      focus:outline-none
      disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-neutral-100 dark:disabled:bg-neutral-800
    `;

    const stateClasses = error
      ? "border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500"
      : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 focus:border-neutral-900 dark:focus:border-white focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white";

    const iconPadding = {
      left: leftIcon ? "pl-10" : "",
      right: rightIcon ? "pr-10" : "",
    };

    return (
      <div className="relative">
        {leftIcon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none">
            {leftIcon}
          </span>
        )}

        <input
          ref={ref}
          disabled={disabled}
          className={`
            ${baseClasses}
            ${stateClasses}
            ${sizeClasses[inputSize]}
            ${iconPadding.left}
            ${iconPadding.right}
            ${className}
          `}
          {...props}
        />

        {rightIcon && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none">
            {rightIcon}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export default Input;
