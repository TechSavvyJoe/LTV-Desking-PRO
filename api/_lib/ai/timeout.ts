export const DEFAULT_AI_TIMEOUT_MS = 120_000;

/**
 * Run a provider operation with a hard timeout that also CANCELS the
 * underlying request. Racing a promise alone is not enough on serverless:
 * a hung provider call would keep the function instance occupied until
 * `maxDuration` (300s). The operation receives an AbortSignal that must be
 * threaded through to the actual fetch / SDK call.
 */
export const withAiTimeout = async <T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = DEFAULT_AI_TIMEOUT_MS
): Promise<T> => {
  const controller = new AbortController();

  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      // Reject first so callers always observe this stable message, then
      // abort so the provider request is actually torn down (the later
      // AbortError lands in an already-settled promise and is ignored).
      reject(new Error("AI provider request timed out."));
      controller.abort();
    }, timeoutMs);

    operation(controller.signal)
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timeout));
  });
};
