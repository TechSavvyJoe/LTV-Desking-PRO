import React, { useState, useCallback } from "react";
import type { LenderProfile, LenderTier } from "../types";
import Button from "./common/Button";
import LenderProfileModal from "./LenderProfileModal";
import { generateLenderCheatSheetPdf } from "../services/pdfGenerator";
import { processLenderSheet } from "../services/aiProcessor";
import * as Icons from "./common/Icons";

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
    <div className="text-xs">
      <span className="text-slate-400">{label}: </span>
      <span className="font-medium text-slate-100">{value}</span>
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

  const handleSave = (profileToSave: LenderProfile) => {
    onUpdate((prev) => {
      const exists = prev.some((p) => p.id === profileToSave.id);
      if (exists) {
        return prev.map((p) => (p.id === profileToSave.id ? profileToSave : p));
      }
      return [...prev, { ...profileToSave, id: `new_${Date.now()}` }];
    });
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (
      window.confirm("Are you sure you want to delete this lender profile?")
    ) {
      onUpdate((prev) => prev.filter((p) => p.id !== id));
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
      const newProfiles: LenderProfile[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const extractedData = await processLenderSheet(file);
          if (!extractedData || !extractedData.name) {
            errors.push(`Could not extract data from ${file.name}`);
            continue;
          }

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

          if (targetId !== "auto") {
            // Update existing
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
          } else {
            // Create new
            createdCount++;
            onUpdate((prev) => [
              ...prev,
              {
                ...extractedData,
                id: `ai_${Date.now()}_${i}`,
                tiers: extractedData.tiers || [],
              } as LenderProfile,
            ]);
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
                    className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 rounded-lg p-3 space-y-1 shadow-sm hover:shadow-md transition-shadow duration-200"
                  >
                    <p className="font-bold text-blue-600 dark:text-blue-400">
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
    <div className="my-8 bg-slate-950 border border-slate-800 rounded-2xl shadow-xl p-5">
      <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-800">
        <h2 className="text-xl font-bold text-white">Manage Lender Profiles</h2>
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

export default LenderProfiles;
