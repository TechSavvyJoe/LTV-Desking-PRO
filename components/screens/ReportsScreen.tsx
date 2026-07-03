import React from "react";

const mono: React.CSSProperties = { fontFamily: "var(--mono)" };

/**
 * Reports screen — sub-header per the REPORTS block of
 * LTV Desking PRO.dc.html; body is a placeholder until the KPI tiles +
 * distribution charts ship in wave 2. [dc-redesign]
 */
export const ReportsScreen: React.FC = () => {
  return (
    <div>
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
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 11, ...mono, letterSpacing: "0.18em", color: "var(--color-text-subtle)" }}>
            PERFORMANCE
          </span>
          <div style={{ height: 20, width: 1, background: "var(--color-border)" }} />
          <span style={{ fontSize: 15, fontWeight: 600 }}>Inventory desirability</span>
          <span style={{ fontSize: 13, color: "var(--color-text-subtle)" }}>
            live, against the current deal structure
          </span>
        </div>
      </header>
      <div style={{ padding: "22px 24px", maxWidth: 1100 }}>
        <div
          className="dc-card"
          style={{
            background: "var(--color-bg)",
            border: "1px solid var(--color-border)",
            borderRadius: 14,
            boxShadow: "var(--shadow)",
            padding: "44px 20px",
            textAlign: "center",
          }}
        >
          <span style={{ fontSize: 13.5, color: "var(--color-text-muted)" }}>
            This screen is being rebuilt to the new design.
          </span>
        </div>
      </div>
    </div>
  );
};

export default ReportsScreen;
