/** Disposable, fail-closed PocketBase pilot benchmark. See docs/runbooks/capacity-benchmark.md. */
import assert from "node:assert/strict";
import { spawn, execFile, execFileSync, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { performance } from "node:perf_hooks";

const root = process.cwd();
const binary = path.resolve(process.env.CAPACITY_PB_BIN || "backend/pocketbase");
const base = "http://127.0.0.1:8098";
const pbRuntimeEnvironment = { GOMEMLIMIT: "512MiB", GOMAXPROCS: "1" };
const runtimeSettings = { ...pbRuntimeEnvironment, GOGC: "default (unset)" };
const envelope = {
  dealers: 5,
  sessionsPerDealer: 2,
  initialInventoryPerDealer: 200,
  roundsPerSession: 20,
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const samples = new Map<string, number[]>();
let errors = 0;
let measuredFailure: Error | undefined;
let cancellation = new AbortController();
let running = false;
const execFileAsync = promisify(execFile);
const streamErrors: string[] = [];
const resources: { rssKiB: number; cpuPercent: number }[] = [];
const progress = { phase: "preflight", seededInventory: 0, createdInventory: 0, createdDeals: 0 };
export interface BenchmarkContext {
  directory: string;
  flags: string[];
  env: NodeJS.ProcessEnv;
  password: string;
}
export interface BenchmarkLauncher {
  name: string;
  runtimeSettings?: Record<string, unknown>;
  version(): string | Promise<string>;
  prepare(context: BenchmarkContext): void | Promise<void>;
  start(context: BenchmarkContext): ChildProcess | Promise<ChildProcess>;
  readyMarker: string;
  sampleResources?(child: ChildProcess): Promise<{ rssKiB: number; cpuPercent: number }>;
  stop(child: ChildProcess): Promise<void>;
  finalize?(): Promise<Record<string, unknown>>;
  cleanup?(): Promise<void>;
}
export class BenchmarkLauncherError extends Error {
  constructor(
    message: string,
    readonly details: Record<string, unknown>
  ) {
    super(message);
  }
}
export type BenchmarkReceipt = Record<string, unknown> & { passed: boolean };
interface RunLifecycle {
  directory?: string;
  child?: ChildProcess;
  finalizationAttempted?: boolean;
  supplemental?: Record<string, unknown>;
}
const nativeLauncher: BenchmarkLauncher = {
  name: "native",
  version: () => execFileSync(binary, ["--version"], { encoding: "utf8" }).trim(),
  prepare: ({ flags, env, password }) => {
    execFileSync(binary, ["migrate", "up", ...flags], { stdio: "pipe", env });
    execFileSync(binary, ["superuser", "upsert", "benchmark@example.invalid", password, ...flags], {
      stdio: "pipe",
      env,
    });
  },
  start: ({ flags, env }) =>
    spawn(
      binary,
      ["serve", "--http=127.0.0.1:8098", ...flags, "--hooksWatch=false", "--automigrate=false"],
      { stdio: ["ignore", "pipe", "pipe"], env }
    ),
  readyMarker: "Server started at http://127.0.0.1:8098",
  sampleResources: async (child) => {
    const { stdout } = await execFileAsync("ps", ["-o", "rss=,%cpu=", "-p", String(child.pid)], {
      encoding: "utf8",
    });
    const [rssKiB, cpuPercent] = stdout.trim().split(/\s+/).map(Number);
    assert(
      rssKiB !== undefined &&
        cpuPercent !== undefined &&
        Number.isFinite(rssKiB) &&
        Number.isFinite(cpuPercent),
      "Invalid process resource sample"
    );
    return { rssKiB, cpuPercent };
  },
  stop,
};
function resourceSummary() {
  return {
    samples: resources.length,
    maxRssMiB: resources.length
      ? Number((Math.max(...resources.map((r) => r.rssKiB)) / 1024).toFixed(2))
      : null,
    maxObservedCpuPercent: resources.length
      ? Math.max(...resources.map((r) => r.cpuPercent))
      : null,
  };
}
const record = (name: string, ms: number) => samples.set(name, [...(samples.get(name) || []), ms]);
async function measured<T>(name: string, operation: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await operation();
  } catch (error) {
    errors++;
    const failure = new Error(`${name}: ${error instanceof Error ? error.message : "failed"}`);
    measuredFailure ||= failure;
    cancellation.abort();
    throw failure;
  } finally {
    record(name, performance.now() - start);
  }
}
async function request(route: string, token = "", method = "GET", body?: unknown) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.any([cancellation.signal, AbortSignal.timeout(15000)]),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${method} ${route.split("?")[0]}`);
  return response.status === 204 ? null : await response.json();
}
const collection = (name: string) => `/api/collections/${name}/records`;
const inventory = (dealer: string, stock: string) => ({
  dealer,
  stockNumber: stock,
  vin: `TEST${stock.padStart(13, "0")}`,
  year: 2024,
  make: "Synthetic",
  model: "Pilot",
  mileage: 10000,
  price: 25000,
  unitCost: 20000,
  status: "available",
  condition: "used",
});
interface Session {
  dealer: string;
  user: string;
  token: string;
  role: string;
}
interface Stream {
  controller: AbortController;
  done: Promise<void>;
  events: Map<string, number>;
  received: Map<string, number>;
}
async function subscribe(session: Session): Promise<Stream> {
  const controller = new AbortController();
  const response = await fetch(`${base}/api/realtime`, {
    signal: AbortSignal.any([controller.signal, cancellation.signal]),
  });
  assert(response.ok && response.body, "SSE connection failed");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events = new Map<string, number>();
  const received = new Map<string, number>();
  let resolveId!: (id: string) => void;
  let rejectId!: (error: unknown) => void;
  const ready = new Promise<string>((resolve, reject) => {
    resolveId = resolve;
    rejectId = reject;
  });
  const done = (async () => {
    let buffer = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          if (!controller.signal.aborted && !cancellation.signal.aborted)
            throw new Error("SSE stream ended unexpectedly");
          break;
        }
        buffer += decoder.decode(value, { stream: true }).replace(/\r/g, "");
        let end: number;
        while ((end = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const data = frame
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim())
            .join("\n");
          if (!data) continue;
          const event = JSON.parse(data);
          if (event.clientId) resolveId(event.clientId);
          if (event.record) {
            assert.equal(event.record.dealer, session.dealer, "Cross-dealer SSE leak");
            if (session.role === "sales")
              assert.equal(event.record.unitCost, undefined, "SSE cost leak");
            const key = `${event.action}:${event.record.id}`;
            events.set(key, (events.get(key) || 0) + 1);
            received.set(key, performance.now());
          }
        }
      }
    } catch (error) {
      if (!controller.signal.aborted && !cancellation.signal.aborted) {
        streamErrors.push(error instanceof Error ? error.message : "SSE failed");
        rejectId(error);
        throw error;
      }
    }
  })();
  // Attach immediately to prevent an unhandled rejection before the final integrity gate.
  void done.catch(() => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const clientId = await Promise.race([
      ready,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("SSE handshake timeout")), 5000);
      }),
    ]);
    await request("/api/realtime", session.token, "POST", {
      clientId,
      subscriptions: ["inventory/*"],
    });
    return { controller, done, events, received };
  } catch (error) {
    controller.abort();
    await Promise.allSettled([done]);
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
async function stop(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.kill("SIGTERM");
  await Promise.race([exited, sleep(3000)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await exited;
  }
}
function latencySummary() {
  return Object.fromEntries(
    [...samples].map(([name, times]) => {
      const sorted = [...times].sort((a, b) => a - b);
      const percentile = (p: number) =>
        Number(sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)]!.toFixed(2));
      return [
        name,
        {
          count: times.length,
          p50Ms: percentile(0.5),
          p95Ms: percentile(0.95),
          p99Ms: percentile(0.99),
        },
      ];
    })
  );
}
async function executeBenchmark(
  launcher: BenchmarkLauncher,
  lifecycle: RunLifecycle
): Promise<BenchmarkReceipt> {
  assert(
    (await stat(path.join(root, "backend/pb_hooks"))).isDirectory(),
    "Run from repository root"
  );
  assert(
    (await stat(path.join(root, "backend/pb_migrations"))).isDirectory(),
    "Run from repository root"
  );
  // Refuse to connect to or kill another process. A busy port aborts before creating any data.
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(8098, "127.0.0.1", resolve);
  });
  await new Promise<void>((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve()))
  );
  const version = await launcher.version();
  assert.equal(
    version,
    "pocketbase version 0.39.6",
    "Use an existing verified 0.39.6 binary via CAPACITY_PB_BIN; no download is performed"
  );
  const directory = await mkdtemp(path.join(os.tmpdir(), "ltv-capacity-"));
  lifecycle.directory = directory;
  const flags = [
    `--dir=${directory}`,
    `--migrationsDir=${path.join(root, "backend/pb_migrations")}`,
    `--hooksDir=${path.join(root, "backend/pb_hooks")}`,
    `--publicDir=${path.join(directory, "public")}`,
  ];
  let child: ChildProcess | undefined;
  let monitor: ReturnType<typeof setInterval> | undefined;
  let samplingTask: Promise<void> | undefined;
  const streams: Stream[] = [];
  const password = "SyntheticBenchmark123!";
  try {
    await mkdir(path.join(directory, "public"));
    const env = { PATH: process.env.PATH, TMPDIR: directory, ...pbRuntimeEnvironment };
    const context = { directory, flags, env, password };
    await launcher.prepare(context);
    cancellation.signal.throwIfAborted();
    child = await launcher.start(context);
    lifecycle.child = child;
    let startup = "";
    let spawnError: Error | undefined;
    child.once("error", (error) => {
      spawnError = error;
    });
    const collectStartup = (chunk: Buffer) => {
      startup = (startup + chunk.toString()).slice(-32000);
    };
    child.stdout?.on("data", collectStartup);
    child.stderr?.on("data", collectStartup);
    let healthy = false;
    for (let i = 0; i < 100; i++) {
      cancellation.signal.throwIfAborted();
      if (spawnError) throw spawnError;
      assert(
        child.exitCode === null && child.signalCode === null,
        "Owned server exited before readiness"
      );
      try {
        await request("/api/health");
        if (!startup.includes(launcher.readyMarker)) {
          await sleep(100);
          continue;
        }
        healthy = true;
        break;
      } catch {
        await sleep(100);
      }
    }
    assert(healthy, "Server readiness timeout");
    const admin = await request("/api/collections/_superusers/auth-with-password", "", "POST", {
      identity: "benchmark@example.invalid",
      password,
    });
    const sessions: Session[] = [];
    const dealers: string[] = [];
    progress.phase = "seed";
    for (let d = 0; d < envelope.dealers; d++) {
      const dealer = await request(collection("dealers"), admin.token, "POST", {
        name: `Synthetic pilot ${d}`,
        code: `PILOT${d}`,
        active: true,
      });
      dealers.push(dealer.id);
      for (let s = 0; s < envelope.sessionsPerDealer; s++) {
        const email = `pilot-${d}-${s}@example.invalid`;
        const role = s === 0 ? "admin" : "sales";
        const user = await request(collection("users"), admin.token, "POST", {
          email,
          password,
          passwordConfirm: password,
          dealer: dealer.id,
          role,
          active: true,
          firstName: "Synthetic",
          lastName: "Pilot",
        });
        const auth = await measured("authentication", () =>
          request("/api/collections/users/auth-with-password", "", "POST", {
            identity: email,
            password,
          })
        );
        sessions.push({ dealer: dealer.id, user: user.id, token: auth.token, role });
      }
      for (let v = 0; v < envelope.initialInventoryPerDealer; v++) {
        await request(
          collection("inventory"),
          admin.token,
          "POST",
          inventory(dealer.id, `${d}-${v}`)
        );
        progress.seededInventory++;
      }
    }
    console.error("Synthetic seed complete; opening SSE and warming reads.");
    for (const session of sessions) {
      const page = await request(`${collection("inventory")}?perPage=200`, session.token);
      assert.equal(page.totalItems, envelope.initialInventoryPerDealer);
      assert(page.items.every((item: any) => item.dealer === session.dealer));
      streams.push(await subscribe(session));
    }
    let sampling = false;
    if (launcher.sampleResources)
      monitor = setInterval(() => {
        if (sampling) return;
        sampling = true;
        samplingTask = launcher.sampleResources!(child!)
          .then((sample) => {
            resources.push(sample);
          })
          .catch(() => {})
          .finally(() => {
            sampling = false;
          });
      }, 1000);
    console.error("Starting 10-session measured workload.");
    progress.phase = "workload";
    const started = performance.now();
    const writes: { dealer: string; id: string; createStart: number; updateStart: number }[] = [];
    const savedWrites: { dealer: string; id: string }[] = [];
    const workloadResults = await Promise.allSettled(
      sessions.map(async (session, index) => {
        for (let round = 0; round < envelope.roundsPerSession; round++) {
          const page = await measured("inventory-list", () =>
            request(`${collection("inventory")}?perPage=200&sort=stockNumber`, session.token)
          );
          assert(page.items.every((item: any) => item.dealer === session.dealer));
          if (session.role === "sales")
            assert(page.items.every((item: any) => item.unitCost === undefined));
          const writer = sessions[index - (index % 2)]!;
          const createStart = performance.now();
          const unit = await measured("inventory-create", () =>
            request(
              collection("inventory"),
              writer.token,
              "POST",
              inventory(session.dealer, `load-${index}-${round}`)
            )
          );
          progress.createdInventory++;
          const updateStart = performance.now();
          writes.push({ dealer: session.dealer, id: unit.id, createStart, updateStart });
          await measured("inventory-update", () =>
            request(`${collection("inventory")}/${unit.id}`, writer.token, "PATCH", {
              price: 26000,
            })
          );
          const deal = await measured("saved-deal-create", () =>
            request(collection("saved_deals"), session.token, "POST", {
              dealer: session.dealer,
              user: session.user,
              name: `Synthetic ${index}-${round}`,
              vehicle: unit.id,
              vehicleData: { vin: unit.vin, price: 26000, unitCost: 20000 },
              dealData: { downPayment: 1000, term: 72, apr: 8.9 },
              status: "draft",
            })
          );
          progress.createdDeals++;
          savedWrites.push({ dealer: session.dealer, id: deal.id });
          assert.equal(deal.user, session.user);
          await measured("saved-deal-update", () =>
            request(`${collection("saved_deals")}/${deal.id}`, session.token, "PATCH", {
              status: "pending",
              dealData: { downPayment: 1500, term: 72, apr: 8.9 },
            })
          );
          const saved = await measured("saved-deal-read", () =>
            request(`${collection("saved_deals")}/${deal.id}`, session.token)
          );
          assert.equal(saved.dealer, session.dealer);
          assert.equal(saved.status, "pending");
          assert.equal(saved.dealData.downPayment, 1500);
        }
      })
    );
    const failedWorker = workloadResults.find((result) => result.status === "rejected");
    if (failedWorker?.status === "rejected") throw measuredFailure || failedWorker.reason;
    const elapsedSeconds = (performance.now() - started) / 1000;
    // Both dealer sessions must receive exactly one create and update for each own-dealer write.
    for (
      let attempt = 0;
      attempt < 50 &&
      streams.some(
        (stream, i) =>
          stream.events.size <
          writes.filter((write) => write.dealer === sessions[i]!.dealer).length * 2
      );
      attempt++
    )
      await sleep(100);
    for (let i = 0; i < streams.length; i++) {
      const own = writes.filter((write) => write.dealer === sessions[i]!.dealer);
      assert.equal(streams[i]!.events.size, own.length * 2);
      for (const write of own)
        for (const action of ["create", "update"]) {
          assert.equal(streams[i]!.events.get(`${action}:${write.id}`), 1);
          record(
            `sse-${action}`,
            streams[i]!.received.get(`${action}:${write.id}`)! -
              (action === "create" ? write.createStart : write.updateStart)
          );
        }
    }
    assert.deepEqual(streamErrors, [], "SSE stream failed");
    progress.phase = "integrity";
    let denialProbes = 0;
    for (const session of sessions) {
      for (const [name, records] of [
        ["inventory", writes],
        ["saved_deals", savedWrites],
      ] as const) {
        const foreign = records.find((write) => write.dealer !== session.dealer)!;
        for (const method of ["GET", "PATCH", "DELETE"]) {
          const response = await fetch(`${base}${collection(name)}/${foreign.id}`, {
            method,
            headers: { Authorization: session.token, "Content-Type": "application/json" },
            body: method === "PATCH" ? JSON.stringify({ price: 1 }) : undefined,
            signal: AbortSignal.any([cancellation.signal, AbortSignal.timeout(15000)]),
          });
          assert.equal(response.status, 404, `Cross-dealer ${method} must be denied`);
          denialProbes++;
        }
        const foreignList = await request(
          `${collection(name)}?filter=${encodeURIComponent(`dealer='${foreign.dealer}'`)}`,
          session.token
        );
        assert.equal(foreignList.totalItems, 0);
        denialProbes++;
      }
    }
    for (const dealer of dealers) {
      const filter = `?perPage=500&filter=${encodeURIComponent(`dealer='${dealer}'`)}`;
      const units = await request(collection("inventory") + filter, admin.token);
      const deals = await request(collection("saved_deals") + filter, admin.token);
      assert.equal(units.totalItems, 240);
      assert.equal(deals.totalItems, 40);
      assert.equal(new Set(units.items.map((unit: any) => unit.stockNumber)).size, 240);
      assert(
        units.items
          .filter((unit: any) => unit.stockNumber.startsWith("load-"))
          .every((unit: any) => unit.price === 26000)
      );
      assert(
        deals.items.every(
          (deal: any) => deal.status === "pending" && deal.dealData.downPayment === 1500
        )
      );
    }
    assert.deepEqual(streamErrors, [], "SSE stream failed during integrity probes");
    const summary = latencySummary();
    lifecycle.finalizationAttempted = true;
    const supplemental = launcher.finalize ? await launcher.finalize() : {};
    lifecycle.supplemental = supplemental;
    assert.deepEqual(streamErrors, [], "SSE stream failed during launcher verification");
    cancellation.signal.throwIfAborted();
    return {
      passed: true,
      launcher: { name: launcher.name, supplemental },
      version,
      runtimeSettings: launcher.runtimeSettings ?? runtimeSettings,
      host: {
        platform: os.platform(),
        arch: os.arch(),
        cpu: os.cpus()[0]?.model,
        logicalCpus: os.cpus().length,
        loadAverage: os.loadavg(),
        memoryGiB: Number((os.totalmem() / 2 ** 30).toFixed(1)),
      },
      envelope,
      elapsedSeconds: Number(elapsedSeconds.toFixed(3)),
      workloadRequests: 1200,
      workloadRequestsPerSecond: Number((1200 / elapsedSeconds).toFixed(2)),
      errors,
      latency: summary,
      integrity: {
        inventory: 1200,
        savedDeals: 200,
        denialProbes,
        sseConnections: streams.length,
        sseEvents: streams.reduce(
          (sum, stream) => sum + [...stream.events.values()].reduce((a, b) => a + b, 0),
          0
        ),
        passed: true,
      },
      resources: {
        ...resourceSummary(),
        databaseBytes: (await stat(path.join(directory, "data.db"))).size,
      },
    };
  } finally {
    if (monitor) clearInterval(monitor);
    for (const stream of streams) stream.controller.abort();
    await Promise.allSettled(streams.map((stream) => stream.done));
    await samplingTask;
  }
}
function failureReceipt(error: unknown, launcher: BenchmarkLauncher): BenchmarkReceipt {
  return {
    passed: false,
    launcher: {
      name: launcher.name,
      supplemental: error instanceof BenchmarkLauncherError ? error.details : {},
    },
    runtimeSettings: launcher.runtimeSettings ?? runtimeSettings,
    failure: error instanceof Error ? error.message : "Benchmark failed",
    errors,
    latency: latencySummary(),
    hostLoadAverage: os.loadavg(),
    progress: { ...progress },
    resources: resourceSummary(),
    streamErrors: [...streamErrors],
  };
}
/** Fixed loopback workload. Launchers own only the processes/resources they create. */
export async function runBenchmark(
  launcher: BenchmarkLauncher = nativeLauncher
): Promise<BenchmarkReceipt> {
  assert(!running, "A benchmark is already running in this process");
  running = true;
  samples.clear();
  resources.length = 0;
  streamErrors.length = 0;
  errors = 0;
  measuredFailure = undefined;
  cancellation = new AbortController();
  Object.assign(progress, {
    phase: "preflight",
    seededInventory: 0,
    createdInventory: 0,
    createdDeals: 0,
  });
  const cancel = () => cancellation.abort();
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  const lifecycle: RunLifecycle = {};
  let receipt: BenchmarkReceipt;
  const cleanupFailures: string[] = [];
  try {
    try {
      receipt = await executeBenchmark(launcher, lifecycle);
    } catch (error) {
      receipt = failureReceipt(error, launcher);
      if (lifecycle.supplemental)
        receipt.launcher = { name: launcher.name, supplemental: lifecycle.supplemental };
      if (lifecycle.child && !lifecycle.finalizationAttempted && launcher.finalize) {
        try {
          receipt.launcher = { name: launcher.name, supplemental: await launcher.finalize() };
        } catch (finalizationError) {
          receipt.launcher = {
            name: launcher.name,
            supplemental:
              finalizationError instanceof BenchmarkLauncherError ? finalizationError.details : {},
          };
          receipt.finalizationFailure =
            finalizationError instanceof Error
              ? finalizationError.message
              : "Launcher finalization failed";
        }
      }
    }
    try {
      if (lifecycle.child) await launcher.stop(lifecycle.child);
    } catch (error) {
      cleanupFailures.push(error instanceof Error ? error.message : "Launcher stop failed");
    }
    try {
      await launcher.cleanup?.();
    } catch (error) {
      cleanupFailures.push(error instanceof Error ? error.message : "Launcher cleanup failed");
    }
    // Preserve disposable data if owned-process cleanup failed; never delete under a possibly live server.
    if (lifecycle.directory && cleanupFailures.length === 0) {
      try {
        await rm(lifecycle.directory, { recursive: true, force: true });
      } catch (error) {
        cleanupFailures.push(
          error instanceof Error ? error.message : "Temporary data cleanup failed"
        );
      }
    }
    if (cleanupFailures.length)
      return {
        ...receipt,
        passed: false,
        failure: receipt.failure || "Benchmark cleanup failed",
        cleanupFailures,
      };
    return receipt;
  } finally {
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
    running = false;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const receipt = await runBenchmark();
  console.log(JSON.stringify(receipt, null, 2));
  if (!receipt.passed) process.exitCode = 1;
}
