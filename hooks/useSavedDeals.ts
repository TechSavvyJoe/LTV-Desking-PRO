import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSavedDeals, saveDeal, updateDeal, deleteDeal } from "../lib/api";
import { queryKeys } from "../lib/queryClient";
import type { SavedDeal } from "../lib/pocketbase";

/**
 * Hook to fetch saved deals with caching.
 */
export const useSavedDeals = () => {
  return useQuery({
    queryKey: queryKeys.savedDeals,
    queryFn: getSavedDeals,
  });
};

/**
 * Hook to save a new deal.
 */
export const useSaveDeal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveDeal,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.savedDeals });
    },
  });
};

/**
 * Hook to update an existing deal.
 */
export const useUpdateDeal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<SavedDeal> }) => updateDeal(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.savedDeals });
    },
  });
};

/**
 * Hook to delete a deal.
 */
export const useDeleteDeal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteDeal,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.savedDeals });
    },
  });
};
