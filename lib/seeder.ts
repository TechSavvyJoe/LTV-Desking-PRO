import { addInventoryItem, saveLenderProfile, getInventory, getLenderProfiles } from "./api";
import { SAMPLE_INVENTORY, DEFAULT_LENDER_PROFILES } from "../constants";
import { toast } from "./toast";

import { getCurrentDealerId, type InventoryItem } from "./pocketbase";

export const seedDatabase = async () => {
  try {
    // 1. Seed Inventory
    const dealerId = getCurrentDealerId();
    console.log("Seeding Database. Current Dealer ID:", dealerId);

    if (!dealerId) {
      toast.error("Error: No Dealer ID found. Cannot seed.");
      return;
    }

    const currentInventory = await getInventory();
    if (currentInventory.length === 0) {
      console.log("Seeding inventory...");
      let inventoryCount = 0;
      for (const vehicle of SAMPLE_INVENTORY) {
        // Strip the optional sample `id` field; PB generates IDs server-side.
        // The rest of the Vehicle shape matches InventoryItem's create input.
        const { id: _id, ...vehicleData } = vehicle;
        void _id;
        await addInventoryItem(
          vehicleData as Omit<InventoryItem, "id" | "dealer" | "created" | "updated">
        );
        inventoryCount++;
      }
      toast.success(`Seeded ${inventoryCount} vehicles.`);
    } else {
      console.log("Inventory already has data. Skipping seed.");
    }

    // 2. Seed Lender Profiles
    const currentProfiles = await getLenderProfiles();
    if (currentProfiles.length === 0) {
      console.log("Seeding lender profiles...");
      let profileCount = 0;
      for (const profile of DEFAULT_LENDER_PROFILES) {
        // Strip the hardcoded string IDs so PB generates them,
        // OR keep them if we want consistent IDs (PB allows custom IDs if they are 15 chars, but ours are like "ford")
        // PB IDs must be 15 chars. "ford" is too short. We must strip 'id'.
        const { id, ...profileData } = profile;
        await saveLenderProfile({
          ...profileData,
          active: true, // Default active for seed data
        });
        profileCount++;
      }
      toast.success(`Seeded ${profileCount} lender profiles.`);
    } else {
      console.log("Lender profiles already have data. Skipping seed.");
    }
  } catch (error: any) {
    console.error("Database seeding failed:", error);
    console.error("Error Details:", error.message, error.data);
    toast.error("Failed to seed database: " + error.message);
  }
};
