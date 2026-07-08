/**
 * Structured logging utility for the application
 *
 * Features:
 * - Log levels (debug, info, warn, error)
 * - Environment-aware (debug disabled in production)
 * - Structured data logging
 * - Integration points for external logging services (Sentry, etc.)
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogContext {
  [key: string]: unknown;
}

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

    // Sentry (via lib/sentry captureException) handles critical errors; extend here for warn telemetry if volume justifies.
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

    // Sentry integration active (lib/sentry.ts + ErrorBoundary); logger forwards via placeholder for future unified path.
    this.sendToExternalService("error", message, errorContext, error);
  }

  /**
   * Send logs to external service (Sentry, LogRocket, etc.)
   * Placeholder for future implementation
   */
  private sendToExternalService(
    level: string,
    message: string,
    context?: LogContext,
    error?: Error | unknown
  ) {
    // Sentry capture lives in lib/sentry.ts (lazy, DSN-gated). Hook logger here only if non-exception telemetry needed.
    // Example (not active to avoid double-init):
    // if (this.isProduction && window.Sentry) { ... }
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
