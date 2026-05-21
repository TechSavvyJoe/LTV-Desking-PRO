import React from "react";
import { SpinnerIcon } from "./Icons";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "success";
  size?: "sm" | "md" | "lg" | "icon";
  children: React.ReactNode;
  /** Loading state - shows spinner and disables button */
  isLoading?: boolean;
  /** Accessibility label - required for icon-only buttons */
  "aria-label"?: string;
}

const Button: React.FC<ButtonProps> = ({
  children,
  variant = "primary",
  size = "md",
  className = "",
  isLoading = false,
  disabled,
  "aria-label": ariaLabel,
  ...props
}) => {
  const isDisabled = disabled || isLoading;

  const baseClasses = `
    relative inline-flex items-center justify-center font-medium
    transition-all duration-150 ease-out
    focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
    disabled:cursor-not-allowed disabled:opacity-50
    active:scale-[0.98]
  `;

  const variantClasses = {
    primary: `
      bg-neutral-950 dark:bg-white
      text-white dark:text-neutral-950
      border border-neutral-950 dark:border-white
      hover:bg-neutral-800 dark:hover:bg-neutral-100
      focus-visible:ring-primary-500 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-950
      disabled:bg-neutral-300 dark:disabled:bg-neutral-700
    `,
    secondary: `
      bg-white dark:bg-neutral-900
      text-neutral-700 dark:text-neutral-200
      border border-neutral-200 dark:border-neutral-700
      hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-600
      focus-visible:ring-primary-500 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-950
    `,
    danger: `
      bg-red-600 dark:bg-red-600
      text-white
      border border-red-600 dark:border-red-500
      hover:bg-red-700 dark:hover:bg-red-500
      focus-visible:ring-red-500 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-950
    `,
    ghost: `
      bg-transparent
      text-neutral-600 dark:text-neutral-400
      border border-transparent
      hover:text-neutral-900 dark:hover:text-white
      hover:bg-neutral-100 dark:hover:bg-neutral-800
      focus-visible:ring-primary-500 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-950
    `,
    success: `
      bg-emerald-600 dark:bg-emerald-600
      text-white
      border border-emerald-600 dark:border-emerald-500
      hover:bg-emerald-700 dark:hover:bg-emerald-500
      focus-visible:ring-emerald-500 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-950
    `,
  };

  const sizeClasses = {
    sm: "px-3 py-1.5 text-xs rounded-md gap-1.5",
    md: "px-4 py-2 text-sm rounded-lg gap-2",
    lg: "px-5 py-2.5 text-base rounded-lg gap-2",
    icon: "p-2 rounded-lg",
  };

  // Warn in development if icon button has no aria-label
  if (import.meta.env.DEV && size === "icon" && !ariaLabel) {
    console.warn("Button: Icon-only buttons should have an aria-label for accessibility.");
  }

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      aria-label={ariaLabel}
      disabled={isDisabled}
      {...props}
    >
      {isLoading && <SpinnerIcon className="w-4 h-4 animate-spin absolute" />}
      <span className={isLoading ? "opacity-0" : "inline-flex items-center gap-inherit"}>
        {children}
      </span>
    </button>
  );
};

export default Button;
