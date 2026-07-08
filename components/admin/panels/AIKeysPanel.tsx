import React, { useState, useEffect, useCallback } from "react";
import {
  getMaskedAiProviderKeys,
  updateAiProviderKeys,
  testAiProviderKey,
  type MaskedAiProviderKeys,
  type AiProviderId,
} from "../../../lib/api";
import * as Icons from "../../common/Icons";
import { DataLoading, DataError } from "../../common/states";
import { confirmAction } from "../../../lib/confirm";

// ============================================
// AI Keys Panel (extracted from SuperAdminDashboard for modularity)
// ============================================

const PROVIDER_META: { id: AiProviderId; label: string; placeholder: string }[] = [
  { id: "openai", label: "OpenAI", placeholder: "sk-…" },
  { id: "anthropic", label: "Anthropic", placeholder: "sk-ant-…" },
  { id: "gemini", label: "Google Gemini", placeholder: "AIza…" },
];

export const AIKeysPanel: React.FC = () => {
  const [data, setData] = useState<MaskedAiProviderKeys | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AiProviderId | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<AiProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await getMaskedAiProviderKeys();
      setData(next);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load AI provider keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startEdit = (provider: AiProviderId) => {
    setEditing(provider);
    setDraft("");
    setError(null);
  };

  const cancelEdit = () => {
    setEditing(null);
    setDraft("");
  };

  const saveKey = async (provider: AiProviderId) => {
    if (!draft.trim()) {
      setError("Paste a key before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateAiProviderKeys({ [`${provider}ApiKey`]: draft.trim() });
      setEditing(null);
      setDraft("");
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save key");
    } finally {
      setSaving(false);
    }
  };

  const clearKey = async (provider: AiProviderId) => {
    const ok = await confirmAction({
      title: "Remove provider key",
      message: `Remove the ${provider} key? AI requests routed to this provider will start failing.`,
      tone: "danger",
      confirmLabel: "Remove",
    });
    if (!ok) return;
    setSaving(true);
    setError(null);
    try {
      await updateAiProviderKeys({ clear: [provider] });
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to clear key");
    } finally {
      setSaving(false);
    }
  };

  const testKey = async (provider: AiProviderId) => {
    setTesting(provider);
    setError(null);
    try {
      await testAiProviderKey(provider);
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="max-w-3xl bg-[var(--color-bg)] ring-1 ring-[var(--color-border)] rounded-lg p-6 space-y-5">
      <div>
        <h3 className="text-base font-semibold text-[var(--color-text)] tracking-tight">
          AI Providers
        </h3>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          Keys are stored in your PocketBase backend and read by the AI proxy at request time. The
          frontend never sees full keys.
        </p>
      </div>

      {loading && <DataLoading label="Loading AI provider keys…" />}

      {error && !loading && (
        <DataError
          title="Failed to load AI keys"
          description={error}
          onRetry={() => {
            setError(null);
            void refresh();
          }}
        />
      )}

      {!loading && (
        <div className="divide-y divide-[var(--color-border)] -mx-2">
          {PROVIDER_META.map((p) => {
            const configured = data?.configured[p.id] ?? false;
            const masked = (data?.[`${p.id}ApiKey` as const] as string | undefined) ?? "";
            const lastTest = data?.lastTested[p.id];
            const isEditing = editing === p.id;
            return (
              <div key={p.id} className="px-2 py-3 flex flex-wrap items-center gap-3">
                <div className="min-w-[120px]">
                  <p className="text-sm font-medium text-[var(--color-text)]">{p.label}</p>
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                    {configured ? "Configured" : "Not configured"}
                  </p>
                </div>
                <div className="flex-1 min-w-[200px]">
                  {isEditing ? (
                    <input
                      type="password"
                      autoComplete="off"
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={p.placeholder}
                      className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
                    />
                  ) : (
                    <span className="inline-block px-2 py-1 rounded bg-[var(--color-bg-subtle)] ring-1 ring-[var(--color-border)] text-xs font-mono text-[var(--color-text-muted)]">
                      {configured ? masked || "••••" : "—"}
                    </span>
                  )}
                  {p.id === "gemini" && (
                    <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
                      Use a paid-tier (billed project) Gemini key — free-tier keys allow Google to
                      train on submitted data.
                    </p>
                  )}
                  {lastTest && !isEditing && (
                    <p
                      className={`text-[11px] mt-1 ${
                        lastTest.ok ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"
                      }`}
                    >
                      {lastTest.ok ? "Live ✓" : "Failed ✗"} {" · "}
                      {new Date(lastTest.at).toLocaleString()}
                      {lastTest.error && !lastTest.ok && (
                        <span className="text-[var(--color-danger)]"> — {lastTest.error}</span>
                      )}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={() => saveKey(p.id)}
                        disabled={saving}
                        className="px-3 py-1.5 rounded-md bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--on-primary)] text-xs font-medium disabled:opacity-50"
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={saving}
                        className="px-3 py-1.5 rounded-md bg-[var(--color-bg-muted)] hover:bg-[var(--color-bg-muted)] text-[var(--color-text)] text-xs font-medium"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => startEdit(p.id)}
                        className="px-3 py-1.5 rounded-md bg-[var(--color-bg-muted)] hover:bg-[var(--color-bg-muted)] text-[var(--color-text)] text-xs font-medium"
                      >
                        {configured ? "Replace" : "Add key"}
                      </button>
                      {configured && (
                        <>
                          <button
                            type="button"
                            onClick={() => testKey(p.id)}
                            disabled={testing === p.id}
                            className="px-3 py-1.5 rounded-md bg-[var(--color-bg-muted)] hover:bg-[var(--color-bg-muted)] text-[var(--color-text)] text-xs font-medium disabled:opacity-50"
                          >
                            {testing === p.id ? "Testing…" : "Test"}
                          </button>
                          <button
                            type="button"
                            onClick={() => clearKey(p.id)}
                            disabled={saving}
                            className="px-3 py-1.5 rounded-md bg-[var(--color-danger-subtle)] hover:bg-[var(--color-danger-subtle)] ring-1 ring-[var(--color-danger)] text-[var(--color-danger)] text-xs font-medium"
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AIKeysPanel;
