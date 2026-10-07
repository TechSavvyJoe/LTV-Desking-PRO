import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { INITIAL_DEAL_DATA, INITIAL_FILTER_DATA } from "../../constants";
import { useDealContext } from "../../context/DealContext";
import { useDeskShortcuts } from "../../hooks/useDeskShortcuts";
import { useSaveDeal } from "../../hooks/useSaveDeal";
import { capture } from "../../lib/analytics";
import { logDealEvent } from "../../lib/api";
import { toast } from "../../lib/toast";
import { applyBackendProductPatch, getBackendProductSplit } from "../../services/backendProducts";
import { activeLenderCount, lenderFitForVehicle } from "../../services/lenderFit";
import type { LenderFitEntry } from "../../services/lenderFit";
import type { CalculatedVehicle, DealData, FilterData, LenderProfile } from "../../types";
import { fmt, splitPay } from "../../utils/format";
import { compareSortValues } from "../../utils/sortComparator";
import { CompareStrip } from "./CompareStrip";
import { DealInspector } from "./DealInspector";
import { DeskShortcutsHelp } from "./DeskShortcutsHelp";
import { DeskTermsRail } from "./DeskTermsRail";
import { InventoryGrid } from "./InventoryGrid";
import { DEFAULT_DIR, isSortKey, numVal } from "./deskConstants";
import type { SortKey } from "./deskConstants";

// PDF and OCR dependencies stay out of the initial desk bundle.
const DealSheetModal = lazy(() =>
  import("./DealSheetModal").then((module) => ({
    default: module.default || module.DealSheetModal,
  }))
);
const DocumentScanner = lazy(() =>
  import("../DocumentScanner").then((module) => ({ default: module.DocumentScanner }))
);

/** The inspector becomes a bottom drawer at this width (matches index.css). */
const DRAWER_QUERY = "(max-width: 900px)";
/** Quiet time after a selection before it is announced (arrow-key runs say one thing). */
const SELECTION_ANNOUNCE_DELAY_MS = 500;

const paymentText = (vehicle: CalculatedVehicle): string | null => {
  const payment = numVal(vehicle.monthlyPayment);
  if (payment === null) return null;
  const { whole, frac } = splitPay(payment);
  return `${whole}${frac}`;
};

/** "2023 Kia Telluride LX on desk — $743.04 per month, approval odds pending" */
const describeSelection = (vehicle: CalculatedVehicle): string => {
  const payment = paymentText(vehicle);
  const odds =
    vehicle.approvalBand === "pending"
      ? "approval odds pending"
      : typeof vehicle.approvalScore === "number"
        ? `approval odds ${Math.round(vehicle.approvalScore)} of 100`
        : null;
  const details = [payment ? `${payment} per month` : null, odds].filter(Boolean).join(", ");
  return details ? `${vehicle.vehicle} on desk — ${details}` : `${vehicle.vehicle} on desk`;
};

/**
 * The Desk coordinates live deal inputs, ranked inventory, and the focused
 * deal jacket. Rendering details live in the dedicated desk subcomponents so
 * this module remains responsible for state and workflow orchestration.
 */
