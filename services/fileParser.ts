import type { Vehicle } from "../types";

/**
 * Result of parsing an inventory file. `skipped`/`reasons` make data loss
 * visible to the user instead of silently dropping rows. [B1]
 */
export interface ParseResult {
  vehicles: Vehicle[];
  skipped: number;
  reasons: string[];
}

const splitCsvIntoRows = (csvString: string): string[] => {
  if (csvString === undefined || csvString === null) return [];
  if (typeof csvString !== "string") return [];
  const str = String(csvString);
  if (str.length === 0) return [];

  const rows = [];
  let currentRowStart = 0;
  let inQuotes = false;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '"') {
      if (inQuotes && i + 1 < str.length && str[i + 1] === '"') {
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      rows.push(str.substring(currentRowStart, i).trim());
      if (char === "\r" && i + 1 < str.length && str[i + 1] === "\n") {
        i++;
      }
      currentRowStart = i + 1;
    }
  }
  if (currentRowStart < str.length) {
    rows.push(str.substring(currentRowStart).trim());
  }
  return rows.filter((row) => row);
};

const parseCsvRow = (rowString: string, delimiter: string): string[] => {
  if (!rowString) return [];
  const res = [];
  let cell = "";
  let inQ = false;
  for (let i = 0; i < rowString.length; i++) {
    const char = rowString[i];
    if (char === '"') {
      if (inQ && i + 1 < rowString.length && rowString[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (char === delimiter && !inQ) {
      res.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }
  res.push(cell.trim());
  return res;
};

/**
 * Detect the column delimiter from the header line. Counts every candidate and
 * picks the most frequent, so comma, semicolon, tab, and pipe exports all work.
 * Tab/pipe were previously undetected and parsed into a single column. [B10]
 */
export const detectDelimiter = (headerLine: string): string => {
  if (!headerLine || typeof headerLine !== "string") return ",";
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = 0;
  for (const d of candidates) {
    const count = headerLine.split(d).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
};

const toCsvCell = (value: unknown): string => {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
};

/**
 * Parse a currency/number cell. Handles accounting-style negatives "(1,200.50)"
 * and refuses ambiguous European-decimal formats ("1.234,56") rather than
 * silently producing a wrong-but-plausible value. [data-import]
 */
export const parseNumber = (str: string | undefined): number | "N/A" => {
  if (str === undefined || str === null || String(str).trim() === "") return "N/A";
  let s = String(str).trim();

  // Accounting-style negative, e.g. (1,200.50) => -1200.50
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }

  // Comma used as a decimal separator, e.g. "1.234,56" or "28500,50" — 1-2
  // digits after the final comma is never a US thousands separator. Refuse
  // rather than mis-parse ("28500,50" must not become 2850050). A trailing
  // 3-digit group ("1,234", "1,234,567") remains a valid thousands separator.
  if (/\d,\d{1,2}$/.test(s)) return "N/A";

  const cleaned = s.replace(/[^0-9.-]+/g, "");
  // Prevent multiple dots/dashes that would yield NaN.
  const isLikelyNumber = /^-?\d+(\.\d+)?$/.test(cleaned);
  if (!isLikelyNumber) return "N/A";
  let num = parseFloat(cleaned);
  if (isNaN(num)) return "N/A";
  if (negative) num = -Math.abs(num);
  return num;
};

/** Stable, order-independent fallback id for rows with no VIN. Derived from
 * identity fields (no row index), so re-uploading shifted rows does not churn
 * the dataset or flip vehicles to "sold". Trim and mileage are part of the
 * basis so two otherwise-identical units (e.g. same model, different trim) do
 * not collide. [B11] */
const syntheticVin = (
  stock: string,
  make: string,
  model: string,
  year: string,
  trim: string,
  mileage: string
): string => {
  const basis = [stock, make, model, year, trim, mileage]
    .map((p) => (p || "").trim().toUpperCase())
    .join("|");
  // Small deterministic hash (djb2) — no randomness, no row index.
  let hash = 5381;
  for (let i = 0; i < basis.length; i++) {
    hash = (hash * 33) ^ basis.charCodeAt(i);
  }
  return `SYN-${(hash >>> 0).toString(36).toUpperCase()}`;
};

const parseVehicleDescription = (
  description: string
): { make?: string; model?: string; trim?: string } => {
  const parts = description.trim().split(/\s+/).filter(Boolean);
  if (/^(19|20)\d{2}$/.test(parts[0] || "")) parts.shift();
  if (parts.length < 2) return {};

  const [make, model, ...trimParts] = parts;
  return {
    make,
    model,
    trim: trimParts.length > 0 ? trimParts.join(" ") : undefined,
  };
};

/**
 * Pure CSV/XLSX-as-CSV parser. Separated from file I/O so it can be unit-tested
 * without a browser FileReader.
 */
export const parseInventoryCsv = (csvContent: string, isExcel: boolean): ParseResult => {
  if (!csvContent || typeof csvContent !== "string" || csvContent.trim() === "") {
    throw new Error("File content is empty or the first sheet is blank.");
  }

  const lines = splitCsvIntoRows(csvContent);
  if (lines.length < 2) {
    throw new Error("File has a header row but no data.");
  }

  const headerLine = lines[0] ?? "";
  const delimiter = isExcel ? "," : detectDelimiter(headerLine);
  const headers = parseCsvRow(headerLine, delimiter).map((h) => h.trim());
  const headersLower = headers.map((h) => h.toLowerCase());

  const idx = {
    vehicle: headersLower.indexOf("vehicle"),
    make: headersLower.indexOf("make"),
    model: headersLower.indexOf("model"),
    trim: headersLower.indexOf("trim"),
    stock: headersLower.indexOf("stock #"),
    vin: headersLower.indexOf("vin"),
    price: headersLower.indexOf("price"),
    jdPower: headers.findIndex(
      (h) => h.toLowerCase().includes("j.d. power") && h.toLowerCase().includes("trade in")
    ),
    jdPowerRetail: headers.findIndex(
      (h) => h.toLowerCase().includes("j.d. power") && h.toLowerCase().includes("retail")
    ),
    unitCost: headersLower.indexOf("unit cost"),
    modelYear: headersLower.findIndex((h) => h === "model year" || h === "year"),
    mileage: headersLower.findIndex((h) => h === "odometer" || h === "mileage"),
  };

  const requiredColumnsMap = {
    price: "'Price'",
    mileage: "'Odometer' or 'Mileage'",
  };

  // Check for either Vehicle OR (Make + Model)
  const hasVehicle = idx.vehicle !== -1;
  const hasMakeModel = idx.make !== -1 && idx.model !== -1;

  if (!hasVehicle && !hasMakeModel) {
    throw new Error("File must contain either a 'Vehicle' column OR 'Make' and 'Model' columns.");
  }

  const missingColumns = Object.entries(requiredColumnsMap)
    .filter(([key]) => idx[key as keyof typeof idx] === -1)
    .map(([, friendlyName]) => friendlyName);

  if (missingColumns.length > 0) {
    const missingMessage = `File is missing or has misnamed required columns: ${missingColumns.join(
      ", "
    )}.`;
    const foundMessage = `The headers found in the file are: [${headers.join(", ")}].`;
    const suggestion = `Please correct the column headers and try again.`;
    throw new Error(`${missingMessage}\n${foundMessage}\n${suggestion}`);
  }

  let skippedMissingData = 0;
  let skippedMissingIdentity = 0;
  const seenVins = new Set<string>();
  // Occurrence counter for synthetic ids: identical no-VIN rows are real
  // physical units, not duplicates — disambiguate with "-2", "-3" suffixes
  // instead of dropping them. [B11]
  const syntheticCounts = new Map<string, number>();
  let duplicateVins = 0;

  const vehicles: Vehicle[] = [];

  for (const rowString of lines.slice(1)) {
    if (!rowString) continue;
    const vals = parseCsvRow(rowString, delimiter);
    // Pad short rows to header width instead of dropping them — a trailing blank
    // optional column should not make a whole vehicle vanish. [B1]
    while (vals.length < headers.length) vals.push("");

    let make = idx.make !== -1 ? (vals[idx.make] ?? "").trim() || undefined : undefined;
    let model = idx.model !== -1 ? (vals[idx.model] ?? "").trim() || undefined : undefined;
    let trim = idx.trim !== -1 ? (vals[idx.trim] ?? "").trim() || undefined : undefined;

    let modelYear = parseNumber(vals[idx.modelYear] ?? "");

    let vehicleDescription: string = idx.vehicle !== -1 ? (vals[idx.vehicle] ?? "") : "";
    if (modelYear === "N/A") {
      const yearMatch = vehicleDescription.match(/\b(19[89]\d|20\d{2})\b/);
      if (yearMatch) modelYear = parseInt(yearMatch[0], 10);
    }

    // PocketBase requires make/model. Vehicle-only exports are common, so
    // derive those fields from "Year Make Model Trim" when possible instead of
    // sending empty strings that the server rejects.
    if ((!make || !model) && vehicleDescription.trim()) {
      const parsedIdentity = parseVehicleDescription(vehicleDescription);
      make ||= parsedIdentity.make;
      model ||= parsedIdentity.model;
      trim ||= parsedIdentity.trim;
    }

    if (!vehicleDescription && make && model) {
      vehicleDescription = `${modelYear !== "N/A" ? modelYear : ""} ${make} ${model} ${
        trim || ""
      }`.trim();
    }

    if (!make || !model) {
      skippedMissingIdentity++;
      continue;
    }

    const mileageRaw = parseNumber(vals[idx.mileage] ?? "");
    const priceRaw = parseNumber(vals[idx.price] ?? "");
    if (priceRaw === "N/A" || mileageRaw === "N/A") {
      skippedMissingData++; // surfaced to the user, not silent. [B1]
      continue;
    }
    if (priceRaw < 0 || mileageRaw < 0) {
      skippedMissingData++; // negative prices/mileage rejected for data quality. [robustness from deep review]
      continue;
    }

    const clampedPrice = Math.max(0, priceRaw);
    const clampedMileage = Math.max(0, mileageRaw);

    const stock = vals[idx.stock] ?? "N/A";
    const rawVin = idx.vin !== -1 ? (vals[idx.vin] ?? "").trim() : "";

    let vin: string;
    if (rawVin !== "") {
      vin = rawVin;
      // Detect duplicate real VINs in the upload instead of silently last-write-wins.
      const vinKey = vin.toUpperCase();
      if (seenVins.has(vinKey)) {
        duplicateVins++;
        continue;
      }
      seenVins.add(vinKey);
    } else {
      const base = syntheticVin(
        stock,
        make ?? "",
        model ?? "",
        String(modelYear),
        trim ?? "",
        String(clampedMileage)
      );
      const occurrence = (syntheticCounts.get(base) ?? 0) + 1;
      syntheticCounts.set(base, occurrence);
      // First occurrence keeps the stable hash id (re-upload friendly);
      // repeats get "-2", "-3"... so both rows survive. [B11]
      vin = occurrence === 1 ? base : `${base}-${occurrence}`;
      seenVins.add(vin.toUpperCase());
    }

    vehicles.push({
      vehicle: vehicleDescription,
      make,
      model,
      trim,
      stock,
      vin,
      modelYear,
      mileage: clampedMileage,
      price: clampedPrice,
      jdPower: parseNumber(vals[idx.jdPower] ?? ""),
      jdPowerRetail: idx.jdPowerRetail !== -1 ? parseNumber(vals[idx.jdPowerRetail] ?? "") : "N/A",
      unitCost: idx.unitCost !== -1 ? parseNumber(vals[idx.unitCost] ?? "") : "N/A",
      baseOutTheDoorPrice: "N/A", // will be calculated later
    });
  }

  const reasons: string[] = [];
  if (skippedMissingData > 0) {
    reasons.push(
      `${skippedMissingData} row${skippedMissingData === 1 ? "" : "s"} skipped (missing, non-numeric, or negative Price/Mileage)`
    );
  }
  if (skippedMissingIdentity > 0) {
    reasons.push(
      `${skippedMissingIdentity} row${
        skippedMissingIdentity === 1 ? "" : "s"
      } skipped (missing or unparseable Make/Model)`
    );
  }
  if (duplicateVins > 0) {
    reasons.push(`${duplicateVins} duplicate VIN${duplicateVins === 1 ? "" : "s"} ignored`);
  }

  return {
    vehicles,
    skipped: skippedMissingData + skippedMissingIdentity + duplicateVins,
    reasons,
  };
};

export const parseFile = (file: File): Promise<ParseResult> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        const buf = data instanceof ArrayBuffer ? data : new ArrayBuffer(0);
        let csvContent: string;
        const isExcel = file.name.toLowerCase().endsWith(".xlsx");

        if (isExcel) {
          // Loaded only on the XLSX path to keep it out of the main bundle. [perf]
          const { default: readXlsxFile } = await import("read-excel-file/browser");
          const sheets = await readXlsxFile(buf);
          const rows = sheets[0]?.data ?? [];
          csvContent = rows.map((row) => row.map(toCsvCell).join(",")).join("\n");
        } else {
          csvContent = new TextDecoder("utf-8").decode(new Uint8Array(buf));
        }

        const result = parseInventoryCsv(csvContent, isExcel);

        if (result.vehicles.length === 0) {
          reject(
            new Error(
              `No valid rows found. Ensure each row has Make and Model plus numeric Price and Mileage.${
                result.reasons.length ? ` (${result.reasons.join("; ")})` : ""
              }`
            )
          );
          return;
        }

        resolve(result);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error("Error reading the file."));
    };

    reader.readAsArrayBuffer(file);
  });
};
