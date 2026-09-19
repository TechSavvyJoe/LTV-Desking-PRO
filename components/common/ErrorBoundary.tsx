import React, { Component, ErrorInfo, ReactNode } from "react";
import { captureException } from "../../lib/sentry";
import Button from "./Button";
import { SUPPORT_EMAIL } from "../../constants";

interface Props {
  children?: ReactNode;
  /**
   * "app" — full-screen fallback for the root boundary.
   * "section" — inline card that replaces only the failed region so one
   * broken panel or modal can't tear down the whole desk. [takeover-P0]
   */
  scope?: "app" | "section";
  /** Human name of the region for the section copy, e.g. "the deal sheet". */
  label?: string;
  /** Runs after "Try again" so callers can reset local state. */
  onReset?: () => void;
  /** Fully custom fallback. */
  fallback?: (args: { reset: () => void; error: Error }) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  /** Short reference shown to the user and attached to the Sentry event. */
  ref: string;
}

const isDev = Boolean(import.meta.env?.DEV);

/** Short, human-readable reference (e.g. "K7M2-9QF4") for support tickets. */
const makeRef = (): string => {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
    if (i === 3) out += "-";
  }
  return out;
};

/**
 * React error boundary. In production it shows a calm, on-brand recovery card
 * with a support reference — never a raw stack trace, which reads as unfinished
 * software to a dealership. Full technical details render only in DEV. Errors
 * are still forwarded to Sentry with the component stack and the reference.
 */
class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, error: null, errorInfo: null, ref: "" };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null, ref: makeRef() };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    void captureException(error, {
      contexts: {
        react: { componentStack: errorInfo.componentStack },
        errorBoundary: { reference: this.state.ref, scope: this.props.scope ?? "app" },
      },
    });
    this.setState({ error, errorInfo });
  }

  private reset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, ref: "" });
    this.props.onReset?.();
  };

  public render() {
    if (!this.state.hasError) return this.props.children;

    const { error, errorInfo, ref } = this.state;
    if (this.props.fallback && error) return this.props.fallback({ reset: this.reset, error });

    const scope = this.props.scope ?? "app";
    const label = this.props.label ?? "This part of the app";
    const subject = encodeURIComponent(`LTV Desking PRO error ${ref}`);
    const supportHref = `mailto:${SUPPORT_EMAIL}?subject=${subject}`;

    const card = (
      <div
        role="alert"
        className={`bg-[var(--color-bg)] border border-[var(--color-border-strong)] rounded-lg shadow-md w-full ${
          scope === "app" ? "max-w-lg p-8" : "p-6"
        }`}
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-danger-subtle)] text-[var(--color-danger)] text-sm font-bold"
          >
            !
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-[var(--color-text)]">
              {scope === "app" ? "Something went wrong" : `${label} couldn't load`}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)] leading-relaxed">
              {scope === "app"
                ? "The app hit an unexpected error. Your saved deals and inventory are safe — nothing was lost. Try again, or reload the page."
                : "It hit an unexpected error. The rest of the desk still works — try again, or reload if it keeps happening."}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={this.reset}>
                Try again
              </Button>
              <Button variant="secondary" onClick={() => window.location.reload()}>
                Reload page
              </Button>
            </div>

            <p className="mt-4 text-xs text-[var(--color-text-subtle)]">
              Reference <span className="font-mono text-[var(--color-text-muted)]">{ref}</span>
              {" · "}
              <a
                href={supportHref}
                className="underline underline-offset-2 hover:text-[var(--color-text)]"
              >
                Contact support
              </a>{" "}
              if this keeps happening.
            </p>

            {isDev && (
              <details className="mt-4 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-3">
                <summary className="cursor-pointer text-xs font-semibold text-[var(--color-text-muted)]">
                  Developer details (hidden in production)
                </summary>
                <p className="mt-2 font-mono text-xs text-[var(--color-danger)] break-words">
                  {error?.toString()}
                </p>
                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-[var(--color-text-muted)]">
                  {errorInfo?.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      </div>
    );

    if (scope === "section") return <div className="p-4">{card}</div>;

    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-subtle)] p-4">
        {card}
      </div>
    );
  }
}

/** Inline boundary for routed screens, panels, and heavy lazy modals. */
export const SectionErrorBoundary: React.FC<Omit<Props, "scope">> = (props) => (
  <ErrorBoundary scope="section" {...props} />
);

export default ErrorBoundary;
