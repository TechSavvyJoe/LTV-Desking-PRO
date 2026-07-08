import React, { useState, useEffect } from "react";
import { getSystemSettings, updateSystemSettings } from "../../../lib/api";
import {
  AI_MODELS,
  AI_PROVIDER_ORDER,
  DEFAULT_AI_SETTINGS,
  type AiProvider,
} from "../../../lib/aiModelRegistry";
import Button from "../../common/Button";

/**
 * AIDefaultsPanel (extracted from SuperAdminDashboard.tsx)
 *
 * Default AI provider + model-per-task settings for new dealers.
 * Persists via system_settings; dealer overrides still apply.
 */

const isAiProvider = (v: string): v is AiProvider =>
  (["openai", "anthropic", "gemini"] as const).includes(v as AiProvider);

export const AIDefaultsPanel: React.FC = () => {
  const [provider, setProvider] = useState<AiProvider>(DEFAULT_AI_SETTINGS.provider);
  const [lenderExtractModel, setLenderExtractModel] = useState(
    DEFAULT_AI_SETTINGS.lenderExtractModel
  );
  const [dealAnalysisModel, setDealAnalysisModel] = useState(DEFAULT_AI_SETTINGS.dealAnalysisModel);
  const [quickModel, setQuickModel] = useState(DEFAULT_AI_SETTINGS.quickModel);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getSystemSettings().then((s) => {
      if (cancelled) return;
      const ai = s.aiDefaults;
      if (ai?.provider) setProvider(ai.provider);
      if (ai?.lenderExtractModel) setLenderExtractModel(ai.lenderExtractModel);
      if (ai?.dealAnalysisModel) setDealAnalysisModel(ai.dealAnalysisModel);
      if (ai?.quickModel) setQuickModel(ai.quickModel);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const modelsFor = (task: "lenderExtract" | "dealAnalysis" | "quick") =>
    AI_MODELS.filter((m) => m.provider === provider && m.tasks.includes(task));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const current = await getSystemSettings();
      await updateSystemSettings({
        supportEmail: current.supportEmail,
        announcementBanner: current.announcementBanner,
        signupsEnabled: current.signupsEnabled,
        defaultLtvThresholds: current.defaultLtvThresholds,
        aiDefaults: { provider, lenderExtractModel, dealAnalysisModel, quickModel },
      });
      setSavedAt(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save AI defaults");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl bg-[var(--color-bg)] ring-1 ring-[var(--color-border)] rounded-lg p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-base font-semibold text-[var(--color-text)] tracking-tight">
            AI Defaults
          </h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            Default provider and model per task. Dealer-level settings override these.
          </p>
        </div>
        {savedAt && (
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-success)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" />
            Saved {savedAt.toLocaleTimeString()}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-[var(--color-danger-subtle)] border border-[var(--color-danger)] px-3 py-2 text-xs text-[var(--color-danger)]">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
            Provider
          </label>
          <select
            value={provider}
            onChange={(e) => {
              const val = e.target.value;
              const next: AiProvider = isAiProvider(val) ? val : "openai";
              setProvider(next);
              const first = (task: "lenderExtract" | "dealAnalysis" | "quick") =>
                AI_MODELS.find((m) => m.provider === next && m.tasks.includes(task))?.id ?? "";
              setLenderExtractModel(first("lenderExtract"));
              setDealAnalysisModel(first("dealAnalysis"));
              setQuickModel(first("quick"));
            }}
            className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
          >
            {AI_PROVIDER_ORDER.map((id) => (
              <option key={id} value={id}>
                {id === "openai" ? "OpenAI" : id === "anthropic" ? "Anthropic" : "Google Gemini"}
              </option>
            ))}
          </select>
        </div>

        {(
          [
            ["Lender extract", lenderExtractModel, setLenderExtractModel, "lenderExtract"],
            ["Deal analysis", dealAnalysisModel, setDealAnalysisModel, "dealAnalysis"],
            ["Quick tasks", quickModel, setQuickModel, "quick"],
          ] as const
        ).map(([label, value, setter, task]) => (
          <div key={task}>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
              {label}
            </label>
            <select
              value={value}
              onChange={(e) => setter(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
            >
              {modelsFor(task).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} {m.isPreview ? "(preview)" : ""}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save AI defaults"}
        </Button>
      </div>
    </div>
  );
};

export default AIDefaultsPanel;
