import { QueryClient } from "@tanstack/react-query";
import { getCurrentDealerId } from "./pocketbase";

/**
 * Configured QueryClient for the application.
 * - staleTime: Data is fresh for 5 minutes before refetching on window focus.
 * - gcTime: Unused cache is garbage collected after 10 minutes.
 * - retry: Only retry once on failure.
 *
 * Progress (state/RQ cleanup):
 * - DealContext loadData now routes the 3 main + settings reads through
 *   queryClient.fetchQuery (with domain-mapped queryFn results). Cache is
 *   populated by RQ rather than only setQueryData.
 * - setQueryData remains in subs/optimistic paths to keep realtime + optimistic
 *   in sync with cache.
 * - Still no useQuery/useMutation in consumers (safe incremental; avoids
 *   breaking all screens/hooks).
 *
 * Per PRODUCTION_READINESS_PLAN.md: DealContext / RQ consolidation to eliminate
 * duplication of server state.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 10, // 10 minutes (formerly cacheTime)
      retry: 1,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 0, // Don't retry mutations automatically
    },
  },
});

// Query keys for cache invalidation + fetchQuery.
// Keep in sync. Now actively used by fetchQuery in DealContext.loadData
// (in addition to setQueryData in mutation/sub paths).
export const queryKeys = {
  inventory: ["dealerData", "inventory"] as const,
  lenderProfiles: ["dealerData", "lenderProfiles"] as const,
  savedDeals: ["dealerData", "savedDeals"] as const,
  dealerSettings: ["dealerData", "dealerSettings"] as const,
  systemStats: ["systemStats"] as const,
  dealers: ["dealers"] as const,
  users: ["users"] as const,
};

export const dealerQueryKeys = (dealerId: string | null | undefined) => {
  const scope = dealerId || "no-dealer";
  return {
    inventory: [...queryKeys.inventory, scope] as const,
    lenderProfiles: [...queryKeys.lenderProfiles, scope] as const,
    savedDeals: [...queryKeys.savedDeals, scope] as const,
    dealerSettings: [...queryKeys.dealerSettings, scope] as const,
  };
};

export const currentDealerQueryKeys = () => dealerQueryKeys(getCurrentDealerId());
