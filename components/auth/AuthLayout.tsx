import React from "react";
import { AnnouncementBanner } from "../common/AnnouncementBanner";
import { GaugeMark } from "../common/GaugeMark";

interface AuthLayoutProps {
  children: React.ReactNode;
}

/**
 * Auth shell — a faint grid + radial tint
 * background (.auth-bg), a centered column (.auth-col, staggered entrance), the
 * gauge logomark + "Precision desking, repriced live" lockup, the card, and a
 * footer. Mirrors the LOGIN block of LTV Desking PRO.dc.html. [dc-redesign]
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
              fontSize: 14,
              color: "var(--color-text-subtle)",
              marginTop: 18,
            }}
          >
            LTV Desking
          </div>
          <h1 className="auth-title">Precision desking, repriced live</h1>
          <div
            style={{
              fontSize: 14,
              color: "var(--color-text-muted)",
              marginTop: 10,
              textAlign: "center",
              maxWidth: 320,
              lineHeight: 1.5,
            }}
          >
            Structure every deal against real lender rules and see approval odds the instant a
            number changes.
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
            fontSize: 12,
            color: "var(--color-text-subtle)",
          }}
        >
          <span>US dealerships</span>
          <a href="/privacy" style={{ color: "inherit", textDecoration: "none" }}>
            Privacy
          </a>
          <a href="/terms" style={{ color: "inherit", textDecoration: "none" }}>
            Terms
          </a>
        </div>
      </div>
    </div>
  );
};
