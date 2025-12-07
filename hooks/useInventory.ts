import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getInventory,
  syncInventory,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
} from "../lib/api";
import { queryKeys } from "../lib/queryClient";
import type { InventoryItem } from "../lib/pocketbase";

/**
 * Hook to fetch inventory items with caching.
 */
export const useInventory = () => {
  return useQuery({
    queryKey: queryKeys.inventory,
    queryFn: getInventory,
  });
};

/**
 * Hook to sync inventory from CSV upload.
 */
export const useSyncInventory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: syncInventory,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.inventory });
    },
  });
};

/**
 * Hook to add a new inventory item.
 */
export const useAddInventoryItem = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: addInventoryItem,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.inventory });
    },
  });
};

/**
 * Hook to update an inventory item.
 */
export const useUpdateInventoryItem = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InventoryItem> }) =>
      updateInventoryItem(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.inventory });
    },
  });
};

/**
 * Hook to delete an inventory item.
 */
export const useDeleteInventoryItem = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteInventoryItem,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.inventory });
    },
  });
};
