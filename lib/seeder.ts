import { addInventoryItem, saveLenderProfile, getInventory, getLenderProfiles } from "./api";
import { SAMPLE_INVENTORY, DEFAULT_LENDER_PROFILES } from "../constants";
import { toast } from "./toast";

import { getCurrentDealerId, type InventoryItem } from "./pocketbase";

/**
 * Seed the database with sample inventory and lender profiles.
 *
 * Development-only [C12]: throws outside dev builds so demo data can never be
 * injected into a production tenant. Verifies every insert (the api helpers
 * return null on failure) and throws if nothing could be created, instead of
 * the previous false-success where every failed insert was still counted.
 */
export const seedDatabase = async (): Promise<void> => {
  if (!import.meta.env.DEV) {
    throw new Error("Seeding is only available in development builds.");
  }

  const dealerId = getCurrentDealerId();
  console.log("Seeding Database. Current Dealer ID:", dealerId);
  if (!dealerId) {
    throw new Error("No Dealer ID found. Cannot seed.");
  }

  let attempted = 0;
  let succeeded = 0;

  // 1. Seed Inventory
  const currentInventory = await getInventory();
  if (currentInventory.length === 0) {
    console.log("Seeding inventory...");
    let inventoryOk = 0;
    for (const vehicle of SAMPLE_INVENTORY) {
      // Strip the optional sample `id` field; PB generates IDs server-side.
      // The rest of the Vehicle shape matches InventoryItem's create input.
      const { id: _id, ...vehicleData } = vehicle;
      void _id;
      attempted++;
      const seedItem: Omit<InventoryItem, "id" | "dealer" | "created" | "updated"> = {
        ...vehicleData,
        make: vehicle.make || "Unknown",
        model: vehicle.model || "Unknown",
        status: "available" as const,
        year: typeof vehicle.modelYear === "number" ? vehicle.modelYear : 2020,
        price: typeof vehicle.price === "number" ? vehicle.price : 0,
        modelYear: typeof vehicle.modelYear === "number" ? vehicle.modelYear : undefined,
        mileage: typeof vehicle.mileage === "number" ? vehicle.mileage : 0,
        unitCost: typeof vehicle.unitCost === "number" ? vehicle.unitCost : 0,
        jdPower: typeof vehicle.jdPower === "number" ? vehicle.jdPower : 0,
        jdPowerRetail: typeof vehicle.jdPowerRetail === "number" ? vehicle.jdPowerRetail : 0,
        baseOutTheDoorPrice: undefined,
      };
      const created = await addInventoryItem(seedItem);
      if (created !== null) {
        inventoryOk++;
        succeeded++;
      }
    }
    const inventoryFailed = SAMPLE_INVENTORY.length - inventoryOk;
    if (inventoryFailed > 0) {
      toast.warning(
        `Seeded ${inventoryOk} of ${SAMPLE_INVENTORY.length} vehicles (${inventoryFailed} failed).`
      );
    } else {
      toast.success(`Seeded ${inventoryOk} vehicles.`);
    }
  } else {
    console.log("Inventory already has data. Skipping seed.");
  }

  // 2. Seed Lender Profiles
  const currentProfiles = await getLenderProfiles();
  if (currentProfiles.length === 0) {
    console.log("Seeding lender profiles...");
    let profileOk = 0;
    for (const profile of DEFAULT_LENDER_PROFILES) {
      // Strip the hardcoded string IDs so PB generates them.
      // PB IDs must be 15 chars; ours are like "ford", so 'id' must go.
      const { id: _profileId, ...profileData } = profile;
      void _profileId;
      attempted++;
      const saved = await saveLenderProfile({
        ...profileData,
        active: true, // Default active for seed data
      });
      if (saved !== null) {
        profileOk++;
        succeeded++;
      }
    }
    const profilesFailed = DEFAULT_LENDER_PROFILES.length - profileOk;
    if (profilesFailed > 0) {
      toast.warning(
        `Seeded ${profileOk} of ${DEFAULT_LENDER_PROFILES.length} lender profiles (${profilesFailed} failed).`
      );
    } else {
      toast.success(`Seeded ${profileOk} lender profiles.`);
    }
  } else {
    console.log("Lender profiles already have data. Skipping seed.");
  }

  if (attempted > 0 && succeeded === 0) {
    throw new Error("Seeding failed: no records could be created. Check the console for details.");
  }
};
