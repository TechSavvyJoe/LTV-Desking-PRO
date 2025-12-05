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
    relative inline-flex items-center justify-center font-semibold
    transition-all duration-200 ease-out
    focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
    disabled:cursor-not-allowed
    active:scale-[0.98]
  `;

  const variantClasses = {
    primary: `
      bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600
      text-white shadow-md shadow-blue-500/20
      hover:shadow-lg hover:shadow-blue-500/30 hover:-translate-y-0.5
      focus-visible:ring-blue-400 focus-visible:ring-offset-0
      disabled:opacity-60 disabled:shadow-none disabled:translate-y-0
      before:absolute before:inset-0 before:rounded-[inherit] before:bg-gradient-to-b before:from-white/15 before:to-transparent
    `,
    secondary: `
      bg-white/90 dark:bg-slate-800/90 
      border border-slate-200 dark:border-slate-700
      text-slate-700 dark:text-slate-200
      shadow-sm
      hover:bg-slate-50 dark:hover:bg-slate-700/90 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-md
      focus-visible:ring-blue-400
      disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-800
    `,
    danger: `
      bg-gradient-to-br from-red-500 to-rose-600
      text-white shadow-md shadow-red-500/20
      hover:shadow-lg hover:shadow-red-500/30 hover:-translate-y-0.5
      focus-visible:ring-red-400
      disabled:opacity-60 disabled:shadow-none disabled:translate-y-0
    `,
    ghost: `
      bg-transparent
      text-slate-600 dark:text-slate-400
      hover:text-slate-900 dark:hover:text-white
      hover:bg-slate-100/80 dark:hover:bg-white/10
      focus-visible:ring-slate-400
      disabled:opacity-50
    `,
    success: `
      bg-gradient-to-br from-emerald-500 to-green-600
      text-white shadow-md shadow-emerald-500/20
      hover:shadow-lg hover:shadow-emerald-500/30 hover:-translate-y-0.5
      focus-visible:ring-emerald-400
      disabled:opacity-60 disabled:shadow-none disabled:translate-y-0
    `,
  };

  const sizeClasses = {
    sm: "px-3.5 py-2 text-xs rounded-lg gap-1.5",
    md: "px-5 py-2.5 text-sm rounded-xl gap-2",
    lg: "px-7 py-3.5 text-base rounded-xl gap-2.5",
    icon: "p-2.5 rounded-xl",
  };

  // Warn in development if icon button has no aria-label
  if (process.env.NODE_ENV === "development" && size === "icon" && !ariaLabel) {
    console.warn(
      "Button: Icon-only buttons should have an aria-label for accessibility."
    );
  }

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      aria-label={ariaLabel}
      disabled={isDisabled}
      {...props}
    >
      {isLoading && <SpinnerIcon className="w-4 h-4 animate-spin absolute" />}
      <span
        className={
          isLoading ? "opacity-0" : "inline-flex items-center gap-inherit"
        }
      >
        {children}
      </span>
    </button>
  );
};

export default Button;
