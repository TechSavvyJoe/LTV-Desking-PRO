// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function harness() {
  const root = mkdtempSync(join(tmpdir(), "ltv-startup-"));
  roots.push(root);
  mkdirSync(join(root, "pb_data"));
  mkdirSync(join(root, "bin"));
  // Exercise the production script without creating /pb or touching real data.
  writeFileSync(
    join(root, "start.sh"),
    readFileSync(resolve("backend/start.sh"), "utf8").replaceAll("/pb/", `${root}/`)
  );
  writeFileSync(join(root, "bin/timeout"), '#!/bin/sh\nshift\nexec "$@"\n', { mode: 0o700 });
  writeFileSync(
    join(root, "litestream"),
    `#!/bin/sh
if [ "$1" = "restore" ]; then
  echo restore >> "$HARNESS_ROOT/events"
  while [ "$#" -gt 0 ]; do
    if [ "$1" = "-o" ]; then shift; candidate="$1"; fi
    shift
  done
  if [ "$RESTORE_MODE" = "cancelled" ]; then
    # v0.5.14 preserves the renamed output if integrity check is cancelled.
    echo unvalidated > "$candidate"
    exit 124
  fi
  if [ "$RESTORE_MODE" = "empty" ]; then exit 0; fi
  echo validated > "$candidate"
  exit 0
fi
echo replicate >> "$HARNESS_ROOT/events"
`,
    { mode: 0o700 }
  );
  writeFileSync(join(root, "pocketbase"), '#!/bin/sh\necho plain >> "$HARNESS_ROOT/events"\n', {
    mode: 0o700,
  });
  const run = (env: Record<string, string> = {}) =>
    spawnSync("/bin/sh", [join(root, "start.sh")], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${root}/bin:${process.env.PATH}`,
        HARNESS_ROOT: root,
        LITESTREAM_ACCESS_KEY_ID: "test",
        LITESTREAM_SECRET_ACCESS_KEY: "test",
        LITESTREAM_BUCKET: "test",
        LITESTREAM_ENDPOINT: "test",
        ALLOW_FRESH_DB: "0",
        ALLOW_NO_BACKUP: "0",
        ...env,
      },
    });
  const events = () =>
    existsSync(join(root, "events")) ? readFileSync(join(root, "events"), "utf8") : "";
  return { root, run, events, db: join(root, "pb_data/data.db") };
}

describe("PocketBase startup restore publication", () => {
  it("retries a cancelled integrity check on the next boot without serving its output", () => {
    const h = harness();
    expect(h.run({ RESTORE_MODE: "cancelled" }).status).toBe(1);
    expect(existsSync(h.db)).toBe(false);
    expect(h.run({ RESTORE_MODE: "cancelled" }).status).toBe(1);
    expect(existsSync(h.db)).toBe(false);
    expect(h.events()).toBe("restore\nrestore\n");
    expect(h.run().status).toBe(0);
    expect(readFileSync(h.db, "utf8")).toBe("validated\n");
    expect(h.events()).toBe("restore\nrestore\nrestore\nreplicate\n");
  });

  it("discards a candidate left by a killed process before retrying", () => {
    const h = harness();
    writeFileSync(`${h.db}.restore`, "unvalidated");
    writeFileSync(`${h.db}.restore.tmp`, "partial");
    expect(h.run().status).toBe(0);
    expect(readFileSync(h.db, "utf8")).toBe("validated\n");
    expect(existsSync(`${h.db}.restore.tmp`)).toBe(false);
  });

  it("fails closed when no replica exists unless fresh bootstrap is explicit", () => {
    const h = harness();
    expect(h.run({ RESTORE_MODE: "empty" }).status).toBe(1);
    expect(h.events()).toBe("restore\n");
    expect(h.run({ RESTORE_MODE: "empty", ALLOW_FRESH_DB: "1" }).status).toBe(0);
    expect(h.events()).toBe("restore\nrestore\nreplicate\n");
  });

  it("preserves an existing production database and never attempts restore", () => {
    const h = harness();
    writeFileSync(h.db, "existing");
    expect(h.run({ RESTORE_MODE: "cancelled" }).status).toBe(0);
    expect(readFileSync(h.db, "utf8")).toBe("existing");
    expect(h.events()).toBe("replicate\n");
  });

  it("requires backup settings and makes plain mode an explicit override", () => {
    const h = harness();
    expect(h.run({ LITESTREAM_BUCKET: "" }).status).toBe(1);
    expect(h.events()).toBe("");
    expect(h.run({ LITESTREAM_BUCKET: "", ALLOW_NO_BACKUP: "1" }).status).toBe(0);
    expect(h.events()).toBe("plain\n");
  });
});
