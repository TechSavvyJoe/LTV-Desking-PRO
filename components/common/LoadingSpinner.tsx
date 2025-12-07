import React from "react";

/**
 * Loading spinner component for lazy-loaded components
 * Used as fallback for React.Suspense
 */
export const LoadingSpinner: React.FC<{ message?: string }> = ({ message = "Loading..." }) => (
  <div className="loading-spinner-container">
    <div className="loading-spinner" />
    <p className="loading-message">{message}</p>
    <style>{`
      .loading-spinner-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 2rem;
        min-height: 200px;
      }
      .loading-spinner {
        width: 40px;
        height: 40px;
        border: 3px solid var(--border-color, #e0e0e0);
        border-top-color: var(--primary-color, #3b82f6);
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }
      .loading-message {
        margin-top: 1rem;
        color: var(--text-muted, #6b7280);
        font-size: 0.875rem;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `}</style>
  </div>
);

/**
 * Full page loading state
 */
export const PageLoader: React.FC<{ message?: string }> = ({ message = "Loading page..." }) => (
  <div className="page-loader">
    <LoadingSpinner message={message} />
    <style>{`
      .page-loader {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--bg-color, white);
        z-index: 9999;
      }
    `}</style>
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
    className={`skeleton ${className}`}
    style={{
      width: typeof width === "number" ? `${width}px` : width,
      height: typeof height === "number" ? `${height}px` : height,
    }}
  >
    <style>{`
      .skeleton {
        background: linear-gradient(
          90deg,
          var(--skeleton-base, #f0f0f0) 25%,
          var(--skeleton-highlight, #e0e0e0) 50%,
          var(--skeleton-base, #f0f0f0) 75%
        );
        background-size: 200% 100%;
        animation: shimmer 1.5s infinite;
        border-radius: 4px;
      }
      @keyframes shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
    `}</style>
  </div>
);

export default LoadingSpinner;
