import React from "react";
import * as Icons from "../common/Icons";

interface RegisterProps {
  onSuccess: () => void;
  onLoginClick: () => void;
}

// Pilot model is invite-only: public self-registration is disabled and the
// tightened API rules would reject the unauthenticated dealers lookup anyway.
// Accounts are created by a dealership admin (or the platform owner).
// Card restyled to match the Login card of LTV Desking PRO.dc.html. [dc-redesign]
export const Register: React.FC<RegisterProps> = ({ onLoginClick }) => {
  return (
    <div
      style={{
        background: "var(--color-bg)",
        border: "1px solid var(--color-border)",
        borderRadius: 16,
        boxShadow: "var(--shadow-md)",
        padding: "28px 28px 30px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <span
          style={{
            fontSize: 10,
            fontFamily: "var(--mono)",
            letterSpacing: "0.12em",
            color: "var(--color-text-subtle)",
          }}
        >
          REGISTER DEALER
        </span>
        <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
      </div>

      <div style={{ textAlign: "center" }}>
        <div style={{ color: "var(--color-text-subtle)" }}>
          <Icons.LockClosedIcon className="w-10 h-10 mx-auto" />
        </div>
        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "var(--color-text)",
            margin: "14px 0 0",
          }}
        >
          Registration is by invitation
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--color-text-muted)",
            lineHeight: 1.5,
            margin: "10px 0 0",
          }}
        >
          Ask your dealership administrator to create your account, or contact support.
        </p>
        <div style={{ marginTop: 18 }}>
          <button
            type="button"
            onClick={onLoginClick}
            style={{
              color: "var(--color-primary)",
              textDecoration: "none",
              cursor: "pointer",
              fontWeight: 600,
              background: "none",
              border: "none",
              fontFamily: "inherit",
              fontSize: 13,
            }}
          >
            Back to sign in
          </button>
        </div>
      </div>
    </div>
  );
};
