import * as Sentry from "@sentry/react";

/**
 * Sentry frontend error tracking.
 *
 * Initialises only when VITE_SENTRY_DSN is set, so local dev and PR previews
 * stay silent unless the developer wants them captured. Set the DSN as a
 * Vercel Project Environment Variable for Production.
 *
 * Free tier (Developer): 5K events/mo, 30-day retention.
 * Team plan ($26/mo): 50K events/mo, unlimited users.
 */
export const initSentry = (): void => {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_RELEASE,
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    sendDefaultPii: false,
  });
};

export { Sentry };
