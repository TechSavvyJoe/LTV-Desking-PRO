import { execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";
import PocketBase from "pocketbase";
import { SAMPLE_INVENTORY, DEFAULT_LENDER_PROFILES } from "../../constants";

// Seed helper for backend (used by e2e integration flows and CI).
// Supports env overrides for CI (linux binary download, custom dirs, keep-running mode).
// Run standalone: node tests/helpers/seed-test-db.ts
// For e2e real-backend: set E2E_REAL_BACKEND=1; run seed first (leaves seeded db), start PB, run playwright with VITE_POCKETBASE_URL pointing to it.
// Exports: seedData(pb) for use in custom node setups; main() for script.

const isCI = !!process.env.CI || !!process.env.E2E_REAL_BACKEND;
const PB_BIN_OVERRIDE = process.env.PB_BIN || process.env.PB_PATH;
const PB_DATA_OVERRIDE = process.env.PB_DATA_DIR;
const KEEP_RUNNING = !!process.env.E2E_KEEP_PB_RUNNING || !!process.env.E2E_REAL_BACKEND;

const DB_PATH = path.resolve(
  PB_DATA_OVERRIDE ? path.join(PB_DATA_OVERRIDE, "data.db") : "backend/pb_data/data.db"
);
const PB_PATH = PB_BIN_OVERRIDE || path.resolve("backend/pocketbase");
const MIGRATIONS_DIR = path.resolve("backend/pb_migrations");
const PB_DATA_DIR = path.resolve(PB_DATA_OVERRIDE || "backend/pb_data");
const DEFAULT_DEALER_A_ID = "dealeraid12345x";
const DEFAULT_DEALER_B_ID = "dealerbid45678x";

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function seedErrorDetails(error: unknown): string {
  if (error && typeof error === "object") {
    const err = error as { status?: number; message?: string; data?: unknown };
    const data = err.data ? ` ${JSON.stringify(err.data)}` : "";
    return `${err.status ? `${err.status} ` : ""}${err.message || String(error)}${data}`;
  }
  return String(error);
}

function isDuplicateSeedError(error: unknown): boolean {
  return /already|exists|unique|validation_not_unique/i.test(seedErrorDetails(error));
}

function ignoreDuplicateOrThrow(label: string, error: unknown): void {
  if (isDuplicateSeedError(error)) return;
  throw new Error(`${label} seed failed: ${seedErrorDetails(error)}`);
}

async function assertCollectionCount(
  pb: PocketBase,
  collection: string,
  minimum: number
): Promise<void> {
  const page = await pb.collection(collection).getList(1, 1, { requestKey: null });
  if (page.totalItems < minimum) {
    throw new Error(
      `${collection} seed incomplete: expected at least ${minimum}, found ${page.totalItems}`
    );
  }
}

/**
 * Download PocketBase linux amd64 binary (for CI ubuntu) if needed.
 * Idempotent; places at targetPath.
 */
async function ensurePocketBaseBinary(targetPath: string): Promise<string> {
  if (fs.existsSync(targetPath)) {
    try {
      execSync(`"${targetPath}" --version`, { stdio: "ignore" });
      return targetPath;
    } catch {
      // Existing binary is missing, incompatible, or not executable; download below.
    }
  }
  console.log("Downloading PocketBase for current platform (CI/linux fallback)...");
  // Use a stable recent version known for amd64 linux
  const version = process.env.PB_VERSION || "0.26.5";
  const platform =
    process.platform === "linux"
      ? "linux_amd64"
      : process.platform === "darwin"
        ? "darwin_arm64"
        : "linux_amd64";
  const url = `https://github.com/pocketbase/pocketbase/releases/download/v${version}/pocketbase_${version}_${platform}.zip`;
  const tmpDir = path.resolve("/tmp/pb-download-" + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  const zipPath = path.join(tmpDir, "pocketbase.zip");
  execSync(`curl -L --max-time 120 --connect-timeout 30 -o "${zipPath}" "${url}"`, {
    stdio: "inherit",
  });
  execSync(`unzip -o "${zipPath}" -d "${tmpDir}"`, { stdio: "inherit" });
  const extracted = path.join(tmpDir, "pocketbase");
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(extracted, targetPath);
  fs.chmodSync(targetPath, 0o755);
  console.log("PocketBase binary ready at", targetPath);
  return targetPath;
}

/** Seed just the data records using an already-running/auth'd PB client. Exported for reuse. */
export async function seedData(
  pb: PocketBase,
  dealerA = DEFAULT_DEALER_A_ID,
  dealerB = DEFAULT_DEALER_B_ID
) {
  console.log("Seeding dealers (idempotent create or skip)...");
  try {
    await pb
      .collection("dealers")
      .create({ id: dealerA, name: "Dealer A", code: "DEALERA", active: true });
  } catch (e: any) {
    ignoreDuplicateOrThrow("dealerA", e);
  }
  try {
    await pb
      .collection("dealers")
      .create({ id: dealerB, name: "Dealer B", code: "DEALERB", active: true });
  } catch (e: any) {
    ignoreDuplicateOrThrow("dealerB", e);
  }

  console.log("Seeding users...");
  const usersToCreate = [
    {
      id: "salesaid123456x",
      email: "sales.a@dealera.com",
      password: "SalesPassword123!",
      passwordConfirm: "SalesPassword123!",
      firstName: "Sales",
      lastName: "A",
      dealer: dealerA,
      role: "sales",
      active: true,
      emailVisibility: true,
    },
    {
      id: "manageraid1234x",
      email: "manager.a@dealera.com",
      password: "ManagerPassword123!",
      passwordConfirm: "ManagerPassword123!",
      firstName: "Manager",
      lastName: "A",
      dealer: dealerA,
      role: "manager",
      active: true,
      emailVisibility: true,
    },
    {
      id: "adminaid123456x",
      email: "admin.a@dealera.com",
      password: "AdminPassword123!",
      passwordConfirm: "AdminPassword123!",
      firstName: "Admin",
      lastName: "A",
      dealer: dealerA,
      role: "admin",
      active: true,
      emailVisibility: true,
    },
    {
      id: "salesbid456789x",
      email: "sales.b@dealerb.com",
      password: "SalesPassword123!",
      passwordConfirm: "SalesPassword123!",
      firstName: "Sales",
      lastName: "B",
      dealer: dealerB,
      role: "sales",
      active: true,
      emailVisibility: true,
    },
    {
      id: "adminbid456789x",
      email: "admin.b@dealerb.com",
      password: "AdminPassword123!",
      passwordConfirm: "AdminPassword123!",
      firstName: "Admin",
      lastName: "B",
      dealer: dealerB,
      role: "admin",
      active: true,
      emailVisibility: true,
    },
    {
      id: "superadminid001",
      email: "superadmin@ltvpro.com",
      password: "SuperAdminPass123!",
      passwordConfirm: "SuperAdminPass123!",
      firstName: "Super",
      lastName: "Admin",
      role: "superadmin",
      active: true,
      emailVisibility: true,
    },
  ];
  for (const u of usersToCreate) {
    try {
      await pb.collection("users").create(u);
    } catch (e: any) {
      ignoreDuplicateOrThrow(`user ${u.email}`, e);
    }
  }

  console.log("Seeding dealer settings...");
  try {
    await pb.collection("dealer_settings").create({
      id: "settingsaid123x",
      dealer: dealerA,
      docFee: 280,
      cvrFee: 24,
      defaultStateFees: 31,
      defaultState: "MI",
      outOfStateTransitFee: 10,
      customTaxRate: null,
      defaultTerm: 72,
      defaultApr: 8.9,
      vscPrice: 2495,
      gapPrice: 895,
      miTradeInCreditCap: 12000,
    });
  } catch (e: any) {
    ignoreDuplicateOrThrow("dealer_settings A", e);
  }
  try {
    await pb.collection("dealer_settings").create({
      id: "settingsbid456x",
      dealer: dealerB,
      docFee: 280,
      cvrFee: 24,
      defaultStateFees: 31,
      defaultState: "MI",
      outOfStateTransitFee: 10,
      customTaxRate: null,
      defaultTerm: 72,
      defaultApr: 8.9,
      vscPrice: 2495,
      gapPrice: 895,
      miTradeInCreditCap: 12000,
    });
  } catch (e: any) {
    ignoreDuplicateOrThrow("dealer_settings B", e);
  }

  console.log("Seeding inventory...");
  for (const vehicle of SAMPLE_INVENTORY) {
    const { id: _id, ...vehicleData } = vehicle;
    try {
      await pb
        .collection("inventory")
        .create({ ...vehicleData, dealer: dealerA, status: "available" });
      await pb
        .collection("inventory")
        .create({ ...vehicleData, dealer: dealerB, status: "available" });
    } catch (e: any) {
      ignoreDuplicateOrThrow(`inventory ${vehicle.vin || vehicle.stock}`, e);
    }
  }

  console.log("Seeding lender profiles...");
  for (const profile of DEFAULT_LENDER_PROFILES) {
    const { id: _profileId, ...profileData } = profile;
    try {
      await pb
        .collection("lender_profiles")
        .create({ ...profileData, dealer: dealerA, active: true });
      await pb
        .collection("lender_profiles")
        .create({ ...profileData, dealer: dealerB, active: true });
    } catch (e: any) {
      ignoreDuplicateOrThrow(`lender ${profile.name}`, e);
    }
  }
  await assertCollectionCount(pb, "dealers", 2);
  await assertCollectionCount(pb, "users", usersToCreate.length);
  await assertCollectionCount(pb, "dealer_settings", 2);
  await assertCollectionCount(pb, "inventory", SAMPLE_INVENTORY.length * 2);
  await assertCollectionCount(pb, "lender_profiles", DEFAULT_LENDER_PROFILES.length * 2);
  console.log("Data seeding complete.");
}

async function main() {
  console.log("Starting E2E database seeding process... (seed helper, CI-aware)");

  let effectivePbPath = PB_PATH;
  if (isCI || !fs.existsSync(effectivePbPath)) {
    effectivePbPath = await ensurePocketBaseBinary(effectivePbPath);
  }

  // 1. Reset database file (unless keep mode)
  if (!KEEP_RUNNING && fs.existsSync(DB_PATH)) {
    console.log("Deleting existing test database...");
    fs.unlinkSync(DB_PATH);
  }
  if (!KEEP_RUNNING) {
    if (fs.existsSync(`${DB_PATH}-wal`)) fs.unlinkSync(`${DB_PATH}-wal`);
    if (fs.existsSync(`${DB_PATH}-shm`)) fs.unlinkSync(`${DB_PATH}-shm`);
  }

  // 2. Run initial migrations to create schema
  console.log("Running baseline migrations...");
  execSync(
    `"${effectivePbPath}" migrate up --dir="${PB_DATA_DIR}" --migrationsDir="${MIGRATIONS_DIR}"`,
    {
      stdio: "inherit",
    }
  );

  // 3. Create superuser
  console.log("Creating PocketBase superuser...");
  execSync(
    `"${effectivePbPath}" superuser upsert superadmin@ltvpro.com SuperAdminPass123! --dir="${PB_DATA_DIR}"`,
    { stdio: "inherit" }
  );

  // 4. Start PocketBase server on port 8090 (background)
  console.log("Starting PocketBase server on port 8090...");
  // Use 'ignore' + detached+unref for KEEP_RUNNING to avoid pipe-buffer deadlocks
  // and let the server reliably outlive this script in CI.
  let pbProcess = spawn(
    effectivePbPath,
    ["serve", "--http=127.0.0.1:8090", `--dir=${PB_DATA_DIR}`],
    {
      stdio: KEEP_RUNNING ? "ignore" : "pipe",
      detached: KEEP_RUNNING,
    }
  );
  if (KEEP_RUNNING && pbProcess.pid) {
    pbProcess.unref();
  }

  const stopPocketBase = async () => {
    pbProcess.kill("SIGTERM");
    await wait(1000);
    for (let i = 0; i < 50; i++) {
      try {
        await fetch("http://127.0.0.1:8090/api/health");
      } catch {
        return;
      }
      await wait(200);
    }
  };

  const resetSkippedRuleMigrations = () => {
    console.log("Resetting skipped migrations in SQLite database...");
    const resetQuery = `DELETE FROM _migrations WHERE file IN (
      '1747400002_tighten_api_rules.js',
      '1747800001_role_gated_writes_and_active_flag.js',
      '1747800003_assert_deal_events_rules.js',
      '1747810004_reassert_deal_events_rules.js',
      '1747810006_reassert_dealer_scoped_rules.js'
    );`;
    try {
      execSync(`sqlite3 "${DB_PATH}" "${resetQuery}"`, { stdio: "inherit" });
    } catch (e) {
      console.warn("sqlite reset skipped (may be ok if no sqlite3):", (e as Error).message);
    }
  };

  const rerunRuleMigrations = () => {
    console.log("Re-running rules migrations to apply security guards...");
    execSync(
      `"${effectivePbPath}" migrate up --dir="${PB_DATA_DIR}" --migrationsDir="${MIGRATIONS_DIR}"`,
      {
        stdio: "inherit",
      }
    );
  };

  const restartPocketBase = async () => {
    console.log("Restarting PocketBase on port 8090 after rule migration re-run...");
    pbProcess = spawn(effectivePbPath, ["serve", "--http=127.0.0.1:8090", `--dir=${PB_DATA_DIR}`], {
      stdio: "ignore",
      detached: true,
    });
    if (pbProcess.pid) pbProcess.unref();

    for (let i = 0; i < 600; i++) {
      try {
        const res = await fetch("http://127.0.0.1:8090/api/health");
        if (res.status === 200) return;
      } catch {
        // Ignored
      }
      await wait(200);
    }
    throw new Error("PocketBase failed to restart after rule migration re-run.");
  };

  // Wait for PocketBase to be ready (much longer timeout for cold CI start after download + migrate).
  console.log("Waiting for PocketBase health (up to ~120s)...");
  let isReady = false;
  const healthStart = Date.now();
  for (let i = 0; i < 600; i++) {
    // ~120s at 200ms
    try {
      const res = await fetch("http://127.0.0.1:8090/api/health");
      if (res.status === 200) {
        isReady = true;
        break;
      }
    } catch {
      // Ignored
    }
    await wait(200);
    if (Date.now() - healthStart > 120000) break;
  }

  if (!isReady) {
    console.error("PocketBase failed to start on port 8090.");
    if (pbProcess && !KEEP_RUNNING) pbProcess.kill();
    process.exit(1);
  }
  console.log("PocketBase is online and healthy.");

  // Extra settle time + retry auth: health can pass before full API/hooks/superuser are ready.
  await wait(2000);
  const pb = new PocketBase("http://127.0.0.1:8090");

  // 5. Authenticate (with retries)
  let authenticated = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      console.log(`Authenticating as superuser (attempt ${attempt + 1})...`);
      try {
        await pb
          .collection("_superusers")
          .authWithPassword("superadmin@ltvpro.com", "SuperAdminPass123!");
      } catch (err) {
        await pb.admins.authWithPassword("superadmin@ltvpro.com", "SuperAdminPass123!");
      }
      authenticated = true;
      console.log("Authenticated successfully.");
      break;
    } catch (err) {
      if (attempt === 29) {
        console.error("Superuser auth failed after retries:", err);
      }
      await wait(1000);
    }
  }

  if (!authenticated) {
    if (pbProcess && !KEEP_RUNNING) pbProcess.kill();
    process.exit(1);
  }

  try {
    // Use the exported seedData helper (deduped logic)
    await seedData(pb);
    console.log("Database seeding completed successfully.");
  } catch (err) {
    console.error("Seeding error:", err);
    if (pbProcess && !KEEP_RUNNING) pbProcess.kill();
    process.exit(1);
  }

  if (!KEEP_RUNNING) {
    // 11. Shut down temporary server
    console.log("Stopping PocketBase temporary server...");
    await stopPocketBase();

    // 12. Reset migrations that skipped rules validation due to fresh DB schema cache quirk
    resetSkippedRuleMigrations();

    // 13. Re-run migrations so the security rules compile and apply with dealers/users seeded
    rerunRuleMigrations();

    console.log("All E2E database seeding and rule assertions finished successfully.");
  } else {
    // CI real-backend E2E needs PB left running, but it must be restarted after
    // seeding so fresh-DB rule migrations can see dealer/user fields and apply.
    console.log("KEEP_RUNNING mode: applying skipped rule migrations before final PB serve.");
    await stopPocketBase();
    resetSkippedRuleMigrations();
    rerunRuleMigrations();
    await restartPocketBase();
    console.log("KEEP_RUNNING mode: PB left running on 8090 with seeded data and rules applied.");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

export { main as runSeed };
