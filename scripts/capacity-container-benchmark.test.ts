// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ChildProcess } from "node:child_process";
import { BenchmarkLauncherError, type BenchmarkContext } from "./capacity-benchmark";
import {
  createContainerLauncher,
  parseCgroupCounters,
  parseRuntimeSettings,
  type DockerOperations,
} from "./capacity-container-benchmark";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const imageId = "sha256:" + "a".repeat(64);
const containerId = "b".repeat(64);
const runtime = "pocketbase:alive\npocketbase:GOMEMLIMIT=512MiB\nlitestream:alive\n";
function counters(peak = 600 * 1024 ** 2, oom = 0) {
  return [
    String(peak),
    "low 0\nhigh 0\nmax 0\noom " + oom + "\noom_kill " + oom,
    String(1024 ** 3),
    "0",
    "usage_usec 1000\nnr_periods 100\nnr_throttled 20\nthrottled_usec 50",
    "100000 100000",
  ].join("\n---\n");
}
async function harness(
  options: {
    peak?: number;
    oom?: number;
    syncMismatch?: boolean;
    ownership?: boolean;
    unknownCreate?: boolean;
    unknownVersion?: boolean;
  } = {}
) {
  const directory = await mkdtemp(path.join(tmpdir(), "ltv-container-test-"));
  roots.push(directory);
  const calls: string[][] = [];
  const waits: number[] = [];
  let runId = "";
  let stopped = false;
  let created = false;
  let containerName = "";
  const context: BenchmarkContext = {
    directory,
    flags: [],
    env: {},
    password: "SyntheticTest123!",
  };
  const operations: DockerOperations = {
    command: async (args) => {
      calls.push(args);
      if (args[0] === "image")
        return JSON.stringify([
          { Id: imageId, Os: "linux", Architecture: "amd64", Config: { Cmd: ["/pb/start.sh"] } },
        ]);
      if (args[0] === "run") {
        runId = args[args.indexOf("--label") + 1]!.split("=")[1]!;
        containerName = args[args.indexOf("--name") + 1]!;
        if (options.unknownVersion) {
          created = true;
          throw new Error("Synthetic version probe timeout");
        }
        return args.includes("/pb/litestream") ? "0.5.14\n" : "pocketbase version 0.39.6\n";
      }
      if (args[0] === "create") {
        runId = args[args.indexOf("--label") + 1]!.split("=")[1]!;
        containerName = args[args.indexOf("--name") + 1]!;
        created = true;
        if (options.unknownCreate) throw new Error("Synthetic Docker create timeout");
        return containerId;
      }
      if (args[0] === "ps") return created ? containerId : "";
      if (args[0] === "inspect")
        return JSON.stringify([
          {
            Id: containerId,
            Name: "/" + containerName,
            Image: imageId,
            Config: {
              Labels: { "ltv.capacity.run": options.ownership === false ? "foreign" : runId },
            },
            State: { Running: !stopped, OOMKilled: false },
            RestartCount: 0,
          },
        ]);
      if (args[0] === "stop") {
        stopped = true;
        return containerId;
      }
      if (args[0] === "rm") {
        created = false;
        return containerId;
      }
      if (args.includes("sync"))
        return JSON.stringify({ txid: 42, replica_txid: options.syncMismatch ? 41 : 42 });
      if (args.includes("restore")) {
        await writeFile(path.join(directory, ".proof/data.db"), "synthetic restored bytes");
        return "integrity passed";
      }
      if (args[0] === "exec" && args.at(-1)?.includes("memory.peak"))
        return counters(options.peak, options.oom);
      if (args[0] === "exec" && args.at(-1)?.includes("/proc/")) return runtime;
      throw new Error("Unexpected fake Docker operation");
    },
    attach: (args) => {
      calls.push(args);
      return {} as ChildProcess;
    },
    wait: async (ms) => {
      waits.push(ms);
    },
  };
  const launcher = createContainerLauncher("ltv-capacity:ci", operations);
  if (!options.unknownVersion) await launcher.version();
  return { directory, context, launcher, calls, waits };
}

