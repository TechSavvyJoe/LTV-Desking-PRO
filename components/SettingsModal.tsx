import React, { useState, useEffect } from "react";
import type { Settings, AppState } from "../types";
import Button from "./common/Button";
import {
  AI_MODEL_DOCS_VERIFIED_DATE,
  AI_PROVIDER_ORDER,
  getAiProviderLabel,
  getDefaultModelForTask,
  getModelsForTask,
  normalizeAiSettings,
  type AiModelRegistryResponse,
  type AiProvider,
  type AiTask,
} from "../lib/aiModelRegistry";
import { toast } from "../lib/toast";
import { confirmAction } from "../lib/confirm";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onSave: (newSettings: Settings) => void;
}

const InputGroup: React.FC<{
  label: string;
  children: React.ReactNode;
  htmlFor?: string;
  description?: string;
}> = ({ label, children, htmlFor, description }) => (
  <div className="flex flex-col">
    <label htmlFor={htmlFor} className="mb-1.5 text-sm font-medium text-[var(--color-text)]">
      {label}
    </label>
    {children}
    {description && <p className="mt-1 text-xs text-[var(--color-text-subtle)]">{description}</p>}
  </div>
);

const StyledInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className="w-full px-3 py-2 text-sm bg-white dark:bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded text-[var(--color-text)] placeholder-[var(--color-text-subtle)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
  />
);

