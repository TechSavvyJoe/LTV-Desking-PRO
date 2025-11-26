import React, { useState, useEffect, useRef } from "react";
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
import ScratchPad from "./components/ScratchPad";
import ActionBar from "./components/ActionBar";
import { Toast } from "./components/common/Toast";
import { TabButton } from "./components/common/TabButton";
import { calculateFinancials } from "./services/calculator";
import { generateFavoritesPdf } from "./services/pdfGenerator";
import { checkBankEligibility } from "./services/lenderMatcher";

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
    handleInventoryUpdate,
    clearDealAndFilters,
    loadSampleData,
  } = useDealContext();

  console.log("App Render - safeInventory:", safeInventory.length);
  console.log("App Render - paginatedInventory:", paginatedInventory.length);

  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<
    "inventory" | "lenders" | "saved" | "scratchpad"
  >("inventory");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [vinLookup, setVinLookup] = useState("");
  const [vinLookupResult, setVinLookupResult] = useState<string | null>(null);
  const [isVinLoading, setIsVinLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setInventory(data);
      setPagination((prev) => ({ ...prev, currentPage: 1 }));
      setMessage({
        type: "success",
        text: `Successfully loaded ${data.length} vehicles.`,
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
      const vehicle = await decodeVin(vinLookup);
      if (vehicle) {
        setInventory((prev) => [vehicle, ...(prev || [])]);
        setVinLookupResult("Success: Vehicle added to inventory");
        setVinLookup("");
        setMessage({ type: "success", text: "Vehicle decoded and added." });
      } else {
        setVinLookupResult("Error: Could not decode VIN");
      }
    } catch (err) {
      setVinLookupResult("Error: Service unavailable");
    } finally {
      setIsVinLoading(false);
    }
  };

  // Save Deal Handler
  const handleSaveDeal = () => {
    if (!activeVehicle) {
      setMessage({ type: "error", text: "No vehicle selected to save." });
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

    const newSavedDeal = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      customerName,
      salespersonName,
      vehicle: activeVehicle,
      dealData: { ...dealData },
      notes: scratchPadNotes,
    };

    setSavedDeals([newSavedDeal, ...safeSavedDeals]);
    setMessage({ type: "success", text: "Deal saved successfully." });
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
      className={`min-h-screen bg-slate-50 dark:bg-black text-slate-900 dark:text-slate-100 transition-colors duration-300 font-sans selection:bg-blue-500/30`}
    >
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-black/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white p-2 rounded-xl shadow-lg shadow-blue-500/20">
              <Icons.CalculatorIcon className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400 tracking-tight">
                LTV Desking{" "}
                <span className="font-light text-blue-500">PRO</span>
              </h1>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-500">
                Professional Deal Structuring
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center bg-slate-100 dark:bg-slate-900 rounded-lg p-1 border border-slate-200 dark:border-slate-800">
              <TabButton
                active={activeTab === "inventory"}
                onClick={() => setActiveTab("inventory")}
                icon={<Icons.ListIcon className="w-4 h-4" />}
                label="Inventory"
                count={safeInventory.length}
              />

              <TabButton
                active={activeTab === "lenders"}
                onClick={() => setActiveTab("lenders")}
                icon={<Icons.BanknotesIcon className="w-4 h-4" />}
                label="Lenders"
                count={safeLenderProfiles.length}
              />
              <TabButton
                active={activeTab === "saved"}
                onClick={() => setActiveTab("saved")}
                icon={<Icons.SaveIcon className="w-4 h-4" />}
                label="Deals"
                count={safeSavedDeals.length}
              />
              <TabButton
                active={activeTab === "scratchpad"}
                onClick={() => setActiveTab("scratchpad")}
                icon={<Icons.PencilIcon className="w-4 h-4" />}
                label="Notes"
              />
            </div>

            <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden md:block"></div>

            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              title="Toggle Theme"
            >
              {theme === "dark" ? (
                <Icons.SunIcon className="w-5 h-5 text-amber-400" />
              ) : (
                <Icons.MoonIcon className="w-5 h-5 text-slate-600" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSettingsOpen(true)}
              title="Settings"
            >
              <Icons.CogIcon className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1920px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Top Controls: File Upload & VIN */}
        {/* Top Controls: File Upload & VIN */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 flex flex-wrap gap-4 items-center justify-between">
            <div className="flex items-center gap-4 flex-1 min-w-[300px]">
              <div className="relative group">
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileUpload}
                  className="hidden"
                  ref={fileInputRef}
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  variant="secondary"
                >
                  <Icons.UploadIcon className="w-4 h-4 mr-2" />
                  Import Inventory
                </Button>
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-900 dark:text-white truncate max-w-[200px]">
                  {fileName}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {safeInventory.length} vehicles loaded
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-1 min-w-[300px] justify-end">
              <div className="relative flex-1 max-w-md">
                <input
                  type="text"
                  placeholder="Enter VIN to Decode..."
                  value={vinLookup}
                  onChange={(e) => setVinLookup(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && handleVinLookup()}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm font-mono uppercase placeholder-slate-400"
                  maxLength={17}
                />
                <Icons.SearchIcon className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              </div>
              <Button
                onClick={handleVinLookup}
                disabled={isVinLoading || vinLookup.length < 11}
              >
                {isVinLoading ? (
                  <Icons.SpinnerIcon className="w-4 h-4 animate-spin" />
                ) : (
                  "Decode"
                )}
              </Button>
            </div>
          </div>

          {/* Deal Controls & Action Bar */}
          <div className="space-y-6">
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

            <ActionBar
              activeTab={activeTab}
              favoritesCount={safeFavorites.length}
              onDownloadFavorites={handleDownloadFavorites}
            />
          </div>

          {/* Main Content Area */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden min-h-[600px]">
            {activeTab === "inventory" && (
              <div className="space-y-8">
                {safeFavorites.length > 0 && (
                  <InventoryTable
                    title="Favorites"
                    icon={
                      <Icons.StarIcon className="w-6 h-6 text-yellow-500" />
                    }
                    inventory={safeFavorites.map((item) =>
                      calculateFinancials(item, dealData, settings)
                    )}
                    lenderProfiles={safeLenderProfiles}
                    dealData={dealData}
                    setDealData={setDealData}
                    onInventoryUpdate={handleInventoryUpdate}
                    customerFilters={filters}
                    settings={settings}
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
                    expandedRows={expandedInventoryRows}
                    toggleRowExpansion={toggleInventoryRowExpansion}
                    favorites={safeFavorites}
                    toggleFavorite={toggleFavorite}
                    pagination={{ currentPage: 1, rowsPerPage: Infinity }}
                    setPagination={() => {}}
                    totalRows={safeFavorites.length}
                    isFavoritesView
                  />
                )}

                <InventoryTable
                  title="All Inventory"
                  inventory={paginatedInventory}
                  lenderProfiles={safeLenderProfiles}
                  dealData={dealData}
                  setDealData={setDealData}
                  onInventoryUpdate={handleInventoryUpdate}
                  customerFilters={filters}
                  settings={settings}
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
                  toggleRowExpansion={toggleInventoryRowExpansion}
                  favorites={safeFavorites}
                  toggleFavorite={toggleFavorite}
                  pagination={pagination}
                  setPagination={setPagination}
                  totalRows={sortedInventory.length}
                  onLoadSampleData={loadSampleData}
                  emptyMessage={
                    safeInventory.length > 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 space-y-4">
                        <p className="text-slate-500 dark:text-slate-400 text-lg">
                          No vehicles match your filters.
                        </p>
                        <Button
                          onClick={clearDealAndFilters}
                          variant="secondary"
                        >
                          <Icons.XMarkIcon className="w-5 h-5 mr-2" />
                          Clear Filters
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 space-y-4">
                        <p className="text-slate-500 dark:text-slate-400 text-lg">
                          No vehicles found.
                        </p>
                        <Button onClick={loadSampleData} variant="primary">
                          <Icons.CloudArrowDownIcon className="w-5 h-5 mr-2" />
                          Load Sample Inventory
                        </Button>
                      </div>
                    )
                  }
                />
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
                  setScratchPadNotes(deal.notes || "");
                  setMessage({ type: "success", text: "Deal loaded." });
                }}
                onDelete={(id) =>
                  setSavedDeals(safeSavedDeals.filter((d) => d.id !== id))
                }
              />
            )}
            {activeTab === "scratchpad" && (
              <ScratchPad
                notes={scratchPadNotes}
                onChange={setScratchPadNotes}
              />
            )}
          </div>
        </div>
      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={setSettings}
      />

      {message && (
        <Toast
          type={message.type}
          message={message.text}
          onClose={() => setMessage(null)}
        />
      )}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <DealProvider>
      <MainLayout />
    </DealProvider>
  );
};

export default App;
