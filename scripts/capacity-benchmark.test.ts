// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import {
  BenchmarkLauncherError,
  runBenchmark,
  type BenchmarkContext,
  type BenchmarkLauncher,
} from "./capacity-benchmark";
import { createContainerLauncher } from "./capacity-container-benchmark";

const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});
function launcher(overrides: Partial<BenchmarkLauncher> = {}) {
  let context: BenchmarkContext | undefined;
  const cleanup = vi.fn(async () => {});
  const start = vi.fn(() => {
    throw new Error("start deliberately failed");
  });
  const stop = vi.fn(async () => {});
  const instance: BenchmarkLauncher = {
    name: "hermetic",
    version: () => "pocketbase version 0.39.6",
    readyMarker: "owned test marker",
    prepare: (value) => {
      context = value;
      directories.push(value.directory);
    },
    start,
    stop,
    cleanup,
    ...overrides,
  };
  return { instance, cleanup, start, stop, context: () => context };
}

describe("capacity benchmark launcher boundaries", () => {
  it("keeps actual container Go settings in failed receipts instead of native execution settings", async () => {
    // Constructing the launcher performs no Docker calls. Fail before serving.
    const declared = createContainerLauncher("ltv-capacity:ci").runtimeSettings;
    const h = launcher({ runtimeSettings: declared });
    const receipt = await runBenchmark(h.instance);
    expect(receipt.passed).toBe(false);
    expect(receipt.runtimeSettings).toEqual({
      pocketbase: {
        GOMEMLIMIT: "512MiB",
        GOMAXPROCS: "automatic (unset)",
        GOGC: "default (unset)",
      },
      litestream: {
        GOMEMLIMIT: "unset",
        GOMAXPROCS: "automatic (unset)",
        GOGC: "default (unset)",
      },
    });
  });
  it("imports without invoking a binary, printing receipts, or installing signal handlers", () => {
    const stdout = execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `
      const before = [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')];
      const module = await import('./scripts/capacity-benchmark.ts');
      if (typeof module.runBenchmark !== 'function') throw new Error('missing export');
      const after = [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')];
      if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('signal side effect');
      console.log('import-only');
    `,
      ],
      { encoding: "utf8", env: { ...process.env, CAPACITY_PB_BIN: "/missing-disallowed-binary" } }
    );
    expect(stdout).toBe("import-only\n");
  });

  it("refuses a busy loopback port without preparing data or contacting its listener", async () => {
    let connections = 0;
    const server = createServer((socket) => {
      connections++;
      socket.destroy();
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(8098, "127.0.0.1", resolve);
    });
    try {
      const prepare = vi.fn();
      const version = vi.fn(() => "pocketbase version 0.39.6");
      const h = launcher({ prepare, version });
      const receipt = await runBenchmark(h.instance);
      expect(receipt).toMatchObject({ passed: false, progress: { phase: "preflight" } });
      expect(receipt.failure).toContain("EADDRINUSE");
      expect(version).not.toHaveBeenCalled();
      expect(prepare).not.toHaveBeenCalled();
      expect(h.start).not.toHaveBeenCalled();
      expect(h.stop).not.toHaveBeenCalled();
      expect(connections).toBe(0);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("cleans partial preparation and removes signal handlers without starting a process", async () => {
    const before = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];
    const h = launcher();
    const prepare = h.instance.prepare;
    h.instance.prepare = async (context) => {
      await prepare(context);
      throw new Error("prepare deliberately failed");
    };
    const receipt = await runBenchmark(h.instance);
    expect(receipt).toMatchObject({ passed: false, failure: "prepare deliberately failed" });
    expect(h.context()?.env).toMatchObject({ GOMEMLIMIT: "512MiB", GOMAXPROCS: "1" });
    expect(h.context()?.env.GOGC).toBeUndefined();
    expect(existsSync(h.context()!.directory)).toBe(false);
    expect(h.cleanup).toHaveBeenCalledOnce();
    expect(h.stop).not.toHaveBeenCalled();
    expect([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")]).toEqual(before);
  });

  it("cleans launcher-owned resources if start fails and preserves data if cleanup fails", async () => {
    const h = launcher({
      cleanup: async () => {
        throw new Error("cleanup deliberately failed");
      },
    });
    const receipt = await runBenchmark(h.instance);
    expect(receipt).toMatchObject({
      passed: false,
      failure: "start deliberately failed",
      cleanupFailures: ["cleanup deliberately failed"],
    });
    expect(existsSync(h.context()!.directory)).toBe(true);
    expect(h.stop).not.toHaveBeenCalled();
  });

  it("stops only the returned child and retains failed cgroup evidence before cleanup", async () => {
    const order: string[] = [];
    const h = launcher({
      start: () =>
        spawn(process.execPath, ["-e", "process.exit(7)"], { stdio: ["ignore", "pipe", "pipe"] }),
      finalize: async () => {
        order.push("finalize");
        throw new BenchmarkLauncherError("resource gate failed", { oomKill: 1 });
      },
      stop: async (child) => {
        order.push("stop");
        expect(child.exitCode).toBe(7);
      },
      cleanup: async () => {
        order.push("cleanup");
      },
    });
    const receipt = await runBenchmark(h.instance);
    expect(receipt).toMatchObject({
      passed: false,
      launcher: { name: "hermetic", supplemental: { oomKill: 1 } },
      finalizationFailure: "resource gate failed",
    });
    expect(order).toEqual(["finalize", "stop", "cleanup"]);
    expect(existsSync(h.context()!.directory)).toBe(false);
  });

  it("cancels before start and rejects concurrent use without replacing active cleanup", async () => {
    let release!: () => void;
    let prepared!: () => void;
    const ready = new Promise<void>((resolve) => {
      prepared = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const h = launcher();
    const prepare = h.instance.prepare;
    h.instance.prepare = async (context) => {
      await prepare(context);
      prepared();
      await held;
    };
    const active = runBenchmark(h.instance);
    await ready;
    await expect(runBenchmark(launcher().instance)).rejects.toThrow("already running");
    const cancel = process.listeners("SIGTERM").at(-1)! as () => void;
    cancel();
    release();
    const receipt = await active;
    expect(receipt.passed).toBe(false);
    expect(h.start).not.toHaveBeenCalled();
    expect(h.cleanup).toHaveBeenCalledOnce();
    expect(existsSync(h.context()!.directory)).toBe(false);
  });
});
