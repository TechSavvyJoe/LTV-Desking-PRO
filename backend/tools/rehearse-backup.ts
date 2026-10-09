import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import PocketBase, { type RecordModel } from "pocketbase";
import { reportRetention } from "./retention-report";

const backend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const collections = [
  "dealers",
  "users",
  "inventory",
  "lender_profiles",
  "saved_deals",
  "dealer_settings",
  "deal_events",
];
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function requireFreePort(port: number) {
  const server = createServer();
  await new Promise<void>((done, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => server.close(() => done()));
  });
}

async function until(check: () => Promise<boolean>, label: string, timeout = 30_000) {
  const started = performance.now();
  while (performance.now() - started < timeout) {
    try {
      if (await check()) return;
    } catch {
      /* wait for bootstrap/restart */
    }
    await wait(200);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

/** No remote URL or existing data-directory input is accepted. Retains all evidence. */
export async function rehearseBackup(binary = join(backend, "pocketbase")) {
  if (process.platform === "win32")
    throw new Error("Native PocketBase restore requires UNIX; use macOS/Linux.");
  const expectedVersion = readFileSync(join(backend, "Dockerfile"), "utf8").match(
    /ARG PB_VERSION=([\d.]+)/
  )?.[1];
  const version = execFileSync(resolve(binary), ["--version"], { encoding: "utf8" }).trim();
  assert.equal(
    version,
    `pocketbase version ${expectedVersion}`,
    "Binary must match Dockerfile PB_VERSION; pass --binary with that local binary."
  );
  await requireFreePort(8099);
  await requireFreePort(8100);
  const root = mkdtempSync(join(tmpdir(), "ltv-full-backup-rehearsal-"));
  const dirs = { source: join(root, "source", "pb_data"), target: join(root, "target", "pb_data") };
  const migrations = join(root, "pb_migrations");
  const hooks = join(root, "pb_hooks");
  cpSync(join(backend, "pb_migrations"), migrations, { recursive: true });
  mkdirSync(hooks);
  // Only executable hook files, never source test files or generated data.
  cpSync(join(backend, "pb_hooks"), hooks, {
    recursive: true,
    filter: (p) => p === join(backend, "pb_hooks") || p.endsWith(".pb.js"),
  });
  mkdirSync(join(root, "public"));
  for (const dir of Object.values(dirs)) mkdirSync(dir, { recursive: true });
  // Never pass the caller's production credentials/configuration to children.
  const env = { PATH: process.env.PATH, TMPDIR: root };
  const args = (dir: string) => [
    `--dir=${dir}`,
    `--migrationsDir=${migrations}`,
    `--hooksDir=${hooks}`,
    `--publicDir=${join(root, "public")}`,
    "--hooksWatch=false",
  ];
  const groups: number[] = [];
  const stopGroups = () => {
    for (const group of groups) {
      try {
        process.kill(-group, "SIGTERM");
      } catch {
        /* already stopped */
      }
    }
  };
  const killGroups = () => {
    for (const group of groups) {
      try {
        process.kill(-group, "SIGKILL");
      } catch {
        /* already stopped */
      }
    }
  };
  const onSignal = () => {
    stopGroups();
    killGroups();
    process.exit(130);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  const password = `Drill1!${randomBytes(18).toString("hex")}`;
  const email = "recovery-superuser@example.invalid";
  const receipt: Record<string, unknown> = {
    status: "running",
    startedAt: new Date().toISOString(),
    root,
    sourceDir: dirs.source,
    targetDir: dirs.target,
    ports: [8099, 8100],
    binary: resolve(binary),
    binaryVersion: version,
    binarySha256: hash(readFileSync(binary)),
    gitHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: backend, encoding: "utf8" }).trim(),
    scope:
      "Synthetic local full ZIP backup/restore only; no R2, production, SMTP, remote durability, or production RPO/RTO validation.",
  };
  const receiptPath = join(root, "receipt.json");
  console.log(`Recovery evidence directory: ${root}`);
  const connect = (port: number) => new PocketBase(`http://127.0.0.1:${port}`);
  const source = connect(8099);
  const target = connect(8100);
  const auth = (pb: PocketBase) => pb.collection("_superusers").authWithPassword(email, password);
  async function start(dir: string, port: number, label: string) {
    const log = join(root, `${label}.log`);
    execFileSync(resolve(binary), ["migrate", "up", ...args(dir)], {
      cwd: root,
      env,
      stdio: "pipe",
      timeout: 30_000,
    });
    execFileSync(resolve(binary), ["superuser", "create", email, password, ...args(dir)], {
      cwd: root,
      env,
      stdio: "pipe",
      timeout: 30_000,
    });
    const { openSync, closeSync } = await import("node:fs");
    const fd = openSync(log, "a", 0o600);
    const child = spawn(resolve(binary), ["serve", `--http=127.0.0.1:${port}`, ...args(dir)], {
      cwd: root,
      env,
      detached: true,
      stdio: ["ignore", fd, fd],
    });
    closeSync(fd);
    child.on("error", () => {
      /* health wait reports failure; finally stops other owned children */
    });
    assert.ok(child.pid, "PocketBase did not spawn");
    groups.push(child.pid);
    await until(
      async () =>
        (await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) }))
          .ok,
      `${label} health`
    );
  }
  async function snapshot(pb: PocketBase) {
    const result: Record<string, unknown[]> = {};
    for (const collection of collections)
      result[collection] = await pb.collection(collection).getFullList({ sort: "id" });
    return result;
  }
  try {
    await start(dirs.source, 8099, "source");
    await auth(source);
    const settings = await source.settings.getAll();
    assert.equal(settings.s3.enabled, false);
    assert.equal(settings.backups.s3.enabled, false);
    assert.equal(settings.smtp.enabled, false);
    const tenants: {
      dealer: RecordModel;
      user: RecordModel;
      userEmail: string;
      adminEmail: string;
      vehicle: RecordModel;
      saved: RecordModel;
      logoHash: string;
    }[] = [];
    for (const letter of ["a", "b"]) {
      const logo = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="${letter === "a" ? "blue" : "green"}"/><text x="10" y="40">${letter.toUpperCase()}</text></svg>`
      );
      const form = new FormData();
      form.set("name", `Synthetic recovery dealer ${letter.toUpperCase()}`);
      form.set("code", `RECOVERY_${letter.toUpperCase()}`);
      form.set("active", "true");
      form.set("logo", new Blob([logo], { type: "image/svg+xml" }), `recovery-${letter}.svg`);
      const dealer = await source.collection("dealers").create(form);
      const userEmail = `recovery-${letter}@example.invalid`;
      const user = await source.collection("users").create({
        email: userEmail,
        password,
        passwordConfirm: password,
        dealer: dealer.id,
        role: "sales",
        active: true,
        verified: true,
        firstName: "Synthetic",
        lastName: letter.toUpperCase(),
      });
      const adminEmail = `recovery-admin-${letter}@example.invalid`;
      await source.collection("users").create({
        email: adminEmail,
        password,
        passwordConfirm: password,
        dealer: dealer.id,
        role: "admin",
        active: true,
        verified: true,
      });
      const vehicle = await source.collection("inventory").create({
        dealer: dealer.id,
        vin: `RECOVERY${letter.toUpperCase()}0000001`,
        year: 2024,
        make: "Synthetic",
        model: "Drill",
        price: 20000,
        unitCost: 17000,
        mileage: 12345,
        status: "available",
      });
      await source.collection("dealer_settings").create({
        dealer: dealer.id,
        defaultTerm: 60,
        defaultApr: 7,
        defaultState: "MI",
        docFee: 100,
      });
      await source.collection("lender_profiles").create({
        dealer: dealer.id,
        name: `Synthetic lender ${letter}`,
        active: true,
        isSample: true,
        tiers: [{ name: "Illustration", maxLtv: 100, maxTerm: 60, minFico: 700 }],
      });
      const saved = await source.collection("saved_deals").create({
        dealer: dealer.id,
        user: user.id,
        vehicle: vehicle.id,
        name: `Synthetic saved deal ${letter}`,
        customerName: "Synthetic Customer",
        vehicleData: { vin: vehicle.vin, price: 20000 },
        dealData: { cashDown: 1000, term: 60, apr: 7 },
        status: "draft",
      });
      await source.collection("deal_events").create({
        dealer: dealer.id,
        user: user.id,
        action: "synthetic_rehearsal",
        snapshot: { savedDeal: saved.id, illustrative: true },
      });
      tenants.push({ dealer, user, userEmail, adminEmail, vehicle, saved, logoHash: hash(logo) });
    }
    const before = await snapshot(source);
    for (const collection of collections)
      assert.equal(
        before[collection]?.length,
        collection === "users" ? 4 : 2,
        `${collection} synthetic count`
      );
    const beforeHash = hash(JSON.stringify(before));
    receipt.recordSnapshotSha256 = beforeHash;
    receipt.counts = Object.fromEntries(
      collections.map((collection) => [collection, before[collection]!.length])
    );
    receipt.tenantCounts = Object.fromEntries(
      tenants.map(({ dealer }) => [
        dealer.id,
        Object.fromEntries(
          collections.map((collection) => [
            collection,
            before[collection]!.filter((row: any) =>
              collection === "dealers" ? row.id === dealer.id : row.dealer === dealer.id
            ).length,
          ])
        ),
      ])
    );
    const ageReport = await reportRetention({
      url: "http://127.0.0.1:8099",
      dealerId: tenants[0]!.dealer.id,
      token: source.authStore.token,
      before: "2999-01-01T00:00:00.000Z", // Fixture classification only; no disposal policy.
      output: join(root, "retention-review"),
      includePlatformAudit: true,
    });
    assert.equal(ageReport.summaries[0]!.total, 1);
    assert.equal(ageReport.summaries[0]!.olderThanCutoff, 1);
    assert.equal(ageReport.summaries[0]!.reviewNeeded, 0);
    assert.equal(ageReport.summaries[1]!.total, 1);
    assert.equal(ageReport.summaries[1]!.olderThanCutoff, 1);
    assert.equal(ageReport.summaries[2]!.scope, "platform");
    assert.equal(ageReport.summaries[2]!.total, 0);
    receipt.retentionReview = {
      passed: true,
      dealerSavedDeals: 1,
      dealerEvents: 1,
      platformAuditRows: 0,
      destructiveActions: false,
    };
    const name = "synthetic_full_recovery.zip";
    const backupStarted = performance.now();
    await source.backups.create(name);
    await until(
      async () =>
        (await source.backups.getFullList()).some(
          (backup) => backup.key === name && backup.size > 0
        ),
      "completed native backup"
    );
    receipt.backupCreateMs = Math.round(performance.now() - backupStarted);
    const downloadUrl = source.backups.getDownloadURL(await source.files.getToken(), name);
    const download = await fetch(downloadUrl, { signal: AbortSignal.timeout(30_000) });
    assert.equal(download.status, 200);
    const archive = Buffer.from(await download.arrayBuffer());
    const archivePath = join(root, name);
    writeFileSync(archivePath, archive, { mode: 0o600 });
    receipt.archive = { path: archivePath, bytes: archive.length, sha256: hash(archive) };
    // Test the actual generated ZIP and confirm database AND both uploaded logos.
    execFileSync("unzip", ["-t", archivePath], { encoding: "utf8" });
    const entries = execFileSync("unzip", ["-Z1", archivePath], { encoding: "utf8" }).split("\n");
    assert.ok(entries.includes("data.db"));
    for (const { dealer } of tenants)
      assert.ok(
        entries.includes(`storage/${dealer.collectionId}/${dealer.id}/${dealer.logo}`),
        "Native backup is missing uploaded logo"
      );
    receipt.archiveEntries = entries.filter(Boolean);
    await start(dirs.target, 8100, "target");
    await auth(target);
    const marker = await target.collection("dealers").create({
      name: "Disposable target pre-restore marker",
      code: "TARGET_MARKER",
      active: true,
    });
    const upload = new FormData();
    upload.set("file", new Blob([archive], { type: "application/zip" }), name);
    const recoveryStarted = performance.now();
    await target.backups.upload(upload);
    const restoreRequested = performance.now();
    await target.backups.restore(name);
    // HTTP 204 is an asynchronous acknowledgement, not success. Wait for actual
    // source tenant IDs and absence of target-only data after process restart.
    await until(
      async () => {
        await auth(target);
        const dealers = await target.collection("dealers").getFullList();
        return (
          dealers.length === 2 &&
          tenants.every(({ dealer }) => dealers.some((row) => row.id === dealer.id)) &&
          !dealers.some((row) => row.id === marker.id)
        );
      },
      "restored source tenant identities",
      60_000
    );
    receipt.restoreToReadyMs = Math.round(performance.now() - restoreRequested);
    const after = await snapshot(target);
    assert.equal(
      hash(JSON.stringify(after)),
      beforeHash,
      "Restored records differ from source snapshot"
    );
    receipt.recordContentMatch = true;
    const logos = [];
    for (const { dealer, logoHash } of tenants) {
      const response = await fetch(target.files.getURL(dealer, dealer.logo));
      assert.equal(response.status, 200);
      const restoredHash = hash(Buffer.from(await response.arrayBuffer()));
      assert.equal(restoredHash, logoHash);
      const diskHash = hash(
        readFileSync(join(dirs.target, "storage", dealer.collectionId, dealer.id, dealer.logo))
      );
      assert.equal(diskHash, logoHash);
      logos.push({
        dealer: dealer.id,
        filename: dealer.logo,
        sourceSha256: logoHash,
        restoredHttpSha256: restoredHash,
        restoredDiskSha256: diskHash,
      });
    }
    receipt.logos = logos;
    const accessChecks = [];
    for (const tenant of tenants) {
      const other = tenants.find((entry) => entry.dealer.id !== tenant.dealer.id)!;
      const sales = connect(8100);
      await sales.collection("users").authWithPassword(tenant.userEmail, password);
      for (const collection of [
        "dealers",
        "inventory",
        "lender_profiles",
        "saved_deals",
        "dealer_settings",
        "users",
      ]) {
        const rows = await sales.collection(collection).getFullList();
        assert.equal(rows.length, collection === "users" ? 2 : 1);
        assert.ok(
          rows.every((row) =>
            collection === "dealers" ? row.id === tenant.dealer.id : row.dealer === tenant.dealer.id
          )
        );
      }
      for (const [collection, id] of [
        ["inventory", other.vehicle.id],
        ["saved_deals", other.saved.id],
        ["users", other.user.id],
        ["dealers", other.dealer.id],
      ]) {
        const response = await fetch(
          `http://127.0.0.1:8100/api/collections/${collection}/records/${id}`,
          { headers: { Authorization: sales.authStore.token } }
        );
        assert.equal(response.status, 404, "Cross-tenant view leaked data");
      }
      const admin = connect(8100);
      await admin.collection("users").authWithPassword(tenant.adminEmail, password);
      const crossWrite = await fetch(
        `http://127.0.0.1:8100/api/collections/inventory/records/${other.vehicle.id}`,
        {
          method: "PATCH",
          headers: { Authorization: admin.authStore.token, "Content-Type": "application/json" },
          body: JSON.stringify({ price: 1 }),
        }
      );
      assert.equal(crossWrite.status, 404, "Cross-tenant admin write was permitted");
      const events = await admin.collection("deal_events").getFullList();
      assert.equal(events.length, 1);
      assert.equal(events[0]!.dealer, tenant.dealer.id);
      const backupList = await fetch("http://127.0.0.1:8100/api/backups", {
        headers: { Authorization: admin.authStore.token },
      });
      assert.equal(backupList.status, 403, "Tenant admin must not manage full backups");
      accessChecks.push({
        dealer: tenant.dealer.id,
        ownLists: "pass",
        crossTenantViews: "404",
        crossTenantAdminWrite: "404",
        ownAdminEvents: "pass",
        tenantBackupList: "403",
      });
    }
    const anonymous = await fetch("http://127.0.0.1:8100/api/collections/inventory/records");
    assert.equal(anonymous.status, 200);
    assert.equal((await anonymous.json()).items.length, 0);
    receipt.accessChecks = accessChecks;
    receipt.anonymousInventoryItems = 0;
    // Dealer logos are public (unprotected FileField); record this deliberately.
    receipt.logoAccess =
      "Public file URLs, matching the current unprotected dealers.logo field; no confidential logo-access guarantee.";
    assert.equal(
      hash(JSON.stringify(await snapshot(source))),
      beforeHash,
      "Source records changed during recovery"
    );
    receipt.sourceContentUnchanged = true;
    stopGroups();
    await wait(1200);
    killGroups();
    for (const port of [8099, 8100]) await requireFreePort(port);
    const integrity: Record<string, string> = {};
    for (const [label, dir] of Object.entries(dirs)) {
      // immutable skips WAL recovery: only use after stopped processes and a
      // clean checkpoint. Refuse a nonempty WAL instead of silently ignoring it.
      const wal = join(dir, "data.db-wal");
      assert.ok(
        !existsSync(wal) || statSync(wal).size === 0,
        "Database still has uncheckpointed WAL"
      );
      const value = execFileSync(
        "sqlite3",
        [
          "-readonly",
          `file:${join(dir, "data.db")}?immutable=1`,
          "PRAGMA query_only=ON; PRAGMA integrity_check;",
        ],
        { encoding: "utf8" }
      ).trim();
      assert.equal(value, "ok");
      integrity[label] = value;
    }
    receipt.sqliteIntegrity = integrity;
    receipt.uploadToValidatedMs = Math.round(performance.now() - recoveryStarted);
    receipt.sourceRetained = true;
    receipt.status = "passed";
  } catch (error) {
    receipt.status = "failed";
    // Do not persist SDK response/request objects which may contain auth tokens.
    receipt.error =
      error instanceof Error
        ? error.message.replaceAll(password, "[synthetic credential redacted]")
        : "Unknown failure";
    throw error;
  } finally {
    stopGroups();
    await wait(300);
    killGroups();
    const released: number[] = [];
    for (const port of [8099, 8100]) {
      try {
        await requireFreePort(port);
        released.push(port);
      } catch {
        /* receipt exposes incomplete cleanup */
      }
    }
    receipt.releasedPorts = released;
    if (receipt.status === "passed" && released.length !== 2) {
      receipt.status = "failed";
      receipt.error = "An owned recovery process did not release its port";
    }
    receipt.finishedAt = new Date().toISOString();
    writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    console.log(`Recovery receipt: ${receiptPath}`);
  }
  if (receipt.status !== "passed")
    throw new Error("An owned recovery process did not release its port");
  return receiptPath;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { binary: { type: "string" } } });
  rehearseBackup(values.binary).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Recovery rehearsal failed");
    process.exitCode = 1;
  });
}
