import { QueryClient } from "@tanstack/react-query";

/**
 * Configured QueryClient for the application.
 * - staleTime: Data is fresh for 5 minutes before refetching on window focus.
 * - gcTime: Unused cache is garbage collected after 10 minutes.
 * - retry: Only retry once on failure.
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

// Query keys for cache invalidation
export const queryKeys = {
  inventory: ["inventory"] as const,
  lenderProfiles: ["lenderProfiles"] as const,
  savedDeals: ["savedDeals"] as const,
  dealerSettings: ["dealerSettings"] as const,
  systemStats: ["systemStats"] as const,
  dealers: ["dealers"] as const,
  users: ["users"] as const,
};
