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

  // Dealer Trust: solid fills, neutral borders, color-only hover. No gradients,
  // no colored shadow glows, no lift/scale transforms. The prop API is unchanged.
  const baseClasses = `
    relative inline-flex items-center justify-center font-medium
    rounded transition-colors duration-[120ms]
    focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2
    disabled:cursor-not-allowed
  `;

  const variantClasses = {
    primary: `
      bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]
      text-white border border-transparent
      focus-visible:outline-[var(--color-primary)]
      disabled:opacity-50
    `,
    secondary: `
      bg-white dark:bg-[var(--color-bg-subtle)]
      hover:bg-[var(--color-bg-muted)]
      text-[var(--color-text)]
      border border-[var(--color-border-strong)]
      focus-visible:outline-[var(--color-primary)]
      disabled:opacity-50
    `,
    danger: `
      bg-[var(--color-danger)] hover:bg-red-800
      text-white border border-transparent
      focus-visible:outline-[var(--color-danger)]
      disabled:opacity-50
    `,
    ghost: `
      bg-transparent hover:bg-[var(--color-bg-muted)]
      text-[var(--color-text-muted)] hover:text-[var(--color-text)]
      border border-transparent
      focus-visible:outline-[var(--color-primary)]
      disabled:opacity-50
    `,
    success: `
      bg-[var(--color-success)] hover:bg-green-800
      text-white border border-transparent
      focus-visible:outline-[var(--color-success)]
      disabled:opacity-50
    `,
  };

  const sizeClasses = {
    sm: "px-3 py-1.5 text-xs gap-1.5",
    md: "px-4 py-2 text-sm gap-2",
    lg: "px-5 py-2.5 text-base gap-2.5",
    icon: "p-2",
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
