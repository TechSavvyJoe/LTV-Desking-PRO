import { useRef, useState } from "react";
import { useDealContext } from "../context/DealContext";
import { parseFile } from "../services/fileParser";
import { decodeVin } from "../services/vinDecoder";
import { calculateFinancials } from "../services/calculator";
import { generateFavoritesPdf } from "../services/pdfGenerator";
import { holdIncompleteFits } from "../services/dealAssessment";
import { lenderFitForVehicle } from "../services/lenderFit";
import { getInventory, syncInventory, logDealEvent, addInventoryItem } from "../lib/api";
import { capture } from "../lib/analytics";
import { createLogger } from "../lib/logger";
import { currentDealerQueryKeys, queryClient, queryKeys } from "../lib/queryClient";
import { getCurrentUser, type InventoryItem } from "../lib/pocketbase";
import type { Vehicle } from "../types";
import { downloadBlob } from "../utils/downloadBlob";

const inventoryImportLogger = createLogger("inventory-import");

const mapPersistedInventoryItem = (item: InventoryItem): Vehicle => ({
  id: item.id,
  vehicle: `${item.year} ${item.make} ${item.model} ${item.trim || ""}`.trim(),
  stock: item.stockNumber || "N/A",
  vin: item.vin,
  modelYear: item.year,
  mileage: !item.mileageUnknown && typeof item.mileage === "number" ? item.mileage : "N/A",
  price: item.price,
  jdPower: typeof item.jdPower === "number" && item.jdPower > 0 ? item.jdPower : "N/A",
  jdPowerRetail:
    typeof item.jdPowerRetail === "number" && item.jdPowerRetail > 0 ? item.jdPowerRetail : "N/A",
  unitCost: typeof item.unitCost === "number" && item.unitCost > 0 ? item.unitCost : "N/A",
  baseOutTheDoorPrice: "N/A",
  make: item.make,
  model: item.model,
  trim: item.trim,
});

/**
 * Inventory import / VIN decode / favorites-PDF handlers, extracted verbatim
 * from the legacy MainLayout (App.tsx) so the new InventoryScreen toolbar can
 * consume them (plan Phase 6). Pulls everything it needs from DealContext.
 * [dc-redesign]
 */
