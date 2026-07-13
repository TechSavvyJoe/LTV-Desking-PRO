/**
 * Sentry frontend error tracking — lazily loaded.
 *
 * The @sentry/react SDK (with tracing + replay) is one of the heaviest deps in
 * the tree. It is dynamically imported only when VITE_SENTRY_DSN is set, so it
 * never ships in the main bundle for local dev, PR previews, or any deploy
 * without a DSN configured. [perf]
 *
 * Free tier (Developer): 5K events/mo, 30-day retention.
 */

type SentryModule = typeof import("@sentry/react");

let sentryPromise: Promise<SentryModule> | null = null;
let initialized = false;

const dsn = (): string | undefined => import.meta.env.VITE_SENTRY_DSN;

const loadSentry = (): Promise<SentryModule> => {
  if (!sentryPromise) sentryPromise = import("@sentry/react");
  return sentryPromise;
};

export const initSentry = async (): Promise<void> => {
  if (!dsn()) return; // not configured — never download the SDK
  const Sentry = await loadSentry();
  Sentry.init({
    dsn: dsn(),
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_RELEASE,
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    sendDefaultPii: false,
  });
  initialized = true;
};

/**
 * Report an exception to Sentry when it's configured. No-ops (without loading
 * the SDK) when there's no DSN, so unconfigured builds pay nothing.
 */
export const captureException = async (
  error: unknown,
  context?: Record<string, unknown>
): Promise<void> => {
  if (!dsn()) return;
  const Sentry = await loadSentry();
  if (!initialized) {
    // An error fired before init completed — bring Sentry up so it isn't lost.
    await initSentry();
  }
  Sentry.captureException(
    error,
    (context ?? undefined) as Parameters<SentryModule["captureException"]>[1]
  );
};

/**
 * Report a non-exception message (e.g. a logged warning) to Sentry when it's
 * configured. Same DSN gating as captureException: no DSN, no SDK download.
 */
export const captureMessage = async (
  message: string,
  context?: Record<string, unknown>
): Promise<void> => {
  if (!dsn()) return;
  const Sentry = await loadSentry();
  if (!initialized) {
    await initSentry();
  }
  Sentry.captureMessage(
    message,
    (context ? { extra: context } : undefined) as Parameters<SentryModule["captureMessage"]>[1]
  );
};
