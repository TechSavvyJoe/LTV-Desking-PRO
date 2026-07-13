import React, { useState, useEffect } from "react";
import * as Icons from "../../common/Icons";

/**
 * Shared owner-console building blocks — the mockup's KPI tiles, mono stat
 * cards, panel cards and initials-avatar list rows (LTV Desking PRO.dc.html
 * lines 761-855), extracted so SuperAdminDashboard / DealerAdminDashboard
 * stay readable. Pure presentation: no data fetching here. [P7]
 */

export const mono: React.CSSProperties = { fontFamily: "var(--mono)" };

export const panelCard: React.CSSProperties = {
  background: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  borderRadius: 14,
  boxShadow: "var(--shadow)",
};

export const kpiLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  ...mono,
  color: "var(--color-text-muted)",
};

/** Big KPI tile with a top-right primary icon (Overview row 1). */
export const KpiTile: React.FC<{
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
}> = ({ label, value, sub, icon }) => (
  <div
    className="transition-colors dc-card"
    style={{ ...panelCard, position: "relative", padding: 19 }}
  >
    <div style={kpiLabelStyle}>{label}</div>
    <div style={{ fontSize: 34, fontWeight: 700, marginTop: 8, letterSpacing: 0 }}>{value}</div>
    <div style={{ fontSize: 12, color: "var(--color-text-subtle)", marginTop: 5, minHeight: 15 }}>
      {sub ?? " "}
    </div>
    {icon && (
      <div
        style={{ position: "absolute", top: 18, right: 18, color: "var(--color-primary)" }}
        aria-hidden
      >
        {icon}
      </div>
    )}
  </div>
);

/** Mono stat card (Overview row 2 — pipeline stats). */
export const StatTile: React.FC<{
  label: string;
  value: React.ReactNode;
  color?: string;
}> = ({ label, value, color }) => (
  <div className="dc-card" style={{ ...panelCard, padding: 18 }}>
    <div style={kpiLabelStyle}>{label}</div>
    <div
      style={{
        fontSize: 28,
        fontWeight: 700,
        ...mono,
        marginTop: 8,
        letterSpacing: 0,
        color: color ?? "var(--color-text)",
      }}
    >
      {value}
    </div>
  </div>
);

/** Card with a "Recent X" header row + "View all →" link. */
export const ListCard: React.FC<{
  title: string;
  onViewAll?: () => void;
  children: React.ReactNode;
}> = ({ title, onViewAll, children }) => (
  <div className="dc-card" style={{ ...panelCard, overflow: "hidden" }}>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "15px 17px",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
      {onViewAll && (
        <button
          onClick={onViewAll}
          className="transition-colors"
          style={{
            fontSize: 13,
            color: "var(--color-primary)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            padding: 0,
          }}
        >
          View all →
        </button>
      )}
    </div>
    {children}
  </div>
);

export const initialsOf = (first?: string, last?: string, fallback?: string): string => {
  const s = `${first?.[0] ?? ""}${last?.[0] ?? ""}`.trim().toUpperCase();
  if (s) return s;
  return (fallback ?? "??").slice(0, 2).toUpperCase();
};

/** Initials-avatar list row (Recent dealers / Recent users). */
export const PersonRow: React.FC<{
  initials: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  right?: React.ReactNode;
  /** Highlight the avatar with the primary-subtle treatment (superadmins). */
  highlight?: boolean;
  compact?: boolean;
}> = ({ initials, title, sub, right, highlight, compact }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: compact ? "11px 17px" : "13px 17px",
      borderBottom: "1px solid var(--color-border)",
      background: highlight ? "var(--color-primary-subtle)" : "transparent",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
      <div
        style={{
          width: compact ? 33 : 36,
          height: compact ? 33 : 36,
          borderRadius: 10,
          background: highlight ? "var(--color-primary-subtle)" : "var(--color-bg-muted)",
          color: highlight ? "var(--color-primary)" : "var(--color-text-muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 700,
          ...mono,
          flexShrink: 0,
        }}
        aria-hidden
      >
        {initials}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: compact ? 500 : 600,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </div>
        {sub !== undefined && (
          <div
            style={{
              fontSize: 12,
              color: "var(--color-text-subtle)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {sub}
          </div>
        )}
      </div>
    </div>
    {right && <div style={{ flexShrink: 0, marginLeft: 12 }}>{right}</div>}
  </div>
);

/** Green "Active"-style pill used across the owner console. */
export const ActivePill: React.FC<{ label?: string }> = ({ label = "Active" }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      fontSize: 12,
      fontWeight: 600,
      background: "var(--color-primary-subtle)",
      color: "var(--color-primary)",
      padding: "4px 9px",
      borderRadius: 6,
    }}
  >
    <span
      style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--color-primary)" }}
    />
    {label}
  </span>
);

/** Role chip (neutral) for user lists. Sentence case per Dealer Trust. */
export const RoleChip: React.FC<{ role: string }> = ({ role }) => (
  <span
    style={{
      fontSize: 11,
      fontWeight: 600,
      ...mono,
      background: "var(--color-bg-muted)",
      color: "var(--color-text-muted)",
      padding: "4px 9px",
      borderRadius: 6,
    }}
  >
    {role}
  </span>
);

