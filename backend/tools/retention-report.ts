import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

type Row = Record<string, unknown>;
type CollectionName = "saved_deals" | "deal_events" | "audit_log";

function parseTimestamp(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(" ", "T");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(normalized)) return undefined;
  const canonical = normalized.includes(".") ? normalized : normalized.replace("Z", ".000Z");
  const time = Date.parse(canonical);
  return Number.isFinite(time) && new Date(time).toISOString() === canonical ? time : undefined;
}

/** Produces aggregate age information only. No deletion or anonymization is performed. */
export async function reportRetention(options: {
  url: string;
  dealerId: string;
  token: string;
  before: string;
  output: string;
  includePlatformAudit?: boolean;
  fetcher?: typeof fetch;
}) {
  const origin = new URL(options.url);
  if (
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/" ||
    (origin.protocol !== "https:" &&
      !(
        origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
      ))
  ) {
    throw new Error("Use an HTTPS origin or local HTTP origin without credentials or a path.");
  }
  if (!/^[a-zA-Z0-9]{15}$/.test(options.dealerId)) throw new Error("Invalid dealer record ID.");
  if (!options.token.trim()) throw new Error("PB_RETENTION_TOKEN is required.");
  const cutoff = parseTimestamp(options.before);
  if (cutoff === undefined)
    throw new Error(
      "--before requires an exact UTC timestamp, for example 2026-01-01T00:00:00.000Z."
    );
  const fetcher = options.fetcher ?? fetch;
  const request = async (path: string): Promise<unknown> => {
    const response = await fetcher(new URL(path, origin), {
      method: "GET",
      headers: { Authorization: `Bearer ${options.token}` },
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok)
      throw new Error(`PocketBase retention request failed (HTTP ${response.status}).`);
    try {
      return await response.json();
    } catch {
      throw new Error("PocketBase retention response was invalid JSON.");
    }
  };
  // Schema access requires an existing PB superuser; tenant admins may receive redacted data.
  const schema = (await request("/api/collections/users")) as Row;
  if (schema.name !== "users" || !Array.isArray(schema.fields))
    throw new Error("Privileged schema access could not be verified.");
  const dealerPath = `/api/collections/dealers/records/${options.dealerId}?fields=id,active,updated`;
  const dealer = (await request(dealerPath)) as Row;
  if (dealer.id !== options.dealerId) throw new Error("Dealer identity mismatch.");

  const summarize = async (
    collection: CollectionName,
    dateField: "created" | "updated",
    scope: "dealer" | "platform"
  ) => {
    let total: number | undefined;
    let totalPages: number | undefined;
    let olderThanCutoff = 0;
    let atOrAfterCutoff = 0;
    let missingTimestamp = 0;
    let invalidTimestamp = 0;
    let inconsistentTimestamps = 0;
    let oldest: number | undefined;
    let newest: number | undefined;
    const seen = new Set<string>();
    for (let page = 1; ; page++) {
      const query = new URLSearchParams({
        page: String(page),
        perPage: "500",
        sort: "id",
        fields: scope === "dealer" ? "id,dealer,created,updated" : "id,created,updated",
      });
      if (scope === "dealer") query.set("filter", `dealer = '${options.dealerId}'`);
      const response = (await request(`/api/collections/${collection}/records?${query}`)) as {
        items: Row[];
        totalItems: number;
        totalPages: number;
        page: number;
      };
      if (
        !Array.isArray(response.items) ||
        !Number.isSafeInteger(response.totalItems) ||
        response.totalItems < 0 ||
        !Number.isSafeInteger(response.totalPages) ||
        response.totalPages !== Math.ceil(response.totalItems / 500) ||
        response.page !== page ||
        (total !== undefined && response.totalItems !== total) ||
        (totalPages !== undefined && response.totalPages !== totalPages) ||
        response.items.length !== Math.min(500, Math.max(0, response.totalItems - (page - 1) * 500))
      ) {
        throw new Error(
          `Invalid or changing pagination for ${collection}. Retry with writes frozen.`
        );
      }
      total = response.totalItems;
      totalPages = response.totalPages;
      for (const row of response.items) {
        if (
          typeof row.id !== "string" ||
          !/^[a-zA-Z0-9]{15}$/.test(row.id) ||
          seen.has(row.id) ||
          (scope === "dealer" && row.dealer !== options.dealerId)
        ) {
          throw new Error(`Duplicate or incorrectly scoped record in ${collection}.`);
        }
        seen.add(row.id);
        const raw = row[dateField];
        if (raw === "" || raw === null || raw === undefined) {
          missingTimestamp++;
          continue;
        }
        const time = parseTimestamp(raw);
        if (time === undefined) {
          invalidTimestamp++;
          continue;
        }
        const created = parseTimestamp(row.created);
        const updated = parseTimestamp(row.updated);
        if (created !== undefined && updated !== undefined && updated < created) {
          inconsistentTimestamps++;
          continue;
        }
        oldest = oldest === undefined ? time : Math.min(oldest, time);
        newest = newest === undefined ? time : Math.max(newest, time);
        if (time < cutoff) olderThanCutoff++;
        else atOrAfterCutoff++;
      }
      if (page >= totalPages) break;
    }
    if (seen.size !== total) throw new Error(`Incomplete retention report for ${collection}.`);
    return {
      collection,
      scope,
      dateField,
      total,
      olderThanCutoff,
      atOrAfterCutoff,
      reviewNeeded: missingTimestamp + invalidTimestamp + inconsistentTimestamps,
      missingTimestamp,
      invalidTimestamp,
      inconsistentTimestamps,
      oldestObserved: oldest === undefined ? null : new Date(oldest).toISOString(),
      newestObserved: newest === undefined ? null : new Date(newest).toISOString(),
    };
  };
  const summaries = [
    await summarize("saved_deals", "updated", "dealer"),
    await summarize("deal_events", "created", "dealer"),
  ];
  if (options.includePlatformAudit)
    summaries.push(await summarize("audit_log", "created", "platform"));
  const finalDealer = await request(dealerPath);
  if (JSON.stringify(finalDealer) !== JSON.stringify(dealer))
    throw new Error("Dealer changed during retention report. Retry with writes frozen.");
  const report = {
    format: "ltv-retention-review-v1",
    completedAt: new Date().toISOString(),
    origin: origin.origin,
    dealerId: options.dealerId,
    beforeExclusive: new Date(cutoff).toISOString(),
    destructiveActions: false,
    consistency:
      "Live paginated REST report, not a snapshot. Same-count changes may be undetected; freeze writes or reconcile against a full backup before any separate disposal review.",
    interpretation:
      "Age counts are not deletion eligibility. Resolve legal holds, approved retention policy, continued business use and missing timestamps separately.",
    platformAudit: options.includePlatformAudit
      ? "Global age counts included explicitly; not dealer-attributed."
      : "Not included: audit_log has no authoritative dealer relation. --include-platform-audit opts into global counts.",
    summaries,
  };
  const output = resolve(options.output);
  mkdirSync(output, { mode: 0o700 }); // Refuse existing output; never delete it on failure.
  try {
    chmodSync(output, 0o700);
    const body = `${JSON.stringify(report, null, 2)}\n`;
    writeFileSync(resolve(output, "report.json"), body, { flag: "wx", mode: 0o600 });
    const receipt = {
      format: report.format,
      completedAt: report.completedAt,
      file: "report.json",
      sha256: createHash("sha256").update(body).digest("hex"),
      containsRecordPayloads: false,
    };
    writeFileSync(resolve(output, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, {
      flag: "wx",
      mode: 0o400,
    });
    return report;
  } catch (error) {
    rmSync(output, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({
      options: {
        url: { type: "string" },
        dealer: { type: "string" },
        before: { type: "string" },
        output: { type: "string" },
        "include-platform-audit": { type: "boolean", default: false },
      },
    });
    if (!values.url || !values.dealer || !values.before || !values.output)
      throw new Error(
        "Required: --url <origin> --dealer <record-id> --before <UTC timestamp> --output <new-directory>."
      );
    await reportRetention({
      url: values.url,
      dealerId: values.dealer,
      before: values.before,
      output: values.output,
      token: process.env.PB_RETENTION_TOKEN ?? "",
      includePlatformAudit: values["include-platform-audit"],
    });
    console.log(
      "Read-only retention report complete. Review report.json and verify receipt.json; no data was deleted."
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Retention report failed.");
    process.exitCode = 1;
  }
}
