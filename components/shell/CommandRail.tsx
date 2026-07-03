import React from "react";
import { GaugeMark } from "../common/GaugeMark";

export type DeskScreenId =
  | "desk"
  | "pipeline"
  | "inventory"
  | "lenders"
  | "reports"
  | "owner";

interface CommandRailProps {
  screen: DeskScreenId;
  onSelect: (s: DeskScreenId) => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  /** Owner Console is superadmin-only. */
  showOwner?: boolean;
  /** Avatar initials. */
  initials?: string;
}

const I = {
  desk: () => (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <rect x="3" y="3" width="8" height="10" rx="1.5" />
      <rect x="14" y="3" width="7" height="6" rx="1.5" />
      <rect x="14" y="13" width="7" height="8" rx="1.5" />
      <rect x="3" y="17" width="8" height="4" rx="1.5" />
    </svg>
  ),
  pipeline: () => (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </svg>
  ),
  inventory: () => (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M5 11l1.6-4.6A2 2 0 0 1 8.5 5h7a2 2 0 0 1 1.9 1.4L19 11" />
      <path d="M5 11h14v6H5z" />
      <path d="M7.5 17v1.6M16.5 17v1.6M7.5 14h.5M16 14h.5" />
    </svg>
  ),
  lenders: () => (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 10l9-6 9 6" />
      <path d="M5 10v8M19 10v8M9.5 10v8M14.5 10v8M3.5 18h17" />
    </svg>
  ),
  reports: () => (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M3 3v18h18" />
      <path d="M8 17v-5M13 17V8M18 17v-9" />
    </svg>
  ),
  owner: () => (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M12 3l8 3.5v5c0 4.5-3.2 7.4-8 9-4.8-1.6-8-4.5-8-9v-5z" />
    </svg>
  ),
  settings: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  sun: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </svg>
  ),
  moon: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  ),
};

const NAV: { id: DeskScreenId; label: string; icon: keyof typeof I }[] = [
  { id: "desk", label: "Desk", icon: "desk" },
  { id: "pipeline", label: "Pipeline", icon: "pipeline" },
  { id: "inventory", label: "Inventory", icon: "inventory" },
  { id: "lenders", label: "Lenders", icon: "lenders" },
  { id: "reports", label: "Reports", icon: "reports" },
];

const RailButton: React.FC<{
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ label, active, onClick, children }) => (
  <button
    onClick={onClick}
    className="rail-btn lift-btn"
    title={label}
    aria-label={label}
    aria-current={active ? "page" : undefined}
    style={{
      position: "relative",
      width: 40,
      height: 40,
      borderRadius: 10,
      border: "none",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "inherit",
      background: active ? "var(--color-primary-subtle)" : "transparent",
      color: active ? "var(--color-primary)" : "var(--color-text-subtle)",
    }}
  >
    <span
      style={{
        position: "absolute",
        left: -14,
        width: 3,
        height: 18,
        borderRadius: "0 3px 3px 0",
        background: active ? "var(--color-primary)" : "transparent",
      }}
    />
    {children}
  </button>
);

/**
 * Left command rail — the redesign's primary navigation (replaces the old top
 * tabs). Mirrors the LEFT COMMAND RAIL of LTV Desking PRO.dc.html. [WS1]
 */
export const CommandRail: React.FC<CommandRailProps> = ({
  screen,
  onSelect,
  theme,
  onToggleTheme,
  onOpenSettings,
  showOwner = false,
  initials = "JS",
}) => {
  const ThemeIcon = theme === "dark" ? I.sun : I.moon;
  return (
    <aside
      style={{
        width: 62,
        flexShrink: 0,
        background: "var(--color-bg)",
        borderRight: "1px solid var(--color-border)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "14px 0",
        position: "sticky",
        top: 0,
        height: "100vh",
        zIndex: 30,
      }}
    >
      <GaugeMark size={34} radius={10} />
      <div style={{ width: 24, height: 1, background: "var(--color-border)", margin: "14px 0" }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
        {NAV.map((n) => {
          const Icon = I[n.icon];
          return (
            <RailButton key={n.id} label={n.label} active={screen === n.id} onClick={() => onSelect(n.id)}>
              <Icon />
            </RailButton>
          );
        })}
        {showOwner && (
          <>
            <div style={{ width: 24, height: 1, background: "var(--color-border)", margin: "6px 0" }} />
            <RailButton
              label="Owner Console"
              active={screen === "owner"}
              onClick={() => onSelect("owner")}
            >
              <I.owner />
            </RailButton>
          </>
        )}
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
        <button
          onClick={onToggleTheme}
          className="rail-btn lift-btn"
          aria-label="Toggle theme"
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            color: "var(--color-text-subtle)",
          }}
        >
          <ThemeIcon />
        </button>
        <button
          onClick={onOpenSettings}
          className="rail-btn lift-btn"
          aria-label="Settings"
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            color: "var(--color-text-subtle)",
          }}
        >
          <I.settings />
        </button>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            background: "var(--color-primary-subtle)",
            color: "var(--color-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
            fontFamily: "var(--mono)",
            marginTop: 4,
          }}
        >
          {initials}
        </div>
      </div>
    </aside>
  );
};

export default CommandRail;
