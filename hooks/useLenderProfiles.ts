import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getLenderProfiles,
  saveLenderProfile,
  updateLenderProfile,
  deleteLenderProfile,
} from "../lib/api";
import { queryKeys } from "../lib/queryClient";
import type { LenderProfile } from "../lib/pocketbase";

/**
 * Hook to fetch lender profiles with caching.
 */
export const useLenderProfiles = () => {
  return useQuery({
    queryKey: queryKeys.lenderProfiles,
    queryFn: getLenderProfiles,
  });
};

/**
 * Hook to save a new lender profile.
 */
export const useSaveLenderProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveLenderProfile,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lenderProfiles });
    },
  });
};

/**
 * Hook to update an existing lender profile.
 */
export const useUpdateLenderProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<LenderProfile> }) =>
      updateLenderProfile(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lenderProfiles });
    },
  });
};

/**
 * Hook to delete a lender profile.
 */
export const useDeleteLenderProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteLenderProfile,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lenderProfiles });
    },
  });
};
