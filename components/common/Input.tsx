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
    {
      error = false,
      leftIcon,
      rightIcon,
      inputSize = "md",
      className = "",
      disabled,
      ...props
    },
    ref
  ) => {
    const sizeClasses = {
      sm: "px-3 py-2 text-sm",
      md: "px-4 py-2.5 text-base",
      lg: "px-4 py-3.5 text-lg",
    };

    const baseClasses = `
      w-full
      bg-white dark:bg-slate-800/80
      border-[1.5px] rounded-xl
      text-slate-900 dark:text-slate-100
      placeholder-slate-400 dark:placeholder-slate-500
      transition-all duration-200 ease-out
      focus:outline-none
      disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800
    `;

    const stateClasses = error
      ? "border-red-400 dark:border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
      : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

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
