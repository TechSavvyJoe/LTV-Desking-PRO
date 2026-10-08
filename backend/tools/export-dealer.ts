import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const COLLECTIONS = [
  "inventory",
  "lender_profiles",
  "saved_deals",
  "deal_events",
  "dealer_settings",
  "users",
] as const;
type Row = Record<string, unknown> & { id: string };

/** Read-only remote export. Never deletes or updates a PocketBase record. */
export async function exportDealer(options: {
  url: string;
  dealerId: string;
  token: string;
  output: string;
  allowActive?: boolean;
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
    throw new Error("Use an HTTPS origin or a local HTTP origin without credentials or a path.");
  }
  if (!/^[a-zA-Z0-9]{15}$/.test(options.dealerId)) throw new Error("Invalid dealer record ID.");
  if (!options.token.trim()) throw new Error("PB_EXPORT_TOKEN is required.");
  const fetcher = options.fetcher ?? fetch;
  const request = async (path: string): Promise<unknown> => {
    const response = await fetcher(new URL(path, origin), {
      method: "GET",
      headers: { Authorization: `Bearer ${options.token}` },
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    // Never include response bodies (which may contain private data) in errors.
    if (!response.ok)
      throw new Error(`PocketBase export request failed (HTTP ${response.status}).`);
    return response.json();
  };

  // Schema reads require PB superuser access. App admins can receive redacted
  // fields, so reject those credentials before creating an incomplete archive.
  await request("/api/collections/users");
  const dealer = (await request(`/api/collections/dealers/records/${options.dealerId}`)) as Row;
  if (dealer.id !== options.dealerId) throw new Error("Dealer identity mismatch.");
  if (dealer.active !== false && !options.allowActive) {
    throw new Error(
      "Deactivate the dealer before offboarding export, or use --allow-active for a live export."
    );
  }

  const output = resolve(options.output);
  mkdirSync(output, { mode: 0o700 }); // Existing directories are never overwritten.
  chmodSync(output, 0o700);
  const files: { file: string; records: number; sha256: string }[] = [];
  const save = (file: string, records: number, value: unknown) => {
    const body = `${JSON.stringify(value, null, 2)}\n`;
    writeFileSync(resolve(output, file), body, { flag: "wx", mode: 0o600 });
    files.push({ file, records, sha256: createHash("sha256").update(body).digest("hex") });
  };
  try {
    save("dealer.json", 1, dealer);
    for (const collection of COLLECTIONS) {
      const records: Row[] = [];
      const seen = new Set<string>();
      let expectedTotal: number | undefined;
      for (let page = 1; ; page++) {
        const query = new URLSearchParams({
          filter: `dealer = '${options.dealerId}'`,
          perPage: "500",
          page: String(page),
          sort: "id",
        });
        const result = (await request(`/api/collections/${collection}/records?${query}`)) as {
          items: Row[];
          totalItems: number;
          totalPages: number;
          page: number;
        };
        if (
          !Array.isArray(result.items) ||
          !Number.isSafeInteger(result.totalItems) ||
          result.totalItems < 0 ||
          !Number.isSafeInteger(result.totalPages) ||
          result.totalPages < 0 ||
          result.page !== page ||
          (expectedTotal !== undefined && result.totalItems !== expectedTotal)
        ) {
          throw new Error(
            `Invalid or changing pagination for ${collection}. Retry while dealer writes are frozen.`
          );
        }
        expectedTotal = result.totalItems;
        for (const record of result.items) {
          if (!record.id || record.dealer !== options.dealerId || seen.has(record.id)) {
            throw new Error(`Duplicate or incorrectly scoped record in ${collection}.`);
          }
          seen.add(record.id);
          records.push(record);
        }
        if (page >= result.totalPages) break;
        if (result.items.length === 0) throw new Error(`Missing page in ${collection}.`);
      }
      if (records.length !== expectedTotal) throw new Error(`Incomplete export for ${collection}.`);
      save(`${collection}.json`, records.length, records);
    }
    const finalDealer = (await request(
      `/api/collections/dealers/records/${options.dealerId}`
    )) as Row;
    if (JSON.stringify(finalDealer) !== JSON.stringify(dealer)) {
      throw new Error("Dealer changed during export. Retry with writes frozen.");
    }
    const receipt = {
      format: "ltv-dealer-export-v1",
      completedAt: new Date().toISOString(),
      origin: origin.origin,
      dealerId: options.dealerId,
      dealerInactive: dealer.active === false,
      consistency:
        "Paginated REST export; freeze all owner writes during export. Not a database snapshot.",
      files,
    };
    writeFileSync(resolve(output, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, {
      flag: "wx",
      mode: 0o400,
    });
    return receipt;
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
        output: { type: "string" },
        "allow-active": { type: "boolean", default: false },
      },
    });
    if (!values.url || !values.dealer || !values.output) {
      throw new Error("Required: --url <origin> --dealer <record-id> --output <new-directory>.");
    }
    await exportDealer({
      url: values.url,
      dealerId: values.dealer,
      output: values.output,
      token: process.env.PB_EXPORT_TOKEN ?? "",
      allowActive: values["allow-active"],
    });
    console.log(
      "Export complete. Verify receipt.json and archive contents before any separate deletion."
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Dealer export failed.");
    process.exitCode = 1;
  }
}
