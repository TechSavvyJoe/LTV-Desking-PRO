/**
 * Custom error classes for different error types in the application
 *
 * Benefits:
 * - Type-safe error handling
 * - Structured error information
 * - Easy to distinguish error types
 * - Preserves error cause chain
 */

/**
 * Base application error class
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
    public readonly code?: string
  ) {
    super(message);
    this.name = this.constructor.name;

    // Maintains proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert to a plain object for logging/serialization
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      cause: this.cause instanceof Error ? this.cause.message : this.cause,
      stack: this.stack,
    };
  }
}

/**
 * API/Network related errors
 */
export class ApiError extends AppError {
  constructor(
    message: string,
    cause?: unknown,
    public readonly statusCode?: number
  ) {
    super(message, cause, "API_ERROR");
    this.statusCode = statusCode;
  }
}

/**
 * Validation errors (user input, data validation)
 */
export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly field?: string,
    cause?: unknown
  ) {
    super(message, cause, "VALIDATION_ERROR");
    this.field = field;
  }
}

/**
 * Authorization/Permission errors
 */
export class AuthorizationError extends AppError {
  constructor(
    message: string = "You do not have permission to perform this action",
    cause?: unknown
  ) {
    super(message, cause, "AUTHORIZATION_ERROR");
  }
}

/**
 * Authentication errors (login, token refresh)
 */
export class AuthenticationError extends AppError {
  constructor(
    message: string = "Authentication failed",
    cause?: unknown
  ) {
    super(message, cause, "AUTHENTICATION_ERROR");
  }
}

/**
 * Not found errors (404)
 */
export class NotFoundError extends AppError {
  constructor(
    resource: string,
    cause?: unknown
  ) {
    super(`${resource} not found`, cause, "NOT_FOUND_ERROR");
  }
}

/**
 * Configuration errors
 */
export class ConfigError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, cause, "CONFIG_ERROR");
  }
}

/**
 * File processing errors
 */
export class FileProcessingError extends AppError {
  constructor(
    message: string,
    public readonly fileName?: string,
    cause?: unknown
  ) {
    super(message, cause, "FILE_PROCESSING_ERROR");
    this.fileName = fileName;
  }
}

/**
 * Database errors
 */
export class DatabaseError extends AppError {
  constructor(
    message: string,
    cause?: unknown,
    public readonly operation?: string
  ) {
    super(message, cause, "DATABASE_ERROR");
    this.operation = operation;
  }
}

/**
 * Type guard to check if error is an AppError
 */
export const isAppError = (error: unknown): error is AppError => {
  return error instanceof AppError;
};

/**
 * Get a user-friendly error message from any error
 */
export const getErrorMessage = (error: unknown): string => {
  if (isAppError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "An unknown error occurred";
};

/**
 * Get error code from any error
 */
export const getErrorCode = (error: unknown): string | undefined => {
  if (isAppError(error)) {
    return error.code;
  }
  return undefined;
};
