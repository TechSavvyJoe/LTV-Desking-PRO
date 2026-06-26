import React, { useState, useEffect, useRef } from "react";
import Button from "./common/Button";
import * as Icons from "./common/Icons";
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
  // Upload state for animated button
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
        className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-[var(--color-bg-subtle)] text-[var(--color-text)] border border-[var(--color-border-strong)] rounded text-sm hover:bg-[var(--color-bg-muted)] transition-colors"
      >
        <Icons.BuildingStorefrontIcon className="w-4 h-4" />
        <span className="font-medium max-w-[150px] truncate">
          {selectedDealer?.name || "Select Dealer"}
        </span>
        <Icons.ChevronDownIcon
          className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
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
                className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:border-[var(--color-primary)]"
                autoFocus
              />
            </div>
          </div>

          {/* Dealer List */}
          <div className="max-h-64 overflow-y-auto">
            {filteredDealers.length === 0 ? (
              <div className="p-4 text-center text-slate-400 text-sm">No dealers found</div>
            ) : (
              filteredDealers.map((dealer) => (
                <button
                  key={dealer.id}
                  onClick={() => handleSelectDealer(dealer.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-700/50 transition-colors ${
                    dealer.id === selectedDealerId
                      ? "bg-[var(--color-primary-subtle)] border-l-2 border-[var(--color-primary)]"
                      : ""
                  }`}
                >
                  <div className="w-8 h-8 bg-[var(--color-primary)] rounded flex items-center justify-center text-white font-semibold text-sm">
                    {dealer.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{dealer.name}</div>
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
                    <Icons.CheckIcon className="w-5 h-5 text-[var(--color-primary)]" />
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
    <header className="sticky top-0 z-30 bg-[var(--color-bg)] border-b border-[var(--color-border)] text-[var(--color-text)] px-4">
      <div className="flex flex-wrap justify-between items-center gap-4 py-2.5">
        <div className="flex items-center gap-4">
          <a
            href="/"
            className="flex items-center gap-2.5 group"
            aria-label="LTV Desking PRO — home"
          >
            <BrandMark className="w-8 h-8" variant="default" />
            <h1 className="text-[15px] font-display font-semibold tracking-tight">
              LTV Desking <span className="text-[var(--color-primary)]">PRO</span>
            </h1>
          </a>

          {/* SuperAdmin Dealer Switcher */}
          {isSuperAdmin && (
            <div className="flex items-center gap-3 ml-2 pl-3 border-l border-[var(--color-border)]">
              <div className="flex items-center gap-1.5 px-2 py-1 bg-[var(--color-bg-muted)] rounded">
                <Icons.ShieldCheckIcon className="w-4 h-4 text-[var(--color-text-muted)]" />
                <span className="text-xs font-medium text-[var(--color-text-muted)]">
                  Superadmin
                </span>
              </div>
              <DealerSwitcher onDealerChange={onDealerChange} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsShowroomMode(!isShowroomMode)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              isShowroomMode
                ? "bg-[var(--color-success)] text-white border border-transparent"
                : "bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)] border border-[var(--color-border-strong)] hover:bg-[var(--color-bg-muted)]"
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
          <div className="h-6 w-px bg-[var(--color-border)] mx-1" />
          <Button variant="secondary" onClick={onOpenSettingsModal} size="sm" className="gap-2">
            <Icons.CogIcon className="w-4 h-4" /> Settings
          </Button>
          {/* AI Lender Upload Button with Progress Animation */}
          <div className="relative">
            {/* Animated progress ring when uploading and minimized */}
            {isUploading && isUploadMinimized && (
              <>
                {/* Progress ring — navy, no purple/pink glow */}
                <div
                  className="absolute -inset-0.5 rounded opacity-90"
                  style={{
                    background: `conic-gradient(from 0deg, var(--color-primary) ${
                      (uploadProgress || 0) * 3.6
                    }deg, var(--color-border) ${(uploadProgress || 0) * 3.6}deg)`,
                  }}
                  aria-hidden
                />
              </>
            )}
            <Button
              variant="primary"
              onClick={
                isUploading && isUploadMinimized && onRestoreUpload
                  ? onRestoreUpload
                  : onOpenAiModal
              }
              size="sm"
              className="gap-2 relative z-10"
              title={
                isUploading && isUploadMinimized
                  ? `Uploading: ${uploadProgress || 0}% - ${uploadStage || "Processing..."}`
                  : "AI Lender Upload"
              }
            >
              {isUploading && isUploadMinimized ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
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
