
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import type { Vehicle, DealData, FilterData, SortConfig, LenderProfile, Message, ValidationErrors, CalculatedVehicle, SavedDeal, Settings } from './types';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useSettings } from './hooks/useSettings';
import { useTheme } from './hooks/useTheme';
import { parseFile } from './services/fileParser';
import { calculateFinancials } from './services/calculator';
import { decodeVin } from './services/vinDecoder';
import { INITIAL_DEAL_DATA, INITIAL_FILTER_DATA, SAMPLE_INVENTORY, DEFAULT_LENDER_PROFILES } from './constants';
import Header from './components/Header';
import DealControls from './components/DealControls';
import ActionBar from './components/ActionBar';
import FavoritesTable from './components/FavoritesTable';
import InventoryTable from './components/InventoryTable';
import Pagination from './components/Pagination';
import LenderProfiles from './components/LenderProfiles';
import CalculationKey from './components/CalculationKey';
import DealStructuringModal from './components/DealStructuringModal';
import FloatingToolsPanel from './components/FloatingToolsPanel';
import AiLenderManagerModal from './components/AiLenderManagerModal';
import DealHistoryPanel from './components/DealHistoryPanel';
import SettingsModal from './components/SettingsModal';

export default function App() {
  useTheme(); // Initialize theme management
  const [settings, setSettings] = useSettings();
  const [inventory, setInventory] = useLocalStorage<Vehicle[]>('ltvInventory', SAMPLE_INVENTORY);
  const [dealData, setDealData] = useLocalStorage<DealData>('ltvDealData', {
      ...INITIAL_DEAL_DATA,
      loanTerm: settings.defaultTerm,
      interestRate: settings.defaultApr,
      stateFees: settings.defaultStateFees,
  });
  const [filters, setFilters] = useLocalStorage<FilterData>('ltvFilters', INITIAL_FILTER_DATA);
  const [message, setMessage] = useState<Message | null>(null);
  const [errors, setErrors] = useState<ValidationErrors>({});
  
  const [customerName, setCustomerName] = useState<string>('');
  const [salespersonName, setSalespersonName] = useState<string>('');
  const [activeVehicle, setActiveVehicle] = useState<CalculatedVehicle | null>(null);
  const [isDealDirty, setIsDealDirty] = useState<boolean>(false);

  const [favorites, setFavorites] = useLocalStorage<Vehicle[]>('ltvFavorites', []);
  const [lenderProfiles, setLenderProfiles] = useLocalStorage<LenderProfile[]>('ltvBankProfiles', DEFAULT_LENDER_PROFILES);
  const [savedDeals, setSavedDeals] = useLocalStorage<SavedDeal[]>('ltvSavedDeals', []);
  const [scratchPadNotes, setScratchPadNotes] = useLocalStorage<string>('ltvScratchPad', '');

  const [inventorySort, setInventorySort] = useState<SortConfig>({ key: null, direction: 'asc' });
  const [favSort, setFavSort] = useState<SortConfig>({ key: null, direction: 'asc' });
  const [pagination, setPagination] = useState({ currentPage: 1, rowsPerPage: 15 });
  const [fileName, setFileName] = useState<string>('Sample Data Loaded');
  const [expandedInventoryRows, setExpandedInventoryRows] = useState<Set<string>>(new Set());
  
  const [dealVehicle, setDealVehicle] = useState<CalculatedVehicle | null>(null);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  
  const [vinLookupResult, setVinLookupResult] = useState<string | null>(null);
  const [isVinLoading, setIsVinLoading] = useState(false);

  // Ensure arrays are initialized to prevent crashes with extra defensive checks
  const safeInventory = useMemo(() => (Array.isArray(inventory) ? inventory : []).filter(v => v && typeof v === 'object'), [inventory]);
  const safeFavorites = useMemo(() => (Array.isArray(favorites) ? favorites : []).filter(v => v && typeof v === 'object'), [favorites]);
  const safeLenderProfiles = useMemo(() => (Array.isArray(lenderProfiles) ? lenderProfiles : []).filter(p => p && typeof p === 'object'), [lenderProfiles]);
  const safeSavedDeals = useMemo(() => (Array.isArray(savedDeals) ? savedDeals : []).filter(d => d && typeof d === 'object'), [savedDeals]);

  useEffect(() => {
    if (activeVehicle) {
      setIsDealDirty(true);
    }
  }, [dealData, filters, customerName, salespersonName, activeVehicle]);

  const handleVinLookup = useCallback(async () => {
    if (!filters || !filters.vin || typeof filters.vin !== 'string' || filters.vin?.length < 17) {
        setVinLookupResult(null);
        return;
    }
    setIsVinLoading(true);
    setVinLookupResult('Decoding VIN...');
    setMessage({ text: `Looking up VIN: ${filters.vin}`, type: 'info' });

    try {
        const vehicleInfo = await decodeVin(filters.vin);
        const description = `${vehicleInfo.year} ${vehicleInfo.make} ${vehicleInfo.model}`;
        setFilters(prev => ({ ...prev, vehicle: description }));
        setVinLookupResult(`Found: ${description}`);
        setMessage({ text: `Successfully decoded VIN. Vehicle filter updated.`, type: 'info' });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        setVinLookupResult(`Error: ${errorMessage}`);
        setMessage({ text: `VIN Lookup Error: ${errorMessage}`, type: 'error' });
    } finally {
        setIsVinLoading(false);
    }
  }, [filters, setFilters]);


  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setMessage({ text: 'Processing file...', type: 'info' });
    setFileName(file.name);

    try {
      const data = await parseFile(file);
      const safeData = Array.isArray(data) ? data : [];
      setInventory(safeData);
      setMessage({ text: `Successfully processed ${safeData.length} vehicles.`, type: 'info' });
      setPagination(prev => ({ ...prev, currentPage: 1 }));
      setFilters(INITIAL_FILTER_DATA);
      setInventorySort({ key: null, direction: 'asc' });
      setErrors({});
      setExpandedInventoryRows(new Set());
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      setMessage({ text: `File processing error: ${errorMessage}. Please ensure the file is not corrupted and has the required columns (e.g., Vehicle, Stock #, VIN, Price, J.D. Power Trade In, Odometer/Mileage).`, type: 'error' });
      setInventory([]);
    } finally {
        if(event.target) {
            event.target.value = '';
        }
    }
  };

  const clearDealAndFilters = useCallback(() => {
    setDealData({
        ...INITIAL_DEAL_DATA,
        loanTerm: settings.defaultTerm,
        interestRate: settings.defaultApr,
        stateFees: settings.defaultStateFees,
    });
    setFilters(INITIAL_FILTER_DATA);
    setErrors({});
    setCustomerName('');
    setSalespersonName('');
    setVinLookupResult(null);
    setScratchPadNotes('');
  }, [setDealData, setFilters, setErrors, setScratchPadNotes, settings]);

  const handleSaveActiveDeal = useCallback(() => {
    if (!activeVehicle) {
      setMessage({ text: 'No active vehicle to save a deal for. Please structure a deal on a vehicle first.', type: 'error' });
      return;
    }

    const currentDeals = Array.isArray(safeSavedDeals) ? safeSavedDeals : [];
    const dealNumber = (currentDeals.length > 0 
        ? Math.max(...currentDeals.map(d => (d && typeof d.dealNumber === 'number' ? d.dealNumber : 0))) 
        : 0) + 1;

    const newDeal: SavedDeal = {
        id: `deal_${Date.now()}`,
        dealNumber,
        vehicleVin: activeVehicle.vin,
        vehicleSnapshot: { ...activeVehicle },
        dealData: { ...dealData },
        customerFilters: {
            creditScore: filters?.creditScore ?? null,
            monthlyIncome: filters?.monthlyIncome ?? null,
        },
        customerName,
        salespersonName,
        createdAt: new Date().toISOString(),
    };

    setSavedDeals(prev => [newDeal, ...(Array.isArray(prev) ? prev : [])]);
    setIsDealDirty(false);
    setMessage({ text: `Deal #${newDeal.dealNumber} for the ${activeVehicle.vehicle} has been saved.`, type: 'info' });

  }, [activeVehicle, dealData, filters, customerName, salespersonName, safeSavedDeals, setSavedDeals]);
  
  const handleClearDeal = useCallback(() => {
    if (activeVehicle && isDealDirty) {
      handleSaveActiveDeal();
      setMessage(prev => ({ text: `${prev?.text || ''} Previous deal auto-saved. Inputs cleared.`, type: 'info' }));
    }
    clearDealAndFilters();
    setActiveVehicle(null);
    setIsDealDirty(false);
    setDealVehicle(null);
  }, [activeVehicle, isDealDirty, handleSaveActiveDeal, clearDealAndFilters]);

  const processedInventory = useMemo(() => {
    return safeInventory.map(item => calculateFinancials(item, dealData, settings));
  }, [safeInventory, dealData, settings]);

  const handleLoadDeal = useCallback((deal: SavedDeal) => {
      setDealData(deal.dealData);
      setFilters(prev => ({
          ...INITIAL_FILTER_DATA,
          creditScore: deal.customerFilters.creditScore,
          monthlyIncome: deal.customerFilters.monthlyIncome,
      }));
      setCustomerName(deal.customerName);
      setSalespersonName(deal.salespersonName);
      
      const loadedVehicle = processedInventory.find(v => v.vin === deal.vehicleVin) || deal.vehicleSnapshot;
      setActiveVehicle(loadedVehicle as CalculatedVehicle);
      setIsDealDirty(false);

      setMessage({ text: `Loaded deal #${deal.dealNumber} for ${deal.customerName}.`, type: 'info' });
  }, [processedInventory, setDealData, setFilters, setActiveVehicle]);
  
  const handleDeleteDeal = useCallback((dealId: string) => {
    if (window.confirm('Are you sure you want to permanently delete this deal history?')) {
        setSavedDeals(prev => (prev || []).filter(d => d.id !== dealId));
        setMessage({ text: 'Deal history deleted.', type: 'info' });
    }
  }, [setSavedDeals]);


  const filteredInventory = useMemo(() => {
    const safeFilters = filters || INITIAL_FILTER_DATA;
    return processedInventory.filter(item => {
      const vehicleMatch = !safeFilters.vehicle || (item.vehicle || '').toLowerCase().includes(safeFilters.vehicle.toLowerCase());
      const maxPriceMatch = !safeFilters.maxPrice || (typeof item.price === 'number' && item.price <= safeFilters.maxPrice);
      const maxPaymentMatch = !safeFilters.maxPayment || (typeof item.monthlyPayment === 'number' && item.monthlyPayment <= safeFilters.maxPayment);
      const vinMatch = !safeFilters.vin || (item.vin || '').toLowerCase().includes(safeFilters.vin.toLowerCase());
      return vehicleMatch && maxPriceMatch && maxPaymentMatch && vinMatch;
    });
  }, [processedInventory, filters]);

  const sortedInventory = useMemo(() => {
    if (!inventorySort.key) return filteredInventory;
    const sorted = [...filteredInventory];
    sorted.sort((a, b) => {
      const valA = a[inventorySort.key!];
      const valB = b[inventorySort.key!];
      
      const isAInvalid = valA === null || valA === 'Error' || valA === 'N/A' || valA === undefined;
      const isBInvalid = valB === null || valB === 'Error' || valB === 'N/A' || valB === undefined;

      if (isAInvalid && isBInvalid) return 0;
      if (isAInvalid) return 1;
      if (isBInvalid) return -1;

      if (typeof valA === 'number' && typeof valB === 'number') {
        return inventorySort.direction === 'asc' ? valA - valB : valB - valA;
      }
      if (typeof valA === 'string' && typeof valB === 'string') {
        return inventorySort.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return 0;
    });
    return sorted;
  }, [filteredInventory, inventorySort]);

  const paginatedInventory = useMemo(() => {
    const { currentPage, rowsPerPage } = pagination;
    if(rowsPerPage === Infinity) return sortedInventory;
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    return sortedInventory.slice(start, end);
  }, [sortedInventory, pagination]);
  
  const toggleFavorite = useCallback((vin: string) => {
    setFavorites(prev => {
      const safePrev = Array.isArray(prev) ? prev : [];
      const isFav = safePrev.some(f => f.vin === vin);
      if (isFav) {
        return safePrev.filter(f => f.vin !== vin);
      } else {
        const vehicleToAdd = (inventory || []).find(v => v.vin === vin);
        return vehicleToAdd ? [...safePrev, vehicleToAdd] : safePrev;
      }
    });
  }, [inventory, setFavorites]);
  
  const toggleInventoryRowExpansion = useCallback((vin: string) => {
    setExpandedInventoryRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(vin)) {
        newSet.delete(vin);
      } else {
        newSet.add(vin);
      }
      return newSet;
    });
  }, []);
  
  const handleStructureDeal = useCallback((vehicle: CalculatedVehicle) => {
      if (activeVehicle && isDealDirty) {
          handleSaveActiveDeal();
      }
      setActiveVehicle(vehicle);
      setDealVehicle(vehicle); 
  }, [activeVehicle, isDealDirty, handleSaveActiveDeal]);

  const handleSaveAndClearModal = useCallback(() => {
      handleSaveActiveDeal();
      setDealVehicle(null);
      clearDealAndFilters();
      setActiveVehicle(null);
      setIsDealDirty(false);
  }, [handleSaveActiveDeal, clearDealAndFilters]);
  
  const handleInventoryUpdate = useCallback((vin: string, updatedData: Partial<Vehicle>) => {
      setInventory(prev => (prev || []).map(v => v.vin === vin ? { ...v, ...updatedData } : v));
      // Keep favorites in sync when editing from expanded rows so numbers match across tables/PDFs.
      setFavorites(prev => {
          if (!Array.isArray(prev)) return prev;
          return prev.map(f => f.vin === vin ? { ...f, ...updatedData } : f);
      });
  }, [setInventory, setFavorites]);

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black text-gray-100 transition-colors">
          <Header onOpenAiModal={() => setIsAiModalOpen(true)} onOpenSettingsModal={() => setIsSettingsModalOpen(true)} />

          <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="border-x border-slate-200 dark:border-x-border min-h-screen">
                  <div className="px-4">
                      {message && (
                          <div className={`my-4 p-3 rounded-md text-sm ${message.type === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-x-blue/20 text-x-blue'}`}>
                              {message.text}
                          </div>
                      )}

                      <DealControls
                          filters={filters || INITIAL_FILTER_DATA}
                          setFilters={setFilters}
                          dealData={dealData}
                          setDealData={setDealData}
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
                          onFileChange={handleFileChange}
                          fileName={fileName}
                          onSaveDeal={handleSaveActiveDeal}
                          onClearDeal={handleClearDeal}
                          activeVehicle={activeVehicle}
                          isDealDirty={isDealDirty}
                          visibleData={paginatedInventory}
                          favoritesData={safeFavorites.map(fav => calculateFinancials(fav, dealData, settings))}
                          dealData={dealData}
                          customerFilters={filters || INITIAL_FILTER_DATA}
                          lenderProfiles={safeLenderProfiles}
                          customerName={customerName}
                          salespersonName={salespersonName}
                          settings={settings}
                      />

                      <FavoritesTable
                          favorites={safeFavorites}
                          dealData={dealData}
                          setDealData={setDealData}
                          lenderProfiles={safeLenderProfiles}
                          customerFilters={filters || INITIAL_FILTER_DATA}
                          toggleFavorite={toggleFavorite}
                          sortConfig={favSort}
                          setSortConfig={setFavSort}
                          onStructureDeal={handleStructureDeal}
                          customerName={customerName}
                          salespersonName={salespersonName}
                          onInventoryUpdate={handleInventoryUpdate}
                          settings={settings}
                      />

                      <InventoryTable
                          vehicles={paginatedInventory}
                          favorites={safeFavorites}
                          toggleFavorite={toggleFavorite}
                          sortConfig={inventorySort}
                          setSortConfig={setInventorySort}
                          expandedRows={expandedInventoryRows}
                          onRowClick={toggleInventoryRowExpansion}
                          onStructureDeal={handleStructureDeal}
                          lenderProfiles={safeLenderProfiles}
                          dealData={dealData}
                          setDealData={setDealData}
                          onInventoryUpdate={handleInventoryUpdate}
                          customerFilters={filters || INITIAL_FILTER_DATA}
                          customerName={customerName}
                          salespersonName={salespersonName}
                          settings={settings}
                      />

                      <Pagination
                          totalItems={sortedInventory.length}
                          pagination={pagination}
                          setPagination={setPagination}                                
                      />

                      <LenderProfiles profiles={safeLenderProfiles} setProfiles={setLenderProfiles} />

                      <CalculationKey />

                  </div>
              </div>
          </main>

          <DealHistoryPanel deals={safeSavedDeals} onLoadDeal={handleLoadDeal} onDeleteDeal={handleDeleteDeal} />
          
          <FloatingToolsPanel 
              activeVehicle={activeVehicle}
              dealData={dealData}
              onDealDataChange={setDealData}
              customerFilters={filters || INITIAL_FILTER_DATA}
              customerName={customerName}
              salespersonName={salespersonName}
              lenderProfiles={safeLenderProfiles}
              scratchPadNotes={scratchPadNotes}
              setScratchPadNotes={setScratchPadNotes}
              settings={settings}
              inventory={processedInventory}
              favorites={safeFavorites}
              toggleFavorite={toggleFavorite}
          />
      </div>

      {dealVehicle && (
        <DealStructuringModal
          vehicle={dealVehicle}
          dealData={dealData}
          setDealData={setDealData}
          onClose={() => setDealVehicle(null)}
          errors={errors}
          setErrors={setErrors}
          onSave={handleSaveActiveDeal}
          onSaveAndClear={handleSaveAndClearModal}
          settings={settings}
        />
      )}
      
      <AiLenderManagerModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        currentProfiles={safeLenderProfiles}
        onUpdateProfiles={setLenderProfiles}
      />
      
      <SettingsModal 
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={settings}
        onSave={setSettings}
      />
    </>
  );
}
