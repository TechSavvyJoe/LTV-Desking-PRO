/**
 * Structured logging utility for the application
 *
 * Features:
 * - Log levels (debug, info, warn, error)
 * - Environment-aware (debug disabled in production)
 * - Structured data logging
 * - Integration points for external logging services (Sentry, etc.)
 */

import { captureException, captureMessage } from "./sentry";

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogContext {
  [key: string]: unknown;
}

/**
 * Rate limiter for external (Sentry) forwarding, shared across all logger
 * instances (child loggers included) so a render/retry loop can't spam the
 * event quota: at most MAX_EXTERNAL_EVENTS_PER_WINDOW events are forwarded
 * per rolling window; the rest still reach the console.
 */
const EXTERNAL_RATE_WINDOW_MS = 60_000;
const MAX_EXTERNAL_EVENTS_PER_WINDOW = 10;
let externalWindowStart = 0;
let externalEventsInWindow = 0;

const externalRateLimitAllows = (now: number = Date.now()): boolean => {
  if (now - externalWindowStart >= EXTERNAL_RATE_WINDOW_MS) {
    externalWindowStart = now;
    externalEventsInWindow = 0;
  }
  if (externalEventsInWindow >= MAX_EXTERNAL_EVENTS_PER_WINDOW) return false;
  externalEventsInWindow++;
  return true;
};

/** Test-only: reset the shared external-forwarding rate limiter. */
export const __resetExternalLogRateLimiterForTests = (): void => {
  externalWindowStart = 0;
  externalEventsInWindow = 0;
};

class Logger {
  private minLevel: LogLevel;
  private isProduction: boolean;

  constructor() {
    // Robust for test runners / non-Vite envs where import.meta.env may be partial or undefined.
    const meta = import.meta as { env?: unknown };
    const env = (meta.env ?? {}) as { PROD?: boolean; MODE?: string };
    this.isProduction = !!(env.PROD || env.MODE === "production");
    this.minLevel = this.isProduction ? LogLevel.INFO : LogLevel.DEBUG;
  }

  /**
   * Set minimum log level
   */
  setLevel(level: LogLevel) {
    this.minLevel = level;
  }

  /**
   * Format log message with timestamp and context
   */
  private format(level: string, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : "";
    return `[${timestamp}] [${level}] ${message}${contextStr}`;
  }

  /**
   * Check if level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return level >= this.minLevel;
  }

  /**
   * Debug level logging (development only)
   */
  debug(message: string, context?: LogContext) {
    if (!this.shouldLog(LogLevel.DEBUG)) return;

    const formatted = this.format("DEBUG", message, context);
    console.log(formatted);
  }

  /**
   * Info level logging
   */
  info(message: string, context?: LogContext) {
    if (!this.shouldLog(LogLevel.INFO)) return;

    const formatted = this.format("INFO", message, context);
    console.log(formatted);
  }

  /**
   * Warning level logging
   */
  warn(message: string, context?: LogContext) {
    if (!this.shouldLog(LogLevel.WARN)) return;

    const formatted = this.format("WARN", message, context);
    console.warn(formatted);

    // Forwarded to Sentry as a message (DSN-gated + rate-limited below).
    this.sendToExternalService("warn", message, context);
  }

  /**
   * Error level logging
   */
  error(message: string, error?: Error | unknown, context?: LogContext) {
    if (!this.shouldLog(LogLevel.ERROR)) return;

    const errorContext = {
      ...context,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : error,
    };

    const formatted = this.format("ERROR", message, errorContext);
    console.error(formatted);

    // Forwarded to Sentry as an exception (DSN-gated + rate-limited below).
    this.sendToExternalService("error", message, errorContext, error);
  }

  /**
   * Forward a log to Sentry via lib/sentry's lazy, DSN-gated helpers.
   * - errors → captureException (falls back to the message when no Error given)
   * - warns → captureMessage
   * No DSN configured → the helpers no-op without downloading the SDK.
   * A shared rolling-window rate limit keeps a render/retry loop from
   * exhausting the Sentry event quota.
   */
  private sendToExternalService(
    level: "warn" | "error",
    message: string,
    context?: LogContext,
    error?: Error | unknown
  ) {
    if (!externalRateLimitAllows()) return;
    if (level === "error") {
      // Prefer the real Error (stack trace); otherwise report the message.
      const reportable = error instanceof Error ? error : new Error(message);
      void captureException(reportable, { extra: { message, ...context } }).catch(() => {
        // Telemetry must never throw back into app code.
      });
    } else {
      void captureMessage(message, context).catch(() => {
        // Telemetry must never throw back into app code.
      });
    }
  }

  /**
   * Create a child logger with default context
   */
  child(defaultContext: LogContext): Logger {
    const childLogger = new Logger();
    const debug = this.debug.bind(this);
    const info = this.info.bind(this);
    const warn = this.warn.bind(this);
    const error = this.error.bind(this);

    // Override methods to include default context
    childLogger.debug = (msg, ctx) => debug(msg, { ...defaultContext, ...ctx });
    childLogger.info = (msg, ctx) => info(msg, { ...defaultContext, ...ctx });
    childLogger.warn = (msg, ctx) => warn(msg, { ...defaultContext, ...ctx });
    childLogger.error = (msg, err, ctx) => error(msg, err, { ...defaultContext, ...ctx });

    return childLogger;
  }
}

/**
 * Global logger instance
 */
export const logger = new Logger();

/**
 * Create a logger for a specific module/component
 */
export const createLogger = (module: string): Logger => {
  return logger.child({ module });
};

/**
 * Helper to log API calls
 */
export const logApiCall = (endpoint: string, method: string, duration?: number, error?: Error) => {
  const context = {
    endpoint,
    method,
    duration: duration ? `${duration}ms` : undefined,
  };

  if (error) {
    logger.error(`API call failed: ${method} ${endpoint}`, error, context);
  } else {
    logger.debug(`API call: ${method} ${endpoint}`, context);
  }
};
