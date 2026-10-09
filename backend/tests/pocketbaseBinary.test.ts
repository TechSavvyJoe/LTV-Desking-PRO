// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ensurePocketBaseBinary } from "../../tests/helpers/pocketbase-binary";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function fixture(version: string, name = "pocketbase") {
  const root = mkdtempSync(join(tmpdir(), "ltv-pb-version-test-"));
  roots.push(root);
  const binary = join(root, name);
  writeFileSync(
    binary,
    `#!/usr/bin/env node\nconsole.log(${JSON.stringify(`pocketbase version ${version}`)});\n`,
    { mode: 0o755 }
  );
  return { root, binary };
}

describe.skipIf(process.platform === "win32")("seed runtime version gate", () => {
  it("rejects a stale executable without replacing it", async () => {
    const { binary } = fixture("0.23.4");
    const before = readFileSync(binary);
    await expect(ensurePocketBaseBinary(binary)).rejects.toThrow("version mismatch");
    expect(readFileSync(binary)).toEqual(before);
  });

  it("accepts the deployment pin and executes paths without a shell", async () => {
    const { root, binary } = fixture("0.39.6", "pb $(touch SHOULD_NOT_EXIST) with spaces");
    await expect(ensurePocketBaseBinary(binary)).resolves.toBe(binary);
    expect(existsSync(join(root, "SHOULD_NOT_EXIST"))).toBe(false);
    expect(existsSync(resolve("SHOULD_NOT_EXIST"))).toBe(false);
  });

  it("refuses unpinned versions or malformed download hashes before executing", async () => {
    const { binary } = fixture("0.39.6");
    await expect(ensurePocketBaseBinary(binary, { version: "0.40.5" })).rejects.toThrow(
      "PB_SHA256"
    );
    await expect(ensurePocketBaseBinary(binary, { checksum: "invalid" })).rejects.toThrow(
      "Invalid PB_SHA256"
    );
    await expect(ensurePocketBaseBinary(binary, { version: "latest" })).rejects.toThrow(
      "Invalid PB_VERSION"
    );
  });

  it("fails before the CLI can reset an existing fixture database", () => {
    const { root, binary } = fixture("0.23.4");
    const database = join(root, "data.db");
    writeFileSync(database, "keep existing fixture intact");
    let failure: unknown;
    try {
      execFileSync(
        process.execPath,
        [resolve("node_modules/tsx/dist/cli.mjs"), resolve("tests/helpers/seed-test-db.ts")],
        {
          env: {
            ...process.env,
            PB_BIN: binary,
            PB_PATH: binary,
            PB_VERSION: "0.39.6",
            PB_SHA256: "",
            PB_DATA_DIR: root,
          },
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 10_000,
        }
      );
    } catch (error) {
      failure = error;
    }
    expect(String((failure as { stderr?: Buffer } | undefined)?.stderr)).toContain(
      "version mismatch"
    );
    expect(readFileSync(database, "utf8")).toBe("keep existing fixture intact");
  });
});