/** 58px console sub-header (label · title · sub · right action). */
export const ConsoleHeader: React.FC<{
  label: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  right?: React.ReactNode;
}> = ({ label, title, sub, right }) => (
  <header
    style={{
      height: 58,
      borderBottom: "1px solid var(--color-border)",
      background: "var(--color-bg)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 24px",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
      <span
        style={{
          fontSize: 11,
          ...mono,
          letterSpacing: "0.18em",
          color: "var(--color-text-subtle)",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <div style={{ height: 20, width: 1, background: "var(--color-border)", flexShrink: 0 }} />
      <span style={{ fontSize: 15, fontWeight: 600, whiteSpace: "nowrap" }}>{title}</span>
      {sub !== undefined && (
        <span style={{ fontSize: 13, color: "var(--color-text-subtle)", whiteSpace: "nowrap" }}>
          {sub}
        </span>
      )}
    </div>
    {right && (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>{right}</div>
    )}
  </header>
);

/** Sub-tab bar row (Overview / Dealers [n] / Users [n] / Settings). */
export const ConsoleTab: React.FC<{
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: number;
}> = ({ active, onClick, label, badge }) => (
  <button
    onClick={onClick}
    className="tab-btn"
    style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      background: "transparent",
      border: "none",
      borderBottom: `2px solid ${active ? "var(--color-primary)" : "transparent"}`,
      color: active ? "var(--color-text)" : "var(--color-text-muted)",
      padding: "12px 4px",
      marginRight: 10,
      fontSize: 14,
      fontWeight: active ? 600 : 500,
      cursor: "pointer",
      fontFamily: "inherit",
      whiteSpace: "nowrap",
    }}
  >
    {label}
    {typeof badge === "number" && (
      <span
        style={{
          fontSize: 11,
          background: "var(--color-bg-muted)",
          color: "var(--color-text-muted)",
          padding: "1px 6px",
          borderRadius: 5,
          ...mono,
        }}
      >
        {badge}
      </span>
    )}
  </button>
);

/** Reusable search input used in dealer/user lists (moved from SuperAdminDashboard for modularity). */
export const SearchInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}> = ({ value, onChange, placeholder = "Search…", autoFocus }) => (
  <div className="relative">
    <Icons.MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className="pl-9 pr-3 py-2 w-full sm:w-64 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)] focus:border-[var(--color-primary)]"
    />
    {value && (
      <button
        onClick={() => onChange("")}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        aria-label="Clear"
        type="button"
      >
        <Icons.XMarkIcon className="w-4 h-4" />
      </button>
    )}
  </div>
);

/** Sortable table header used in dealer/user management lists. */
export const SortHeader: React.FC<{
  label: string;
  field: string;
  current: { field: string; dir: "asc" | "desc" };
  onSort: (field: string) => void;
  align?: "left" | "center" | "right";
  className?: string;
}> = ({ label, field, current, onSort, align = "left", className = "" }) => {
  const isActive = current.field === field;
  return (
    <th
      scope="col"
      className={`px-4 py-3 text-${align} text-xs font-semibold text-[var(--color-text)] ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 hover:text-[var(--color-text)] focus:outline-none ${
          isActive ? "text-[var(--color-text)]" : ""
        }`}
      >
        {label}
        <span
          className={isActive ? "text-[var(--color-primary)]" : "text-[var(--color-text-muted)]"}
        >
          {isActive ? (current.dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
};

// ============================================
// Console helper components (moved from SuperAdminDashboard.tsx for modularity)
// RefreshBar, StatusPill, relativeTime — used by header and dealer tables.
// ============================================

export const relativeTime = (date: Date, _tick: number): string => {
  void _tick; // force re-render via tick prop
  const diff = Math.max(0, Date.now() - date.getTime());
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return date.toLocaleDateString();
};

export const StatusPill: React.FC<{ active: boolean; onClick?: () => void; title?: string }> = ({
  active,
  onClick,
  title,
}) => {
  const cls = active
    ? "bg-[var(--color-success-subtle)] text-[var(--color-success)] ring-1 ring-inset ring-[var(--color-success)] hover:bg-[var(--color-success-subtle)]"
    : "bg-[var(--color-danger-subtle)] text-[var(--color-danger)] ring-1 ring-inset ring-[var(--color-danger)] hover:bg-[var(--color-danger-subtle)]";
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${cls}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${active ? "bg-[var(--color-success)]" : "bg-[var(--color-danger)]"}`}
      />
      {active ? "Active" : "Inactive"}
    </button>
  );
};

export const RefreshBar: React.FC<{
  loading: boolean;
  lastUpdated: Date | null;
  onRefresh: () => void;
}> = ({ loading, lastUpdated, onRefresh }) => {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const relative = lastUpdated ? relativeTime(lastUpdated, tick) : null;

  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={loading}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-[var(--color-text-muted)] bg-[var(--color-bg-muted)] border border-[var(--color-border)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text)] transition-colors disabled:opacity-50"
      title="Refresh data"
    >
      <Icons.ArrowPathIcon className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
      <span>{loading ? "Refreshing…" : `Updated ${relative || "just now"}`}</span>
    </button>
  );
};
