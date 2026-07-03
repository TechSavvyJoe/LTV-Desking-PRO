import { useRef, useState } from "react";
import { useDealContext } from "../context/DealContext";
import { parseFile } from "../services/fileParser";
import { decodeVin } from "../services/vinDecoder";
import { calculateFinancials } from "../services/calculator";
import { generateFavoritesPdf } from "../services/pdfGenerator";
import { checkBankEligibility } from "../services/lenderMatcher";
import { syncInventory, logDealEvent } from "../lib/api";
import { capture } from "../lib/analytics";

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

    // Validate file size (10MB max)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes
    if (file.size > MAX_FILE_SIZE) {
      setMessage({
        type: "error",
        text: "File size exceeds 10MB limit. Please upload a smaller file.",
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
        text: "Invalid file type. Please upload a CSV or Excel workbook (.csv, .xlsx).",
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
          text: "No valid vehicle data found in file.",
        });
        return;
      }

      // Validate row count (10,000 rows max)
      const MAX_ROWS = 10000;
      if (data.length > MAX_ROWS) {
        setMessage({
          type: "error",
          text: `File contains ${data.length} vehicles. Maximum allowed is ${MAX_ROWS} rows. Please split into smaller files.`,
        });
        return;
      }

      // Show syncing message — surface skipped rows so import loss is never silent. [B1]
      const skippedNote = skipped > 0 ? ` Skipped ${skipped} (${reasons.join("; ")}).` : "";
      setMessage({
        type: skipped > 0 ? "warning" : "success",
        text: `Parsed ${data.length} vehicles.${skippedNote} Syncing to database...`,
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

      // Wait for sync to complete before updating UI
      const syncResult = await syncInventory(itemsToSync);

      // Only update local state after successful sync
      setInventory(data);
      setPagination((prev) => ({ ...prev, currentPage: 1 }));

      const failedNote =
        syncResult.failed > 0
          ? ` ${syncResult.failed} operation(s) failed and were not saved.`
          : "";
      setMessage({
        type: syncResult.failed > 0 ? "warning" : "success",
        text: `Synced: ${syncResult.added} added, ${syncResult.updated} updated, ${syncResult.removed} marked sold.${failedNote}`,
      });
      capture("import_completed", {
        vehicles: data.length,
        skipped,
        failed: syncResult.failed,
      });
    } catch (err) {
      console.error(err);
      // The parser writes user-safe, actionable messages (missing columns,
      // skipped-row reasons) — show them instead of a generic toast. [C-regression]
      setMessage({
        type: "error",
        text:
          err instanceof Error && err.message
            ? err.message
            : "Error syncing inventory. Please try again.",
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
        "1G1...SAMPLE1",
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
    link.href = URL.createObjectURL(blob);
    link.download = "inventory_sample.csv";
    link.click();
  };

  // VIN Lookup Handler
  const handleVinLookup = async () => {
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
        const newVehicle = {
          vehicle: `${decoded.year} ${decoded.make} ${decoded.model}`,
          stock: `VIN-${Date.now()}`,
          vin: vinLookup,
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
        setInventory((prev) => [newVehicle, ...(prev || [])]);
        setActiveVehicle(calculateFinancials(newVehicle, dealData, settings));
        setVinLookupResult("Success: Vehicle added to inventory");
        setVinLookup("");

        // Also sync to PocketBase
        syncInventory([
          {
            vin: newVehicle.vin,
            year: newVehicle.modelYear,
            make: newVehicle.make || "",
            model: newVehicle.model || "",
            trim: newVehicle.trim,
            mileage: typeof newVehicle.mileage === "number" ? newVehicle.mileage : undefined,
            price: typeof newVehicle.price === "number" ? newVehicle.price : 0,
          },
        ])
          .then(() => {
            if (import.meta.env.DEV) {
              console.log("VIN lookup vehicle synced to PocketBase");
            }
          })
          .catch((err: unknown) => {
            console.error("Failed to sync VIN lookup to PocketBase:", err);
            // Surface the silent persistence failure (e.g. no dealership selected)
            // instead of leaving the user believing the vehicle was saved.
            setMessage({
              type: "warning",
              text: "Vehicle is shown locally but couldn't be saved to the server.",
            });
          });

        setMessage({
          type: "success",
          text: "Vehicle decoded and saved. Please enter price/mileage before structuring.",
        });
      } else {
        setVinLookupResult("Error: Could not decode VIN");
      }
    } catch (err) {
      // vinDecoder crafts specific user-facing errors (timeout, not found,
      // invalid VIN) — surface them instead of a blanket "Service unavailable".
      setVinLookupResult(
        `Error: ${err instanceof Error && err.message ? err.message : "Service unavailable"}`
      );
    } finally {
      setIsVinLoading(false);
    }
  };

  // Favorites PDF Download Handler
  const handleDownloadFavorites = async () => {
    if (safeFavorites.length === 0) {
      setMessage({
        type: "error",
        text: "No favorites to generate a PDF for.",
      });
      return;
    }
    try {
      const pdfData = safeFavorites
        .map((vehicle) => {
          const calculatedVehicle = calculateFinancials(vehicle, dealData, settings);

          const lenderEligibility = safeLenderProfiles.map((bank) => ({
            name: bank.name,
            ...checkBankEligibility(calculatedVehicle, { ...dealData, ...filters }, bank),
          }));

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
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setMessage({ type: "success", text: "Favorites PDF generated." });
      // Evidence trail: record exactly what was handed across the desk —
      // the PDF itself is ephemeral client-side output. [G44]
      void logDealEvent({
        action: "pdf_generated",
        customerName,
        vin: pdfData.map((d) => d.vehicle.vin).join(","),
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
      console.error("PDF generation failed", err);
      setMessage({
        type: "error",
        text: "Unable to generate PDF. Please check your data.",
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
