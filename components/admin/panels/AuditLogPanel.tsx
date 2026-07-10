import React, { useState, useEffect, useCallback } from "react";
import { listAuditLog, AuditLogEntry } from "../../../lib/api";
import { DataLoading, DataError, EmptyState } from "../../common/states";

/**
 * AuditLogCard / AuditLogPanel (extracted from SuperAdminDashboard.tsx)
 *
 * Read-only append-only audit log display (last 25). Used inside System Settings.
 * Preserves all formatting, error/loading, and detail rendering.
 */

const formatAuditAction = (action: string): string => {
  switch (action) {
    case "ai_key_updated":
      return "Updated key";
    case "ai_key_cleared":
      return "Removed key";
    case "ai_key_tested":
      return "Tested key";
    default:
      return action;
  }
};

export const AuditLogCard: React.FC = () => {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listAuditLog(25);
      setEntries(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="max-w-3xl bg-[var(--color-bg)] ring-1 ring-[var(--color-border)] rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-base font-semibold text-[var(--color-text)] tracking-tight">
            Audit Log
          </h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            Most recent 25 entries. Append-only — entries cannot be edited or deleted.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          aria-busy={loading}
          aria-label={loading ? "Refreshing audit log" : "Refresh audit log"}
          className="px-3 py-1.5 rounded-md bg-[var(--color-bg-muted)] hover:bg-[var(--color-bg-muted)] text-[var(--color-text)] text-xs font-medium disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {loading && <DataLoading label="Loading audit log…" />}

      {error && !loading && (
        <DataError title="Failed to load audit log" description={error} onRetry={refresh} />
      )}

      {!loading && !error && entries.length === 0 && (
        <EmptyState
          title="No audit entries yet"
          description="Actions like key updates and tests will appear here once performed. The log is append-only."
        />
      )}

      {!loading && entries.length > 0 && (
        <div className="divide-y divide-[var(--color-border)] -mx-2">
          {entries.map((entry) => {
            const actor = entry.expand?.actor;
            const actorName = actor
              ? `${actor.firstName ?? ""} ${actor.lastName ?? ""}`.trim() ||
                actor.email ||
                entry.actor
              : entry.actor;
            const detailsObj =
              entry.details && typeof entry.details === "object"
                ? (entry.details as Record<string, unknown>)
                : null;
            return (
              <div
                key={entry.id}
                className="px-2 py-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1"
              >
                <span className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
                  {new Date(entry.created).toLocaleString()}
                </span>
                <span className="text-xs font-medium text-[var(--color-text)]">{actorName}</span>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {formatAuditAction(entry.action)}
                </span>
                {entry.target && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--color-bg-muted)] text-[var(--color-text-muted)] font-mono">
                    {entry.target}
                  </span>
                )}
                {detailsObj?.ok === false && typeof detailsObj.error === "string" && (
                  <span className="text-[11px] text-[var(--color-danger)]">
                    — {detailsObj.error}
                  </span>
                )}
                {detailsObj?.ok === true && (
                  <span className="text-[11px] text-[var(--color-success)]">— live</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Also export as AuditLogPanel for naming consistency in admin/panels
export const AuditLogPanel = AuditLogCard;

export default AuditLogCard;
