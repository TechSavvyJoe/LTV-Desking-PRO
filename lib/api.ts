import {
  pb,
  collections,
  InventoryItem,
  LenderProfile,
  SavedDeal,
  DealerSettings,
  getCurrentDealerId,
} from "./pocketbase";
import type { RecordModel } from "pocketbase";

// Helper for type-safe casting
const asType = <T>(record: RecordModel): T => record as unknown as T;
const asTypeArray = <T>(records: RecordModel[]): T[] =>
  records as unknown as T[];

// ============================================
// INVENTORY OPERATIONS
// ============================================

export const getInventory = async (): Promise<InventoryItem[]> => {
  const dealerId = getCurrentDealerId();
  if (!dealerId) return [];

  try {
    const records = await collections.inventory.getFullList({
      filter: `dealer = "${dealerId}"`,
      sort: "-created",
    });
    return asTypeArray<InventoryItem>(records);
  } catch (error) {
    console.error("Failed to fetch inventory:", error);
    return [];
  }
};

export const addInventoryItem = async (
  item: Omit<InventoryItem, "id" | "dealer" | "created" | "updated">
): Promise<InventoryItem | null> => {
  const dealerId = getCurrentDealerId();
  if (!dealerId) return null;

  try {
    const record = await collections.inventory.create({
      ...item,
      dealer: dealerId,
    });
    return asType<InventoryItem>(record);
  } catch (error) {
    console.error("Failed to add inventory item:", error);
    return null;
  }
};

export const updateInventoryItem = async (
  id: string,
  data: Partial<InventoryItem>
): Promise<InventoryItem | null> => {
  try {
    const record = await collections.inventory.update(id, data);
    return asType<InventoryItem>(record);
  } catch (error) {
    console.error("Failed to update inventory item:", error);
    return null;
  }
};

export const deleteInventoryItem = async (id: string): Promise<boolean> => {
  try {
    await collections.inventory.delete(id);
    return true;
  } catch (error) {
    console.error("Failed to delete inventory item:", error);
    return false;
  }
};

// ============================================
// LENDER PROFILES OPERATIONS
// ============================================

export const getLenderProfiles = async (): Promise<LenderProfile[]> => {
  const dealerId = getCurrentDealerId();
  if (!dealerId) return [];

  try {
    const records = await collections.lenderProfiles.getFullList({
      filter: `dealer = "${dealerId}"`,
      sort: "name",
    });
    return asTypeArray<LenderProfile>(records);
  } catch (error) {
    console.error("Failed to fetch lender profiles:", error);
    return [];
  }
};

export const saveLenderProfile = async (
  profile: Omit<LenderProfile, "id" | "dealer" | "created" | "updated">
): Promise<LenderProfile | null> => {
  const dealerId = getCurrentDealerId();
  if (!dealerId) return null;

  try {
    const record = await collections.lenderProfiles.create({
      ...profile,
      dealer: dealerId,
    });
    return asType<LenderProfile>(record);
  } catch (error) {
    console.error("Failed to save lender profile:", error);
    return null;
  }
};

export const updateLenderProfile = async (
  id: string,
  data: Partial<LenderProfile>
): Promise<LenderProfile | null> => {
  try {
    const record = await collections.lenderProfiles.update(id, data);
    return asType<LenderProfile>(record);
  } catch (error) {
    console.error("Failed to update lender profile:", error);
    return null;
  }
};

export const deleteLenderProfile = async (id: string): Promise<boolean> => {
  try {
    await collections.lenderProfiles.delete(id);
    return true;
  } catch (error) {
    console.error("Failed to delete lender profile:", error);
    return false;
  }
};

// ============================================
// SAVED DEALS OPERATIONS
// ============================================

export const getSavedDeals = async (): Promise<SavedDeal[]> => {
  const dealerId = getCurrentDealerId();
  if (!dealerId) return [];

  try {
    const records = await collections.savedDeals.getFullList({
      filter: `dealer = "${dealerId}"`,
      sort: "-created",
      expand: "user,vehicle",
    });
    return asTypeArray<SavedDeal>(records);
  } catch (error) {
    console.error("Failed to fetch saved deals:", error);
    return [];
  }
};

export const saveDeal = async (
  deal: Omit<SavedDeal, "id" | "dealer" | "user" | "created" | "updated">
): Promise<SavedDeal | null> => {
  const dealerId = getCurrentDealerId();
  const userId = pb.authStore.model?.id;
  if (!dealerId || !userId) return null;

  try {
    const record = await collections.savedDeals.create({
      ...deal,
      dealer: dealerId,
      user: userId,
    });
    return asType<SavedDeal>(record);
  } catch (error) {
    console.error("Failed to save deal:", error);
    return null;
  }
};

export const updateDeal = async (
  id: string,
  data: Partial<SavedDeal>
): Promise<SavedDeal | null> => {
  try {
    const record = await collections.savedDeals.update(id, data);
    return asType<SavedDeal>(record);
  } catch (error) {
    console.error("Failed to update deal:", error);
    return null;
  }
};

export const deleteDeal = async (id: string): Promise<boolean> => {
  try {
    await collections.savedDeals.delete(id);
    return true;
  } catch (error) {
    console.error("Failed to delete deal:", error);
    return false;
  }
};

// ============================================
// DEALER SETTINGS OPERATIONS
// ============================================

export const getDealerSettings = async (): Promise<DealerSettings | null> => {
  const dealerId = getCurrentDealerId();
  if (!dealerId) return null;

  try {
    const records = await collections.dealerSettings.getList(1, 1, {
      filter: `dealer = "${dealerId}"`,
    });
    return records.items[0] ? asType<DealerSettings>(records.items[0]) : null;
  } catch (error) {
    console.error("Failed to fetch dealer settings:", error);
    return null;
  }
};

export const updateDealerSettings = async (
  data: Partial<DealerSettings>
): Promise<DealerSettings | null> => {
  const dealerId = getCurrentDealerId();
  if (!dealerId) return null;

  try {
    const existing = await getDealerSettings();

    if (existing) {
      const record = await collections.dealerSettings.update(existing.id, data);
      return asType<DealerSettings>(record);
    } else {
      const record = await collections.dealerSettings.create({
        ...data,
        dealer: dealerId,
      });
      return asType<DealerSettings>(record);
    }
  } catch (error) {
    console.error("Failed to update dealer settings:", error);
    return null;
  }
};

// ============================================
// REAL-TIME SUBSCRIPTIONS
// ============================================

export const subscribeToInventory = (
  callback: (data: InventoryItem[]) => void
): (() => void) => {
  const dealerId = getCurrentDealerId();
  if (!dealerId) return () => {};

  getInventory().then(callback);

  collections.inventory.subscribe("*", async () => {
    const data = await getInventory();
    callback(data);
  });

  return () => {
    collections.inventory.unsubscribe("*");
  };
};

export const subscribeToSavedDeals = (
  callback: (data: SavedDeal[]) => void
): (() => void) => {
  const dealerId = getCurrentDealerId();
  if (!dealerId) return () => {};

  getSavedDeals().then(callback);

  collections.savedDeals.subscribe("*", async () => {
    const data = await getSavedDeals();
    callback(data);
  });

  return () => {
    collections.savedDeals.unsubscribe("*");
  };
};
