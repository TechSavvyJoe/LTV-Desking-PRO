import React from "react";
import { SpinnerIcon } from "./Icons";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "success";
  size?: "sm" | "md" | "lg" | "icon";
  children: React.ReactNode;
  isLoading?: boolean;
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
      bg-neutral-900 dark:bg-white
      text-white dark:text-neutral-900
      hover:bg-neutral-800 dark:hover:bg-neutral-100
      focus-visible:ring-neutral-900 dark:focus-visible:ring-white
    `,
    secondary: `
      bg-white dark:bg-neutral-800
      text-neutral-700 dark:text-neutral-200
      border border-neutral-200 dark:border-neutral-700
      hover:bg-neutral-50 dark:hover:bg-neutral-700
      hover:border-neutral-300 dark:hover:border-neutral-600
      focus-visible:ring-neutral-400
    `,
    danger: `
      bg-red-600 text-white
      hover:bg-red-700
      focus-visible:ring-red-500
    `,
    ghost: `
      bg-transparent
      text-neutral-600 dark:text-neutral-400
      hover:text-neutral-900 dark:hover:text-white
      hover:bg-neutral-100 dark:hover:bg-neutral-800
      focus-visible:ring-neutral-400
    `,
    success: `
      bg-emerald-600 text-white
      hover:bg-emerald-700
      focus-visible:ring-emerald-500
    `,
  };

  const sizeClasses = {
    sm: "px-3 py-1.5 text-xs rounded-md gap-1.5",
    md: "px-4 py-2 text-sm rounded-lg gap-2",
    lg: "px-5 py-2.5 text-base rounded-lg gap-2",
    icon: "p-2 rounded-lg",
  };

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