const StyledSelect = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    {...props}
    className="w-full px-3 py-2 text-sm bg-white dark:bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded text-[var(--color-text)] placeholder-[var(--color-text-subtle)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
  />
);

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onSave }) => {
  const [localSettings, setLocalSettings] = useState<Settings>(settings);
  const [modelRegistry, setModelRegistry] = useState<AiModelRegistryResponse | null>(null);

  useEffect(() => {
    setLocalSettings({
      ...settings,
      ai: normalizeAiSettings(settings.ai),
    });
  }, [settings, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    fetch("/api/ai/models")
      .then((response) => response.json() as Promise<AiModelRegistryResponse>)
      .then((data) => {
        if (active) setModelRegistry(data);
      })
      .catch(() => {
        if (active) setModelRegistry(null);
      });

    return () => {
      active = false;
    };
  }, [isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    // Keep numeric fields non-negative and avoid NaN when clearing inputs.
    setLocalSettings((prev) => {
      const current = prev[name as keyof Settings];
      if (type === "number") {
        if (value === "") return prev; // ignore empty to keep last valid value
        const numeric = Number(value);
        if (Number.isNaN(numeric)) return prev;
        return { ...prev, [name]: Math.max(0, numeric) } as Settings;
      }
      return { ...prev, [name]: value } as Settings;
    });
  };

  const handleSave = () => {
    onSave({
      ...localSettings,
      ai: normalizeAiSettings(localSettings.ai),
    });
    onClose();
  };

  const handleProviderChange = (provider: AiProvider) => {
    setLocalSettings((prev) => ({
      ...prev,
      ai: {
        provider,
        lenderExtractModel: getDefaultModelForTask(provider, "lenderExtract"),
        dealAnalysisModel: getDefaultModelForTask(provider, "dealAnalysis"),
        quickModel: getDefaultModelForTask(provider, "quick"),
      },
    }));
  };

  const handleAiModelChange = (task: AiTask, model: string) => {
    setLocalSettings((prev) => {
      const ai = normalizeAiSettings(prev.ai);
      return {
        ...prev,
        ai: {
          ...ai,
          ...(task === "lenderExtract" ? { lenderExtractModel: model } : {}),
          ...(task === "dealAnalysis" ? { dealAnalysisModel: model } : {}),
          ...(task === "quick" ? { quickModel: model } : {}),
        },
      };
    });
  };

  const handleResetAllData = async () => {
    const confirmed = await confirmAction({
      title: "Reset all local data?",
      message:
        "This will clear saved inventory, favorites, deals, filters, and settings. Continue?",
      confirmLabel: "Reset",
      tone: "danger",
    });
    if (!confirmed) return;
    const keys = [
      "ltvInventory_v2",
      "ltvDealData_v2",
      "ltvFilters_v2",
      "ltvFavorites_v2",
      "ltvBankProfiles_v2",
      "ltvSavedDeals_v2",
      "ltvScratchPad_v2",
      "ltvSettings_v2",
    ];
    try {
      keys.forEach((k) => window.localStorage.removeItem(k));
      window.location.reload();
    } catch (err) {
      console.error("Failed to reset data", err);
      toast.error("Could not reset data. Please clear site data manually in your browser.");
    }
  };

  if (!isOpen) return null;

  const aiSettings = normalizeAiSettings(localSettings.ai);
  const selectedProvider = modelRegistry?.providers.find(
    (provider) => provider.id === aiSettings.provider
  );
  const selectedProviderConfigured = selectedProvider?.configured ?? false;

  return (
    <div
      className="fixed inset-0 bg-black/70 flex justify-center items-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg shadow-md w-full max-w-2xl max-h-[90vh] flex flex-col text-[var(--color-text)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-base font-semibold text-[var(--color-text)]">Application settings</h2>
        </div>
        <div className="px-6 py-5 overflow-y-auto space-y-6">
          <section className="border-t border-[var(--color-border)] pt-6 first:border-t-0 first:pt-0">
            <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Deal defaults</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputGroup label="Default Loan Term (Months)" htmlFor="defaultTerm">
                <StyledInput
                  type="number"
                  name="defaultTerm"
                  id="defaultTerm"
                  value={localSettings.defaultTerm}
                  onChange={handleChange}
                />
              </InputGroup>
              <InputGroup label="Default Interest Rate (APR %)" htmlFor="defaultApr">
                <StyledInput
                  type="number"
                  name="defaultApr"
                  id="defaultApr"
                  value={localSettings.defaultApr}
                  onChange={handleChange}
                  step="0.1"
                />
              </InputGroup>
            </div>
          </section>

          <section className="border-t border-[var(--color-border)] pt-6 first:border-t-0 first:pt-0">
            <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">
              Fees & state tax
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputGroup
                label="Dealership State"
                htmlFor="defaultState"
                description="Sets the base for tax calculations."
              >
                <StyledSelect
                  name="defaultState"
                  id="defaultState"
                  value={localSettings.defaultState}
                  onChange={handleChange}
                >
                  <option value="MI">Michigan</option>
                  <option value="OH">Ohio</option>
                  <option value="IN">Indiana</option>
                </StyledSelect>
              </InputGroup>
              <InputGroup label="Doc Fee ($)" htmlFor="docFee">
                <StyledInput
                  type="number"
                  name="docFee"
                  id="docFee"
                  value={localSettings.docFee}
                  onChange={handleChange}
                />
              </InputGroup>
              <InputGroup label="CVR Fee ($)" htmlFor="cvrFee">
                <StyledInput
                  type="number"
                  name="cvrFee"
                  id="cvrFee"
                  value={localSettings.cvrFee}
                  onChange={handleChange}
                />
              </InputGroup>
              <InputGroup label="Default State/Title Fees ($)" htmlFor="defaultStateFees">
                <StyledInput
                  type="number"
                  name="defaultStateFees"
                  id="defaultStateFees"
                  value={localSettings.defaultStateFees}
                  onChange={handleChange}
                />
              </InputGroup>
              <div className="sm:col-span-2">
                <InputGroup
                  label="Out-of-State Transit Fee ($)"
                  htmlFor="outOfStateTransitFee"
                  description="Applied to out-of-state deals per reciprocal tax agreements."
                >
                  <StyledInput
                    type="number"
                    name="outOfStateTransitFee"
                    id="outOfStateTransitFee"
                    value={localSettings.outOfStateTransitFee}
                    onChange={handleChange}
                  />
                </InputGroup>
              </div>
              <div className="sm:col-span-2">
                <InputGroup
                  label="Custom Tax Rate (%)"
                  htmlFor="customTaxRate"
                  description="Overrides state defaults. Leave empty to use state logic."
                >
                  <StyledInput
                    type="number"
                    name="customTaxRate"
                    id="customTaxRate"
                    value={localSettings.customTaxRate ?? ""}
                    onChange={handleChange}
                    step="0.01"
                    placeholder="e.g. 6.0"
                  />
                </InputGroup>
              </div>
            </div>
          </section>

          <section className="border-t border-[var(--color-border)] pt-6 first:border-t-0 first:pt-0">
            <div className="flex flex-col gap-1 mb-4">
              <h3 className="text-sm font-semibold text-[var(--color-text)]">
                AI provider &amp; models
              </h3>
              <p className="text-xs text-slate-400">
                Model catalog verified from official docs on{" "}
                {modelRegistry?.verifiedDate ?? AI_MODEL_DOCS_VERIFIED_DATE}.
              </p>
              {modelRegistry?.warnings.map((warning) => (
                <p key={warning} className="text-xs text-amber-300">
                  {warning}
                </p>
              ))}
              {modelRegistry && !selectedProviderConfigured && (
                <p className="text-xs text-amber-300">
                  {getAiProviderLabel(aiSettings.provider)} is selected but its server key is not
                  configured. Requests will use the first configured provider.
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputGroup
                label="Provider"
                htmlFor="aiProvider"
                description="Controls lender extraction, deal analysis, and fast validation defaults."
              >
                <StyledSelect
                  id="aiProvider"
                  value={aiSettings.provider}
                  onChange={(event) => handleProviderChange(event.target.value as AiProvider)}
                >
                  {AI_PROVIDER_ORDER.map((provider) => {
                    const providerState = modelRegistry?.providers.find(
                      (item) => item.id === provider
                    );
                    return (
                      <option key={provider} value={provider}>
                        {getAiProviderLabel(provider)}
                        {providerState?.configured ? " (configured)" : ""}
                      </option>
                    );
                  })}
                </StyledSelect>
              </InputGroup>

              <InputGroup
                label="Lender PDF Extraction"
                htmlFor="lenderExtractModel"
                description="Uses the top PDF-capable model for rate sheets."
              >
                <StyledSelect
                  id="lenderExtractModel"
                  value={aiSettings.lenderExtractModel}
                  onChange={(event) => handleAiModelChange("lenderExtract", event.target.value)}
                >
                  {getModelsForTask(aiSettings.provider, "lenderExtract").map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                      {model.isPreview ? " (preview)" : ""}
                    </option>
                  ))}
                </StyledSelect>
              </InputGroup>

              <InputGroup
                label="Deal Assistant"
                htmlFor="dealAnalysisModel"
                description="Balanced by default for desk manager suggestions."
              >
                <StyledSelect
                  id="dealAnalysisModel"
                  value={aiSettings.dealAnalysisModel}
                  onChange={(event) => handleAiModelChange("dealAnalysis", event.target.value)}
                >
                  {getModelsForTask(aiSettings.provider, "dealAnalysis").map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                      {model.isAlias ? " (alias)" : ""}
                      {model.isPreview ? " (preview)" : ""}
                    </option>
                  ))}
                </StyledSelect>
              </InputGroup>

              <InputGroup
                label="Fast Workflows"
                htmlFor="quickModel"
                description="Used for quick validation, summaries, and routing."
              >
                <StyledSelect
                  id="quickModel"
                  value={aiSettings.quickModel}
                  onChange={(event) => handleAiModelChange("quick", event.target.value)}
                >
                  {getModelsForTask(aiSettings.provider, "quick").map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                      {model.isAlias ? " (alias)" : ""}
                      {model.isPreview ? " (preview)" : ""}
                    </option>
                  ))}
                </StyledSelect>
              </InputGroup>
            </div>
          </section>

          <section className="border-t border-[var(--color-border)] pt-6 first:border-t-0 first:pt-0">
            <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">
              LTV color thresholds (%)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <InputGroup
                label="Warning (Yellow)"
                htmlFor="ltvWarn"
                description="LTV above this turns yellow."
              >
                <StyledInput
                  type="number"
                  name="ltvThresholds.warn"
                  id="ltvWarn"
                  value={localSettings.ltvThresholds?.warn ?? 115}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setLocalSettings((prev) => ({
                      ...prev,
                      ltvThresholds: {
                        ...prev.ltvThresholds,
                        warn: val,
                      },
                    }));
                  }}
                />
              </InputGroup>
              <InputGroup
                label="Danger (Orange)"
                htmlFor="ltvDanger"
                description="LTV above this turns orange."
              >
                <StyledInput
                  type="number"
                  name="ltvThresholds.danger"
                  id="ltvDanger"
                  value={localSettings.ltvThresholds?.danger ?? 125}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setLocalSettings((prev) => ({
                      ...prev,
                      ltvThresholds: {
                        ...prev.ltvThresholds,
                        danger: val,
                      },
                    }));
                  }}
                />
              </InputGroup>
              <InputGroup
                label="Critical (Red)"
                htmlFor="ltvCritical"
                description="LTV above this turns red."
              >
                <StyledInput
                  type="number"
                  name="ltvThresholds.critical"
                  id="ltvCritical"
                  value={localSettings.ltvThresholds?.critical ?? 135}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setLocalSettings((prev) => ({
                      ...prev,
                      ltvThresholds: {
                        ...prev.ltvThresholds,
                        critical: val,
                      },
                    }));
                  }}
                />
              </InputGroup>
            </div>
          </section>
        </div>
        <div className="px-6 py-3 border-t border-[var(--color-border)] flex justify-between items-center gap-3 bg-[var(--color-bg-subtle)] sticky bottom-0 flex-wrap">
          <div className="flex gap-2">
            <Button type="button" variant="danger" size="sm" onClick={handleResetAllData}>
              Reset All Data
            </Button>
            {/* Temporary Seed Button */}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={async () => {
                if (
                  await confirmAction({
                    title: "Seed database?",
                    message: "Seed database with default inventory and lenders?",
                    confirmLabel: "Seed",
                  })
                ) {
                  try {
                    const { seedDatabase } = await import("../lib/seeder");
                    await seedDatabase();
                    toast.success("Database seeded! Reloading application...");
                    setTimeout(() => window.location.reload(), 1500);
                  } catch (e) {
                    console.error(e);
                  }
                }
              }}
            >
              Seed DB
            </Button>
          </div>
          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave}>
              Save Settings
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
