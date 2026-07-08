import React, { useState, useEffect } from "react";
import { getSystemSettings, updateSystemSettings, type SystemSettings } from "../../../lib/api";
import Button from "../../common/Button";
import * as Icons from "../../common/Icons";
import { AIKeysPanel } from "./AIKeysPanel";
import { AIDefaultsPanel } from "./AIDefaultsPanel";
import { AuditLogCard } from "./AuditLogPanel";

/**
 * SystemSettingsPanel (extracted from SuperAdminDashboard.tsx)
 *
 * Global system settings form + embedded AI keys, AI defaults, audit log.
 * Affects entire platform.
 */

export const SystemSettingsPanel: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [form, setForm] = useState<SystemSettings>({
    supportEmail: "",
    announcementBanner: "",
    signupsEnabled: true,
    defaultLtvThresholds: "",
  });

  useEffect(() => {
    let cancelled = false;
    getSystemSettings()
      .then((s) => {
        if (cancelled) return;
        setForm({
          supportEmail: s.supportEmail || "",
          announcementBanner: s.announcementBanner || "",
          signupsEnabled: s.signupsEnabled !== false,
          defaultLtvThresholds:
            typeof s.defaultLtvThresholds === "string"
              ? s.defaultLtvThresholds
              : JSON.stringify(s.defaultLtvThresholds ?? {}, null, 2),
        });
      })
      .catch(
        (e: unknown) =>
          !cancelled && setError(e instanceof Error ? e.message : "Failed to load settings")
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    setError(null);
    let thresholds: unknown = {};
    if (form.defaultLtvThresholds && typeof form.defaultLtvThresholds === "string") {
      try {
        thresholds = JSON.parse(form.defaultLtvThresholds);
      } catch {
        setError("Default LTV thresholds must be valid JSON");
        return;
      }
    }

    setSaving(true);
    try {
      await updateSystemSettings({
        supportEmail: form.supportEmail,
        announcementBanner: form.announcementBanner,
        signupsEnabled: form.signupsEnabled,
        defaultLtvThresholds: thresholds,
      });
      setSavedAt(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Icons.SpinnerIcon className="w-6 h-6 text-[var(--color-primary)] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fadeIn">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text)] tracking-tight">
            System Settings
          </h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            Affects every dealership on the platform.
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
        <div className="rounded-lg bg-[var(--color-danger-subtle)] border border-[var(--color-danger)] px-4 py-3 text-sm text-[var(--color-danger)] max-w-3xl">
          {error}
        </div>
      )}

      <div className="max-w-3xl bg-[var(--color-bg)] ring-1 ring-[var(--color-border)] rounded-lg p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
            Support email
          </label>
          <input
            type="email"
            value={form.supportEmail || ""}
            onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
            className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
            placeholder="support@ltvdesking.com"
          />
          <p className="text-xs text-[var(--color-text-muted)] mt-1.5">
            Shown to dealers in error messages and help screens.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
            Announcement banner
          </label>
          <textarea
            value={form.announcementBanner || ""}
            onChange={(e) => setForm({ ...form, announcementBanner: e.target.value })}
            className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] min-h-[60px] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
            placeholder="Scheduled maintenance Friday 10pm ET…"
          />
          <p className="text-xs text-[var(--color-text-muted)] mt-1.5">
            Leave empty to hide. Displayed at the top of every page when set.
          </p>
        </div>

        <div className="flex items-center justify-between p-4 bg-[var(--color-bg-subtle)] ring-1 ring-[var(--color-border)] rounded-xl">
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">Allow new dealer signups</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              When off, the public registration form on{" "}
              <code className="text-[var(--color-text-muted)]">/</code> is disabled.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={form.signupsEnabled !== false}
              onChange={(e) => setForm({ ...form, signupsEnabled: e.target.checked })}
            />
            <div className="w-11 h-6 bg-[var(--color-bg-muted)] peer-focus:ring-2 peer-focus:ring-[var(--color-primary)] rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--color-primary)]"></div>
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
            Default LTV thresholds (JSON)
          </label>
          <textarea
            value={
              typeof form.defaultLtvThresholds === "string"
                ? form.defaultLtvThresholds
                : JSON.stringify(form.defaultLtvThresholds ?? {}, null, 2)
            }
            onChange={(e) => setForm({ ...form, defaultLtvThresholds: e.target.value })}
            className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] font-mono text-xs min-h-[140px] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
            placeholder='{"700": 120, "650": 110}'
            spellCheck={false}
          />
          <p className="text-xs text-[var(--color-text-muted)] mt-1.5">
            Applied as the default for new dealerships.
          </p>
        </div>
      </div>

      <div className="max-w-3xl flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>

      <AIKeysPanel />
      <AIDefaultsPanel />
      <AuditLogCard />
    </div>
  );
};

export default SystemSettingsPanel;
