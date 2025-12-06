import {
  pb,
  collections,
  InventoryItem,
  LenderProfile,
  SavedDeal,
  DealerSettings,
  Dealer,
  User,
  getCurrentDealerId,
  getCurrentUser,
} from "./pocketbase";
import type { RecordModel } from "pocketbase";
import { sanitizeId } from "./typeGuards";

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
      filter: `dealer = "${sanitizeId(dealerId)}"`,
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

// Bulk sync inventory - updates existing items by VIN, adds new ones, removes stale ones
export const syncInventory = async (
  items: Array<{
    vin: string;
    stockNumber?: string;
    year: number;
    make: string;
    model: string;
    trim?: string;
    mileage?: number;
    price: number;
    unitCost?: number;
    jdPower?: number;
    jdPowerRetail?: number;
  }>
): Promise<{ added: number; updated: number; removed: number }> => {
  const dealerId = getCurrentDealerId();
  if (!dealerId) return { added: 0, updated: 0, removed: 0 };

  try {
    // Get existing inventory for this dealer
    const existingRecords = await collections.inventory.getFullList({
      filter: `dealer = "${sanitizeId(dealerId)}"`,
    });

    const existingByVin = new Map<string, InventoryItem>();
    for (const record of existingRecords) {
      const item = asType<InventoryItem>(record);
      if (item.vin) {
        existingByVin.set(item.vin.toUpperCase(), item);
      }
    }

    const incomingVins = new Set<string>();
    let added = 0;
    let updated = 0;

    // Process incoming items
    for (const item of items) {
      if (!item.vin) continue;
      const vinUpper = item.vin.toUpperCase();
      incomingVins.add(vinUpper);

      const existing = existingByVin.get(vinUpper);
      if (existing) {
        // Update existing item
        await collections.inventory.update(existing.id, {
          stockNumber: item.stockNumber,
          year: item.year,
          make: item.make,
          model: item.model,
          trim: item.trim,
          mileage: item.mileage,
          price: item.price,
          unitCost: item.unitCost,
          jdPower: item.jdPower,
          jdPowerRetail: item.jdPowerRetail,
          status: "available",
        });
        updated++;
      } else {
        // Add new item
        await collections.inventory.create({
          dealer: dealerId,
          vin: item.vin,
          stockNumber: item.stockNumber,
          year: item.year,
          make: item.make,
          model: item.model,
          trim: item.trim,
          mileage: item.mileage,
          price: item.price,
          unitCost: item.unitCost,
          jdPower: item.jdPower,
          jdPowerRetail: item.jdPowerRetail,
          status: "available",
        });
        added++;
      }
    }

    // Remove items no longer in upload (mark as sold or delete)
    let removed = 0;
    for (const [vin, existing] of existingByVin) {
      if (!incomingVins.has(vin)) {
        // Mark as sold instead of deleting to preserve history
        await collections.inventory.update(existing.id, { status: "sold" });
        removed++;
      }
    }

    return { added, updated, removed };
  } catch (error) {
    console.error("Failed to sync inventory:", error);
    return { added: 0, updated: 0, removed: 0 };
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
      filter: `dealer = "${sanitizeId(dealerId)}"`,
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
      filter: `dealer = "${sanitizeId(dealerId)}"`,
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
      filter: `dealer = "${sanitizeId(dealerId)}"`,
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

// ============================================
// SUPERADMIN: System Stats
// ============================================

export interface SystemStats {
  totalDealers: number;
  activeDealers: number;
  totalUsers: number;
  totalDeals: number;
  totalInventory: number;
}

export const getSystemStats = async (): Promise<SystemStats> => {
  const user = getCurrentUser();
  if (user?.role !== "superadmin") {
    return {
      totalDealers: 0,
      activeDealers: 0,
      totalUsers: 0,
      totalDeals: 0,
      totalInventory: 0,
    };
  }

  try {
    const [dealers, users, deals, inventory] = await Promise.all([
      collections.dealers.getFullList(),
      pb.collection("users").getFullList(),
      collections.savedDeals.getFullList(),
      collections.inventory.getFullList(),
    ]);

    return {
      totalDealers: dealers.length,
      activeDealers: dealers.filter((d) => (d as unknown as Dealer).active)
        .length,
      totalUsers: users.length,
      totalDeals: deals.length,
      totalInventory: inventory.length,
    };
  } catch (error) {
    console.error("Failed to fetch system stats:", error);
    return {
      totalDealers: 0,
      activeDealers: 0,
      totalUsers: 0,
      totalDeals: 0,
      totalInventory: 0,
    };
  }
};

// ============================================
// SUPERADMIN: Dealer Management
// ============================================

export const getAllDealers = async (): Promise<Dealer[]> => {
  const user = getCurrentUser();
  if (user?.role !== "superadmin") return [];

  try {
    const records = await collections.dealers.getFullList({
      sort: "name",
    });
    return asTypeArray<Dealer>(records);
  } catch (error) {
    console.error("Failed to fetch dealers:", error);
    return [];
  }
};

export const createDealer = async (
  data: Omit<Dealer, "id" | "created" | "updated">
): Promise<Dealer | null> => {
  const user = getCurrentUser();
  if (user?.role !== "superadmin") return null;

  try {
    const record = await collections.dealers.create(data);
    return asType<Dealer>(record);
  } catch (error) {
    console.error("Failed to create dealer:", error);
    return null;
  }
};

export const updateDealer = async (
  id: string,
  data: Partial<Dealer>
): Promise<Dealer | null> => {
  const user = getCurrentUser();
  if (user?.role !== "superadmin") return null;

  try {
    const record = await collections.dealers.update(id, data);
    return asType<Dealer>(record);
  } catch (error) {
    console.error("Failed to update dealer:", error);
    return null;
  }
};

export const deleteDealer = async (id: string): Promise<boolean> => {
  const user = getCurrentUser();
  if (user?.role !== "superadmin") return false;

  try {
    await collections.dealers.delete(id);
    return true;
  } catch (error) {
    console.error("Failed to delete dealer:", error);
    return false;
  }
};

// ============================================
// SUPERADMIN: User Management
// ============================================

export const createUser = async (data: {
  email: string;
  password: string;
  passwordConfirm: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: User["role"];
  dealer: string;
}): Promise<User | null> => {
  const user = getCurrentUser();
  if (user?.role !== "superadmin") {
    console.error("[createUser] Access denied - not superadmin");
    return null;
  }

  try {
    console.log("[createUser] Creating user with data:", {
      ...data,
      password: "[REDACTED]",
    });
    const record = await pb.collection("users").create(data);
    console.log("[createUser] Successfully created user:", record.id);
    return asType<User>(record);
  } catch (error: any) {
    console.error("[createUser] Failed to create user:", error);
    console.error("[createUser] Error details:", error?.data);
    throw error; // Re-throw to show error to user
  }
};

export const getAllUsers = async (): Promise<User[]> => {
  const user = getCurrentUser();
  console.log("[getAllUsers] Current user:", user);
  console.log("[getAllUsers] User role:", user?.role);
  console.log("[getAllUsers] Role type:", typeof user?.role);
  console.log("[getAllUsers] Role exact check:", user?.role === "superadmin");

  if (user?.role !== "superadmin") {
    console.warn(
      "[getAllUsers] Access denied - user role is not superadmin. Role value:",
      JSON.stringify(user?.role)
    );
    return [];
  }

  try {
    console.log("[getAllUsers] Attempting to fetch users from PocketBase...");
    const records = await pb.collection("users").getFullList({
      sort: "firstName",
      expand: "dealer",
    });
    console.log("[getAllUsers] SUCCESS! Fetched", records.length, "users");
    console.log(
      "[getAllUsers] User records:",
      records.map((r) => ({
        id: r.id,
        email: r.email,
        firstName: r.firstName,
        role: r.role,
      }))
    );
    return asTypeArray<User>(records);
  } catch (error: any) {
    console.error("[getAllUsers] FAILED to fetch users!");
    console.error("[getAllUsers] Error name:", error?.name);
    console.error("[getAllUsers] Error message:", error?.message);
    console.error("[getAllUsers] Error status:", error?.status);
    console.error("[getAllUsers] Full error:", error);

    // Check if it's a permission error
    if (error?.status === 403 || error?.status === 401) {
      console.error(
        "[getAllUsers] This is a PERMISSION error - check PocketBase API Rules for 'users' collection"
      );
      console.error(
        "[getAllUsers] The 'List' rule needs to allow superadmins to see all users"
      );
    }

    return [];
  }
};

export const updateUserRole = async (
  id: string,
  role: User["role"]
): Promise<User | null> => {
  const user = getCurrentUser();
  if (user?.role !== "superadmin") return null;

  try {
    const record = await pb.collection("users").update(id, { role });
    return asType<User>(record);
  } catch (error) {
    console.error("Failed to update user role:", error);
    return null;
  }
};

export const updateUser = async (
  id: string,
  data: Partial<
    Pick<User, "firstName" | "lastName" | "email" | "phone" | "role" | "dealer">
  >
): Promise<User | null> => {
  const user = getCurrentUser();
  if (user?.role !== "superadmin") return null;

  try {
    const record = await pb.collection("users").update(id, data);
    return asType<User>(record);
  } catch (error) {
    console.error("Failed to update user:", error);
    return null;
  }
};

export const deleteUser = async (id: string): Promise<boolean> => {
  const user = getCurrentUser();
  if (user?.role !== "superadmin") return false;

  try {
    await pb.collection("users").delete(id);
    return true;
  } catch (error) {
    console.error("Failed to delete user:", error);
    return false;
  }
};