const DeskScreenBase: React.FC = () => {
  const {
    settings,
    dealData,
    setDealData,
    filters,
    setFilters,
    customerName,
    setCustomerName,
    setActiveVehicle,
    favorites,
    toggleFavorite,
    safeLenderProfiles,
    processedInventory,
    filteredInventory,
    inventorySort,
    setInventorySort,
    focusVin,
    setFocusVin,
    searchQuery,
    setSearchQuery,
    loadSampleData,
  } = useDealContext();

  const { handleSaveDeal } = useSaveDeal();
  const totalLenders = activeLenderCount(safeLenderProfiles);
  const thresholds = settings.ltvThresholds;

  const [dealSheetOpen, setDealSheetOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [advancedTermsOpen, setAdvancedTermsOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [compactInspector, setCompactInspector] = useState(false);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(DRAWER_QUERY);
    const syncCompactInspector = () => setCompactInspector(media.matches);
    syncCompactInspector();
    media.addEventListener?.("change", syncCompactInspector);
    return () => media.removeEventListener?.("change", syncCompactInspector);
  }, []);

  const sortKey: SortKey = isSortKey(inventorySort.key) ? inventorySort.key : "approvalScore";
  const sortDirection: "asc" | "desc" = isSortKey(inventorySort.key)
    ? inventorySort.direction
    : "desc";

  const handleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setInventorySort({
          key,
          direction: sortDirection === "asc" ? "desc" : "asc",
        });
        return;
      }
      setInventorySort({ key, direction: DEFAULT_DIR[key] });
    },
    [setInventorySort, sortDirection, sortKey]
  );

  const rows = useMemo(() => {
    const displayName = (vehicle: CalculatedVehicle): string =>
      vehicle.make && vehicle.model
        ? `${vehicle.make} ${vehicle.model} ${vehicle.trim ?? ""}`
        : String(vehicle.vehicle).replace(/^\d{4}\s+/, "");

    const sorted = [...filteredInventory];
    // Shared invalid-aware comparator (utils/sortComparator); "stringify"
    // preserves this call site's historical mixed-type coercion.
    sorted.sort((left, right) =>
      compareSortValues(
        sortKey === "vehicle" ? displayName(left) : left[sortKey],
        sortKey === "vehicle" ? displayName(right) : right[sortKey],
        sortDirection,
        "stringify"
      )
    );
    return sorted;
  }, [filteredInventory, sortDirection, sortKey]);

  const focused = useMemo(
    () => rows.find((vehicle) => vehicle.vin === focusVin) ?? rows[0],
    [focusVin, rows]
  );

  // The top-ranked row is the initial selection, but it must become explicit.
  // Otherwise any edit that reorders approval odds can silently switch the
  // inspector (and the vehicle that Save deal targets) to a different VIN.
  useEffect(() => {
    const firstRow = rows[0];
    if (!firstRow) return;
    if (!focusVin || !rows.some((vehicle) => vehicle.vin === focusVin)) {
      setFocusVin(firstRow.vin);
    }
  }, [focusVin, rows, setFocusVin]);

  const lastDeskedVinRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focused || lastDeskedVinRef.current === focused.vin) return;
    lastDeskedVinRef.current = focused.vin;
    setActiveVehicle(focused);
    capture("deal_desked", {
      term: dealData.loanTerm,
      score: focused.approvalScore ?? null,
      fitCount: focused.fitCount ?? 0,
    });
    if ((focused.fitCount ?? 0) > 0) {
      capture("lender_matched", {
        fitCount: focused.fitCount,
        vin: focused.vin,
      });
    }
  }, [dealData.loanTerm, focused, setActiveVehicle]);

  const setDeal = useCallback(
    (patch: Partial<DealData>) => setDealData((current) => ({ ...current, ...patch })),
    [setDealData]
  );
  const setFilter = useCallback(
    (patch: Partial<FilterData>) => setFilters((current) => ({ ...current, ...patch })),
    [setFilters]
  );

  const focusedEntries = useMemo<LenderFitEntry[]>(() => {
    if (!focused) return [];
    return lenderFitForVehicle(focused, { ...dealData, ...filters }, safeLenderProfiles).entries;
  }, [dealData, filters, focused, safeLenderProfiles]);

  const profilesById = useMemo(() => {
    const profiles = new Map<string, LenderProfile>();
    for (const profile of safeLenderProfiles) profiles.set(profile.id, profile);
    return profiles;
  }, [safeLenderProfiles]);

  const buyRate = useMemo(() => {
    const coerceRate = (value: unknown): number | null => {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value !== "string") return null;
      const parsed = parseFloat(value.replace(/%\s*$/, ""));
      return Number.isFinite(parsed) ? parsed : null;
    };

    for (const entry of focusedEntries) {
      const baseRate = coerceRate(entry.matchedTier?.baseInterestRate);
      if (entry.eligible && baseRate !== null) {
        const rate = Number(
          (baseRate + (coerceRate(entry.matchedTier?.rateAdder) ?? 0)).toFixed(2)
        );
        return { rate, lender: entry.name };
      }
    }
    return null;
  }, [focusedEntries]);

  const applyBuyRate = useCallback(() => {
    if (!buyRate || !focused) return;
    setDeal({ interestRate: buyRate.rate });
    toast.success(`APR set to ${buyRate.rate}% (${buyRate.lender})`);
    logDealEvent("buy_rate_applied", {
      vin: focused.vin,
      snapshot: { apr: buyRate.rate, lender: buyRate.lender },
    });
  }, [buyRate, focused, setDeal]);

  const [aprText, setAprText] = useState(() =>
    typeof dealData.interestRate === "number" ? String(dealData.interestRate) : ""
  );
  useEffect(() => {
    const target =
      typeof dealData.interestRate === "number" && Number.isFinite(dealData.interestRate)
        ? dealData.interestRate
        : NaN;
    const current = parseFloat(aprText);
    if ((Number.isNaN(current) && Number.isNaN(target)) || current === target) return;
    setAprText(Number.isNaN(target) ? "" : String(target));
  }, [aprText, dealData.interestRate]);

  const onAprChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value.replace(/[^0-9.]/g, "");
      setAprText(raw);
      setDeal({ interestRate: raw === "" ? "" : parseFloat(raw) });
    },
    [setDeal]
  );

  const backendSplit = getBackendProductSplit(dealData);
  const toggleVsc = useCallback(
    () =>
      setDealData((current) => {
        const split = getBackendProductSplit(current);
        const nextAmount = split.vscAmount > 0 ? 0 : settings.vscPrice;
        return {
          ...current,
          ...applyBackendProductPatch(current, { vscAmount: nextAmount }),
        };
      }),
    [setDealData, settings.vscPrice]
  );
  const toggleGap = useCallback(
    () =>
      setDealData((current) => {
        const split = getBackendProductSplit(current);
        const nextAmount = split.gapAmount > 0 ? 0 : settings.gapPrice;
        return {
          ...current,
          ...applyBackendProductPatch(current, { gapAmount: nextAmount }),
        };
      }),
    [setDealData, settings.gapPrice]
  );
  const setVscAmount = useCallback(
    (amount: number) =>
      setDealData((current) => ({
        ...current,
        ...applyBackendProductPatch(current, { vscAmount: amount }),
      })),
    [setDealData]
  );
  const setGapAmount = useCallback(
    (amount: number) =>
      setDealData((current) => ({
        ...current,
        ...applyBackendProductPatch(current, { gapAmount: amount }),
      })),
    [setDealData]
  );
  const setOtherBackend = useCallback(
    (amount: number) =>
      setDealData((current) => ({
        ...current,
        ...applyBackendProductPatch(current, { otherBackend: amount }),
      })),
    [setDealData]
  );

  const handleReset = useCallback(() => {
    setDealData({
      ...INITIAL_DEAL_DATA,
      loanTerm: settings.defaultTerm,
      interestRate: settings.defaultApr,
      stateFees: settings.defaultStateFees,
      buyerState: settings.defaultState,
    });
    setFilters(INITIAL_FILTER_DATA);
    setSearchQuery("");
    setCustomerName("");
  }, [setCustomerName, setDealData, setFilters, setSearchQuery, settings]);

  const clearFilters = useCallback(() => {
    setFilters((current) => ({
      ...current,
      vehicle: "",
      maxPrice: null,
      maxPayment: null,
      maxMiles: null,
      maxOtdLtv: null,
      vin: "",
      minScore: null,
    }));
    setSearchQuery("");
  }, [setFilters, setSearchQuery]);

  const compareCards = useMemo(() => {
    const inventoryByVin = new Map(processedInventory.map((vehicle) => [vehicle.vin, vehicle]));
    return favorites
      .map((favorite) => inventoryByVin.get(favorite.vin))
      .filter((vehicle): vehicle is CalculatedVehicle => vehicle !== undefined);
  }, [favorites, processedInventory]);
  const isPinned = focused ? favorites.some((favorite) => favorite.vin === focused.vin) : false;

  const saveFocusedDeal = useCallback(() => {
    if (focused) handleSaveDeal(focused);
  }, [focused, handleSaveDeal]);
  const saveFromDealSheet = useCallback(() => {
    setDealSheetOpen(false);
    saveFocusedDeal();
  }, [saveFocusedDeal]);
  const openDealSheet = useCallback(() => {
    setInspectorOpen(false);
    setDealSheetOpen(true);
  }, []);
  const setFocusedTermDown = useCallback(
    (term: number, down: number) => setDeal({ loanTerm: term, downPayment: down }),
    [setDeal]
  );
  const toggleFocusedFavorite = useCallback(() => {
    if (focused) toggleFavorite(focused.vin);
  }, [focused, toggleFavorite]);
  const focusInventoryVin = useCallback(
    (vin: string) => {
      setFocusVin(vin);
      if (
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia(DRAWER_QUERY).matches
      ) {
        setInspectorOpen(true);
      }
    },
    [setFocusVin]
  );

  // Beside the grid, choosing a unit changes the inspector without moving
  // focus, so say what landed on the desk — once per selection, after a
  // short pause, and never for a reprice of the same unit. The first
  // (automatic) selection on load is not announced. In the drawer layout the
  // drawer opens and takes focus, which says it already.
  const [selectionAnnouncement, setSelectionAnnouncement] = useState("");
  const announcedVinRef = useRef<string | null>(null);
  const focusedRef = useRef(focused);
  useEffect(() => {
    focusedRef.current = focused;
  }, [focused]);
  const focusedVinForAnnouncement = focused?.vin ?? null;
  useEffect(() => {
    if (!focusedVinForAnnouncement) return;
    const previousVin = announcedVinRef.current;
    announcedVinRef.current = focusedVinForAnnouncement;
    if (previousVin === null || previousVin === focusedVinForAnnouncement || compactInspector) {
      return;
    }
    const timer = window.setTimeout(() => {
      const current = focusedRef.current;
      if (current?.vin === focusedVinForAnnouncement) {
        setSelectionAnnouncement(describeSelection(current));
      }
    }, SELECTION_ANNOUNCE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [compactInspector, focusedVinForAnnouncement]);

  // Drawer layout with the drawer closed: the sticky deal bar is the one
  // "View deal" button, so the grid header hides its copy.
  const dealBarVisible = compactInspector && !inspectorOpen && Boolean(focused);
  // The deal bar's "View deal" unmounts while the drawer is open, so the
  // drawer can't hand focus back to it on close; do it here instead.
  const dealBarButtonRef = useRef<HTMLButtonElement>(null);
  const wasInspectorOpenRef = useRef(inspectorOpen);
  useEffect(() => {
    const wasOpen = wasInspectorOpenRef.current;
    wasInspectorOpenRef.current = inspectorOpen;
    if (!wasOpen || inspectorOpen) return;
    const active = document.activeElement;
    if (!active || active === document.body || !active.isConnected) {
      dealBarButtonRef.current?.focus();
    }
  }, [inspectorOpen]);

  const orderedVins = useMemo(() => rows.map((row) => row.vin), [rows]);
  useDeskShortcuts({
    orderedVins,
    focusedVin: focused?.vin ?? null,
    onFocusVin: setFocusVin,
    onToggleCompare: toggleFavorite,
    isModalOpen: dealSheetOpen,
    onSaveDeal: saveFocusedDeal,
    shortcutsHelpOpen,
    onOpenShortcutsHelp: () => setShortcutsHelpOpen(true),
    onCloseShortcutsHelp: () => setShortcutsHelpOpen(false),
  });

  const buyerState = dealData.buyerState ?? settings.defaultState;
  const focusedPayment = focused ? paymentText(focused) : null;

  return (
    <div data-screen-label="Dealer desk">
      <h1 className="sr-only">The Desk</h1>
      <div className="desk-body">
        <div className="desk-workspace">
          <div className="desk-main-column">
            <DeskTermsRail
              customerName={customerName}
              setCustomerName={setCustomerName}
              filters={filters}
              setFilter={setFilter}
              dealData={dealData}
              setDeal={setDeal}
              buyerState={buyerState}
              aprText={aprText}
              onAprChange={onAprChange}
              buyRate={buyRate}
              applyBuyRate={applyBuyRate}
              advancedOpen={advancedTermsOpen}
              onToggleAdvanced={() => setAdvancedTermsOpen((open) => !open)}
              onReset={handleReset}
              onClearFilters={clearFilters}
              onScanIncome={() => setScannerOpen(true)}
            />

            {compareCards.length > 0 && (
              <CompareStrip
                vehicles={compareCards}
                focusedVin={focused?.vin ?? null}
                thresholds={thresholds}
                onFocus={focusInventoryVin}
                onRemove={toggleFavorite}
              />
            )}

            <InventoryGrid
              rows={rows}
              inventoryCount={processedInventory.length}
              focusedVin={focused?.vin ?? null}
              thresholds={thresholds}
              searchQuery={searchQuery}
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSearchChange={setSearchQuery}
              onSort={handleSort}
              onFocus={focusInventoryVin}
              onOpenInspector={() => setInspectorOpen(true)}
              showInspectorButton={!dealBarVisible}
              onLoadSampleData={loadSampleData}
              onClearFilters={clearFilters}
            />
          </div>

          {inspectorOpen && (
            <button
              type="button"
              aria-label="Close deal inspector"
              className="desk-inspector-backdrop"
              onClick={() => setInspectorOpen(false)}
            />
          )}
          {focused && (
            <DealInspector
              vehicle={focused}
              entries={focusedEntries}
              profilesById={profilesById}
              totalLenders={totalLenders}
              dealData={dealData}
              settings={settings}
              pinned={isPinned}
              onPin={toggleFocusedFavorite}
              onSetTermDown={setFocusedTermDown}
              compactMode={compactInspector}
              onCloseCompact={() => setInspectorOpen(false)}
              compactOpen={inspectorOpen}
              vscAmount={backendSplit.vscAmount}
              gapAmount={backendSplit.gapAmount}
              otherBackend={backendSplit.otherBackend}
              onToggleVsc={toggleVsc}
              onToggleGap={toggleGap}
              onVscAmountChange={setVscAmount}
              onGapAmountChange={setGapAmount}
              onOtherBackendChange={setOtherBackend}
              onDealSheet={openDealSheet}
              onSaveDeal={saveFocusedDeal}
            />
          )}
        </div>

        {/* Drawer layout only: the unit on the desk and a way to open it.
            Last child of .desk-body so it sticks to the bottom edge. */}
        {dealBarVisible && focused && (
          <div className="desk-deal-bar">
            <div className="desk-deal-bar-info min-w-0">
              <span className="desk-deal-bar-name block truncate font-semibold">
                {focused.vehicle}
              </span>
              {focusedPayment && (
                <span className="desk-deal-bar-payment block tabular-nums">
                  <span aria-hidden="true">{fmt(numVal(focused.monthlyPayment) as number)}/mo</span>
                  <span className="sr-only">{focusedPayment} per month</span>
                </span>
              )}
            </div>
            <button
              ref={dealBarButtonRef}
              type="button"
              className="desk-deal-bar-btn desk-primary-action min-h-11 shrink-0 px-4"
              onClick={() => setInspectorOpen(true)}
            >
              View deal
            </button>
          </div>
        )}
      </div>

      <div role="status" className="sr-only">
        {selectionAnnouncement}
      </div>

      {dealSheetOpen && focused && (
        <Suspense fallback={null}>
          <DealSheetModal
            vehicle={focused}
            onClose={() => setDealSheetOpen(false)}
            onSaveToPipeline={saveFromDealSheet}
          />
        </Suspense>
      )}

      {scannerOpen && (
        <Suspense fallback={null}>
          <DocumentScanner
            onIncomeExtracted={(income) => {
              setFilters({ ...filters, monthlyIncome: income });
              toast.success(`Monthly income set to ${fmt(income)} from pay stub`);
            }}
            onClose={() => setScannerOpen(false)}
          />
        </Suspense>
      )}

      <DeskShortcutsHelp open={shortcutsHelpOpen} onClose={() => setShortcutsHelpOpen(false)} />
    </div>
  );
};

const DeskScreen = React.memo(DeskScreenBase) as React.FC;
DeskScreen.displayName = "DeskScreen";
export default DeskScreen;
