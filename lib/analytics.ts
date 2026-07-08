/**
 * Product analytics — PostHog, strictly gated. [G71]
 *
 * No-ops entirely (never downloads the SDK) unless VITE_POSTHOG_KEY is set, so
 * dev/preview builds and key-less deploys send nothing. Events are the five
 * pilot-success metrics (deal_saved, lender_matched, pdf_generated,
 * inventory_uploaded, sample_loaded) plus supporting (deal_desked etc).
 * See PRODUCTION_READINESS_PLAN §2.1. Adoption signals, never vanity.
 *
 * PRIVACY: never pass customer names, incomes, or credit scores in event
 * properties. Dealer/user ids and deal *shape* (term, LTV band) only.
 */

type PosthogModule = typeof import("posthog-js").default;

let client: PosthogModule | null = null;
let initStarted = false;

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || "https://us.i.posthog.com";

const ensureInit = async (): Promise<PosthogModule | null> => {
  if (!KEY) return null;
  if (client) return client;
  if (initStarted) return null; // init in flight; drop rather than queue
  initStarted = true;
  try {
    const mod = await import("posthog-js");
    mod.default.init(KEY, {
      api_host: HOST,
      autocapture: false, // explicit events only — keeps PII out by construction
      capture_pageview: true,
      persistence: "localStorage",
    });
    client = mod.default;
    return client;
  } catch (error) {
    // PostHog optional; failures non-fatal in prod.
    return null;
  }
};

export type AnalyticsEvent =
  | "deal_desked"
  | "lender_match_viewed"
  | "lender_matched"
  | "pdf_generated"
  | "pdf_failed"
  | "import_completed"
  | "inventory_uploaded"
  | "sample_loaded"
  | "deal_saved";

export const capture = (event: AnalyticsEvent, props?: Record<string, unknown>): void => {
  void ensureInit().then((ph) => {
    if (ph) ph.capture(event, props);
  });
};

export const identify = (userId: string, props?: Record<string, unknown>): void => {
  void ensureInit().then((ph) => {
    if (ph) ph.identify(userId, props);
  });
};