export function useInventoryImport() {
  const {
    settings,
    dealData,
    filters,
    customerName,
    salespersonName,
    setMessage,
    setInventory,
    setActiveVehicle,
    setFocusVin,
    setPagination,
    fileName,
    setFileName,
    safeFavorites,
    safeLenderProfiles,
  } = useDealContext();

  const [vinLookup, setVinLookup] = useState("");
  const [vinLookupResult, setVinLookupResult] = useState<string | null>(null);
  const [isVinLoading, setIsVinLoading] = useState(false);
  const [isUploadingInventory, setIsUploadingInventory] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File Upload Handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const role = getCurrentUser()?.role;
    if (role !== "admin" && role !== "superadmin") {
      setMessage({
        type: "error",
        text: "Only admins can import inventory. Ask your admin to import it.",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Validate file size (10MB max)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes
    if (file.size > MAX_FILE_SIZE) {
      setMessage({
        type: "error",
        text: "This file is over 10 MB. Upload a smaller export.",
      });
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    // Validate file type (CSV and modern Excel only)
    const allowedTypes = [
      "text/csv",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];
    const allowedExtensions = [".csv", ".xlsx"];
    const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf("."));

    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
      setMessage({
        type: "error",
        text: "That file type isn't supported. Upload a CSV or Excel (.xlsx) file.",
      });
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    setFileName(file.name);
    setIsUploadingInventory(true);

    try {
      // Parse the file first
      const { vehicles: data, skipped, reasons } = await parseFile(file);
      if (data.length === 0) {
        setMessage({
          type: "error",
          text: "No vehicles found in this file. Compare its columns with the sample CSV.",
        });
        return;
      }

      // Validate row count (10,000 rows max)
      const MAX_ROWS = 10000;
      if (data.length > MAX_ROWS) {
        setMessage({
          type: "error",
          text: `This file has ${data.length.toLocaleString()} vehicles; the limit is ${MAX_ROWS.toLocaleString()}. Split it into smaller files.`,
        });
        return;
      }

      // Show syncing message — surface skipped rows so import loss is never silent. [B1]
      const skippedNote = skipped > 0 ? ` Skipped ${skipped} (${reasons.join("; ")}).` : "";
      setMessage({
        type: skipped > 0 ? "warning" : "success",
        text: `Read ${data.length} vehicles.${skippedNote} Importing…`,
      });

      // Prepare items for sync
      const itemsToSync = data.map((v) => ({
        vin: v.vin,
        stockNumber: v.stock !== "N/A" ? v.stock : undefined,
        year: typeof v.modelYear === "number" ? v.modelYear : new Date().getFullYear(),
        make: v.make || "",
        model: v.model || "",
        trim: v.trim,
        mileage: typeof v.mileage === "number" ? v.mileage : undefined,
        price: typeof v.price === "number" ? v.price : 0,
        unitCost: typeof v.unitCost === "number" ? v.unitCost : undefined,
        jdPower: typeof v.jdPower === "number" ? v.jdPower : undefined,
        jdPowerRetail: typeof v.jdPowerRetail === "number" ? v.jdPowerRetail : undefined,
      }));

      // A file import is an intentional full-feed replacement. VINs omitted
      // from the uploaded feed are marked sold; the one-off VIN decoder below
      // continues to use partial-update semantics.
      // Rejected rows can describe vehicles still on the lot. Only a fully
      // parsed feed is allowed to archive VINs absent from the accepted rows.
      const syncResult = await syncInventory(itemsToSync, { markMissingSold: skipped === 0 });

      // Re-read server state so partial write failures can never install
      // unpersisted parsed rows in the local inventory.
      const persistedItems = await getInventory();
      const persistedVehicles = persistedItems
        .filter((item) => item.status !== "sold")
        .map(mapPersistedInventoryItem);

      setInventory(persistedVehicles);
      queryClient.setQueryData(currentDealerQueryKeys().inventory, persistedVehicles);
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory });
      setPagination((prev) => ({ ...prev, currentPage: 1 }));

      const failedNote =
        syncResult.failed > 0
          ? ` ${syncResult.failed} ${syncResult.failed === 1 ? "change" : "changes"} couldn't be saved — import the file again.`
          : "";
      const retainedNote =
        skipped > 0 || syncResult.archivingSkipped
          ? ` Omitted vehicles were kept available because the import was incomplete.${skippedNote}`
          : "";
      setMessage({
        type: syncResult.failed > 0 || skipped > 0 ? "warning" : "success",
        text: `Inventory imported: ${syncResult.added} added, ${syncResult.updated} updated, ${syncResult.removed} marked sold.${failedNote}${retainedNote}`,
      });
      capture("import_completed", {
        vehicles: data.length,
        skipped,
        failed: syncResult.failed,
      });
      capture("inventory_uploaded", {
        vehicles: data.length,
        skipped,
        failed: syncResult.failed,
      });
    } catch (err) {
      inventoryImportLogger.error("Inventory import failed", err);
      // The parser writes user-safe, actionable messages (missing columns,
      // skipped-row reasons) — show them instead of a generic toast. [C-regression]
      setMessage({
        type: "error",
        text:
          err instanceof Error && err.message
            ? err.message
            : "Couldn't import inventory. Check your connection and try again.",
      });
    } finally {
      setIsUploadingInventory(false);
      // Always reset the input so re-selecting the SAME file re-fires onChange
      // (after a failure or even a success, re-upload used to be a silent no-op).
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Sample CSV download (extracted from the legacy toolbar button)
  const downloadSampleCsv = () => {
    const headers = [
      "Stock #",
      "Year",
      "Make",
      "Model",
      "Trim",
      "VIN",
      "Mileage",
      "Price",
      "Cost",
      "J.D. Power Trade In",
      "J.D. Power Retail",
      "Unit Cost",
    ];
    const sampleData = [
      [
        "STK1001",
        "2023",
        "Toyota",
        "Camry",
        "SE",
        "1HGCM82633A004352",
        "15000",
        "28500",
        "25000",
        "24000",
        "29000",
        "25000",
      ],
    ];
    const csvContent = [headers.join(","), ...sampleData.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = "inventory_sample.csv";
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  // VIN Lookup Handler
  const handleVinLookup = async () => {
    if (isVinLoading) return;
    const role = getCurrentUser()?.role;
    if (role !== "admin" && role !== "superadmin") {
      setVinLookupResult("Error: Only admins can add inventory from a VIN.");
      return;
    }
    // NHTSA decode needs the full 17-character VIN (the old 11-char gate let
    // short VINs through to fail server-side with a generic error).
    if (!vinLookup || vinLookup.length !== 17) {
      setVinLookupResult("Error: VIN must be 17 characters");
      return;
    }
    setIsVinLoading(true);
    setVinLookupResult(null);
    try {
      const decoded = await decodeVin(vinLookup);
      if (decoded) {
        // Decoding a VIN is an add, not a re-sync: never zero out an existing
        // vehicle's price, mileage or availability with decoder defaults.
        const existing = (await getInventory()).find(
          (item) => item.vin.toUpperCase() === vinLookup.trim().toUpperCase()
        );
        if (existing) {
          setVinLookupResult(
            "Error: This VIN is already in inventory. Edit the existing vehicle instead."
          );
          return;
        }
        const newVehicle = {
          vehicle: `${decoded.year} ${decoded.make} ${decoded.model}`,
          stock: `VIN-${Date.now()}`,
          vin: vinLookup.trim().toUpperCase(),
          make: decoded.make,
          model: decoded.model,
          trim: decoded.trim,
          modelYear: decoded.year,
          mileage: 0,
          price: 0,
          jdPower: "N/A" as const,
          jdPowerRetail: "N/A" as const,
          unitCost: "N/A" as const,
          baseOutTheDoorPrice: "N/A" as const,
        };
        const persisted = await addInventoryItem({
          vin: newVehicle.vin,
          stockNumber: newVehicle.stock,
          year: newVehicle.modelYear,
          make: newVehicle.make,
          model: newVehicle.model,
          trim: newVehicle.trim,
          price: 0,
          status: "available",
        });
        if (!persisted)
          throw new Error("Couldn't save this vehicle. Check your connection and try again.");
        const savedVehicle = mapPersistedInventoryItem(persisted);
        setInventory((prev) => [
          savedVehicle,
          ...(prev || []).filter((v) => v.vin !== savedVehicle.vin),
        ]);
        setActiveVehicle(calculateFinancials(savedVehicle, dealData, settings));
        setFocusVin(savedVehicle.vin);
        setVinLookupResult("Success: Vehicle added to inventory");
        setVinLookup("");

        queryClient.invalidateQueries({ queryKey: queryKeys.inventory });

        setMessage({
          type: "success",
          text: "Vehicle added. Enter its price and mileage before structuring a deal.",
        });
      } else {
        setVinLookupResult("Error: Couldn't decode this VIN. Check it and try again.");
      }
    } catch (err) {
      // vinDecoder crafts specific user-facing errors (timeout, not found,
      // invalid VIN) — surface them instead of a blanket "Service unavailable".
      setVinLookupResult(
        `Error: ${err instanceof Error && err.message ? err.message : "VIN lookup is unavailable. Try again shortly."}`
      );
    } finally {
      setIsVinLoading(false);
    }
  };

  // Compare PDF download handler
  const handleDownloadFavorites = async () => {
    if (safeFavorites.length === 0) {
      setMessage({
        type: "error",
        text: "Add vehicles to Compare on the desk first.",
      });
      return;
    }
    try {
      const pdfData = safeFavorites
        .map((vehicle) => {
          const calculatedVehicle = calculateFinancials(vehicle, dealData, settings);

          const lenderEligibility = holdIncompleteFits(
            lenderFitForVehicle(calculatedVehicle, { ...dealData, ...filters }, safeLenderProfiles),
            filters
          ).entries;

          return {
            vehicle: calculatedVehicle,
            dealData,
            customerFilters: filters,
            customerName,
            salespersonName,
            lenderEligibility,
          };
        })
        .sort((a, b) => {
          const aOk = a.lenderEligibility.filter((l) => l.eligible).length;
          const bOk = b.lenderEligibility.filter((l) => l.eligible).length;
          return bOk - aOk;
        });

      const blob = await generateFavoritesPdf(pdfData, settings);
      downloadBlob(blob, "LTV_Compare.pdf");
      setMessage({ type: "success", text: "Compare PDF downloaded" });
      // Evidence trail: record exactly what was handed across the desk —
      // the PDF itself is ephemeral client-side output. [G44]
      void logDealEvent({
        action: "pdf_generated",
        customerName,
        // deal_events.vin is a single-VIN field (max 32 chars) — a joined list
        // exceeded it and PB rejected the whole event. The full VIN list lives
        // in snapshot.vehicles below. [review/P2]
        vin: pdfData.length === 1 ? pdfData[0]?.vehicle.vin : undefined,
        snapshot: {
          type: "favorites",
          dealData,
          settings: { ...settings, ai: undefined },
          vehicles: pdfData.map((d) => ({
            vin: d.vehicle.vin,
            price: d.vehicle.price,
            monthlyPayment: d.vehicle.monthlyPayment,
            otdLtv: d.vehicle.otdLtv,
            fits: d.lenderEligibility.filter((l) => l.eligible).map((l) => l.name),
          })),
        },
      });
      capture("pdf_generated", { type: "favorites", vehicles: pdfData.length });
    } catch (err) {
      inventoryImportLogger.error("PDF generation failed", err);
      setMessage({
        type: "error",
        text: "Couldn't create the Compare PDF. Try again.",
      });
    }
  };

  return {
    fileInputRef,
    fileName,
    isUploadingInventory,
    handleFileUpload,
    downloadSampleCsv,
    vinLookup,
    setVinLookup,
    vinLookupResult,
    isVinLoading,
    handleVinLookup,
    handleDownloadFavorites,
  };
}

export default useInventoryImport;
