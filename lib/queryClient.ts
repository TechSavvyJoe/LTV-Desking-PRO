import { QueryClient } from "@tanstack/react-query";
import { getCurrentDealerId } from "./pocketbase";

/**
 * Configured QueryClient for the application.
 * - staleTime: Data is fresh for 5 minutes before refetching on window focus.
 * - gcTime: Unused cache is garbage collected after 10 minutes.
 * - retry: Only retry once on failure.
 *
 * React Query is the source of truth for dealer-scoped server arrays:
 * - DealProvider drives inventory / lenderProfiles / savedDeals via useQuery
 * - Optimistic + realtime paths update the cache with setQueryData
 * - Admin dashboards read dealers / users / systemStats via useQuery
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

// Query keys for cache invalidation + useQuery / fetchQuery.
export const queryKeys = {
  inventory: ["dealerData", "inventory"] as const,
  lenderProfiles: ["dealerData", "lenderProfiles"] as const,
  savedDeals: ["dealerData", "savedDeals"] as const,
  dealerSettings: ["dealerData", "dealerSettings"] as const,
  dealerUsers: ["dealerData", "dealerUsers"] as const,
  currentDealer: ["dealerData", "currentDealer"] as const,
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
    dealerUsers: [...queryKeys.dealerUsers, scope] as const,
    currentDealer: [...queryKeys.currentDealer, scope] as const,
  };
};

export const currentDealerQueryKeys = () => dealerQueryKeys(getCurrentDealerId());
