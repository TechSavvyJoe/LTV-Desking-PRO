import React, { useState, useRef, useMemo, useEffect } from "react";
import {
  isAuthenticated,
  onAuthStateChange,
  logout,
  getCurrentUser,
} from "./lib/auth";
import {
  saveDeal,
  deleteDeal,
  updateInventoryItem,
  syncInventory,
} from "./lib/api";
import { Login } from "./components/auth/Login";
import { Register } from "./components/auth/Register";
import { AuthLayout } from "./components/auth/AuthLayout";
import { useTheme } from "./hooks/useTheme";
import { parseFile } from "./services/fileParser";
import { decodeVin } from "./services/vinDecoder";
import { DealProvider, useDealContext } from "./context/DealContext";
import * as Icons from "./components/common/Icons";
import Button from "./components/common/Button";
import DealControls from "./components/DealControls";
import InventoryTable from "./components/InventoryTable";
import LenderProfiles from "./components/LenderProfiles";
import SavedDeals from "./components/SavedDeals";
import SettingsModal from "./components/SettingsModal";
import FinanceTools from "./components/FinanceTools";
import ActionBar from "./components/ActionBar";
import { Toast } from "./components/common/Toast";
import { TabButton } from "./components/common/TabButton";
import { calculateFinancials } from "./services/calculator";
import { generateFavoritesPdf } from "./services/pdfGenerator";
import { checkBankEligibility } from "./services/lenderMatcher";
import { CalculatedVehicle, SavedDeal } from "./types";
import DealStructuringModal from "./components/DealStructuringModal";
import { InventoryExpandedRow } from "./components/InventoryExpandedRow";
import AiLenderManagerModal from "./components/AiLenderManagerModal";
import Header from "./components/Header";
import SkipNavLink from "./components/common/SkipNavLink";
import { SuperAdminDashboard } from "./components/admin/SuperAdminDashboard";

