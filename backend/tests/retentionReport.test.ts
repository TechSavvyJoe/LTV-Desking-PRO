// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reportRetention } from "../tools/retention-report";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
const dealerId = "dealeraid12345x";
const id = (index: number) => `row${String(index).padStart(12, "0")}`;

function harness(mode = "normal") {
  const root = mkdtempSync(join(tmpdir(), "ltv-retention-test-"));
  roots.push(root);
  const output = join(root, "report");
  const calls: URL[] = [];
  const old = "2025-01-01 12:00:00.000Z";
  const fresh = "2026-02-01T00:00:00.000Z";
  const fetcher = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(url);
    expect(init?.method).toBe("GET");
    expect(init?.redirect).toBe("error");
    if (mode === "invalid-json")
      return new Response("PRIVATE_PAYLOAD is not JSON", { status: 200 });
    let body: unknown = { name: "users", fields: [] };
    if (url.pathname.includes("/dealers/records/")) {
      body = { id: dealerId, active: true, updated: "stable" };
    } else if (url.pathname.endsWith("/records")) {
      const collection = url.pathname.split("/")[3];
      const platform = collection === "audit_log";
      expect(url.searchParams.get("fields")).toBe(
        platform ? "id,created,updated" : "id,dealer,created,updated"
      );
      expect(url.searchParams.get("filter")).toBe(platform ? null : `dealer = '${dealerId}'`);
      const page = Number(url.searchParams.get("page"));
      let rows = (
        collection === "saved_deals"
          ? [
              { updated: old, created: old },
              { updated: fresh, created: old },
              { updated: "", created: old },
              { updated: "2025-02-31T00:00:00.000Z", created: old },
              { updated: old, created: fresh },
              { updated: "2026-01-01T00:00:00.000Z", created: old },
            ]
          : [{ updated: old, created: old }]
      ).map((row, i) => ({ ...row, id: id(i), dealer: dealerId, details: "PRIVATE_PAYLOAD" }));
      if (mode === "pagination" || mode === "changing" || mode === "duplicate") {
        rows = Array.from({ length: collection === "saved_deals" ? 501 : 1 }, (_, i) => ({
          id: id(i),
          dealer: dealerId,
          created: old,
          updated: old,
          details: "PRIVATE_PAYLOAD",
        }));
      }
      if (mode === "scope") rows[0]!.dealer = "dealerbid45678x";
      const totalItems = rows.length + (mode === "changing" && page === 2 ? 1 : 0);
      const items = rows.slice((page - 1) * 500, page * 500);
      if (mode === "duplicate" && page === 2) items[0]!.id = id(0);
      body = { page, totalItems, totalPages: Math.ceil(totalItems / 500), items };
    }
    return new Response(JSON.stringify(mode === "denied" ? { message: "PRIVATE_PAYLOAD" } : body), {
      status: mode === "denied" ? 403 : 200,
    });
  }) as typeof fetch;
  return {
    output,
    calls,
    options: {
      url: "http://127.0.0.1:8091",
      dealerId,
      token: "synthetic-credential",
      before: "2026-01-01T00:00:00.000Z",
      output,
      fetcher,
    },
  };
}

describe("read-only retention review", () => {
  it("uses last update for deals, created for immutable events, and separates unknown dates", async () => {
    const h = harness();
    const report = await reportRetention(h.options);
    expect(report.summaries[0]).toMatchObject({
      total: 6,
      olderThanCutoff: 1,
      atOrAfterCutoff: 2,
      reviewNeeded: 3,
      missingTimestamp: 1,
      invalidTimestamp: 1,
      inconsistentTimestamps: 1,
      dateField: "updated",
    });
    expect(report.summaries[1]).toMatchObject({
      total: 1,
      olderThanCutoff: 1,
      dateField: "created",
    });
    expect(h.calls.some((url) => url.pathname.includes("audit_log"))).toBe(false);
    expect(report.platformAudit).toContain("no authoritative dealer relation");
    expect(report.destructiveActions).toBe(false);
  });

  it("requires explicit opt-in for globally scoped audit counts and stores no payloads or credentials", async () => {
    const h = harness();
    const report = await reportRetention({ ...h.options, includePlatformAudit: true });
    expect(report.summaries[2]).toMatchObject({
      scope: "platform",
      collection: "audit_log",
      total: 1,
    });
    const bytes = readFileSync(join(h.output, "report.json"));
    const receipt = JSON.parse(readFileSync(join(h.output, "receipt.json"), "utf8"));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(receipt.sha256);
    expect(String(bytes)).not.toContain("PRIVATE_PAYLOAD");
    expect(String(bytes)).not.toContain(h.options.token);
    expect(String(bytes)).not.toContain(id(0));
    expect(statSync(h.output).mode & 0o777).toBe(0o700);
    expect(statSync(join(h.output, "report.json")).mode & 0o777).toBe(0o600);
    expect(statSync(join(h.output, "receipt.json")).mode & 0o777).toBe(0o400);
    await expect(reportRetention(h.options)).rejects.toThrow();
    expect(readFileSync(join(h.output, "report.json"))).toEqual(bytes);
  });

  it("counts every page without publishing record IDs", async () => {
    const h = harness("pagination");
    const report = await reportRetention(h.options);
    expect(report.summaries[0]).toMatchObject({ total: 501, olderThanCutoff: 501 });
  });

  it.each(["scope", "changing", "duplicate"])(
    "rejects %s inconsistencies without leaving output",
    async (mode) => {
      const h = harness(mode);
      await expect(reportRetention(h.options)).rejects.toThrow();
      expect(existsSync(h.output)).toBe(false);
    }
  );

  it("fails closed on privilege denial without revealing its response body", async () => {
    const h = harness("denied");
    await expect(reportRetention(h.options)).rejects.toThrow("HTTP 403");
    expect(h.calls).toHaveLength(1);
    expect(existsSync(h.output)).toBe(false);
  });

  it("does not expose a malformed successful response body in an error", async () => {
    const h = harness("invalid-json");
    await expect(reportRetention(h.options)).rejects.toThrow(
      "PocketBase retention response was invalid JSON."
    );
    expect(existsSync(h.output)).toBe(false);
  });

  it("rejects ambiguous dates, unsafe origins and injectable IDs before any request", async () => {
    const h = harness();
    for (const before of ["2026-01-01", "2025-02-31T00:00:00.000Z", "2026-01-01T00:00:00+01:00"]) {
      await expect(reportRetention({ ...h.options, before })).rejects.toThrow(
        "exact UTC timestamp"
      );
    }
    await expect(reportRetention({ ...h.options, url: "http://remote.example" })).rejects.toThrow(
      "origin"
    );
    await expect(reportRetention({ ...h.options, dealerId: "injected'" })).rejects.toThrow(
      "record ID"
    );
    expect(h.calls).toHaveLength(0);
  });
});
