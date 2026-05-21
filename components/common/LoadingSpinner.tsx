import React from "react";

/**
 * Loading spinner component for lazy-loaded components
 * Used as fallback for React.Suspense
 */
export const LoadingSpinner: React.FC<{ message?: string }> = ({ message = "Loading..." }) => (
  <div className="flex flex-col items-center justify-center p-8 min-h-[200px]">
    <div className="w-8 h-8 border-2 border-neutral-200 dark:border-neutral-700 border-t-primary-500 rounded-full animate-spin" />
    <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">{message}</p>
  </div>
);

/**
 * Full page loading state
 */
export const PageLoader: React.FC<{ message?: string }> = ({ message = "Loading page..." }) => (
  <div className="fixed inset-0 flex items-center justify-center bg-white dark:bg-neutral-950 z-[9999]">
    <LoadingSpinner message={message} />
  </div>
);

/**
 * Skeleton loader for content placeholders
 */
export const Skeleton: React.FC<{
  width?: string | number;
  height?: string | number;
  className?: string;
}> = ({ width = "100%", height = "1rem", className = "" }) => (
  <div
    className={`skeleton bg-neutral-200 dark:bg-neutral-800 rounded ${className}`}
    style={{
      width: typeof width === "number" ? `${width}px` : width,
      height: typeof height === "number" ? `${height}px` : height,
    }}
  />
);

export default LoadingSpinner;
