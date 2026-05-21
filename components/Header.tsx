import React, { useState, useEffect, useRef } from "react";
import Button from "./common/Button";
import * as Icons from "./common/Icons";
import ThemeToggle from "./common/ThemeToggle";
import { BrandMark } from "./common/BrandMark";
import { useDealContext } from "../context/DealContext";
import {
  getCurrentUser,
  Dealer,
  getSuperadminDealerOverride,
  setSuperadminDealerOverride,
} from "../lib/pocketbase";
import { getAllDealers } from "../lib/api";

interface HeaderProps {
  onOpenAiModal: () => void;
  onOpenSettingsModal: () => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  onDealerChange?: () => void;
  isUploading?: boolean;
  isUploadMinimized?: boolean;
  uploadProgress?: number;
  uploadStage?: string;
  onRestoreUpload?: () => void;
}

// Dealer Switcher Component for SuperAdmins
const DealerSwitcher: React.FC<{ onDealerChange?: () => void }> = ({ onDealerChange }) => {
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [selectedDealerId, setSelectedDealerId] = useState<string | null>(
    getSuperadminDealerOverride()
  );
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadDealers = async () => {
      const dealerList = await getAllDealers();
      setDealers(dealerList);

      const firstDealer = dealerList[0];
      if (!selectedDealerId && firstDealer) {
        setSelectedDealerId(firstDealer.id);
        setSuperadminDealerOverride(firstDealer.id);
      }
    };
    loadDealers();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedDealer = dealers.find((d) => d.id === selectedDealerId);
  const filteredDealers = dealers.filter(
    (d) =>
      d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelectDealer = (dealerId: string) => {
    setSelectedDealerId(dealerId);
    setSuperadminDealerOverride(dealerId);
    setIsOpen(false);
    setSearchTerm("");
    onDealerChange?.();
  };

  if (dealers.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 rounded-lg text-xs">
        <Icons.SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
        <span>Loading...</span>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
      >
        <Icons.BuildingStorefrontIcon className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
        <span className="font-medium max-w-[140px] truncate">
          {selectedDealer?.name || "Select Dealer"}
        </span>
        <Icons.ChevronDownIcon
          className={`w-3.5 h-3.5 text-neutral-400 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1.5 w-72 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in">
          {/* Search */}
          <div className="p-2 border-b border-neutral-100 dark:border-neutral-800">
            <div className="relative">
              <Icons.MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search dealers..."
                className="w-full pl-9 pr-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:border-primary-500 dark:focus:border-primary-400"
                autoFocus
              />
            </div>
          </div>

          {/* Dealer List */}
          <div className="max-h-64 overflow-y-auto custom-scrollbar">
            {filteredDealers.length === 0 ? (
              <div className="p-4 text-center text-neutral-400 text-sm">No dealers found</div>
            ) : (
              filteredDealers.map((dealer) => (
                <button
                  key={dealer.id}
                  onClick={() => handleSelectDealer(dealer.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors ${
                    dealer.id === selectedDealerId ? "bg-neutral-50 dark:bg-neutral-800" : ""
                  }`}
                >
                  <div className="w-8 h-8 bg-neutral-100 dark:bg-neutral-800 rounded-lg flex items-center justify-center text-neutral-600 dark:text-neutral-300 font-semibold text-sm border border-neutral-200 dark:border-neutral-700">
                    {dealer.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                      {dealer.name}
                    </div>
                    {(dealer.code || (dealer.city && dealer.state)) && (
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">
                        {dealer.code && <span>{dealer.code}</span>}
                        {dealer.code && dealer.city && dealer.state && <span> · </span>}
                        {dealer.city && dealer.state && (
                          <span>
                            {dealer.city}, {dealer.state}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {dealer.id === selectedDealerId && (
                    <Icons.CheckIcon className="w-4 h-4 text-primary-500" />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-3 py-2 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50">
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              {dealers.length} dealer{dealers.length !== 1 ? "s" : ""} available
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Header: React.FC<HeaderProps> = ({
  onOpenAiModal,
  onOpenSettingsModal,
  theme,
  toggleTheme,
  onDealerChange,
  isUploading,
  isUploadMinimized,
  uploadProgress,
  uploadStage,
  onRestoreUpload,
}) => {
  const { isShowroomMode, setIsShowroomMode } = useDealContext();
  const currentUser = getCurrentUser();
  const isSuperAdmin = currentUser?.role === "superadmin";

  return (
    <header className="sticky top-0 z-30 bg-white dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 px-4 lg:px-6">
      <div className="flex items-center justify-between h-14 gap-4">
        {/* Left side - Logo and brand */}
        <div className="flex items-center gap-4">
          <a href="/" className="flex items-center gap-3 group" aria-label="LTV Desking PRO — home">
            <BrandMark
              className="w-8 h-8 transition-transform group-hover:scale-105"
              variant="default"
            />
            <div className="hidden sm:block">
              <h1 className="text-base font-semibold text-neutral-900 dark:text-white tracking-tight">
                LTV Desking <span className="text-primary-500">PRO</span>
              </h1>
            </div>
          </a>

          {/* SuperAdmin Badge & Dealer Switcher */}
          {isSuperAdmin && (
            <div className="flex items-center gap-3 ml-2 pl-4 border-l border-neutral-200 dark:border-neutral-800">
              <span className="hidden md:flex items-center gap-1.5 px-2 py-1 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-md">
                <Icons.ShieldCheckIcon className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" />
                <span className="text-xs font-medium text-primary-700 dark:text-primary-300">
                  Admin
                </span>
              </span>
              <DealerSwitcher onDealerChange={onDealerChange} />
            </div>
          )}
        </div>

        {/* Right side - Actions */}
        <div className="flex items-center gap-2">
          {/* Showroom Mode Toggle */}
          <button
            onClick={() => setIsShowroomMode(!isShowroomMode)}
            className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isShowroomMode
                ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-transparent hover:border-neutral-200 dark:hover:border-neutral-700"
            }`}
            title="Toggle Showroom Mode (Hides Profit/Cost)"
          >
            {isShowroomMode ? (
              <>
                <Icons.EyeIcon className="w-3.5 h-3.5" />
                <span>Showroom</span>
              </>
            ) : (
              <>
                <Icons.EyeSlashIcon className="w-3.5 h-3.5" />
                <span>Desk</span>
              </>
            )}
          </button>

          <div className="hidden sm:block h-5 w-px bg-neutral-200 dark:bg-neutral-800 mx-1" />

          <ThemeToggle theme={theme} onToggle={toggleTheme} />

          <Button variant="ghost" onClick={onOpenSettingsModal} size="sm" className="gap-1.5">
            <Icons.CogIcon className="w-4 h-4" />
            <span className="hidden md:inline">Settings</span>
          </Button>

          {/* AI Lender Upload Button */}
          <Button
            onClick={
              isUploading && isUploadMinimized && onRestoreUpload ? onRestoreUpload : onOpenAiModal
            }
            size="sm"
            className={`gap-1.5 ${
              isUploading && isUploadMinimized
                ? "bg-primary-600 hover:bg-primary-700 dark:bg-primary-600 dark:hover:bg-primary-500 text-white border-primary-600 dark:border-primary-500"
                : "bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-400 text-white border-primary-600 dark:border-primary-500"
            }`}
            title={
              isUploading && isUploadMinimized
                ? `Uploading: ${uploadProgress || 0}% - ${uploadStage || "Processing..."}`
                : "AI Lender Upload"
            }
          >
            {isUploading && isUploadMinimized ? (
              <>
                <Icons.SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
                <span className="font-medium tabular">{uploadProgress || 0}%</span>
              </>
            ) : (
              <>
                <Icons.SparklesIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">AI Upload</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </header>
  );
};

export default Header;
