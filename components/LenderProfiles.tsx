import React, { useState, useCallback } from "react";
import type { LenderProfile, LenderTier } from "../types";
import Button from "./common/Button";
import LenderProfileModal from "./LenderProfileModal";
import { generateLenderCheatSheetPdf } from "../services/pdfGenerator";
import { processLenderSheet } from "../services/aiProcessor";
import * as Icons from "./common/Icons";
import {
  saveLenderProfile,
  updateLenderProfile,
  deleteLenderProfile,
} from "../lib/api";

interface LenderProfilesProps {
  profiles: LenderProfile[];
  onUpdate: React.Dispatch<React.SetStateAction<LenderProfile[]>>;
}

const getRange = (tiers: LenderTier[], key: keyof LenderTier): string => {
  if (!tiers || !Array.isArray(tiers) || tiers.length === 0) return "N/A";
  // Filter out potential null/undefined entries in the array
  const validTiers = tiers.filter((t) => t);
  if (validTiers.length === 0) return "N/A";

  const values = validTiers
    .map((t) => t[key] as number)
    .filter((v) => typeof v === "number" && v > 0);
  if (values.length === 0) return "N/A";
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? `${min}` : `${min} - ${max}`;
};

const TierDetail = ({
  label,
  value,
  highlight,
  icon,
}: {
  label: string;
  value: string | number | undefined | null;
  highlight?: boolean;
  icon?: React.ReactNode;
}) => {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div
      className={`flex items-center justify-between py-2 px-3 rounded-lg transition-colors ${
        highlight
          ? "bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-200 dark:border-emerald-800/50"
          : "bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800/60"
      }`}
    >
      <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {icon}
        {label}
      </span>
      <span
        className={`text-sm font-bold ${
          highlight
            ? "text-emerald-700 dark:text-emerald-400"
            : "text-slate-900 dark:text-slate-100"
        }`}
      >
        {value}
      </span>
    </div>
  );
};

// Premium section header for tier cards
const TierSection = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div className="space-y-2">
    <h5 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 border-b border-slate-200 dark:border-slate-700 pb-1">
      {title}
    </h5>
    <div className="space-y-1.5">{children}</div>
  </div>
);

