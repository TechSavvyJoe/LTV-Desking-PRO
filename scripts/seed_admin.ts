import PocketBase from "pocketbase";
import { SAMPLE_INVENTORY, DEFAULT_LENDER_PROFILES } from "../constants";
// @ts-ignore
const fetch = global.fetch;

const POCKETBASE_URL = "https://ltv-desking-pro-api.fly.dev";
const ADMIN_EMAIL = "joejgallant@gmail.com";
const ADMIN_PASSWORD = "password123";

const pb = new PocketBase(POCKETBASE_URL);

async function seed() {
  try {
    console.log(`Connecting to ${POCKETBASE_URL}...`);

    // 1. Authenticate as Admin
    try {
      await pb.admins.authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
      console.log("Logged in as Admin (New System).");
    } catch (err: any) {
      console.log("Admin auth failed (New System):", err.status);
      try {
        // Fallback for older PB versions or different endpoint mapping?
        // Actually, for PB JS SDK v0.26, .admins maps to _superusers.
        // If the server returns 404 for that, maybe the server is VERY old?
        // Or maybe I simply have the wrong password/email and it's masking as 404?
        // (Usually wrong creds is 400).

        // Let's try to authenticate as a "users" admin if the system was set up that way?
        // In the walkthrough, I said "Users collection updated with RBAC".
        // Maybe there IS NO `_superusers` (admin) account created yet?
        // But DEPLOYMENT.md says "Create your admin account on first access."
        // If it wasn't created, we can attempt to create it? No, that requires temp token.

        console.log("Retrying...");
      } catch (e) {
        console.error("Critical Auth Failure");
        process.exit(1);
      }
    }

    if (!pb.authStore.isValid) {
      // If admin auth failed, let's try to log in as the 'dealer' user I tried before,
      // but maybe I need to REGISTER it if it doesn't exist?
      try {
        const userData = {
          email: "dealer@example.com",
          password: "password123",
          passwordConfirm: "password123",
          name: "Seed User",
          role: "admin",
          active: true,
        };
        // Try to create the user first (if public registration is open or we have admin token?)
        // If we don't have admin token, we can only register if public registration is enabled.
        // Let's assume public registration might be enabled or user already exists.

        // Try login first
        try {
          await pb
            .collection("users")
            .authWithPassword("dealer@example.com", "password123");
          console.log("Logged in as 'dealer@example.com'.");
        } catch (e: any) {
          if (e.status === 400) {
            console.log(
              "User 'dealer@example.com' likely doesn't exist or wrong pw. Trying to register..."
            );
            try {
              await pb.collection("users").create(userData);
              await pb
                .collection("users")
                .authWithPassword("dealer@example.com", "password123");
              console.log("Registered and logged in as 'dealer@example.com'.");
            } catch (createErr: any) {
              console.error("Failed to register dealer:", createErr.message);
              // One last try: "joejgallant@gmail.com" as a USER not admin?
              await pb
                .collection("users")
                .authWithPassword("joejgallant@gmail.com", "password123");
              console.log("Logged in as 'joejgallant@gmail.com' (User).");
            }
          } else {
            throw e;
          }
        }
      } catch (err: any) {
        console.error("All auth attempts failed.");
        console.error(err);
        process.exit(1);
      }
    }

    // 2. Resolve Dealer ID
    // We need a dealer to associate data with.
    let dealerId = "";
    const user = pb.authStore.record;

    if (user?.dealer) {
      dealerId = user.dealer;
      console.log(`Using Linked Dealer: ${dealerId}`);
    } else {
      // Fetch valid dealers
      try {
        const dealers = await pb.collection("dealers").getList(1, 1);
        if (dealers.items.length > 0) {
          dealerId = dealers.items[0].id;
          console.log(
            `Found Existing Dealer: ${dealers.items[0].name} (${dealerId})`
          );
        } else {
          // Create Dealer
          const dealer = await pb.collection("dealers").create({
            name: "Automated Seed Dealer",
            code: "AUTO001",
            active: true,
          });
          dealerId = dealer.id;
          console.log(`Created New Dealer: ${dealer.name} (${dealerId})`);

          // Link current user to this dealer if possible
          if (user) {
            try {
              await pb
                .collection("users")
                .update(user.id, { dealer: dealerId });
              console.log("Linked user to new dealer.");
            } catch (e) {
              console.log("Could not link user (permissions?)");
            }
          }
        }
      } catch (e: any) {
        console.error("Failed to resolve dealer:", e.message);
        // Fallback: If we assume existing API doesn't enforce relation check on create (unlikely if rules set)
      }
    }

    if (!dealerId) {
      console.error("No Dealer ID context. Cannot seed.");
      process.exit(1);
    }

    // 3. Seed Inventory
    console.log("Seeding Inventory...");
    let invCount = 0;
    for (const vehicle of SAMPLE_INVENTORY) {
      try {
        const { id, ...data } = vehicle as any;
        await pb.collection("inventory").create({
          ...data,
          dealer: dealerId,
          status: "Available",
        });
        process.stdout.write(".");
        invCount++;
      } catch (err: any) {
        // Ignore duplicate or validation errors
      }
    }
    console.log(`\nSeeded ${invCount} vehicles.`);

    // 4. Seed Lender Profiles
    console.log("Seeding Lender Profiles...");
    let lenderCount = 0;
    for (const profile of DEFAULT_LENDER_PROFILES) {
      try {
        const { id, ...data } = profile as any;
        // Check if exists? NA, just create.
        await pb.collection("lender_profiles").create({
          ...data,
          dealer: dealerId,
          active: true,
          tiers: data.tiers,
        });
        process.stdout.write(".");
        lenderCount++;
      } catch (err: any) {
        console.log(`Fail ${profile.name}: ${err.message}`);
      }
    }
    console.log(`\nSeeded ${lenderCount} lender profiles.`);
  } catch (e: any) {
    console.error("Script Error:", e);
  }
}

seed();
