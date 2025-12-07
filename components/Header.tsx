import React, { useState, useEffect, useRef } from "react";
import Button from "./common/Button";
import * as Icons from "./common/Icons";
import ThemeToggle from "./common/ThemeToggle";
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
  // Upload state for animated button
  isUploading?: boolean;
  isUploadMinimized?: boolean;
  uploadProgress?: number;
  uploadStage?: string;
  onRestoreUpload?: () => void;
}

// Dealer Switcher Component for SuperAdmins
const DealerSwitcher: React.FC<{ onDealerChange?: () => void }> = ({
  onDealerChange,
}) => {
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

      // If no dealer is selected yet and we have dealers, auto-select the first one
      // Don't trigger onDealerChange for auto-selection - only for manual switches
      const firstDealer = dealerList[0];
      if (!selectedDealerId && firstDealer) {
        setSelectedDealerId(firstDealer.id);
        setSuperadminDealerOverride(firstDealer.id);
        // No reload needed - data will load with the selected dealer
      }
    };
    loadDealers();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
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
      <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/20 text-yellow-400 rounded-lg text-xs">
        <Icons.SpinnerIcon className="w-4 h-4 animate-spin" />
        Loading dealers...
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-purple-600/20 text-purple-300 border border-purple-500/50 rounded-lg text-sm hover:bg-purple-600/30 transition-all"
      >
        <Icons.BuildingStorefrontIcon className="w-4 h-4" />
        <span className="font-medium max-w-[150px] truncate">
          {selectedDealer?.name || "Select Dealer"}
        </span>
        <Icons.ChevronDownIcon
          className={`w-4 h-4 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-72 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-slate-700">
            <div className="relative">
              <Icons.MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search dealers..."
                className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:border-purple-500"
                autoFocus
              />
            </div>
          </div>

          {/* Dealer List */}
          <div className="max-h-64 overflow-y-auto">
            {filteredDealers.length === 0 ? (
              <div className="p-4 text-center text-slate-400 text-sm">
                No dealers found
              </div>
            ) : (
              filteredDealers.map((dealer) => (
                <button
                  key={dealer.id}
                  onClick={() => handleSelectDealer(dealer.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-700/50 transition-colors ${
                    dealer.id === selectedDealerId
                      ? "bg-purple-600/20 border-l-2 border-purple-500"
                      : ""
                  }`}
                >
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                    {dealer.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">
                      {dealer.name}
                    </div>
                    <div className="text-xs text-slate-400">
                      {dealer.code && <span>Code: {dealer.code}</span>}
                      {dealer.city && dealer.state && (
                        <span>
                          {" "}
                          • {dealer.city}, {dealer.state}
                        </span>
                      )}
                    </div>
                  </div>
                  {dealer.id === selectedDealerId && (
                    <Icons.CheckIcon className="w-5 h-5 text-purple-400" />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-2 border-t border-slate-700 bg-slate-800/50">
            <div className="text-xs text-slate-400 text-center">
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
    <header className="sticky top-0 z-30 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-900 text-white shadow-lg px-4">
      <div className="flex flex-wrap justify-between items-center gap-4 py-4">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              LTV & Desking Pro
            </h1>
            <p className="mt-1 text-sm sm:text-base text-slate-200/80">
              Precision deal structuring, lender intelligence, and desking in
              one refined workspace.
            </p>
          </div>

          {/* SuperAdmin Dealer Switcher */}
          {isSuperAdmin && (
            <div className="flex items-center gap-3 ml-4 pl-4 border-l border-slate-700">
              <div className="flex items-center gap-1.5 px-2 py-1 bg-purple-600/30 rounded-lg">
                <Icons.ShieldCheckIcon className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-medium text-purple-300">
                  Super Admin
                </span>
              </div>
              <DealerSwitcher onDealerChange={onDealerChange} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsShowroomMode(!isShowroomMode)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              isShowroomMode
                ? "bg-green-500/20 text-green-400 border border-green-500/50"
                : "bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700"
            }`}
            title="Toggle Showroom Mode (Hides Profit/Cost)"
          >
            {isShowroomMode ? (
              <>
                <Icons.EyeIcon className="w-4 h-4" /> Showroom On
              </>
            ) : (
              <>
                <Icons.EyeSlashIcon className="w-4 h-4" /> Desk Mode
              </>
            )}
          </button>
          <div className="h-6 w-px bg-slate-700 mx-1" />
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <Button
            variant="secondary"
            onClick={onOpenSettingsModal}
            size="sm"
            className="!rounded-full gap-2"
          >
            <Icons.CogIcon className="w-4 h-4" /> Settings
          </Button>
          {/* AI Lender Upload Button with Progress Animation */}
          <div className="relative">
            {/* Animated progress ring when uploading and minimized */}
            {isUploading && isUploadMinimized && (
              <>
                {/* Outer glow ring */}
                <div
                  className="absolute -inset-1 rounded-full opacity-75 animate-pulse"
                  style={{
                    background: `conic-gradient(from 0deg, rgba(168, 85, 247, 0.8) ${
                      (uploadProgress || 0) * 3.6
                    }deg, rgba(236, 72, 153, 0.2) ${
                      (uploadProgress || 0) * 3.6
                    }deg)`,
                  }}
                />
                {/* Spinning glow effect */}
                <div
                  className="absolute -inset-1 rounded-full animate-spin"
                  style={{
                    background:
                      "conic-gradient(from 0deg, transparent 0deg, rgba(168, 85, 247, 0.6) 60deg, transparent 120deg)",
                    animationDuration: "2s",
                  }}
                />
              </>
            )}
            <Button
              onClick={
                isUploading && isUploadMinimized && onRestoreUpload
                  ? onRestoreUpload
                  : onOpenAiModal
              }
              size="sm"
              className={`!rounded-full gap-2 relative z-10 transition-all duration-300 ${
                isUploading && isUploadMinimized
                  ? "bg-gradient-to-r from-purple-600 via-pink-500 to-purple-600 animate-gradient-x shadow-lg shadow-purple-500/50"
                  : "bg-gradient-to-r from-purple-500 to-pink-500"
              }`}
              title={
                isUploading && isUploadMinimized
                  ? `Uploading: ${uploadProgress || 0}% - ${
                      uploadStage || "Processing..."
                    }`
                  : "AI Lender Upload"
              }
            >
              {isUploading && isUploadMinimized ? (
                <>
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  <span className="font-semibold">{uploadProgress || 0}%</span>
                </>
              ) : (
                <>
                  <Icons.SparklesIcon className="w-4 h-4" /> AI Lender Upload
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
