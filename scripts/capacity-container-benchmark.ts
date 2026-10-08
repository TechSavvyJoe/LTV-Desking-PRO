/** Linux CI-only comparison; the workload is shared with the native harness. */
import assert from "node:assert/strict";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import {
  runBenchmark,
  BenchmarkLauncherError,
  type BenchmarkLauncher,
  type BenchmarkContext,
} from "./capacity-benchmark";

const execAsync = promisify(execFile);
const dockerPrefix = ["--host", "unix:///var/run/docker.sock"];
const dockerEnv = { PATH: process.env.PATH };
const memoryLimit = 1024 ** 3;
const headroomBudget = 768 * 1024 ** 2;
export interface DockerOperations {
  command: (args: string[]) => Promise<string>;
  attach: (args: string[]) => ChildProcess;
  wait: (ms: number) => Promise<void>;
}
const realOperations: DockerOperations = {
  command: async (args) => {
    try {
      return (
        await execAsync("docker", [...dockerPrefix, ...args], {
          env: dockerEnv,
          timeout: 60_000,
          maxBuffer: 1024 * 1024,
        })
      ).stdout;
    } catch {
      // Do not expose Docker argv/stdout or inherited credentials in receipts.
      throw new Error("Docker " + args[0] + " failed or timed out.");
    }
  },
  attach: (args) =>
    spawn("docker", [...dockerPrefix, ...args], {
      env: dockerEnv,
      stdio: ["ignore", "pipe", "pipe"],
    }),
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export function parseCgroupCounters(text: string) {
  const sections = text.trim().split("\n---\n");
  assert.equal(sections.length, 6, "Incomplete cgroup counters");
  const integer = (value: string | undefined) => {
    assert(value !== undefined && /^\d+$/.test(value.trim()), "Invalid cgroup integer");
    const parsed = Number(value.trim());
    assert(Number.isSafeInteger(parsed), "Unsafe cgroup integer");
    return parsed;
  };
  const counters = (value: string) =>
    Object.fromEntries(
      value
        .trim()
        .split("\n")
        .map((line) => {
          const [name, count] = line.trim().split(/\s+/);
          assert(name, "Missing cgroup counter name");
          return [name, integer(count)];
        })
    );
  const events = counters(sections[1]!);
  assert("oom" in events && "oom_kill" in events, "Missing OOM counters");
  const cpu = counters(sections[4]!);
  assert("usage_usec" in cpu && "nr_throttled" in cpu, "Missing CPU counters");
  const [quota, period] = sections[5]!.trim().split(/\s+/).map(integer);
  assert.equal(integer(sections[2]), memoryLimit, "Hard memory limit is not 1 GiB");
  assert.equal(integer(sections[3]), 0, "Container swap is not disabled");
  assert(quota! > 0 && quota === period, "Hard CPU quota is not one CPU");
  return {
    memoryPeakBytes: integer(sections[0]),
    memoryEvents: events,
    memoryMaxBytes: memoryLimit,
    memorySwapMaxBytes: 0,
    cpuStat: cpu,
    cpuMax: { quota, period },
  };
}

const cgroupCommand =
  'set -e; for file in memory.peak memory.events memory.max memory.swap.max cpu.stat cpu.max; do test -r "/sys/fs/cgroup/$file"; cat "/sys/fs/cgroup/$file"; if [ "$file" != cpu.max ]; then printf "\\n---\\n"; fi; done';
const runtimeCommand =
  'set -e; for proc in /proc/[0-9]*; do test -r "$proc/cmdline" || continue; cmd=$(tr "\\000" " " < "$proc/cmdline"); case "$cmd" in "/pb/pocketbase serve "*) name=pocketbase;; "/pb/litestream replicate "*) name=litestream;; *) continue;; esac; printf "%s:alive\\n" "$name"; tr "\\000" "\\n" < "$proc/environ" | while IFS= read -r item; do case "$item" in GOMEMLIMIT=*|GOMAXPROCS=*|GOGC=*) printf "%s:%s\\n" "$name" "$item";; esac; done; done';
export function parseRuntimeSettings(text: string) {
  const settings: Record<string, Record<string, string>> = { pocketbase: {}, litestream: {} };
  for (const line of text.trim().split("\n")) {
    const [processName, value] = line.split(":");
    assert(processName && processName in settings && value, "Invalid runtime evidence");
    if (value === "alive") settings[processName]!.alive = "true";
    else {
      const [key, setting] = value.split("=");
      assert(
        key && ["GOMEMLIMIT", "GOMAXPROCS", "GOGC"].includes(key) && setting,
        "Invalid Go setting"
      );
      settings[processName]![key] = setting;
    }
  }
  for (const processName of ["pocketbase", "litestream"]) {
    assert.equal(settings[processName]!.alive, "true", processName + " is not alive");
    assert.equal(
      settings[processName]!.GOMAXPROCS,
      undefined,
      "Production Go execution setting must remain automatic"
    );
    assert.equal(settings[processName]!.GOGC, undefined, "GOGC must retain its default");
  }
  assert.equal(settings.pocketbase!.GOMEMLIMIT, "512MiB", "PocketBase memory target differs");
  assert.equal(settings.litestream!.GOMEMLIMIT, undefined, "PocketBase limit leaked to Litestream");
  return settings;
}
const replicaConfig = [
  "snapshot:",
  "  interval: 24h",
  "  retention: 336h",
  "levels:",
  "  - interval: 1h",
  "    retention: 24h",
  "  - interval: 24h",
  "    retention: 336h",
  "validation:",
  "  interval: 6h",
  "socket:",
  "  enabled: true",
  "  path: /tmp/ltv-litestream.sock",
  "dbs:",
  "  - path: /pb/pb_data/data.db",
  "    replica:",
  "      type: file",
  "      path: /replica",
  "      sync-interval: 10s",
  "",
].join("\n");

export function createContainerLauncher(
  image: string,
  operations = realOperations
): BenchmarkLauncher {
  assert(/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]*$/.test(image), "Invalid explicit container image");
  const runId = randomUUID();
  const name = "ltv-capacity-" + runId;
  let containerId = "";
  let imageId = "";
  let creationAttempted = false;
  let context: BenchmarkContext | undefined;
  const command = operations.command;
  const inspect = async (id = containerId) => {
    assert(id, "Owned container was not created");
    const [state] = JSON.parse(await command(["inspect", id]));
    assert.equal(state.Id, id, "Container identity changed");
    assert.equal(state.Config.Labels["ltv.capacity.run"], runId, "Container ownership changed");
    assert.equal(state.Image, imageId, "Container image changed");
    assert(
      ["/" + name, "/" + name + "-pb-version", "/" + name + "-ls-version"].includes(state.Name),
      "Container name is not owned"
    );
    return state;
  };
  return {
    name: "docker-1cpu-1gib-file-replica",
    runtimeSettings: {
      pocketbase: {
        GOMEMLIMIT: "512MiB",
        GOMAXPROCS: "automatic (unset)",
        GOGC: "default (unset)",
      },
      litestream: { GOMEMLIMIT: "unset", GOMAXPROCS: "automatic (unset)", GOGC: "default (unset)" },
    },
    readyMarker: "Server started at http://0.0.0.0:8080",
    version: async () => {
      const [metadata] = JSON.parse(await command(["image", "inspect", image]));
      assert.equal(metadata.Os, "linux", "Use the Linux backend image");
      assert.equal(metadata.Architecture, "amd64", "Use the pinned amd64 backend image");
      assert.deepEqual(
        metadata.Config.Cmd,
        ["/pb/start.sh"],
        "Image does not use production startup"
      );
      assert(/^sha256:[a-f0-9]{64}$/.test(metadata.Id), "Missing immutable image identity");
      imageId = metadata.Id;
      creationAttempted = true;
      const version = await command([
        "run",
        "--rm",
        "--name",
        name + "-pb-version",
        "--label",
        "ltv.capacity.run=" + runId,
        "--pull=never",
        "--network=none",
        "--entrypoint",
        "/pb/pocketbase",
        imageId,
        "--version",
      ]);
      const litestreamVersion = await command([
        "run",
        "--rm",
        "--name",
        name + "-ls-version",
        "--label",
        "ltv.capacity.run=" + runId,
        "--pull=never",
        "--network=none",
        "--entrypoint",
        "/pb/litestream",
        imageId,
        "version",
      ]);
      assert(
        /(^|\s)v?0\.5\.14(\s|$)/.test(litestreamVersion.trim()),
        "Use pinned Litestream 0.5.14"
      );
      return version.trim();
    },
    prepare: async (input) => {
      assert(imageId, "Image must be verified before prepare");
      context = input;
      const replica = path.join(input.directory, ".replica");
      const proof = path.join(input.directory, ".proof");
      await mkdir(replica, { mode: 0o700 });
      await mkdir(proof, { mode: 0o700 });
      const config = path.join(input.directory, ".litestream-ci.yml");
      await writeFile(config, replicaConfig, { mode: 0o600, flag: "wx" });
      const bootstrap =
        'set -e; /pb/pocketbase migrate up --dir=/pb/pb_data --migrationsDir=/pb/pb_migrations; /pb/pocketbase superuser upsert benchmark@example.invalid "$CAPACITY_SYNTHETIC_PASSWORD" --dir=/pb/pb_data; exec /pb/start.sh';
      creationAttempted = true;
      containerId = (
        await command([
          "create",
          "--pull=never",
          "--name",
          name,
          "--label",
          "ltv.capacity.run=" + runId,
          "--cpus=1",
          "--memory=1g",
          "--memory-swap=1g",
          "--restart=no",
          "--user",
          (process.getuid?.() ?? 1000) + ":" + (process.getgid?.() ?? 1000),
          "--publish",
          "127.0.0.1:8098:8080",
          "--mount",
          "type=bind,src=" + input.directory + ",dst=/pb/pb_data",
          "--mount",
          "type=bind,src=" + replica + ",dst=/replica",
          "--mount",
          "type=bind,src=" + proof + ",dst=/proof",
          "--mount",
          "type=bind,src=" + config + ",dst=/pb/litestream.yml,readonly",
          "--env",
          "CAPACITY_SYNTHETIC_PASSWORD=" + input.password,
          "--env",
          "ALLOW_NO_BACKUP=0",
          "--env",
          "ALLOW_FRESH_DB=0",
          "--env",
          "LITESTREAM_BUCKET=synthetic-local-file",
          "--env",
          "LITESTREAM_ENDPOINT=https://synthetic.invalid",
          "--env",
          "LITESTREAM_ACCESS_KEY_ID=synthetic",
          "--env",
          "LITESTREAM_SECRET_ACCESS_KEY=synthetic",
          "--entrypoint",
          "/bin/sh",
          imageId,
          "-c",
          bootstrap,
        ])
      ).trim();
      assert(/^[a-f0-9]{64}$/.test(containerId), "Invalid owned container identity");
    },
    start: () => {
      assert(containerId, "Owned container was not prepared");
      return operations.attach(["start", "--attach", containerId]);
    },
    finalize: async () => {
      const evidence: Record<string, unknown> = { imageId, headroomBudgetBytes: headroomBudget };
      try {
        const state = await inspect();
        evidence.oomKilled = state.State.OOMKilled;
        evidence.running = state.State.Running;
        evidence.restarts = state.RestartCount;
        assert(state.State.Running, "Owned backend exited");
        assert.equal(state.State.OOMKilled, false, "Container OOM killed");
        assert.equal(state.RestartCount, 0, "Container restarted");
        const initialCounters = parseCgroupCounters(
          await command(["exec", containerId, "/bin/sh", "-c", cgroupCommand])
        );
        Object.assign(evidence, initialCounters);
        assert.equal(initialCounters.memoryEvents.oom, 0, "Aggregate cgroup OOM event");
        assert.equal(initialCounters.memoryEvents.oom_kill, 0, "Aggregate cgroup OOM kill");
        // The daemon IPC sync confirms delivery to the synthetic local-file replica.
        const sync = JSON.parse(
          await command([
            "exec",
            containerId,
            "/pb/litestream",
            "sync",
            "-wait",
            "-json",
            "-timeout",
            "30",
            "-socket",
            "/tmp/ltv-litestream.sock",
            "/pb/pb_data/data.db",
          ])
        );
        assert(
          sync.txid && sync.replica_txid === sync.txid,
          "Local file replication was not confirmed"
        );
        await command([
          "exec",
          containerId,
          "/pb/litestream",
          "restore",
          "-integrity-check",
          "full",
          "-config",
          "/pb/litestream.yml",
          "-o",
          "/proof/data.db",
          "/pb/pb_data/data.db",
        ]);
        assert(context, "Missing benchmark context");
        assert(
          (await stat(path.join(context.directory, ".proof/data.db"))).size > 0,
          "Replica restore is empty"
        );
        await operations.wait(20_000);
        const finalState = await inspect();
        assert(
          finalState.State.Running && !finalState.State.OOMKilled,
          "Backend exited or OOM killed"
        );
        assert.equal(finalState.RestartCount, 0, "Container restarted");
        const runtimeSettings = parseRuntimeSettings(
          await command(["exec", containerId, "/bin/sh", "-c", runtimeCommand])
        );
        const counters = parseCgroupCounters(
          await command(["exec", containerId, "/bin/sh", "-c", cgroupCommand])
        );
        Object.assign(evidence, counters, { runtimeSettings });
        assert.equal(counters.memoryEvents.oom, 0, "Aggregate cgroup OOM event");
        assert.equal(counters.memoryEvents.oom_kill, 0, "Aggregate cgroup OOM kill");
        assert(
          counters.memoryPeakBytes <= headroomBudget,
          "Aggregate peak exceeds 768 MiB headroom budget"
        );
        return {
          imageId,
          ...counters,
          headroomBudgetBytes: headroomBudget,
          idleSeconds: 20,
          oomKilled: false,
          restarts: 0,
          runtimeSettings,
          replica: {
            type: "synthetic-local-file",
            confirmedTxid: sync.txid,
            integrityCheck: "full",
            restored: true,
          },
          scope:
            "Short CI comparison; aggregate cgroup includes bootstrap, PocketBase, Litestream, verification helpers and local file cache. Node load client is outside. Not Fly hardware, R2 delivery or sustained capacity.",
        };
      } catch (error) {
        throw new BenchmarkLauncherError(
          error instanceof Error ? error.message : "Container evidence failed",
          evidence
        );
      }
    },
    stop: async (child) => {
      if (!containerId) return;
      const state = await inspect();
      if (state.State.Running) await command(["stop", "--time", "30", containerId]);
      // Stop the owned backend first, then terminate only its attachment CLI.
      if (child.pid && child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    },
    cleanup: async () => {
      if (creationAttempted) {
        // A Docker create timeout has an unknown outcome. Recover only a
        // container with this unique run label, never an arbitrary host name.
        const matches = (
          await command([
            "ps",
            "--all",
            "--no-trunc",
            "--filter",
            "label=ltv.capacity.run=" + runId,
            "--format",
            "{{.ID}}",
          ])
        )
          .trim()
          .split("\n")
          .filter(Boolean);
        assert(matches.length <= 3, "Ambiguous owned container cleanup");
        for (const id of matches) {
          assert(/^[a-f0-9]{64}$/.test(id), "Invalid recovered container identity");
          await inspect(id);
          await command(["rm", "--force", id]);
        }
      }
      containerId = "";
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    assert(
      process.platform === "linux" && process.env.CI === "true",
      "Container benchmark is Linux CI-only"
    );
    assert(
      !process.env.DOCKER_HOST || process.env.DOCKER_HOST === "unix:///var/run/docker.sock",
      "Remote Docker overrides are refused"
    );
    assert(!process.env.DOCKER_CONTEXT, "Docker context overrides are refused");
    const image = process.env.CAPACITY_CONTAINER_IMAGE;
    assert(image, "CAPACITY_CONTAINER_IMAGE must identify the locally built backend image");
    const receipt = await runBenchmark(createContainerLauncher(image));
    if (receipt.passed) {
      assert.equal(receipt.workloadRequests, 1200);
      const integrity = receipt.integrity as { sseEvents?: number; denialProbes?: number };
      assert.equal(integrity.sseEvents, 800);
      assert.equal(integrity.denialProbes, 80);
    }
    console.log(JSON.stringify(receipt, null, 2));
    if (!receipt.passed) process.exitCode = 1;
  } catch (error) {
    console.log(
      JSON.stringify({
        passed: false,
        failure: error instanceof Error ? error.message : "Container comparison failed",
      })
    );
    process.exitCode = 1;
  }
}
