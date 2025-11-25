
import React, { Component, ErrorInfo, ReactNode } from 'react';

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
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-2xl max-w-2xl w-full border border-red-200 dark:border-red-900">
            <h1 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">
              Something went wrong.
            </h1>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              The application encountered an unexpected error.
            </p>
            
            <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg overflow-auto max-h-64 mb-6 border border-red-100 dark:border-red-800/50">
              <p className="font-mono text-sm text-red-700 dark:text-red-300 font-bold">
                {this.state.error?.toString()}
              </p>
              <pre className="font-mono text-xs text-red-600/80 dark:text-red-400/80 mt-2 whitespace-pre-wrap">
                  {this.state.errorInfo?.componentStack}
              </pre>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors"
            >
              Refresh Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
