import React from "react";
import * as Icons from "./Icons";

/**
 * The three state primitives every fetch path should use.
 *
 * <DataLoading>  — show while React Query / fetch is in-flight
 * <DataError>    — show when a fetch failed; primary action is retry
 * <EmptyState>   — show when the fetch succeeded but the resource is empty;
 *                  primary action is "add one"
 *
 * Each is opinionated about typography, spacing, and motion so callers
 * don't reinvent these. Pass an icon, title, optional description, and
 * up to two actions.
 */

interface Action {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
}

const ActionButton: React.FC<Action> = ({ label, onClick, variant = "primary" }) => {
  const classes =
    variant === "primary"
      ? "px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
      : "px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-colors";
  return (
    <button type="button" onClick={onClick} className={classes}>
      {label}
    </button>
  );
};

// ============================================
// Loading
// ============================================

export interface DataLoadingProps {
  /** Optional caption ("Loading inventory…"); defaults to "Loading…" */
  label?: string;
  /** "inline" = single row, "block" = centered card */
  variant?: "inline" | "block";
}

export const DataLoading: React.FC<DataLoadingProps> = ({
  label = "Loading…",
  variant = "block",
}) => {
  if (variant === "inline") {
    return (
      <div
        className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"
        role="status"
        aria-live="polite"
      >
        <Icons.SpinnerIcon className="w-4 h-4 animate-spin" />
        <span>{label}</span>
      </div>
    );
  }
  return (
    <div
      className="flex flex-col items-center justify-center py-12 gap-3"
      role="status"
      aria-live="polite"
    >
      <Icons.SpinnerIcon className="w-8 h-8 text-blue-500 animate-spin" />
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
};

// ============================================
// Error
// ============================================

export interface DataErrorProps {
  /** Headline ("Couldn't load deals") */
  title?: string;
  /** Detailed message — usually the error message */
  description?: string;
  /** Retry handler. Hides retry button if omitted. */
  onRetry?: () => void;
  /** Secondary action ("Contact support") */
  secondaryAction?: Action;
}

export const DataError: React.FC<DataErrorProps> = ({
  title = "Something went wrong",
  description,
  onRetry,
  secondaryAction,
}) => (
  <div
    className="flex flex-col items-center justify-center py-12 px-6 text-center gap-3 max-w-md mx-auto"
    role="alert"
  >
    <Icons.ExclamationCircleIcon
      className="w-10 h-10 text-rose-500 dark:text-rose-400"
      aria-hidden="true"
    />
    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
    {description && <p className="text-sm text-slate-600 dark:text-slate-400">{description}</p>}
    <div className="flex items-center gap-2 mt-2">
      {onRetry && <ActionButton label="Retry" onClick={onRetry} variant="primary" />}
      {secondaryAction && <ActionButton {...secondaryAction} variant="secondary" />}
    </div>
  </div>
);

// ============================================
// Empty
// ============================================

export interface EmptyStateProps {
  /** Icon component from `Icons.*` */
  icon?: React.ReactNode;
  /** Headline ("No inventory yet") */
  title: string;
  /** Sub-copy ("Add your first vehicle or upload a CSV to get started.") */
  description?: string;
  /** Primary action (usually "Add X" or "Try sample data") */
  primaryAction?: Action;
  /** Optional secondary action */
  secondaryAction?: Action;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
}) => (
  <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3 max-w-md mx-auto">
    {icon && (
      <div className="w-12 h-12 text-slate-400 dark:text-slate-500 mb-2" aria-hidden="true">
        {icon}
      </div>
    )}
    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
    {description && (
      <p className="text-sm text-slate-600 dark:text-slate-400 max-w-sm">{description}</p>
    )}
    {(primaryAction || secondaryAction) && (
      <div className="flex items-center gap-2 mt-3">
        {primaryAction && <ActionButton {...primaryAction} variant="primary" />}
        {secondaryAction && <ActionButton {...secondaryAction} variant="secondary" />}
      </div>
    )}
  </div>
);