const MainLayout: React.FC = () => {
  const {
    settings,
    setSettings,
    inventory,
    setInventory,
    dealData,
    setDealData,
    filters,
    setFilters,
    message,
    setMessage,
    errors,
    setErrors,
    customerName,
    setCustomerName,
    salespersonName,
    setSalespersonName,
    activeVehicle,
    setActiveVehicle,
    favorites,
    setFavorites,
    lenderProfiles,
    setLenderProfiles,
    savedDeals,
    setSavedDeals,
    scratchPadNotes,
    setScratchPadNotes,
    inventorySort,
    setInventorySort,
    favSort,
    setFavSort,
    pagination,
    setPagination,
    fileName,
    setFileName,
    expandedInventoryRows,
    setExpandedInventoryRows,
    expandedFavoriteRows,
    setExpandedFavoriteRows,
    safeInventory,
    safeFavorites,
    safeLenderProfiles,
    safeSavedDeals,
    processedInventory,
    filteredInventory,
    sortedInventory,
    paginatedInventory,
    toggleFavorite,
    toggleInventoryRowExpansion,
    toggleFavoriteRowExpansion,
    handleInventoryUpdate,
    clearDealAndFilters,
    loadSampleData,
  } = useDealContext();

  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<
    "inventory" | "lenders" | "saved" | "scratchpad"
  >("inventory");

  // Handler to change tabs and scroll to top
  const handleTabChange = (
    tab: "inventory" | "lenders" | "saved" | "scratchpad"
  ) => {
    setActiveTab(tab);
    // Scroll to top of page when changing tabs
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDealModalOpen, setIsDealModalOpen] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isSavedDealModalOpen, setIsSavedDealModalOpen] = useState(false);
  const [vinLookup, setVinLookup] = useState("");
  const [vinLookupResult, setVinLookupResult] = useState<string | null>(null);
  const [isVinLoading, setIsVinLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Create a Set of favorite VINs for efficient lookups in InventoryTable
  const favoriteVins = useMemo(() => {
    return new Set(safeFavorites.map((v) => v.vin));
  }, [safeFavorites]);

  // PDF and share handlers for expanded rows
  const isShareSupported =
    typeof navigator !== "undefined" && "share" in navigator;

  const downloadPdf = (e: React.MouseEvent, vehicle: CalculatedVehicle) => {
    e.stopPropagation();
    // PDF generation is handled elsewhere
    console.log("Download PDF for:", vehicle.vin);
  };

  const sharePdf = async (e: React.MouseEvent, vehicle: CalculatedVehicle) => {
    e.stopPropagation();
    if (isShareSupported) {
      console.log("Share PDF for:", vehicle.vin);
    }
  };

  // File Upload Handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    try {
      const data = await parseFile(file);
      if (data.length === 0) {
        setMessage({
          type: "error",
          text: "No valid vehicle data found in file.",
        });
        return;
      }

      // Update local state immediately for responsiveness
      setInventory(data);
      setPagination((prev) => ({ ...prev, currentPage: 1 }));

      // Sync to PocketBase in background (dealer-specific)
      const itemsToSync = data.map((v) => ({
        vin: v.vin,
        stockNumber: v.stock !== "N/A" ? v.stock : undefined,
        year:
          typeof v.modelYear === "number"
            ? v.modelYear
            : new Date().getFullYear(),
        make: v.make || "",
        model: v.model || "",
        trim: v.trim,
        mileage: typeof v.mileage === "number" ? v.mileage : undefined,
        price: typeof v.price === "number" ? v.price : 0,
        unitCost: typeof v.unitCost === "number" ? v.unitCost : undefined,
        jdPower: typeof v.jdPower === "number" ? v.jdPower : undefined,
        jdPowerRetail:
          typeof v.jdPowerRetail === "number" ? v.jdPowerRetail : undefined,
      }));

      const syncResult = await syncInventory(itemsToSync);

      setMessage({
        type: "success",
        text: `Loaded ${data.length} vehicles. Synced: ${syncResult.added} added, ${syncResult.updated} updated, ${syncResult.removed} marked sold.`,
      });
    } catch (err) {
      console.error(err);
      setMessage({
        type: "error",
        text: "Error parsing file. Ensure it is a valid CSV or Excel file.",
      });
    }
  };

  // VIN Lookup Handler
  const handleVinLookup = async () => {
    if (!vinLookup || vinLookup.length < 11) {
      // Basic length check
      setVinLookupResult("Error: Invalid VIN length");
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
            mileage:
              typeof newVehicle.mileage === "number"
                ? newVehicle.mileage
                : undefined,
            price: typeof newVehicle.price === "number" ? newVehicle.price : 0,
          },
        ])
          .then(() => {
            console.log("VIN lookup vehicle synced to PocketBase");
          })
          .catch((err: unknown) => {
            console.error("Failed to sync VIN lookup to PocketBase:", err);
          });

        setMessage({
          type: "success",
          text: "Vehicle decoded and saved. Please enter price/mileage before structuring.",
        });
      } else {
        setVinLookupResult("Error: Could not decode VIN");
      }
    } catch (err) {
      setVinLookupResult("Error: Service unavailable");
    } finally {
      setIsVinLoading(false);
    }
  };

  const handleSelectVehicle = (vehicle: CalculatedVehicle) => {
    const isValid =
      typeof vehicle.price === "number" &&
      vehicle.price > 0 &&
      typeof vehicle.mileage === "number" &&
      vehicle.mileage >= 0 &&
      vehicle.vin &&
      vehicle.vin !== "N/A" &&
      vehicle.vin.length >= 11;

    if (!isValid) {
      setMessage({
        type: "error",
        text: "Please enter a numeric price, mileage, and valid VIN before structuring.",
      });
      return;
    }
    setActiveVehicle(vehicle);
    setIsDealModalOpen(true);
    setMessage({ type: "success", text: "Vehicle staged for structuring." });
  };

  // Save Deal Handler
  const handleSaveDeal = (vehicleOverride?: CalculatedVehicle) => {
    const vehicleToSave = vehicleOverride || activeVehicle;
    if (!vehicleToSave) {
      setMessage({ type: "error", text: "No vehicle selected to save." });
      return;
    }
    if (
      typeof vehicleToSave.price !== "number" ||
      vehicleToSave.price <= 0 ||
      typeof vehicleToSave.mileage !== "number" ||
      vehicleToSave.mileage < 0 ||
      !vehicleToSave.vin ||
      vehicleToSave.vin.length < 11
    ) {
      setMessage({
        type: "error",
        text: "Complete vehicle details (price, mileage, VIN) before saving.",
      });
      return;
    }
    if (!customerName) {
      setErrors((prev) => ({
        ...prev,
        customerName: "Customer Name is required",
      }));
      setMessage({ type: "error", text: "Please enter a Customer Name." });
      return;
    }

    const now = new Date().toISOString();
    const newDealData = {
      name: `${now.split("T")[0]} - ${customerName}`, // Or ask for name
      customerName,
      salespersonName,
      vehicle: vehicleToSave.id, // Assuming calculated vehicle has ID matching inventory
      vehicleData: vehicleToSave, // Store snapshot
      dealData: { ...dealData },
      customerFilters: {
        creditScore: filters.creditScore,
        monthlyIncome: filters.monthlyIncome,
      },
      notes: scratchPadNotes,
      status: "draft" as const,
    };

    // Optimistic Update or Wait?
    // Let's call API and update state with result
    saveDeal(newDealData).then((saved) => {
      if (saved) {
        // Map DB SavedDeal to App SavedDeal
        const mappedSaved: SavedDeal = {
          id: saved.id,
          date: saved.created,
          customerName: saved.customerName || "Unknown",
          salespersonName: saved.salespersonName || "Unknown",
          vehicle: saved.vehicleData as any,
          dealData: saved.dealData as any,
          customerFilters: {
            creditScore: (saved.dealData as any)?.creditScore || null,
            monthlyIncome: (saved.dealData as any)?.monthlyIncome || null,
          },
        };
        setSavedDeals((prev) => [mappedSaved, ...prev]);
        setMessage({ type: "success", text: "Deal saved successfully." });
        setIsDealModalOpen(false);
      } else {
        setMessage({ type: "error", text: "Failed to save deal to backend." });
      }
    });
  };

  const handleRowSelect = (
    vin: string,
    fallbackVehicles: CalculatedVehicle[]
  ) => {
    const candidate =
      processedInventory.find(
        (v) =>
          v.vin === vin ||
          (!v.vin && vin.startsWith("VIN-")) ||
          (v.vin === "N/A" && vin.startsWith("VIN-"))
      ) ||
      fallbackVehicles.find(
        (v) =>
          v.vin === vin ||
          (!v.vin && vin.startsWith("VIN-")) ||
          (v.vin === "N/A" && vin.startsWith("VIN-"))
      );
    if (candidate) {
      setActiveVehicle(candidate);
    }
    toggleInventoryRowExpansion(vin);
  };

  const handleFavoriteRowSelect = (
    vin: string,
    fallbackVehicles: CalculatedVehicle[]
  ) => {
    const candidate = fallbackVehicles.find(
      (v) =>
        v.vin === vin ||
        (!v.vin && vin.startsWith("VIN-")) ||
        (v.vin === "N/A" && vin.startsWith("VIN-"))
    );
    if (candidate) {
      setActiveVehicle(candidate);
    }
    toggleFavoriteRowExpansion(vin);
  };

  // PDF Download Handlers
  const handleDownloadFavorites = async () => {
    if (safeFavorites.length === 0) {
      setMessage({
        type: "error",
        text: "No favorites to generate a PDF for.",
      });
      return;
    }
    try {
      const pdfData = safeFavorites.map((vehicle) => {
        // Calculate financials for the favorite vehicle if not already done
        const calculatedVehicle = calculateFinancials(
          vehicle,
          dealData,
          settings
        );

        const lenderEligibility = safeLenderProfiles.map((bank) => ({
          name: bank.name,
          ...checkBankEligibility(
            calculatedVehicle,
            { ...dealData, ...filters },
            bank
          ),
        }));

        return {
          vehicle: calculatedVehicle,
          dealData,
          customerFilters: filters,
          customerName,
          salespersonName,
          lenderEligibility,
        };
      });

      const blob = await generateFavoritesPdf(pdfData, settings);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 100);
      setMessage({ type: "success", text: "Favorites PDF generated." });
    } catch (err) {
      console.error("PDF generation failed", err);
      setMessage({
        type: "error",
        text: "Unable to generate PDF. Please check your data.",
      });
    }
  };

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${
        theme === "dark" ? "bg-[#0f172a]" : "bg-[#f8fafc]"
      } text-slate-900 dark:text-slate-100 font-sans selection:bg-blue-500/30 selection:text-blue-600 dark:selection:text-blue-300`}
    >
      {/* Skip navigation for accessibility */}
      <SkipNavLink />

      <Header
        onOpenAiModal={() => setIsAiModalOpen(true)}
        onOpenSettingsModal={() => setIsSettingsOpen(true)}
        theme={theme}
        toggleTheme={toggleTheme}
        onDealerChange={() => {
          // Reload the page to refresh all data for the new dealer
          window.location.reload();
        }}
      />

      <main className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-8 transition-all duration-300 space-y-8">
        {/* Deal Controls & Actions (Restored to Top) */}
        <section className="space-y-6">
          <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-all duration-300 hover:shadow-md hover:border-blue-200 dark:hover:border-slate-700">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-black/20">
              <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Icons.UserIcon className="w-4 h-4" /> Customer & Deal
              </h3>
            </div>
            <div className="p-4">
              <DealControls
                dealData={dealData}
                setDealData={setDealData}
                filters={filters}
                setFilters={setFilters}
                errors={errors}
                setErrors={setErrors}
                customerName={customerName}
                setCustomerName={setCustomerName}
                salespersonName={salespersonName}
                setSalespersonName={setSalespersonName}
                onVinLookup={handleVinLookup}
                vinLookupResult={vinLookupResult}
                isVinLoading={isVinLoading}
              />
            </div>
          </div>

          <ActionBar
            activeTab={activeTab}
            favoritesCount={favorites.length}
            onDownloadFavorites={handleDownloadFavorites}
            onSaveDeal={() => handleSaveDeal()}
            canSave={
              !!activeVehicle &&
              typeof activeVehicle.price === "number" &&
              !!customerName
            }
          />
        </section>

        {/* Main Content Area (Tables) */}
        <section className="space-y-6 min-w-0">
          {/* Top Toolbar: File Upload & VIN (Refined) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 flex flex-wrap gap-4 items-center justify-between">
            {/* File Import Section */}
            <div className="flex items-center gap-3 flex-1 min-w-[280px]">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
                ref={fileInputRef}
                title="Upload inventory file"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="secondary"
                className="bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700"
              >
                <Icons.CloudArrowDownIcon className="w-4 h-4 mr-2" />
                Import
              </Button>

              <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 mx-2"></div>

              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {fileName}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {safeInventory.length} vehicles
                </div>
              </div>

              <Button
                title="Download Sample CSV"
                variant="ghost"
                size="icon"
                className="text-slate-400 hover:text-blue-500"
                onClick={() => {
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
                  const csvContent = [
                    headers.join(","),
                    ...sampleData.map((r) => r.join(",")),
                  ].join("\n");
                  const blob = new Blob([csvContent], {
                    type: "text/csv;charset=utf-8;",
                  });
                  const link = document.createElement("a");
                  link.href = URL.createObjectURL(blob);
                  link.download = "inventory_sample.csv";
                  link.click();
                }}
              >
                <Icons.DocumentArrowDownIcon className="w-5 h-5" />
              </Button>
            </div>

            {/* Quick VIN Decoder */}
            <div className="flex items-center gap-2 flex-1 min-w-[280px] justify-end">
              <div className="relative w-full max-w-xs">
                <input
                  type="text"
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all text-sm font-mono uppercase placeholder-slate-400"
                  placeholder="Enter VIN..."
                  maxLength={17}
                  value={vinLookup}
                  onChange={(e) => setVinLookup(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && handleVinLookup()}
                />
                <Icons.SearchIcon className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
              </div>
              <Button
                onClick={handleVinLookup}
                disabled={isVinLoading || vinLookup.length < 11}
                className="shrink-0"
              >
                {isVinLoading ? (
                  <Icons.SpinnerIcon className="w-4 h-4 animate-spin" />
                ) : (
                  "Decode"
                )}
              </Button>
            </div>
          </div>

          {/* Contextual Status Bar */}
          {(dealData.tradeInValue > 0 || dealData.downPayment > 0) && (
            <div className="flex flex-wrap items-center gap-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 border border-blue-100 dark:border-blue-900/30 px-5 py-3 rounded-xl text-sm text-blue-800 dark:text-blue-200 animate-fadeIn">
              <span className="font-bold flex items-center gap-2 uppercase tracking-wide text-xs">
                <Icons.InformationCircleIcon className="w-5 h-5" />
                Pending Structure
              </span>
              <div className="flex items-center gap-3 ml-auto sm:ml-0">
                <span className="bg-white/80 dark:bg-blue-950/50 px-3 py-1 rounded-lg border border-blue-200/50 dark:border-blue-500/20 font-mono font-medium">
                  Down: ${dealData.downPayment.toLocaleString()}
                </span>
                <span className="bg-white/80 dark:bg-blue-950/50 px-3 py-1 rounded-lg border border-blue-200/50 dark:border-blue-500/20 font-mono font-medium">
                  Trade: ${dealData.tradeInValue.toLocaleString()}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                onClick={clearDealAndFilters}
              >
                Clear
              </Button>
            </div>
          )}

          {/* Navigation Tabs */}
          <div className="sticky top-[88px] z-20 xl:static bg-transparent">
            <nav className="flex items-center gap-2 p-1.5 bg-slate-100/80 dark:bg-slate-900/80 rounded-2xl overflow-x-auto border border-slate-200 dark:border-slate-800 backdrop-blur-md shadow-sm">
              <TabButton
                active={activeTab === "inventory"}
                onClick={() => handleTabChange("inventory")}
                icon={<Icons.TruckIcon className="w-5 h-5" />}
                label="Inventory"
                count={inventory.length}
              />
              <TabButton
                active={activeTab === "lenders"}
                onClick={() => handleTabChange("lenders")}
                icon={<Icons.BanknotesIcon className="w-5 h-5" />}
                label="Lender Programs"
                count={lenderProfiles.length}
              />
              <TabButton
                active={activeTab === "saved"}
                onClick={() => handleTabChange("saved")}
                icon={<Icons.FolderIcon className="w-5 h-5" />}
                label="Saved Deals"
                count={savedDeals.length}
              />
              <TabButton
                active={activeTab === "scratchpad"}
                onClick={() => handleTabChange("scratchpad")}
                icon={<Icons.CalculatorIcon className="w-5 h-5" />}
                label="Finance Tools"
              />
            </nav>
          </div>

          {/* TAB CONTENT */}
          <div className="min-h-[500px] animate-fadeIn">
            {activeTab === "inventory" && (
              <div className="space-y-8">
                {/* Favorites Section */}
                {safeFavorites.length > 0 && (
                  <div className="bg-amber-50/50 dark:bg-amber-900/10 rounded-2xl border border-amber-100 dark:border-amber-900/30 p-1">
                    <div className="px-4 py-3 border-b border-amber-100 dark:border-amber-900/30 flex items-center justify-between">
                      <h2 className="text-sm font-bold text-amber-800 dark:text-amber-200 uppercase tracking-widest flex items-center gap-2">
                        <Icons.StarIcon className="w-4 h-4 text-amber-500 fill-current" />
                        Shortlist ({safeFavorites.length})
                      </h2>
                    </div>
                    <div className="p-2">
                      <InventoryTable
                        data={safeFavorites.map((item) =>
                          calculateFinancials(item, dealData, settings)
                        )}
                        sortConfig={favSort}
                        onSort={(key) =>
                          setFavSort((prev) => ({
                            key,
                            direction:
                              prev.key === key && prev.direction === "asc"
                                ? "desc"
                                : "asc",
                          }))
                        }
                        expandedRows={expandedFavoriteRows}
                        onRowClick={(vin) =>
                          handleFavoriteRowSelect(
                            vin,
                            safeFavorites.map((item) =>
                              calculateFinancials(item, dealData, settings)
                            )
                          )
                        }
                        onStructureDeal={handleSelectVehicle}
                        favoriteVins={favoriteVins}
                        toggleFavorite={toggleFavorite}
                        pagination={{
                          currentPage: 1,
                          itemsPerPage: Infinity,
                        }}
                        setPagination={() => {}}
                        totalRows={safeFavorites.length}
                        isFavoritesView
                        renderExpandedRow={(vehicle) => (
                          <InventoryExpandedRow
                            item={vehicle}
                            lenderProfiles={safeLenderProfiles}
                            dealData={dealData}
                            setDealData={setDealData}
                            onInventoryUpdate={handleInventoryUpdate}
                            customerFilters={filters}
                            settings={settings}
                            onDownloadPdf={downloadPdf}
                            onSharePdf={() => console.log("Share PDF")} // Placeholder
                            isShareSupported={isShareSupported}
                          />
                        )}
                      />
                    </div>
                  </div>
                )}

                {/* Main Inventory */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                  <InventoryTable
                    data={paginatedInventory}
                    sortConfig={inventorySort}
                    onSort={(key) =>
                      setInventorySort((prev) => ({
                        key,
                        direction:
                          prev.key === key && prev.direction === "asc"
                            ? "desc"
                            : "asc",
                      }))
                    }
                    expandedRows={expandedInventoryRows}
                    onRowClick={(vin) =>
                      handleRowSelect(vin, paginatedInventory)
                    }
                    onStructureDeal={handleSelectVehicle}
                    favoriteVins={favoriteVins}
                    toggleFavorite={toggleFavorite}
                    pagination={pagination}
                    setPagination={setPagination}
                    totalRows={sortedInventory.length}
                    onLoadSampleData={loadSampleData}
                    emptyMessage={
                      safeInventory.length > 0 ? (
                        <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                          <Icons.FunnelIcon className="w-12 h-12 text-slate-200 dark:text-slate-800" />
                          <p className="text-slate-500">
                            No vehicles match your filters.
                          </p>
                          <Button
                            onClick={clearDealAndFilters}
                            variant="secondary"
                            size="sm"
                          >
                            Clear Filters
                          </Button>
                        </div>
                      ) : (
                        <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                          <Icons.TruckIcon className="w-12 h-12 text-slate-200 dark:text-slate-800" />
                          <p className="text-slate-500">Inventory is empty.</p>
                          <Button
                            onClick={loadSampleData}
                            variant="primary"
                            size="sm"
                          >
                            Load Sample Data
                          </Button>
                        </div>
                      )
                    }
                    renderExpandedRow={(vehicle) => (
                      <InventoryExpandedRow
                        item={vehicle}
                        lenderProfiles={safeLenderProfiles}
                        dealData={dealData}
                        setDealData={setDealData}
                        onInventoryUpdate={handleInventoryUpdate}
                        customerFilters={filters}
                        settings={settings}
                        onDownloadPdf={downloadPdf}
                        onSharePdf={() => console.log("Share PDF")}
                        isShareSupported={isShareSupported}
                      />
                    )}
                  />
                </div>
              </div>
            )}

            {activeTab === "lenders" && (
              <LenderProfiles
                profiles={safeLenderProfiles}
                onUpdate={setLenderProfiles}
              />
            )}

            {activeTab === "saved" && (
              <SavedDeals
                deals={safeSavedDeals}
                onLoad={(deal) => {
                  setCustomerName(deal.customerName);
                  setSalespersonName(deal.salespersonName || "");
                  setDealData(deal.dealData);
                  setFilters((prev) => ({
                    ...prev,
                    creditScore: deal.customerFilters?.creditScore ?? null,
                    monthlyIncome: deal.customerFilters?.monthlyIncome ?? null,
                  }));
                  setScratchPadNotes(deal.notes || "");
                  if (deal.vehicle) {
                    setActiveVehicle(deal.vehicle);
                  }
                  setMessage({
                    type: "success",
                    text: "Deal loaded successfully.",
                  });
                }}
                onDelete={(id) => {
                  if (
                    window.confirm("Are you sure you want to delete this deal?")
                  ) {
                    deleteDeal(id).then((success) => {
                      if (success) {
                        setSavedDeals(
                          safeSavedDeals.filter((d) => d.id !== id)
                        );
                        setMessage({
                          type: "success",
                          text: "Deal deleted.",
                        });
                      } else {
                        setMessage({
                          type: "error",
                          text: "Failed to delete deal.",
                        });
                      }
                    });
                  }
                }}
              />
            )}

            {activeTab === "scratchpad" && (
              <FinanceTools
                scratchPadNotes={scratchPadNotes}
                setScratchPadNotes={setScratchPadNotes}
                dealData={dealData}
                activeVehicle={activeVehicle}
              />
            )}
          </div>
        </section>
      </main>

      {/* Modals */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={setSettings}
      />

      {isDealModalOpen && activeVehicle && (
        <DealStructuringModal
          vehicle={activeVehicle}
          dealData={dealData}
          setDealData={setDealData}
          onClose={() => setIsDealModalOpen(false)}
          errors={errors}
          setErrors={setErrors}
          onSave={() => handleSaveDeal(activeVehicle)}
          onSaveAndClear={() => {
            handleSaveDeal(activeVehicle);
            clearDealAndFilters();
            setActiveVehicle(null);
          }}
          settings={settings}
        />
      )}

      <AiLenderManagerModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        currentProfiles={lenderProfiles}
        onUpdateProfiles={setLenderProfiles}
      />

      {/* Global Toast */}
      <Toast />
    </div>
  );
};

const App: React.FC = () => {
  const [isAuth, setIsAuth] = useState(isAuthenticated());
  const [view, setView] = useState<"login" | "register">("login");
  const [isLoading, setIsLoading] = useState(true);
  
  // Persist viewMode in sessionStorage so it survives page reloads
  const [viewMode, setViewMode] = useState<"auto" | "dealer">(() => {
    const saved = sessionStorage.getItem('superadmin_view_mode');
    return (saved === 'dealer') ? 'dealer' : 'auto';
  });
  
  // Save viewMode to sessionStorage whenever it changes
  useEffect(() => {
    sessionStorage.setItem('superadmin_view_mode', viewMode);
  }, [viewMode]);

  const currentUser = getCurrentUser();
  const isSuperAdmin = currentUser?.role === "superadmin";

  useEffect(() => {
    // Check initial auth state
    setIsAuth(isAuthenticated());
    setIsLoading(false);

    // Subscribe to auth changes
    const unsubscribe = onAuthStateChange((user) => {
      setIsAuth(!!user);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900">
        <Icons.SpinnerIcon className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!isAuth) {
    return (
      <AuthLayout>
        {view === "login" ? (
          <Login
            onSuccess={() => setIsAuth(true)}
            onRegisterClick={() => setView("register")}
          />
        ) : (
          <Register
            onSuccess={() => setView("login")}
            onLoginClick={() => setView("login")}
          />
        )}
      </AuthLayout>
    );
  }

  // SuperAdmin role-based routing
  if (isSuperAdmin && viewMode === "auto") {
    return (
      <SuperAdminDashboard onSwitchToDealer={() => setViewMode("dealer")} />
    );
  }

  return (
    <DealProvider>
      <MainLayout />
      {/* Admin/Logout Controls */}
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2">
        {isSuperAdmin && viewMode === "dealer" && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setViewMode("auto")}
            className="shadow-lg bg-purple-600 border-purple-500 text-white hover:bg-purple-700"
          >
            <Icons.Cog6ToothIcon className="w-4 h-4 mr-2" />
            Admin Console
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={logout}
          className="shadow-lg border-red-200 text-red-600 hover:bg-red-50 dark:bg-slate-800 dark:border-red-900 dark:text-red-400"
        >
          <Icons.ArrowRightStartOnRectangleIcon className="w-4 h-4 mr-2" />
          Logout
        </Button>
      </div>
    </DealProvider>
  );
};

export default App;
