import React, { useState, useEffect, useRef } from "react";
import type { Settings, AppState } from "../types";
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
import { MI_DOC_FEE_WARN_THRESHOLD, INITIAL_SETTINGS, STORAGE_KEYS } from "../constants";
import { updateDealerSettings } from "../lib/api";
import { getCurrentUser } from "../lib/pocketbase";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onSave: (newSettings: Settings) => void;
}

const mono: React.CSSProperties = { fontFamily: "var(--mono)" };

const sectionH: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.1em",
  ...mono,
  color: "var(--color-text-subtle)",
  margin: "0 0 13px",
};

const fieldLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "var(--color-text-muted)",
  display: "block",
  marginBottom: 5,
};

const inputBase: React.CSSProperties = {
  width: "100%",
  background: "var(--color-bg-subtle)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 14,
  color: "var(--color-text)",
  outline: "none",
};

const numInput: React.CSSProperties = { ...inputBase, ...mono };
const selectInput: React.CSSProperties = { ...inputBase, padding: 8, fontFamily: "inherit" };

const hr = <hr style={{ border: "none", borderTop: "1px solid var(--color-border)", margin: "22px 0" }} />;

const TERM_OPTIONS = [48, 54, 60, 66, 72, 78, 84, 90, 96];

const STATE_OPTIONS: { value: AppState; label: string }[] = [
  { value: "MI", label: "Michigan" },
  { value: "OH", label: "Ohio" },
  { value: "IN", label: "Indiana" },
  { value: "IL", label: "Illinois" },
  { value: "FL", label: "Florida" },
];

/**
 * System settings modal — 580px card per the SETTINGS MODAL block of
 * LTV Desking PRO.dc.html (lines 862-908): DEAL DEFAULTS / FEES / LTV
 * THRESHOLDS + the retained AI section, all on tokens. Save writes through
 * the context (local persistence) AND to PB dealer_settings using the REAL
 * column names (defaultTerm/defaultApr + the 1747810002 desk fields).
 * Sales/manager get a read-only view (server enforces via PB rules). [P7]
 */
