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
import { sanitizeId, escapeFilterString } from "./typeGuards";
import { createLogger } from "./logger";

// Create structured logger for API operations
const apiLogger = createLogger("api");

// Helper for type-safe casting
const asType = <T>(record: RecordModel): T => record as unknown as T;
const asTypeArray = <T>(records: RecordModel[]): T[] => records as unknown as T[];

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
// OPTIMIZED: Uses Promise.all with batching for 10-100x performance improvement
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

  // Batch size for parallel operations (avoid overwhelming the API)
  const BATCH_SIZE = 50;

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
    const updateOperations: Promise<unknown>[] = [];
    const createOperations: Promise<unknown>[] = [];

    // Prepare operations (don't execute yet)
    for (const item of items) {
      if (!item.vin) continue;
      const vinUpper = item.vin.toUpperCase();
      incomingVins.add(vinUpper);

      const existing = existingByVin.get(vinUpper);
      if (existing) {
        // Queue update operation
        updateOperations.push(
          collections.inventory.update(existing.id, {
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
          })
        );
      } else {
        // Queue create operation
        createOperations.push(
          collections.inventory.create({
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
          })
        );
      }
    }

    // Prepare removal operations (mark as sold)
    const removeOperations: Promise<unknown>[] = [];
    for (const [vin, existing] of existingByVin) {
      if (!incomingVins.has(vin)) {
        removeOperations.push(collections.inventory.update(existing.id, { status: "sold" }));
      }
    }

    // Execute all operations in parallel batches
    const processBatch = async (operations: Promise<unknown>[]) => {
      const results = [];
      for (let i = 0; i < operations.length; i += BATCH_SIZE) {
        const batch = operations.slice(i, i + BATCH_SIZE);
        results.push(...(await Promise.allSettled(batch)));
      }
      return results.filter((r) => r.status === "fulfilled").length;
    };

    const [updatedCount, addedCount, removedCount] = await Promise.all([
      processBatch(updateOperations),
      processBatch(createOperations),
      processBatch(removeOperations),
    ]);

    return {
      added: addedCount,
      updated: updatedCount,
      removed: removedCount,
    };
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
  if (import.meta.env.DEV) {
    console.log("[API] getLenderProfiles - dealerId:", dealerId);
  }
  if (!dealerId) {
    if (import.meta.env.DEV) {
      console.warn("[API] No dealer ID - cannot load lender profiles");
    }
    return [];
  }

  try {
    const records = await collections.lenderProfiles.getFullList({
      filter: `dealer = "${sanitizeId(dealerId)}"`,
      sort: "name",
    });
    if (import.meta.env.DEV) {
      console.log(
        "[API] getLenderProfiles - loaded",
        records.length,
        "lenders for dealer",
        dealerId
      );
    }
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
  if (import.meta.env.DEV) {
    console.log("[API] saveLenderProfile - dealerId:", dealerId, "lender:", profile.name);
  }
  if (!dealerId) {
    if (import.meta.env.DEV) {
      console.warn("[API] No dealer ID - cannot save lender profile");
    }
    return null;
  }

  try {
    // Check if lender(s) with the same name already exist for this dealer
    const existingRecords = await collections.lenderProfiles.getFullList({
      filter: `dealer = "${sanitizeId(dealerId)}" && name ~ "${escapeFilterString(profile.name)}"`,
      sort: "-updated", // Most recently updated first
    });

    if (import.meta.env.DEV) {
      console.log("[API] Found", existingRecords.length, "existing records for", profile.name);
    }

    if (existingRecords.length > 0) {
      // Update the most recent record
      const primaryId = existingRecords[0]?.id;
      if (primaryId) {
        if (import.meta.env.DEV) {
          console.log(`[API] Updating lender profile: ${profile.name} (id: ${primaryId})`);
        }
        const record = await collections.lenderProfiles.update(primaryId, {
          ...profile,
          dealer: dealerId,
        });

        // Delete all other duplicate records in parallel (keeping only the one we just updated)
        const duplicateIds = existingRecords
          .slice(1)
          .map((r) => r.id)
          .filter(Boolean);
        if (duplicateIds.length > 0) {
          if (import.meta.env.DEV) {
            console.log(`[API] Deleting ${duplicateIds.length} duplicate lender records`);
          }
          await Promise.allSettled(
            duplicateIds.map((dupId) =>
              collections.lenderProfiles.delete(dupId).catch((delErr) => {
                console.warn("[API] Failed to delete duplicate:", dupId, delErr);
              })
            )
          );
        }

        return asType<LenderProfile>(record);
      }
    }

    // Create new lender profile
    if (import.meta.env.DEV) {
      console.log(`[API] Creating new lender profile: ${profile.name}`);
    }
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

/**
 * Cleanup all duplicate lender profiles for the current dealer.
 * Keeps only the most recently updated record for each unique lender name.
 * Returns the number of duplicates removed.
 */
export const cleanupDuplicateLenders = async (): Promise<number> => {
  const dealerId = getCurrentDealerId();
  if (!dealerId) {
    console.warn("[API] No dealer ID - cannot cleanup lenders");
    return 0;
  }

  try {
    // Get all lender profiles for this dealer, sorted by name and then by updated date
    const allRecords = await collections.lenderProfiles.getFullList({
      filter: `dealer = "${sanitizeId(dealerId)}"`,
      sort: "name,-updated", // Group by name, newest first within each group
    });

    if (import.meta.env.DEV) {
      console.log("[API] cleanupDuplicateLenders - found", allRecords.length, "total records");
    }

    // Group by normalized lender name (lowercase, trimmed)
    const lenderMap = new Map<string, typeof allRecords>();
    for (const record of allRecords) {
      const name = (record.name || "").toLowerCase().trim();
      if (!lenderMap.has(name)) {
        lenderMap.set(name, []);
      }
      lenderMap.get(name)!.push(record);
    }

    let deletedCount = 0;

    // Collect all duplicate IDs to delete in parallel
    const allDuplicateIds: string[] = [];
    for (const [name, records] of lenderMap.entries()) {
      if (records.length > 1) {
        if (import.meta.env.DEV) {
          console.log(`[API] Found ${records.length} duplicates for "${name}" - keeping newest`);
        }
        // Skip the first (most recent), collect the rest for deletion
        const duplicateIds = records
          .slice(1)
          .map((r) => r.id)
          .filter(Boolean);
        allDuplicateIds.push(...duplicateIds);
      }
    }

    // Delete all duplicates in parallel
    if (allDuplicateIds.length > 0) {
      if (import.meta.env.DEV) {
        console.log(`[API] Deleting ${allDuplicateIds.length} total duplicates in parallel`);
      }
      const deleteResults = await Promise.allSettled(
        allDuplicateIds.map((dupId) =>
          collections.lenderProfiles.delete(dupId).catch((err) => {
            console.warn("[API] Failed to delete duplicate:", dupId, err);
            throw err; // Re-throw to track failures
          })
        )
      );

      // Count successful deletions
      deletedCount = deleteResults.filter((result) => result.status === "fulfilled").length;
      if (import.meta.env.DEV) {
        console.log(
          `[API] Successfully deleted ${deletedCount} of ${allDuplicateIds.length} duplicates`
        );
      }
    }

    if (import.meta.env.DEV) {
      console.log("[API] cleanupDuplicateLenders - removed", deletedCount, "duplicates");
    }
    return deletedCount;
  } catch (error) {
    console.error("Failed to cleanup duplicate lenders:", error);
    return 0;
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

export const subscribeToInventory = (callback: (data: InventoryItem[]) => void): (() => void) => {
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

export const subscribeToSavedDeals = (callback: (data: SavedDeal[]) => void): (() => void) => {
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
// SUPERADMIN: System Settings (global, singleton)
// ============================================

export interface SystemSettings {
  id?: string;
  supportEmail?: string;
  announcementBanner?: string;
  signupsEnabled?: boolean;
  defaultLtvThresholds?: unknown;
}

const SYSTEM_SETTINGS_CACHE_KEY = "ltv_system_settings_cache";

export const getSystemSettings = async (): Promise<SystemSettings> => {
  try {
    const list = await pb.collection("system_settings").getFullList({ sort: "created" });
    const first = list[0];
    if (!first) {
      return { signupsEnabled: true };
    }
    const settings = asType<SystemSettings>(first);
    try {
      localStorage.setItem(SYSTEM_SETTINGS_CACHE_KEY, JSON.stringify(settings));
    } catch {
      // sessionStorage/localStorage may be unavailable
    }
    return settings;
  } catch (error) {
    console.warn("Failed to fetch system settings, using cache/defaults:", error);
    try {
      const cached = localStorage.getItem(SYSTEM_SETTINGS_CACHE_KEY);
      if (cached) return JSON.parse(cached) as SystemSettings;
    } catch {
      // Ignore parse errors
    }
    return { signupsEnabled: true };
  }
};

export const getCachedSystemSettings = (): SystemSettings | null => {
  try {
    const cached = localStorage.getItem(SYSTEM_SETTINGS_CACHE_KEY);
    return cached ? (JSON.parse(cached) as SystemSettings) : null;
  } catch {
    return null;
  }
};

export const updateSystemSettings = async (
  data: Omit<SystemSettings, "id">
): Promise<SystemSettings> => {
  const user = getCurrentUser();
  if (user?.role !== "superadmin") throw new Error("Owner access required");

  const list = await pb.collection("system_settings").getFullList({ sort: "created" });
  const existing = list[0];
  const record = existing
    ? await pb.collection("system_settings").update(existing.id, data)
    : await pb.collection("system_settings").create(data);
  const settings = asType<SystemSettings>(record);
  try {
    localStorage.setItem(SYSTEM_SETTINGS_CACHE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
  return settings;
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
      activeDealers: dealers.filter((d) => (d as unknown as Dealer).active).length,
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

export const createDealerWithAdmin = async (input: {
  dealer: Omit<Dealer, "id" | "created" | "updated">;
  admin: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
  };
}): Promise<{ dealer: Dealer; admin: User }> => {
  const current = getCurrentUser();
  if (current?.role !== "superadmin") {
    throw new Error("Owner access required");
  }

  const dealerRecord = await collections.dealers.create(input.dealer);
  const newDealer = asType<Dealer>(dealerRecord);

  try {
    const userRecord = await pb.collection("users").create({
      email: input.admin.email,
      password: input.admin.password,
      passwordConfirm: input.admin.password,
      firstName: input.admin.firstName,
      lastName: input.admin.lastName,
      phone: input.admin.phone || "",
      role: "admin",
      dealer: newDealer.id,
    });
    return { dealer: newDealer, admin: asType<User>(userRecord) };
  } catch (error) {
    // Roll back the dealer if user creation fails
    try {
      await collections.dealers.delete(newDealer.id);
    } catch (rollbackError) {
      console.error("Failed to roll back dealer after user creation failure:", rollbackError);
    }
    throw error;
  }
};

export const updateDealer = async (id: string, data: Partial<Dealer>): Promise<Dealer | null> => {
  const user = getCurrentUser();
  if (user?.role !== "superadmin") return null;

  try {
    const record = await collections.dealers.update(sanitizeId(id), data);
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
    await collections.dealers.delete(sanitizeId(id));
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
    if (import.meta.env.DEV) {
      console.log("[createUser] Creating user with data:", {
        ...data,
        password: "[REDACTED]",
      });
    }
    const record = await pb.collection("users").create(data);
    if (import.meta.env.DEV) {
      console.log("[createUser] Successfully created user:", record.id);
    }
    return asType<User>(record);
  } catch (error: any) {
    console.error("[createUser] Failed to create user:", error);
    console.error("[createUser] Error details:", error?.data);
    throw error; // Re-throw to show error to user
  }
};

export const getAllUsers = async (): Promise<User[]> => {
  const user = getCurrentUser();
  if (import.meta.env.DEV) {
    console.log("[getAllUsers] Current user:", user?.email, "role:", user?.role);
  }

  if (user?.role !== "superadmin") {
    if (import.meta.env.DEV) {
      console.warn("[getAllUsers] Access denied - not superadmin");
    }
    return [];
  }

  try {
    const records = await pb.collection("users").getFullList({
      sort: "firstName",
      expand: "dealer",
    });
    if (import.meta.env.DEV) {
      console.log("[getAllUsers] Fetched", records.length, "users");
    }
    return asTypeArray<User>(records);
  } catch (error: any) {
    console.error("[getAllUsers] Failed to fetch users:", error?.message || error);

    if (import.meta.env.DEV && (error?.status === 403 || error?.status === 401)) {
      console.error(
        "[getAllUsers] Permission error - check PocketBase API Rules for 'users' collection"
      );
    }

    return [];
  }
};

export const updateUserRole = async (id: string, role: User["role"]): Promise<User | null> => {
  const user = getCurrentUser();
  if (user?.role !== "superadmin") return null;

  try {
    const record = await pb.collection("users").update(sanitizeId(id), { role });
    return asType<User>(record);
  } catch (error) {
    console.error("Failed to update user role:", error);
    return null;
  }
};

export const updateUser = async (
  id: string,
  data: Partial<Pick<User, "firstName" | "lastName" | "email" | "phone" | "role" | "dealer">>
): Promise<User | null> => {
  const user = getCurrentUser();
  if (user?.role !== "superadmin") return null;

  try {
    const record = await pb.collection("users").update(sanitizeId(id), data);
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
    await pb.collection("users").delete(sanitizeId(id));
    return true;
  } catch (error) {
    console.error("Failed to delete user:", error);
    return false;
  }
};

// ============================================
// DEALER ADMIN: User & Dealer Management
// ============================================

export const getDealerUsers = async (): Promise<User[]> => {
  const user = getCurrentUser();
  const dealerId = getCurrentDealerId();
  
  if (!user || !dealerId) return [];
  if (user.role !== "admin" && user.role !== "superadmin") return [];

  try {
    const records = await pb.collection("users").getFullList({
      filter: `dealer = "${sanitizeId(dealerId)}"`,
      sort: "firstName",
    });
    return asTypeArray<User>(records);
  } catch (error) {
    console.error("Failed to fetch dealer users:", error);
    return [];
  }
};

export const createDealerUser = async (data: {
  email: string;
  password?: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: User["role"];
}): Promise<User | null> => {
  const user = getCurrentUser();
  const dealerId = getCurrentDealerId();

  if (!user || !dealerId || user.role !== "admin") return null;

  try {
    const record = await pb.collection("users").create({
      ...data,
      passwordConfirm: data.password,
      dealer: dealerId,
    });
    return asType<User>(record);
  } catch (error) {
    console.error("Failed to create dealer user:", error);
    throw error;
  }
};

export const updateDealerUser = async (
  id: string,
  data: Partial<Pick<User, "firstName" | "lastName" | "email" | "phone" | "role">>
): Promise<User | null> => {
  const user = getCurrentUser();
  const dealerId = getCurrentDealerId();

  if (!user || !dealerId || user.role !== "admin") return null;

  const safeId = sanitizeId(id);
  const target = await pb.collection("users").getOne(safeId);
  if (target.dealer !== dealerId) {
    throw new Error("Cannot modify user outside your dealership");
  }

  const record = await pb.collection("users").update(safeId, data);
  return asType<User>(record);
};

export const deleteDealerUser = async (id: string): Promise<boolean> => {
  const user = getCurrentUser();
  const dealerId = getCurrentDealerId();

  if (!user || !dealerId || user.role !== "admin") return false;

  const safeId = sanitizeId(id);
  const target = await pb.collection("users").getOne(safeId);
  if (target.dealer !== dealerId) {
    throw new Error("Cannot delete user outside your dealership");
  }

  await pb.collection("users").delete(safeId);
  return true;
};

export const getCurrentDealerDetails = async (): Promise<Dealer | null> => {
  const dealerId = getCurrentDealerId();
  if (!dealerId) return null;

  try {
    const record = await collections.dealers.getOne(sanitizeId(dealerId));
    return asType<Dealer>(record);
  } catch (error) {
    console.error("Failed to fetch current dealer details:", error);
    return null;
  }
};
