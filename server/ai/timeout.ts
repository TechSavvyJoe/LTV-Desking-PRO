export const DEFAULT_AI_TIMEOUT_MS = 120_000;

export const withAiTimeout = async <T>(
  operation: Promise<T>,
  timeoutMs = DEFAULT_AI_TIMEOUT_MS
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("AI provider request timed out."));
    }, timeoutMs);

    operation
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timeout));
  });