const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onSave }) => {
  const [localSettings, setLocalSettings] = useState<Settings>(settings);
  const [modelRegistry, setModelRegistry] = useState<AiModelRegistryResponse | null>(null);

  const role = getCurrentUser()?.role;
  const canEdit = role === "admin" || role === "superadmin";

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

  // Close on Escape while open.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Initial focus: move the keyboard user into the dialog on open. [a11y]
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isOpen) dialogRef.current?.focus();
  }, [isOpen]);

  const setNum = (name: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === "") return; // keep last valid value while clearing
    const numeric = Number(value);
    if (Number.isNaN(numeric)) return;
    setLocalSettings((prev) => ({ ...prev, [name]: Math.max(0, numeric) }) as Settings);
  };

  const setThreshold = (key: "warn" | "danger" | "critical") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const numeric = Number(e.target.value);
    if (Number.isNaN(numeric)) return;
    setLocalSettings((prev) => ({
      ...prev,
      ltvThresholds: { ...prev.ltvThresholds, [key]: numeric },
    }));
  };

  const handleSave = () => {
    if (!canEdit) return;
    const next: Settings = { ...localSettings, ai: normalizeAiSettings(localSettings.ai) };
    // Context write: persists the full Settings blob locally + legacy PB sync.
    onSave(next);
    // Authoritative PB write with the REAL dealer_settings column names —
    // defaultTerm/defaultApr (the context's legacy path sends phantom
    // defaultLoanTerm/defaultInterestRate keys PB ignores) plus the new desk
    // fields from migration 1747810002. [P7 settings binding]
    updateDealerSettings({
      defaultTerm: next.defaultTerm,
      defaultApr: next.defaultApr,
      defaultState: next.defaultState,
      docFee: next.docFee,
      cvrFee: next.cvrFee,
      defaultStateFees: next.defaultStateFees,
      outOfStateTransitFee: next.outOfStateTransitFee,
      customTaxRate: next.customTaxRate ?? undefined,
      vscPrice: next.vscPrice,
      gapPrice: next.gapPrice,
      miTradeInCreditCap: next.miTradeInCreditCap,
    }).then((res) => {
      if (!res) toast.error("Couldn't sync settings to the server — local defaults still apply.");
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

  /**
   * Clears ONLY this browser's UI preferences — desk focus/sort blob, filters
   * and theme. Never touches PocketBase data (deals, inventory, lenders,
   * dealer settings). [reconciliation 14]
   */
  const handleResetLocalPrefs = async () => {
    const confirmed = await confirmAction({
      title: "Reset local preferences?",
      message:
        "Clears this browser's desk preferences — focused row & sort, saved filters, and theme. Deals, inventory, lender programs and dealership settings stored on the server are untouched.",
      confirmLabel: "Reset preferences",
      tone: "danger",
    });
    if (!confirmed) return;
    try {
      [STORAGE_KEYS.DESK_UI, STORAGE_KEYS.FILTERS, STORAGE_KEYS.THEME].forEach((k) =>
        window.localStorage.removeItem(k)
      );
      window.location.reload();
    } catch (err) {
      console.error("Failed to reset local preferences", err);
      toast.error("Could not reset preferences. Please clear site data manually in your browser.");
    }
  };

  if (!isOpen) return null;

  const aiSettings = normalizeAiSettings(localSettings.ai);
  const selectedProvider = modelRegistry?.providers.find(
    (provider) => provider.id === aiSettings.provider
  );
  const selectedProviderConfigured = selectedProvider?.configured ?? false;

  const termValue = localSettings.defaultTerm;
  const termOptions = TERM_OPTIONS.includes(termValue)
    ? TERM_OPTIONS
    : [...TERM_OPTIONS, termValue].sort((a, b) => a - b);

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(4,7,10,.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="System settings"
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-bg)",
          border: "1px solid var(--color-border)",
          borderRadius: 16,
          boxShadow: "var(--shadow-md)",
          width: "100%",
          maxWidth: 580,
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          color: "var(--color-text)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "17px 22px",
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ fontSize: 11, ...mono, color: "var(--color-text-subtle)" }} aria-hidden>
                ⚙
              </span>
              <div style={{ fontSize: 16, fontWeight: 600 }}>System settings</div>
              {!canEdit && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    ...mono,
                    letterSpacing: "0.06em",
                    background: "var(--color-bg-muted)",
                    color: "var(--color-text-muted)",
                    padding: "2px 7px",
                    borderRadius: 5,
                  }}
                >
                  READ-ONLY
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 2 }}>
              Defaults applied to new deals across this dealership.
            </div>
          </div>
          <button
            onClick={onClose}
            className="lift-btn"
            aria-label="Close"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--color-text-muted)",
              cursor: "pointer",
              width: 30,
              height: 30,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 22, overflowY: "auto" }}>
          {/* DEAL DEFAULTS */}
          <section>
            <h3 style={sectionH}>DEAL DEFAULTS</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={fieldLabel} htmlFor="settings-default-term">
                  Default term
                </label>
                <select
                  id="settings-default-term"
                  className="dc-input"
                  disabled={!canEdit}
                  value={termValue}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({ ...prev, defaultTerm: Number(e.target.value) }))
                  }
                  style={selectInput}
                >
                  {termOptions.map((t) => (
                    <option key={t} value={t}>
                      {t} months
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={fieldLabel} htmlFor="settings-default-apr">
                  Default APR (%)
                </label>
                <input
                  id="settings-default-apr"
                  className="dc-input"
                  type="number"
                  step="0.1"
                  disabled={!canEdit}
                  value={localSettings.defaultApr}
                  onChange={setNum("defaultApr")}
                  style={numInput}
                />
              </div>
              <div>
                <label style={fieldLabel} htmlFor="settings-default-state">
                  Default state
                </label>
                <select
                  id="settings-default-state"
                  className="dc-input"
                  disabled={!canEdit}
                  value={localSettings.defaultState}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({ ...prev, defaultState: e.target.value as AppState }))
                  }
                  style={selectInput}
                >
                  {STATE_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {hr}

          {/* FEES */}
          <section>
            <h3 style={sectionH}>FEES</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={fieldLabel} htmlFor="settings-doc-fee">
                  Doc fee ($)
                </label>
                <input
                  id="settings-doc-fee"
                  className="dc-input"
                  type="number"
                  disabled={!canEdit}
                  value={localSettings.docFee}
                  onChange={setNum("docFee")}
                  style={numInput}
                />
                {localSettings.docFee > MI_DOC_FEE_WARN_THRESHOLD && (
                  <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--color-warning)" }}>
                    Above Michigan&apos;s typical doc-fee cap — verify the statutory cap.
                  </p>
                )}
              </div>
              <div>
                <label style={fieldLabel} htmlFor="settings-cvr-fee">
                  CVR fee ($)
                </label>
                <input
                  id="settings-cvr-fee"
                  className="dc-input"
                  type="number"
                  disabled={!canEdit}
                  value={localSettings.cvrFee}
                  onChange={setNum("cvrFee")}
                  style={numInput}
                />
              </div>
              <div>
                <label style={fieldLabel} htmlFor="settings-title-reg">
                  Title / reg ($)
                </label>
                <input
                  id="settings-title-reg"
                  className="dc-input"
                  type="number"
                  disabled={!canEdit}
                  value={localSettings.defaultStateFees}
                  onChange={setNum("defaultStateFees")}
                  style={numInput}
                />
              </div>
              <div>
                <label style={fieldLabel} htmlFor="settings-vsc-price">
                  VSC price ($)
                </label>
                <input
                  id="settings-vsc-price"
                  className="dc-input"
                  type="number"
                  disabled={!canEdit}
                  value={localSettings.vscPrice}
                  onChange={setNum("vscPrice")}
                  style={numInput}
                />
              </div>
              <div>
                <label style={fieldLabel} htmlFor="settings-gap-price">
                  GAP price ($)
                </label>
                <input
                  id="settings-gap-price"
                  className="dc-input"
                  type="number"
                  disabled={!canEdit}
                  value={localSettings.gapPrice}
                  onChange={setNum("gapPrice")}
                  style={numInput}
                />
              </div>
              <div>
                <label style={fieldLabel} htmlFor="settings-mi-cap">
                  MI trade-in credit cap ($)
                </label>
                <input
                  id="settings-mi-cap"
                  className="dc-input"
                  type="number"
                  disabled={!canEdit}
                  value={localSettings.miTradeInCreditCap ?? INITIAL_SETTINGS.miTradeInCreditCap}
                  onChange={setNum("miTradeInCreditCap")}
                  style={numInput}
                />
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--color-text-subtle)" }}>
                  Michigan sales-tax trade-in credit cap — verify the current statutory figure.
                </p>
              </div>
            </div>
          </section>

          {hr}

          {/* LTV THRESHOLDS */}
          <section>
            <h3 style={{ ...sectionH, margin: "0 0 5px" }}>LTV THRESHOLDS</h3>
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 13px" }}>
              Color bands applied to the OTD LTV column.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ ...fieldLabel, fontWeight: 600, color: "var(--color-warning)" }} htmlFor="settings-ltv-warn">
                  Warn (%)
                </label>
                <input
                  id="settings-ltv-warn"
                  className="dc-input"
                  type="number"
                  disabled={!canEdit}
                  value={localSettings.ltvThresholds?.warn ?? 115}
                  onChange={setThreshold("warn")}
                  style={numInput}
                />
              </div>
              <div>
                <label style={{ ...fieldLabel, fontWeight: 600, color: "var(--color-danger)" }} htmlFor="settings-ltv-danger">
                  Danger (%)
                </label>
                <input
                  id="settings-ltv-danger"
                  className="dc-input"
                  type="number"
                  disabled={!canEdit}
                  value={localSettings.ltvThresholds?.danger ?? 125}
                  onChange={setThreshold("danger")}
                  style={numInput}
                />
              </div>
              <div>
                <label style={fieldLabel} htmlFor="settings-ltv-critical">
                  Critical (%)
                </label>
                <input
                  id="settings-ltv-critical"
                  className="dc-input"
                  type="number"
                  disabled={!canEdit}
                  value={localSettings.ltvThresholds?.critical ?? 135}
                  onChange={setThreshold("critical")}
                  style={numInput}
                />
              </div>
            </div>
          </section>

          {hr}

          {/* AI PROVIDER & MODELS (retained section, tokens) */}
          <section>
            <h3 style={{ ...sectionH, margin: "0 0 5px" }}>AI PROVIDER &amp; MODELS</h3>
            <p style={{ fontSize: 12, color: "var(--color-text-subtle)", margin: "0 0 6px" }}>
              Model catalog verified from official docs on{" "}
              {modelRegistry?.verifiedDate ?? AI_MODEL_DOCS_VERIFIED_DATE}.
            </p>
            {modelRegistry?.warnings.map((warning) => (
              <p key={warning} style={{ fontSize: 12, color: "var(--color-warning)", margin: "0 0 6px" }}>
                {warning}
              </p>
            ))}
            {modelRegistry && !selectedProviderConfigured && (
              <p style={{ fontSize: 12, color: "var(--color-warning)", margin: "0 0 6px" }}>
                {getAiProviderLabel(aiSettings.provider)} is selected but its server key is not
                configured. Requests will use the first configured provider.
              </p>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
              <div>
                <label style={fieldLabel} htmlFor="aiProvider">
                  Provider
                </label>
                <select
                  id="aiProvider"
                  className="dc-input"
                  disabled={!canEdit}
                  value={aiSettings.provider}
                  onChange={(event) => handleProviderChange(event.target.value as AiProvider)}
                  style={selectInput}
                >
                  {AI_PROVIDER_ORDER.map((provider) => {
                    const providerState = modelRegistry?.providers.find((item) => item.id === provider);
                    return (
                      <option key={provider} value={provider}>
                        {getAiProviderLabel(provider)}
                        {providerState?.configured ? " (configured)" : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label style={fieldLabel} htmlFor="lenderExtractModel">
                  Lender PDF extraction
                </label>
                <select
                  id="lenderExtractModel"
                  className="dc-input"
                  disabled={!canEdit}
                  value={aiSettings.lenderExtractModel}
                  onChange={(event) => handleAiModelChange("lenderExtract", event.target.value)}
                  style={selectInput}
                >
                  {getModelsForTask(aiSettings.provider, "lenderExtract").map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                      {model.isPreview ? " (preview)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={fieldLabel} htmlFor="dealAnalysisModel">
                  Deal assistant
                </label>
                <select
                  id="dealAnalysisModel"
                  className="dc-input"
                  disabled={!canEdit}
                  value={aiSettings.dealAnalysisModel}
                  onChange={(event) => handleAiModelChange("dealAnalysis", event.target.value)}
                  style={selectInput}
                >
                  {getModelsForTask(aiSettings.provider, "dealAnalysis").map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                      {model.isAlias ? " (alias)" : ""}
                      {model.isPreview ? " (preview)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={fieldLabel} htmlFor="quickModel">
                  Fast workflows
                </label>
                <select
                  id="quickModel"
                  className="dc-input"
                  disabled={!canEdit}
                  value={aiSettings.quickModel}
                  onChange={(event) => handleAiModelChange("quick", event.target.value)}
                  style={selectInput}
                >
                  {getModelsForTask(aiSettings.provider, "quick").map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                      {model.isAlias ? " (alias)" : ""}
                      {model.isPreview ? " (preview)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "13px 22px",
            borderTop: "1px solid var(--color-border)",
            background: "var(--color-bg-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 9,
            borderRadius: "0 0 16px 16px",
          }}
        >
          <button
            onClick={handleResetLocalPrefs}
            className="lift-btn settings-reset-link"
            title="Clears this browser's desk focus/sort, filters and theme — never server data"
            style={{
              marginRight: "auto",
              background: "transparent",
              border: "none",
              color: "var(--color-text-subtle)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
              padding: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-danger)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-subtle)")}
          >
            Reset local preferences
          </button>
          {import.meta.env.DEV && (
            <button
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
                    toast.error(e instanceof Error ? e.message : "Failed to seed database.");
                  }
                }
              }}
              className="lift-btn"
              style={{
                background: "transparent",
                border: "1px solid var(--color-border-strong)",
                color: "var(--color-text-muted)",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Seed DB (dev)
            </button>
          )}
          <button
            onClick={onClose}
            className="lift-btn"
            style={{
              background: "transparent",
              border: "1px solid var(--color-border-strong)",
              color: "var(--color-text)",
              borderRadius: 8,
              padding: "8px 15px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          {canEdit && (
            <button
              onClick={handleSave}
              className="lift-btn btn-primary"
              style={{
                border: "1px solid transparent",
                borderRadius: 8,
                padding: "8px 15px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Save changes
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
