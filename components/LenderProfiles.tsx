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
}: {
  label: string;
  value: string | number | undefined | null;
}) => {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="text-sm flex items-center justify-between py-1 px-2 bg-slate-50/50 dark:bg-slate-800/30 rounded-md">
      <span className="text-slate-500 dark:text-slate-400 font-medium">
        {label}
      </span>
      <span className="font-semibold text-slate-900 dark:text-slate-100">
        {value}
      </span>
    </div>
  );
};

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
                  extractedData.name!.toLowerCase().includes(p.name.toLowerCase())
              );
              if (match) {
                targetId = match.id;
              }
            }

            if (targetId !== "auto" && extractedLenders.length === 1) {
              // Only update specific target if there's exactly one lender in the file
              // Otherwise auto-create for multi-lender files
              onUpdate((prev) =>
                prev.map((p) => {
                  if (p.id === targetId) {
                    updatedCount++;
                    return {
                      ...p,
                      ...extractedData, // Overwrite fields
                      id: p.id, // Keep ID
                      tiers: extractedData.tiers || p.tiers, // Replace tiers if present
                    } as LenderProfile;
                  }
                  return p;
                })
              );
            } else if (targetId !== "auto") {
              // For multi-lender files with a target selected, check if this lender exists
              const existingMatch = profiles.find(
                (p) => p.name.toLowerCase() === extractedData.name!.toLowerCase()
              );
              if (existingMatch) {
                onUpdate((prev) =>
                  prev.map((p) => {
                    if (p.id === existingMatch.id) {
                      updatedCount++;
                      return {
                        ...p,
                        ...extractedData,
                        id: p.id,
                        tiers: extractedData.tiers || p.tiers,
                      } as LenderProfile;
                    }
                    return p;
                  })
                );
              } else {
                // Create new
                createdCount++;
                onUpdate((prev) => [
                  ...prev,
                  {
                    ...extractedData,
                    id: `ai_${Date.now()}_${i}_${j}`,
                    tiers: extractedData.tiers || [],
                  } as LenderProfile,
                ]);
              }
            } else {
              // Auto-detect mode: check if lender already exists
              const existingMatch = profiles.find(
                (p) => p.name.toLowerCase() === extractedData.name!.toLowerCase()
              );
              if (existingMatch) {
                onUpdate((prev) =>
                  prev.map((p) => {
                    if (p.id === existingMatch.id) {
                      updatedCount++;
                      return {
                        ...p,
                        ...extractedData,
                        id: p.id,
                        tiers: extractedData.tiers || p.tiers,
                      } as LenderProfile;
                    }
                    return p;
                  })
                );
              } else {
                // Create new
                createdCount++;
                onUpdate((prev) => [
                  ...prev,
                  {
                    ...extractedData,
                    id: `ai_${Date.now()}_${i}_${j}`,
                    tiers: extractedData.tiers || [],
                  } as LenderProfile,
                ]);
              }
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
      <td colSpan={6} className="p-0">
        <div className="p-4 dark:hover:bg-slate-800">
          <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">
            Lending Tiers
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
            {tiers.length > 0 ? (
              tiers.map((tier, index) => {
                if (!tier) return null;
                return (
                  <div
                    key={index}
                    className="group relative border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-white to-slate-50 dark:from-slate-900/50 dark:to-slate-800/30 rounded-xl p-4 space-y-2 shadow-sm hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-300"
                  >
                    {/* Subtle accent bar */}
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-t-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <p className="font-bold text-lg text-blue-600 dark:text-blue-400 flex items-center gap-2">
                      <Icons.ShieldCheckIcon className="w-5 h-5" />
                      {tier.name}
                    </p>
                    <TierDetail
                      label="FICO"
                      value={
                        tier.minFico
                          ? `${tier.minFico}${
                              tier.maxFico ? ` - ${tier.maxFico}` : "+"
                            }`
                          : tier.maxFico
                          ? `Up to ${tier.maxFico}`
                          : null
                      }
                    />
                    <TierDetail
                      label="Year"
                      value={
                        tier.minYear
                          ? `${tier.minYear}${
                              tier.maxYear ? ` - ${tier.maxYear}` : "+"
                            }`
                          : tier.maxYear
                          ? `Up to ${tier.maxYear}`
                          : null
                      }
                    />
                    <TierDetail
                      label="Mileage"
                      value={
                        tier.minMileage
                          ? `Over ${tier.minMileage.toLocaleString()}`
                          : tier.maxMileage
                          ? `Up to ${tier.maxMileage.toLocaleString()}`
                          : null
                      }
                    />
                    <TierDetail
                      label="Term"
                      value={
                        tier.minTerm
                          ? `${tier.minTerm} - ${tier.maxTerm}mo`
                          : tier.maxTerm
                          ? `Up to ${tier.maxTerm}mo`
                          : null
                      }
                    />
                    <TierDetail
                      label="LTV"
                      value={tier.maxLtv ? `Up to ${tier.maxLtv}%` : null}
                    />
                    <TierDetail
                      label="Fin. Amt"
                      value={
                        tier.minAmountFinanced
                          ? `$${tier.minAmountFinanced.toLocaleString()}${
                              tier.maxAmountFinanced
                                ? ` - $${tier.maxAmountFinanced.toLocaleString()}`
                                : "+"
                            }`
                          : tier.maxAmountFinanced
                          ? `Up to $${tier.maxAmountFinanced.toLocaleString()}`
                          : null
                      }
                    />
                  </div>
                );
              })
            ) : (
              <p className="text-slate-400 text-sm italic">No tiers defined.</p>
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
                "Max LTV Range",
                "Book Source",
                "Tiers",
                "Action",
              ].map((header) => (
                <th
                  key={header}
                  className="p-3 font-semibold text-slate-400 text-left"
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
                  <td className="p-3">{getRange(profile.tiers, "maxLtv")}%</td>
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
                    {profile.tiers && Array.isArray(profile.tiers)
                      ? profile.tiers.length
                      : 0}
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
