import React, { Component, ErrorInfo, ReactNode } from "react";
import { captureException } from "../../lib/sentry";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Uncaught error; forwarded to Sentry in lib/sentry.ts from index.
    void captureException(error, {
      contexts: { react: { componentStack: errorInfo.componentStack } },
    });
    this.setState({ error, errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-muted)] p-4">
          <div className="bg-[var(--color-bg)] p-8 rounded-md shadow-md max-w-2xl w-full border border-[var(--color-danger)]/30">
            <h1 className="text-2xl font-semibold text-[var(--color-danger)] mb-4">
              Something went wrong.
            </h1>
            <p className="text-[var(--color-text-muted)] mb-6">
              The application encountered an unexpected error.
            </p>

            <div className="bg-[var(--color-danger-subtle)] p-4 rounded-md overflow-auto max-h-64 mb-6 border border-[var(--color-danger)]/20">
              <p className="font-mono text-sm text-[var(--color-danger)] font-semibold">
                {this.state.error?.toString()}
              </p>
              <pre className="font-mono text-xs text-[var(--color-danger)]/80 mt-2 whitespace-pre-wrap">
                {this.state.errorInfo?.componentStack}
              </pre>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="w-full px-4 py-2 bg-[var(--color-danger)] text-white font-medium rounded transition-colors duration-[var(--duration-fast)]"
              style={{ "--tw-bg-opacity": "1" } as React.CSSProperties}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#991b1b")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--color-danger)")}
            >
              Refresh application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
