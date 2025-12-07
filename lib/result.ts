/**
 * Result type for consistent error handling across the application
 *
 * Usage:
 * ```typescript
 * function fetchData(): Result<Data, Error> {
 *   try {
 *     const data = await api.fetch();
 *     return { success: true, data };
 *   } catch (error) {
 *     return { success: false, error: new ApiError("Failed to fetch", error) };
 *   }
 * }
 *
 * const result = fetchData();
 * if (result.success) {
 *   console.log(result.data);
 * } else {
 *   console.error(result.error.message);
 * }
 * ```
 */
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Helper to create a successful result
 */
export const ok = <T>(data: T): Result<T, never> => ({
  success: true,
  data,
});

/**
 * Helper to create an error result
 */
export const err = <E = Error>(error: E): Result<never, E> => ({
  success: false,
  error,
});

/**
 * Unwrap a result, throwing if it's an error
 * Use sparingly - prefer handling errors explicitly
 */
export const unwrap = <T, E>(result: Result<T, E>): T => {
  if (result.success) {
    return result.data;
  }
  throw result.error;
};

/**
 * Map over a successful result
 */
export const map = <T, U, E>(
  result: Result<T, E>,
  fn: (data: T) => U
): Result<U, E> => {
  if (result.success) {
    return ok(fn(result.data));
  }
  return result;
};

/**
 * Chain operations on results (flatMap)
 */
export const andThen = <T, U, E>(
  result: Result<T, E>,
  fn: (data: T) => Result<U, E>
): Result<U, E> => {
  if (result.success) {
    return fn(result.data);
  }
  return result;
};

/**
 * Provide a default value if result is an error
 */
export const orElse = <T, E>(result: Result<T, E>, defaultValue: T): T => {
  if (result.success) {
    return result.data;
  }
  return defaultValue;
};

/**
 * Convert a promise to a Result
 */
export const fromPromise = async <T>(
  promise: Promise<T>
): Promise<Result<T, Error>> => {
  try {
    const data = await promise;
    return ok(data);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
};
