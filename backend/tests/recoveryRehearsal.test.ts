// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:net";
import { readFileSync } from "node:fs";
import { rehearseBackup } from "../tools/rehearse-backup";

const mocks = vi.hoisted(() => ({ execFileSync: vi.fn(), spawn: vi.fn(), mkdtempSync: vi.fn() }));
vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  execFileSync: mocks.execFileSync,
  spawn: mocks.spawn,
}));
vi.mock("node:fs", async (original) => ({
  ...(await original<typeof import("node:fs")>()),
  mkdtempSync: mocks.mkdtempSync,
}));
afterEach(() => vi.clearAllMocks());

describe("recovery rehearsal isolation gates", () => {
  it("refuses a mismatched runtime before creating data or spawning a server", async () => {
    mocks.execFileSync.mockReturnValue("pocketbase version 0.23.4\n");
    await expect(rehearseBackup("/synthetic/test/pocketbase")).rejects.toThrow(
      "Binary must match Dockerfile PB_VERSION"
    );
    expect(mocks.execFileSync).toHaveBeenCalledExactlyOnceWith(
      "/synthetic/test/pocketbase",
      ["--version"],
      { encoding: "utf8" }
    );
    expect(mocks.mkdtempSync).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("refuses an occupied exclusive port without contacting or stopping its owner", async () => {
    const version = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8").match(
      /ARG PB_VERSION=([\d.]+)/
    )![1];
    mocks.execFileSync.mockReturnValue(`pocketbase version ${version}\n`);
    const existing = createServer();
    await new Promise<void>((done, reject) => {
      existing.once("error", reject);
      existing.listen(8099, "127.0.0.1", done);
    });
    try {
      await expect(rehearseBackup("/synthetic/test/pocketbase")).rejects.toMatchObject({
        code: "EADDRINUSE",
      });
      expect(existing.listening).toBe(true);
      expect(mocks.mkdtempSync).not.toHaveBeenCalled();
      expect(mocks.spawn).not.toHaveBeenCalled();
      expect(mocks.execFileSync).toHaveBeenCalledTimes(1);
    } finally {
      await new Promise<void>((done, reject) =>
        existing.close((error) => (error ? reject(error) : done()))
      );
    }
  });
});