const LenderProfiles: React.FC<LenderProfilesProps> = ({
  profiles,
  onUpdate,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<LenderProfile | null>(
    null
  );
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [isUploading, setIsUploading] = useState(false);
  const [targetLenderId, setTargetLenderId] = useState<string>("auto");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleAddNew = () => {
    setEditingProfile(null);
    setIsModalOpen(true);
  };

  const handleEdit = (profile: LenderProfile) => {
    setEditingProfile(profile);
    setIsModalOpen(true);
  };

  const handleSave = async (profileToSave: LenderProfile) => {
    // Determine if new or update
    const isNew =
      !profileToSave.id ||
      profileToSave.id.startsWith("new_") ||
      profileToSave.id.startsWith("ai_");

    const apiProfile = {
      ...profileToSave,
      active: profileToSave.active ?? true, // Default to true if undefined
      tiers: profileToSave.tiers as any[], // Explicit cast for API
    };

    try {
      if (isNew) {
        // Create
        // Omit id for creation
        const { id, ...createData } = apiProfile;
        const saved = await saveLenderProfile(createData as any);
        if (saved) {
          onUpdate((prev) => [...prev, saved as unknown as LenderProfile]);
        }
      } else {
        // Update
        const updated = await updateLenderProfile(
          profileToSave.id,
          apiProfile as any
        );
        if (updated) {
          onUpdate((prev) =>
            prev.map((p) =>
              p.id === updated.id ? (updated as unknown as LenderProfile) : p
            )
          );
        }
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error("Failed to save lender profile", error);
      alert("Failed to save profile.");
    }
  };

  const handleDelete = async (id: string) => {
    if (
      window.confirm("Are you sure you want to delete this lender profile?")
    ) {
      const success = await deleteLenderProfile(id);
      if (success) {
        onUpdate((prev) => prev.filter((p) => p.id !== id));
      } else {
        alert("Failed to delete profile.");
      }
    }
  };

  const toggleRowExpansion = useCallback((id: string) => {
    setExpandedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const handleDownloadCheatSheet = async () => {
    if (profiles.length === 0) {
      alert("No lender profiles to generate a cheat sheet for.");
      return;
    }
    try {
      const blob = await generateLenderCheatSheetPdf(profiles);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (error) {
      console.error("Failed to generate lender cheat sheet PDF:", error);
      alert(
        "Sorry, there was an error creating the cheat sheet. Please try again."
      );
    }
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    let updatedCount = 0;
    let createdCount = 0;
    let errors: string[] = [];

    // Helper to save/update a lender and update local state
    const persistLender = async (
      extractedData: Partial<LenderProfile>,
      existingProfile: LenderProfile | null
    ): Promise<boolean> => {
      try {
        if (existingProfile) {
          // Update existing lender in PocketBase
          const mergedData = {
            ...existingProfile,
            ...extractedData,
            id: existingProfile.id,
            tiers: extractedData.tiers || existingProfile.tiers,
          };
          const updated = await updateLenderProfile(
            existingProfile.id,
            mergedData as any
          );
          if (updated) {
            onUpdate((prev) =>
              prev.map((p) =>
                p.id === existingProfile.id
                  ? (updated as unknown as LenderProfile)
                  : p
              )
            );
            updatedCount++;
            return true;
          }
        } else {
          // Create new lender in PocketBase
          const { id, ...createData } = extractedData as any;
          const saved = await saveLenderProfile({
            ...createData,
            active: true,
            tiers: createData.tiers || [],
          } as any);
          if (saved) {
            onUpdate((prev) => [...prev, saved as unknown as LenderProfile]);
            createdCount++;
            return true;
          }
        }
        return false;
      } catch (error) {
        console.error("Failed to persist lender:", error);
        return false;
      }
    };

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file) continue;

        try {
          // processLenderSheet now returns an array of lenders
          const extractedLenders = await processLenderSheet(file);

          if (!extractedLenders || extractedLenders.length === 0) {
            errors.push(`Could not extract any lender data from ${file.name}`);
            continue;
          }

          // Process each extracted lender
          for (let j = 0; j < extractedLenders.length; j++) {
            const extractedData = extractedLenders[j];
            if (!extractedData || !extractedData.name) continue;

            // Determine target profile to update
            let targetId = targetLenderId;

            // If auto-detect, try to find a match by name
            if (targetId === "auto") {
              const match = profiles.find(
                (p) =>
                  p.name
                    .toLowerCase()
                    .includes(extractedData.name!.toLowerCase()) ||
                  extractedData
                    .name!.toLowerCase()
                    .includes(p.name.toLowerCase())
              );
              if (match) {
                targetId = match.id;
              }
            }

            // Find existing profile if we have a target
            let existingProfile: LenderProfile | null = null;
            if (targetId !== "auto") {
              existingProfile = profiles.find((p) => p.id === targetId) || null;
            } else {
              // Auto-detect: check if lender already exists by name
              existingProfile =
                profiles.find(
                  (p) =>
                    p.name.toLowerCase() === extractedData.name!.toLowerCase()
                ) || null;
            }

            // Persist to PocketBase and update local state
            const success = await persistLender(extractedData, existingProfile);
            if (!success) {
              errors.push(`Failed to save ${extractedData.name} to database`);
            }
          }
        } catch (err: any) {
          errors.push(`${file.name}: ${err.message}`);
        }
      }

      let message = `Processed ${files.length} file(s).\n`;
      if (updatedCount > 0) message += `Updated ${updatedCount} lender(s).\n`;
      if (createdCount > 0)
        message += `Created ${createdCount} new lender(s).\n`;
      if (errors.length > 0) message += `\nErrors:\n${errors.join("\n")}`;

      alert(message);
    } catch (error: any) {
      console.error("Upload failed:", error);
      alert(error.message || "Failed to process files.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const ExpandedRow = ({ profile }: { profile: LenderProfile }) => {
    const tiers =
      profile?.tiers && Array.isArray(profile.tiers) ? profile.tiers : [];

    return (
      <td colSpan={9} className="p-0">
        <div className="bg-gradient-to-b from-slate-50 to-white dark:from-slate-900/80 dark:to-slate-900 p-6 border-t-2 border-blue-500">
          {/* Lender Quick Stats Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                <Icons.BuildingLibraryIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h4 className="text-xl font-bold text-slate-900 dark:text-white">
                  {profile.name}
                </h4>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {tiers.length} {tiers.length === 1 ? "tier" : "tiers"} •
                  {profile.bookValueSource || "Trade"} Book •
                  {profile.minIncome
                    ? ` $${profile.minIncome.toLocaleString()} min income`
                    : " No income requirement"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {profile.maxPti && (
                <div className="px-3 py-1.5 bg-amber-100 dark:bg-amber-900/30 rounded-full">
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                    {profile.maxPti}% Max PTI
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Tier Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
            {tiers.length > 0 ? (
              tiers.map((tier, index) => {
                if (!tier) return null;
                const hasHighLTV = tier.maxLtv && tier.maxLtv >= 120;
                const hasOTD = tier.otdLtv || tier.frontEndLtv;

                return (
                  <div
                    key={index}
                    className="group relative bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm hover:shadow-xl hover:border-blue-300 dark:hover:border-blue-600 transition-all duration-300"
                  >
                    {/* Tier Header with gradient */}
                    <div className="bg-gradient-to-r from-slate-800 to-slate-700 dark:from-slate-700 dark:to-slate-600 px-4 py-3">
                      <div className="flex items-center justify-between">
                        <h5 className="font-bold text-white text-sm truncate flex-1">
                          {tier.name || `Tier ${index + 1}`}
                        </h5>
                        {tier.vehicleType && (
                          <span
                            className={`ml-2 px-2 py-0.5 text-[10px] font-bold uppercase rounded ${
                              tier.vehicleType === "new"
                                ? "bg-emerald-500 text-white"
                                : tier.vehicleType === "certified"
                                ? "bg-blue-500 text-white"
                                : "bg-slate-600 text-slate-200"
                            }`}
                          >
                            {tier.vehicleType}
                          </span>
                        )}
                      </div>
                      {/* FICO badge in header */}
                      {(tier.minFico || tier.maxFico) && (
                        <div className="mt-2 flex items-center gap-2">
                          <Icons.UserIcon className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-xs text-slate-300 font-medium">
                            FICO:{" "}
                            {tier.minFico
                              ? `${tier.minFico}${
                                  tier.maxFico ? `-${tier.maxFico}` : "+"
                                }`
                              : tier.maxFico
                              ? `≤${tier.maxFico}`
                              : "Any"}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Tier Body */}
                    <div className="p-4 space-y-4">
                      {/* LTV Section - Most Important */}
                      <TierSection title="Advance / LTV">
                        {(tier.frontEndLtv || tier.maxLtv) && (
                          <TierDetail
                            label="Front-End"
                            value={`${tier.frontEndLtv || tier.maxLtv}%`}
                            highlight={!!hasHighLTV}
                            icon={<Icons.ChartIcon className="w-3 h-3" />}
                          />
                        )}
                        {tier.otdLtv && (
                          <TierDetail
                            label="OTD LTV"
                            value={`${tier.otdLtv}%`}
                            highlight={tier.otdLtv >= 130}
                            icon={
                              <Icons.ReceiptPercentIcon className="w-3 h-3" />
                            }
                          />
                        )}
                        {tier.maxAdvance && (
                          <TierDetail
                            label="Max Advance"
                            value={`$${tier.maxAdvance.toLocaleString()}`}
                            icon={
                              <Icons.CurrencyDollarIcon className="w-3 h-3" />
                            }
                          />
                        )}
                      </TierSection>

                      {/* Vehicle Requirements */}
                      {(tier.minYear ||
                        tier.maxYear ||
                        tier.maxMileage ||
                        tier.maxAge) && (
                        <TierSection title="Vehicle Requirements">
                          {(tier.minYear || tier.maxYear) && (
                            <TierDetail
                              label="Model Year"
                              value={
                                tier.minYear
                                  ? `${tier.minYear}${
                                      tier.maxYear ? `-${tier.maxYear}` : "+"
                                    }`
                                  : tier.maxYear
                                  ? `≤${tier.maxYear}`
                                  : null
                              }
                              icon={
                                <Icons.CalendarDaysIcon className="w-3 h-3" />
                              }
                            />
                          )}
                          {tier.maxMileage && (
                            <TierDetail
                              label="Max Mileage"
                              value={`${tier.maxMileage.toLocaleString()} mi`}
                              icon={<Icons.SparklesIcon className="w-3 h-3" />}
                            />
                          )}
                          {tier.maxAge && (
                            <TierDetail
                              label="Max Age"
                              value={`${tier.maxAge} years`}
                              icon={
                                <Icons.DocumentTextIcon className="w-3 h-3" />
                              }
                            />
                          )}
                        </TierSection>
                      )}

                      {/* Loan Terms */}
                      {(tier.maxTerm ||
                        tier.minTerm ||
                        tier.minAmountFinanced ||
                        tier.maxAmountFinanced) && (
                        <TierSection title="Loan Terms">
                          {(tier.maxTerm || tier.minTerm) && (
                            <TierDetail
                              label="Term"
                              value={
                                tier.minTerm
                                  ? `${tier.minTerm}-${tier.maxTerm || "?"}mo`
                                  : tier.maxTerm
                                  ? `Up to ${tier.maxTerm}mo`
                                  : null
                              }
                              icon={
                                <Icons.DocumentTextIcon className="w-3 h-3" />
                              }
                            />
                          )}
                          {(tier.minAmountFinanced ||
                            tier.maxAmountFinanced) && (
                            <TierDetail
                              label="Amount"
                              value={
                                tier.minAmountFinanced
                                  ? `$${tier.minAmountFinanced.toLocaleString()}${
                                      tier.maxAmountFinanced
                                        ? `-$${tier.maxAmountFinanced.toLocaleString()}`
                                        : "+"
                                    }`
                                  : tier.maxAmountFinanced
                                  ? `Up to $${tier.maxAmountFinanced.toLocaleString()}`
                                  : null
                              }
                              icon={<Icons.BanknotesIcon className="w-3 h-3" />}
                            />
                          )}
                        </TierSection>
                      )}

                      {/* Rate Info */}
                      {(tier.baseInterestRate ||
                        tier.rateAdder ||
                        tier.maxRate) && (
                        <TierSection title="Rate Info">
                          {tier.baseInterestRate && (
                            <TierDetail
                              label="Buy Rate"
                              value={`${tier.baseInterestRate.toFixed(2)}%`}
                              icon={
                                <Icons.ReceiptPercentIcon className="w-3 h-3" />
                              }
                            />
                          )}
                          {tier.rateAdder && (
                            <TierDetail
                              label="Rate Adder"
                              value={`+${tier.rateAdder.toFixed(2)}%`}
                              icon={<Icons.SparklesIcon className="w-3 h-3" />}
                            />
                          )}
                          {tier.maxRate && (
                            <TierDetail
                              label="Max Rate"
                              value={`${tier.maxRate.toFixed(2)}%`}
                              icon={
                                <Icons.ExclamationTriangleIcon className="w-3 h-3" />
                              }
                            />
                          )}
                        </TierSection>
                      )}

                      {/* Backend Limits */}
                      {(tier.maxBackend || tier.maxBackendPercent) && (
                        <TierSection title="Backend Products">
                          {tier.maxBackend && (
                            <TierDetail
                              label="Max Backend"
                              value={`$${tier.maxBackend.toLocaleString()}`}
                              icon={
                                <Icons.ShieldCheckIcon className="w-3 h-3" />
                              }
                            />
                          )}
                          {tier.maxBackendPercent && (
                            <TierDetail
                              label="Backend %"
                              value={`${tier.maxBackendPercent}%`}
                              icon={
                                <Icons.ReceiptPercentIcon className="w-3 h-3" />
                              }
                            />
                          )}
                        </TierSection>
                      )}
                    </div>

                    {/* Confidence indicator */}
                    {tier.confidence !== undefined && (
                      <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-700">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-400">
                            Extraction Confidence
                          </span>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  tier.confidence >= 0.8
                                    ? "bg-emerald-500"
                                    : tier.confidence >= 0.6
                                    ? "bg-amber-500"
                                    : "bg-red-500"
                                }`}
                                style={{
                                  width: `${(tier.confidence || 0) * 100}%`,
                                }}
                              />
                            </div>
                            <span className="font-bold text-slate-600 dark:text-slate-300">
                              {Math.round((tier.confidence || 0) * 100)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                <Icons.DocumentTextIcon className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-slate-500 dark:text-slate-400 font-medium">
                  No tiers defined
                </p>
                <p className="text-slate-400 dark:text-slate-500 text-sm">
                  Upload a rate sheet to populate tier data
                </p>
              </div>
            )}
          </div>
        </div>
      </td>
    );
  };

  // Ensure we are working with a valid array and valid objects
  const safeProfiles = (Array.isArray(profiles) ? profiles : []).filter(
    (p) => p && typeof p === "object"
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Icons.BuildingLibraryIcon className="w-7 h-7 text-blue-600 dark:text-blue-400" />
            Lender Profiles
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {safeProfiles.length}{" "}
            {safeProfiles.length === 1 ? "lender" : "lenders"} configured
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".pdf"
            multiple
            className="hidden"
            title="Upload rate sheet PDF files"
            aria-label="Upload rate sheet PDF files"
          />
          <select
            value={targetLenderId}
            onChange={(e) => setTargetLenderId(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-slate-300 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5"
            title="Select target lender for rate sheet upload"
            aria-label="Select target lender for rate sheet upload"
          >
            <option value="auto">Auto-Detect Lender</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                Update: {p.name}
              </option>
            ))}
          </select>
          <Button
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <Icons.SpinnerIcon className="animate-spin w-5 h-5 text-blue-500" />
            ) : (
              <Icons.CloudArrowDownIcon className="w-5 h-5 text-blue-400" />
            )}
            <span className="ml-2">
              {isUploading ? "Analyzing..." : "Upload Rate Sheet(s)"}
            </span>
          </Button>
          <Button variant="ghost" onClick={handleDownloadCheatSheet}>
            <Icons.PdfIcon />
            <span className="ml-2">Download Cheat Sheet</span>
          </Button>
          <Button variant="secondary" onClick={handleAddNew}>
            Add New Lender
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-slate-200">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900">
              {[
                "Name",
                "FICO Range",
                "Max LTV",
                "Years",
                "Max Term",
                "Max Miles",
                "Book",
                "Tiers",
                "Action",
              ].map((header) => (
                <th
                  key={header}
                  className="p-3 font-semibold text-slate-400 text-left whitespace-nowrap"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {safeProfiles.map((profile) => (
              <React.Fragment key={profile.id}>
                <tr
                  className="border-b border-slate-800 last:border-b-0 hover:bg-slate-900 cursor-pointer"
                  onClick={() => toggleRowExpansion(profile.id)}
                >
                  <td className="p-3 font-medium text-white">{profile.name}</td>
                  <td className="p-3">{getRange(profile.tiers, "minFico")}</td>
                  <td className="p-3 text-green-400 font-medium">
                    {getRange(profile.tiers, "maxLtv")}%
                  </td>
                  <td className="p-3">{getRange(profile.tiers, "minYear")}</td>
                  <td className="p-3">
                    {getRange(profile.tiers, "maxTerm")} mo
                  </td>
                  <td className="p-3">
                    {(() => {
                      const range = getRange(profile.tiers, "maxMileage");
                      if (range === "N/A") return range;
                      // Format mileage with commas for readability
                      const parts = range.split(" - ");
                      return parts
                        .map((p) => parseInt(p).toLocaleString())
                        .join(" - ");
                    })()}
                  </td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                        profile.bookValueSource === "Retail"
                          ? "bg-blue-900/60 text-blue-200"
                          : "bg-slate-800 text-slate-300"
                      }`}
                    >
                      {profile.bookValueSource || "Trade"}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 text-xs font-medium bg-purple-900/50 text-purple-300 rounded-full">
                      {profile.tiers && Array.isArray(profile.tiers)
                        ? profile.tiers.length
                        : 0}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(profile);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(profile.id);
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
                {expandedRows.has(profile.id) && (
                  <tr className="border-b border-slate-800">
                    <ExpandedRow profile={profile} />
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <LenderProfileModal
          profile={editingProfile}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
};

// Memoize expensive component
export default React.memo(LenderProfiles);
