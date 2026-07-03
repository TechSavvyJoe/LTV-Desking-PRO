import React from "react";
import { AnnouncementBanner } from "../common/AnnouncementBanner";
import { GaugeMark } from "../common/GaugeMark";

interface AuthLayoutProps {
  children: React.ReactNode;
}

const mono: React.CSSProperties = { fontFamily: "var(--mono)" };

/**
 * Auth shell for the dark/green redesign — a faint grid + radial glow
 * background (.auth-bg), a centered column (.auth-col, staggered entrance), the
 * gauge logomark + "Precision desking, repriced live" lockup, the card, and a
 * mono footer. Mirrors the LOGIN block of LTV Desking PRO.dc.html. [dc-redesign]
 */
export const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
  return (
    <div
      className="auth-bg"
      style={{
        position: "relative",
        zIndex: 1,
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div className="absolute top-0 inset-x-0 z-20">
        <AnnouncementBanner />
      </div>

      <div
        className="auth-col"
        style={{ width: "100%", maxWidth: 404, position: "relative", zIndex: 1 }}
      >
        {/* Brand lockup */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginBottom: 28,
          }}
        >
          <GaugeMark size={48} radius={14} />
          <div
            style={{
              fontSize: 13,
              ...mono,
              letterSpacing: "0.34em",
              color: "var(--color-text-subtle)",
              marginTop: 18,
              textTransform: "uppercase",
            }}
          >
            LTV Desking
          </div>
          <div
            style={{
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              marginTop: 4,
              textAlign: "center",
              color: "var(--color-text)",
            }}
          >
            Precision desking, <span style={{ color: "var(--color-primary)" }}>repriced live</span>
          </div>
          <div
            style={{
              fontSize: 13.5,
              color: "var(--color-text-muted)",
              marginTop: 10,
              textAlign: "center",
              maxWidth: 320,
              lineHeight: 1.5,
            }}
          >
            Structure every deal against real lender rules and see approval odds the instant a number
            changes.
          </div>
        </div>

        {children}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            marginTop: 22,
            fontSize: 11,
            ...mono,
            color: "var(--color-text-subtle)",
          }}
        >
          <span>US DEALERSHIPS</span>
          <span style={{ opacity: 0.4 }}>/</span>
          <a href="/privacy" style={{ color: "inherit", textDecoration: "none" }}>
            PRIVACY
          </a>
          <span style={{ opacity: 0.4 }}>/</span>
          <a href="/terms" style={{ color: "inherit", textDecoration: "none" }}>
            TERMS
          </a>
        </div>
      </div>
    </div>
  );
};
