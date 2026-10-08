// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportDealer } from "../tools/export-dealer";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
const dealerId = "dealeraid12345x";

function harness(mode = "normal") {
  const root = mkdtempSync(join(tmpdir(), "ltv-export-"));
  roots.push(root);
  const output = join(root, "archive");
  const calls: URL[] = [];
  const fetcher = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(url);
    expect(init?.method).toBe("GET");
    expect(init?.redirect).toBe("error");
    let body: unknown = { id: "users", name: "users" };
    if (url.pathname.includes("/dealers/records/")) {
      body = { id: dealerId, active: mode === "active", updated: "checkpoint" };
    } else if (url.pathname.endsWith("/records")) {
      const inventory = url.pathname.includes("/inventory/");
      const page = Number(url.searchParams.get("page"));
      expect(url.searchParams.get("filter")).toBe(`dealer = '${dealerId}'`);
      const count = inventory ? (page === 1 ? 500 : 1) : 0;
      body = {
        page,
        totalItems: inventory ? (mode === "changing" && page === 2 ? 502 : 501) : 0,
        totalPages: inventory ? 2 : 0,
        items: Array.from({ length: count }, (_, index) => ({
          id: `record-${page}-${index}`,
          dealer: mode === "scope" ? "otherdealer12345" : dealerId,
          value: "synthetic",
        })),
      };
    }
    return new Response(JSON.stringify(body), {
      status: mode === "denied" ? 403 : 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  const options = {
    url: "http://127.0.0.1:8090",
    dealerId,
    token: "synthetic-token",
    output,
    fetcher,
  };
  return { output, calls, options };
}

describe("read-only dealer export", () => {
  it("exports every page and writes a private, verifiable receipt without credentials", async () => {
    const h = harness();
    const receipt = await exportDealer(h.options);
    const inventory = JSON.parse(readFileSync(join(h.output, "inventory.json"), "utf8"));
    expect(inventory).toHaveLength(501);
    expect(receipt.files).toHaveLength(7);
    for (const file of receipt.files) {
      const bytes = readFileSync(join(h.output, file.file));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(file.sha256);
      expect(statSync(join(h.output, file.file)).mode & 0o777).toBe(0o600);
    }
    expect(statSync(h.output).mode & 0o777).toBe(0o700);
    expect(statSync(join(h.output, "receipt.json")).mode & 0o777).toBe(0o400);
    expect(JSON.stringify(receipt)).not.toContain(h.options.token);
    await expect(exportDealer(h.options)).rejects.toThrow();
    expect(JSON.parse(readFileSync(join(h.output, "inventory.json"), "utf8"))).toHaveLength(501);
  });

  it.each(["scope", "changing"])("discards partial output for %s failure", async (mode) => {
    const h = harness(mode);
    await expect(exportDealer(h.options)).rejects.toThrow();
    expect(existsSync(h.output)).toBe(false);
  });

  it("rejects active dealer exports unless the caller explicitly accepts a live export", async () => {
    const h = harness("active");
    await expect(exportDealer(h.options)).rejects.toThrow("Deactivate");
    expect(existsSync(h.output)).toBe(false);
    const receipt = await exportDealer({ ...h.options, allowActive: true });
    expect(receipt.dealerInactive).toBe(false);
  });

  it("requires privileged schema access before writing any archive", async () => {
    const h = harness("denied");
    await expect(exportDealer(h.options)).rejects.toThrow("HTTP 403");
    expect(h.calls).toHaveLength(1);
    expect(existsSync(h.output)).toBe(false);
  });

  it("rejects unsafe origins and invalid identities before fetching", async () => {
    const h = harness();
    for (const url of [
      "http://example.com",
      "https://user:secret@example.com",
      "https://example.com/api/",
    ]) {
      await expect(exportDealer({ ...h.options, url })).rejects.toThrow("origin");
    }
    await expect(exportDealer({ ...h.options, dealerId: "injected'" })).rejects.toThrow(
      "record ID"
    );
    expect(h.calls).toHaveLength(0);
  });
});
