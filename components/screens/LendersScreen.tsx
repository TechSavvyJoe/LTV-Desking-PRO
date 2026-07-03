import React from "react";
import { useDealContext } from "../../context/DealContext";

const mono: React.CSSProperties = { fontFamily: "var(--mono)" };

/**
 * Lenders screen — sub-header per the LENDERS block of
 * LTV Desking PRO.dc.html; body is a placeholder until the matched-tier
 * matrix + tier accordion editor ship in wave 2. [dc-redesign]
 */
export const LendersScreen: React.FC = () => {
  const { lenderProfiles } = useDealContext();
  const activeCount = lenderProfiles.filter((p) => p.active !== false).length;
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
            LENDER NETWORK
          </span>
          <div style={{ height: 20, width: 1, background: "var(--color-border)" }} />
          <span style={{ fontSize: 15, fontWeight: 600 }}>{activeCount} active programs</span>
          <span style={{ fontSize: 13, color: "var(--color-text-subtle)" }}>
            eligibility recalculated against the live deal
          </span>
        </div>
      </header>
      <div style={{ padding: "20px 24px" }}>
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

export default LendersScreen;
