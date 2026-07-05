import React from "react";

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
  letterSpacing: "0.06em",
  ...mono,
  color: "var(--color-text-muted)",
  textTransform: "uppercase",
};

/** Big KPI tile with a top-right primary icon (Overview row 1). */
export const KpiTile: React.FC<{
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
}> = ({ label, value, sub, icon }) => (
  <div className="lift-btn dc-card" style={{ ...panelCard, position: "relative", padding: 19 }}>
    <div style={kpiLabelStyle}>{label}</div>
    <div style={{ fontSize: 34, fontWeight: 700, marginTop: 8, letterSpacing: "-0.02em" }}>{value}</div>
    <div style={{ fontSize: 12, color: "var(--color-text-subtle)", marginTop: 5, minHeight: 15 }}>
      {sub ?? " "}
    </div>
    {icon && (
      <div style={{ position: "absolute", top: 18, right: 18, color: "var(--color-primary)" }} aria-hidden>
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
        letterSpacing: "-0.02em",
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
          className="lift-btn"
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
    <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--color-primary)" }} />
    {label}
  </span>
);

/** Role chip (mono, uppercase) for user lists. */
export const RoleChip: React.FC<{ role: string }> = ({ role }) => (
  <span
    style={{
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: "0.04em",
      ...mono,
      background: "var(--color-bg-muted)",
      color: "var(--color-text-muted)",
      padding: "4px 9px",
      borderRadius: 6,
      textTransform: "uppercase",
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
      <span style={{ fontSize: 11, ...mono, letterSpacing: "0.18em", color: "var(--color-text-subtle)", whiteSpace: "nowrap" }}>
        {label}
      </span>
      <div style={{ height: 20, width: 1, background: "var(--color-border)", flexShrink: 0 }} />
      <span style={{ fontSize: 15, fontWeight: 600, whiteSpace: "nowrap" }}>{title}</span>
      {sub !== undefined && (
        <span style={{ fontSize: 13, color: "var(--color-text-subtle)", whiteSpace: "nowrap" }}>{sub}</span>
      )}
    </div>
    {right && <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>{right}</div>}
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