describe("hard-cgroup container launcher without Docker or local workload", () => {
  it("uses production image/startup, explicit hard limits, synthetic file replication and owned cleanup", async () => {
    const h = await harness();
    await h.launcher.prepare(h.context);
    h.launcher.start(h.context);
    const create = h.calls.find((call) => call[0] === "create")!;
    expect(create).toEqual(
      expect.arrayContaining([
        "--cpus=1",
        "--memory=1g",
        "--memory-swap=1g",
        "--restart=no",
        "127.0.0.1:8098:8080",
        imageId,
      ])
    );
    expect(create.at(-1)).toContain("exec /pb/start.sh");
    expect(create.join(" ")).not.toContain("ALLOW_NO_BACKUP=1");
    expect(create.join(" ")).not.toContain("GOMEMLIMIT=");
    expect(create.join(" ")).not.toContain("GOMAXPROCS=");
    expect(await readFile(path.join(h.directory, ".litestream-ci.yml"), "utf8")).toContain(
      "type: file"
    );
    expect(h.launcher.sampleResources).toBeUndefined();
    const receipt = await h.launcher.finalize!();
    expect(receipt.memoryPeakBytes).toBe(600 * 1024 ** 2);
    expect(receipt.runtimeSettings).toEqual(parseRuntimeSettings(runtime));
    expect(receipt.replica).toEqual({
      type: "synthetic-local-file",
      confirmedTxid: 42,
      integrityCheck: "full",
      restored: true,
    });
    expect(h.waits).toEqual([20_000]);
    await h.launcher.stop({} as ChildProcess);
    await h.launcher.cleanup!();
    expect(h.calls.at(-1)).toEqual(["rm", "--force", containerId]);
  });

  it.each([{ peak: 769 * 1024 ** 2 }, { oom: 1 }])(
    "fails closed with retained aggregate evidence for %j",
    async (options) => {
      const h = await harness(options);
      await h.launcher.prepare(h.context);
      await expect(h.launcher.finalize!()).rejects.toBeInstanceOf(BenchmarkLauncherError);
      try {
        await h.launcher.finalize!();
      } catch (error) {
        expect((error as BenchmarkLauncherError).details.memoryPeakBytes).toBe(
          options.peak ?? 600 * 1024 ** 2
        );
      }
      await h.launcher.cleanup!();
    }
  );

  it("rejects missing replication acknowledgement", async () => {
    const h = await harness({ syncMismatch: true });
    await h.launcher.prepare(h.context);
    await expect(h.launcher.finalize!()).rejects.toThrow("replication was not confirmed");
    expect(h.calls.some((call) => call.includes("restore"))).toBe(false);
    await h.launcher.cleanup!();
  });

  it("recovers unknown create outcomes by exact unique label and never removes foreign ownership", async () => {
    const h = await harness({ unknownCreate: true });
    await expect(h.launcher.prepare(h.context)).rejects.toThrow("timeout");
    await h.launcher.cleanup!();
    expect(h.calls.some((call) => call[0] === "ps" && call.includes("--no-trunc"))).toBe(true);
    expect(h.calls.at(-1)).toEqual(["rm", "--force", containerId]);
    const foreign = await harness({ ownership: false });
    await foreign.launcher.prepare(foreign.context);
    await expect(foreign.launcher.cleanup!()).rejects.toThrow("ownership changed");
    expect(foreign.calls.some((call) => call[0] === "rm")).toBe(false);
  });

  it("requires exact cgroup v2 limits and observed per-process Go settings", () => {
    expect(() => parseCgroupCounters(counters().replace("1073741824", "max"))).toThrow();
    expect(() => parseCgroupCounters(counters().replace("100000 100000", "200000 100000"))).toThrow(
      "one CPU"
    );
    expect(() =>
      parseCgroupCounters(counters().replace("\n---\n0\n---\n", "\n---\n1024\n---\n"))
    ).toThrow("swap");
    expect(() => parseRuntimeSettings(runtime.replace("512MiB", "99MiB"))).toThrow("memory target");
    expect(() => parseRuntimeSettings(runtime + "litestream:GOMEMLIMIT=512MiB\n")).toThrow(
      "leaked"
    );
    expect(() => parseRuntimeSettings(runtime + "pocketbase:GOGC=50\n")).toThrow("default");
    expect(() => parseRuntimeSettings(runtime + "pocketbase:GOMAXPROCS=1\n")).toThrow("automatic");
  });
  it("cleans uniquely labelled version probes after unknown outcomes before prepare", async () => {
    const h = await harness({ unknownVersion: true });
    await expect(h.launcher.version()).rejects.toThrow("probe timeout");
    await h.launcher.cleanup!();
    expect(h.calls.some((call) => call[0] === "create")).toBe(false);
    expect(h.calls.at(-1)).toEqual(["rm", "--force", containerId]);
  });
});
