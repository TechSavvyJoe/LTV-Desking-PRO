import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg" | "icon";
  children: React.ReactNode;
  /** Accessibility label - required for icon-only buttons */
  "aria-label"?: string;
}

const Button: React.FC<ButtonProps> = ({
  children,
  variant = "primary",
  size = "md",
  className = "",
  "aria-label": ariaLabel,
  ...props
}) => {
  const baseClasses =
    "inline-flex items-center justify-center rounded-xl font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none shadow-sm";

  const variantClasses = {
    primary:
      "bg-gradient-to-r from-sky-500 to-indigo-500 text-white hover:shadow-md hover:from-sky-600 hover:to-indigo-600 focus:ring-sky-300 focus:ring-offset-0",
    secondary:
      "border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 bg-white/80 dark:bg-slate-900/60 hover:border-sky-400 focus:ring-sky-300",
    danger:
      "border border-red-400 text-red-600 hover:bg-red-50 focus:ring-red-300",
    ghost:
      "bg-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-white/10 focus:ring-sky-300",
  };

  const sizeClasses = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-5 py-2.5 text-sm",
    lg: "px-7 py-3 text-base",
    icon: "p-2",
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
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
