import React, { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useDealContext } from "../../context/DealContext";
import { useTheme } from "../../hooks/useTheme";
import { GaugeMark } from "../common/GaugeMark";
import { AnnouncementBanner } from "../common/AnnouncementBanner";
import SkipNavLink from "../common/SkipNavLink";
// Lazy load modals (Settings ~750 LOC + AI manager) to keep shell + desk initial
// bundle smaller. Only fetched on explicit open.
const SettingsModal = lazy(() => import("../SettingsModal"));
const AiLenderManagerModal = lazy(() => import("../AiLenderManagerModal"));
import BackgroundUploadIndicator from "../BackgroundUploadIndicator";
import { SkeletonRows, DataError } from "../common/states";
import { SectionErrorBoundary } from "../common/ErrorBoundary";
import { CommandPalette, useCommandPaletteHotkey } from "./CommandPalette";
import type { PaletteItem } from "./CommandPalette";
import { vehiclePaletteItem } from "./paletteItems";
import { useOpenDealInDesk } from "../../hooks/useOpenDealInDesk";
import { GettingStarted } from "./GettingStarted";
import {
  getCurrentUser,
  getSuperadminDealerOverride,
  setSuperadminDealerOverride,
  clearSuperadminDealerOverride,
  collections,
  asRecord,
} from "../../lib/pocketbase";
import type { Dealer } from "../../lib/pocketbase";
import { getAllDealers } from "../../lib/api";
import { logout } from "../../lib/auth";
import { toast } from "../../lib/toast";

/** Context handed to routed screens via <Outlet/> (react-router outlet context). */
export interface ShellOutletContext {
  /** Opens the AI Lender Upload modal owned by the shell. */
  openAiUpload: () => void;
}

const mono: React.CSSProperties = { fontFamily: "var(--mono)" };

/* Inline SVGs copied verbatim from LTV Desking PRO.dc.html (header + renderVals). */
const SparkleIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path
      d="M12 8.5 13 11l2.5 1L13 13l-1 2.5L11 13l-2.5-1L11 11z"
      fill="currentColor"
      stroke="none"
    />
    <path d="M5 4v3M19 17v3M4 18h2M18 5h2" />
  </svg>
);

const SunIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
  >
    <circle cx="12" cy="12" r="5" />
    <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
  </svg>
);

const MoonIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
  >
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);

const GearIcon = () => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const WrenchIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
);

const SearchIcon = () => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.8-3.8" />
  </svg>
);

const ShieldIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
  >
    <path d="M12 3l8 3.5v5c0 4.5-3.2 7.4-8 9-4.8-1.6-8-4.5-8-9v-5z" />
  </svg>
);

/** Icon buttons in the header's right cluster (theme / settings / tools). */
const railBtnStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 9,
  border: "none",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
  color: "var(--color-text-subtle)",
  flexShrink: 0,
};

/** Row-2 tab styling — active = 2px primary bottom bar + text color + weight 600. */
const tabStyle = (isActive: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 7,
  background: "transparent",
  border: "none",
  borderBottom: `2px solid ${isActive ? "var(--color-primary)" : "transparent"}`,
  color: isActive ? "var(--color-text)" : "var(--color-text-muted)",
  padding: "9px 12px 10px",
  fontSize: 14,
  fontWeight: isActive ? 600 : 500,
  cursor: "pointer",
  fontFamily: "inherit",
  textDecoration: "none",
  whiteSpace: "nowrap",
});

const CountChip: React.FC<{ count: number }> = ({ count }) => (
  <span
    style={{
      fontSize: 11,
      ...mono,
      background: "var(--color-bg-muted)",
      color: "var(--color-text-muted)",
      padding: "1px 6px",
      borderRadius: 5,
    }}
  >
    {count}
  </span>
);

/**
 * The dealer app shell — top nav per LTV Desking PRO.dc.html lines 141-177.
 * Row 1: logomark + wordmark · dealer control · impersonation pill · AI Lender
 * Upload · theme · settings · tools · avatar menu. Row 2: screen tabs with
 * live counts. Hosts the routed screens via <Outlet/> and owns the
 * SettingsModal + AiLenderManagerModal mounts (moved from legacy MainLayout).
 * [dc-redesign]
 */
export const AppShell: React.FC = () => {
  const {
    settings,
    setSettings,
    inventory,
    lenderProfiles,
    setLenderProfiles,
    savedDeals,
    setFocusVin,
    setSearchQuery,
    message,
    setMessage,
    dataLoading,
    dataError,
    refetchData,
  } = useDealContext();

  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const currentUser = getCurrentUser();
  const isSuperAdmin = currentUser?.role === "superadmin";
  const isDealerAdmin = currentUser?.role === "admin";
  const overrideId = getSuperadminDealerOverride();

  // Bridge the context message state to the global toast system (from MainLayout).
  useEffect(() => {
    if (message) {
      // Map all four message types so warnings/info aren't downgraded to errors.
      toast[message.type](message.text);
      // Clear after dispatching so the same message can be set again
      setMessage(null);
    }
  }, [message, setMessage]);

  // Offline awareness: a dealership Wi-Fi blip used to be indistinguishable
  // from a broken app — saves just failed with generic errors. [G68]
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // --- Dealer control -------------------------------------------------------
  // Superadmin: a select over all dealers wired to the impersonation override
  // (reuses the old Header DealerSwitcher logic — auto-select first dealer,
  // manual switch reloads so every query refetches under the new dealer).
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [dealersError, setDealersError] = useState(false);
  // Bumped by the retry button to re-run the dealer fetch after a failure.
  const [dealersFetchNonce, setDealersFetchNonce] = useState(0);
  const [dealerName, setDealerName] = useState<string>("");

  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    setDealersError(false);
    getAllDealers()
      .then((dealerList) => {
        if (cancelled) return;
        setDealers(dealerList);
        const firstDealer = dealerList[0];
        if (!getSuperadminDealerOverride() && firstDealer) {
          // Auto-selection doesn't reload — data loads with the selected dealer.
          setSuperadminDealerOverride(firstDealer.id);
        }
      })
      .catch(() => {
        // A failed fetch used to leave the switcher on "Loading dealers…"
        // forever; surface the failure and offer a retry instead.
        if (!cancelled) setDealersError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin, dealersFetchNonce]);

  useEffect(() => {
    if (isSuperAdmin) return;
    const dealerId = currentUser?.dealer;
    if (!dealerId) return;
    const expanded = currentUser?.expand?.dealer?.name;
    if (expanded) {
      setDealerName(expanded);
      return;
    }
    let cancelled = false;
    collections.dealers
      .getOne(dealerId)
      .then((record) => {
        if (!cancelled) setDealerName(asRecord<Dealer>(record)?.name ?? "");
      })
      .catch(() => {
        /* keep placeholder */
      });
    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin, currentUser?.dealer, currentUser?.expand?.dealer?.name]);

  const impersonatedDealer = useMemo(
    () => dealers.find((d) => d.id === overrideId) ?? null,
    [dealers, overrideId]
  );

  const handleDealerSwitch = (dealerId: string) => {
    if (!dealerId || dealerId === overrideId) return;
    setSuperadminDealerOverride(dealerId);
    // Reload so all dealer-scoped data refetches under the new dealer.
    window.location.reload();
  };

  const handleExitImpersonation = () => {
    clearSuperadminDealerOverride();
    navigate("/admin");
  };

  // --- AI Lender Upload modal state (moved from legacy MainLayout) ----------
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isAiMinimized, setIsAiMinimized] = useState(false);
  // Progress reported by the AI importer, shown by the minimized
  // BackgroundUploadIndicator while the user keeps working.
  const [aiUploadProgress, setAiUploadProgress] = useState({ progress: 0, stage: "" });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const openAiUpload = useCallback(() => {
    setIsAiModalOpen(true);
    setIsAiMinimized(false);
  }, []);

  // --- Avatar popover --------------------------------------------------------
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const initials = useMemo(() => {
    const fromName = `${currentUser?.firstName?.[0] ?? ""}${currentUser?.lastName?.[0] ?? ""}`
      .trim()
      .toUpperCase();
    if (fromName) return fromName;
    return (currentUser?.email?.slice(0, 2) ?? "??").toUpperCase();
  }, [currentUser?.firstName, currentUser?.lastName, currentUser?.email]);

  const menuItemStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    background: "transparent",
    border: "none",
    borderRadius: 7,
    padding: "8px 10px",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--color-text)",
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "left",
  };

  const outletContext: ShellOutletContext = { openAiUpload };

  // --- Command palette (⌘K) --------------------------------------------------
  // One keyboard-first entry point for every screen, action, saved deal and
  // unit in stock — the switching pattern F&I managers expect from DMS-class
  // tools. Items are rebuilt only when the underlying lists change. [takeover-P1 #8]
  const [paletteOpen, setPaletteOpen] = useState(false);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  useCommandPaletteHotkey(openPalette);
  const openDealInDesk = useOpenDealInDesk();

  const paletteItems = useMemo<PaletteItem[]>(() => {
    const go = (to: string) => () => navigate(to);
    const screens: PaletteItem[] = [
      {
        id: "nav-desk",
        label: "The Desk",
        detail: "Structure a deal",
        group: "Go to",
        onSelect: go("/desk"),
      },
      {
        id: "nav-pipeline",
        label: "Pipeline",
        detail: `${savedDeals.length} saved deals`,
        group: "Go to",
        onSelect: go("/pipeline"),
      },
      {
        id: "nav-inventory",
        label: "Inventory",
        detail: `${inventory.length} vehicles`,
        group: "Go to",
        onSelect: go("/inventory"),
      },
      {
        id: "nav-lenders",
        label: "Lenders",
        detail: `${lenderProfiles.length} lender profiles`,
        group: "Go to",
        onSelect: go("/lenders"),
      },
      { id: "nav-reports", label: "Reports", group: "Go to", onSelect: go("/reports") },
      {
        id: "nav-tools",
        label: "Finance tools",
        detail: "Payment, LTV and reserve calculators",
        group: "Go to",
        onSelect: go("/tools"),
      },
    ];
    if (isSuperAdmin || isDealerAdmin) {
      screens.push({
        id: "nav-admin",
        label: isSuperAdmin ? "Owner Console" : "Admin",
        detail: "Users, dealers, settings",
        group: "Go to",
        onSelect: go("/admin"),
      });
    }
    const actions: PaletteItem[] = [
      {
        id: "act-ai-upload",
        label: "AI Lender Upload",
        detail: "Import a rate sheet or program guide",
        group: "Actions",
        keywords: ["import", "rate sheet", "lender", "program"],
        onSelect: openAiUpload,
      },
      {
        id: "act-settings",
        label: "Settings",
        detail: "Dealer defaults, fees, taxes",
        group: "Actions",
        keywords: ["preferences", "defaults", "fees", "tax"],
        onSelect: () => setIsSettingsOpen(true),
      },
      {
        id: "act-theme",
        label: theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
        group: "Actions",
        keywords: ["theme", "dark", "light", "appearance"],
        onSelect: toggleTheme,
      },
      { id: "act-signout", label: "Sign out", group: "Account", onSelect: logout },
    ];
    const deals: PaletteItem[] = savedDeals.map((deal) => ({
      id: `deal-${deal.id}`,
      label: deal.customerName || "Unnamed deal",
      detail: [deal.vehicle?.vehicle, deal.vehicle?.stock && `STK ${deal.vehicle.stock}`]
        .filter(Boolean)
        .join(" · "),
      group: "Saved deals",
      keywords: [deal.vehicle?.vin ?? "", deal.vehicle?.stock ?? "", deal.salespersonName ?? ""],
      onSelect: () => openDealInDesk(deal),
    }));
    const vehicles: PaletteItem[] = inventory.map((v, i) =>
      vehiclePaletteItem(v, i, { setSearchQuery, setFocusVin, navigate })
    );
    return [...screens, ...actions, ...deals, ...vehicles];
  }, [
    navigate,
    savedDeals,
    inventory,
    lenderProfiles.length,
    isSuperAdmin,
    isDealerAdmin,
    theme,
    toggleTheme,
    openAiUpload,
    openDealInDesk,
    setSearchQuery,
    setFocusVin,
  ]);

  return (
    <div
      style={{
        position: "relative",
        zIndex: 1,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--font-sans)",
        color: "var(--color-text)",
      }}
    >
      {/* Skip navigation for accessibility */}
      <SkipNavLink />

      <AnnouncementBanner />

      {!isOnline && (
        <div
          role="status"
          className="sticky top-0 z-[70] bg-[var(--color-warning-subtle)] text-[var(--color-warning)] border-b border-[var(--color-warning)]/30 px-4 py-2 text-sm font-medium text-center"
        >
          Working offline — your edits stay on this device and saves will fail until the connection
          returns.
        </div>
      )}

      {/* TOP NAV — mockup lines 141-177 */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 30,
          background: "var(--color-bg)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div
          className="app-shell-topbar"
          style={{ height: 54, display: "flex", alignItems: "center", gap: 12, padding: "0 20px" }}
        >
          <div
            className="app-shell-brand"
            style={{ display: "flex", alignItems: "center", gap: 10 }}
          >
            <GaugeMark size={30} radius={9} />
            <span
              className="app-shell-wordmark"
              style={{
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: 0,
                whiteSpace: "nowrap",
              }}
            >
              LTV Desking <span style={{ color: "var(--color-primary)" }}>PRO</span>
            </span>
          </div>
          <div
            className="app-shell-divider"
            style={{ height: 22, width: 1, background: "var(--color-border)" }}
          />

          {isSuperAdmin ? (
            dealersError ? (
              <div
                className="app-shell-dealer"
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <span
                  role="alert"
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--color-danger)",
                    whiteSpace: "nowrap",
                  }}
                >
                  Couldn't load dealers
                </span>
                <button
                  onClick={() => setDealersFetchNonce((n) => n + 1)}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--color-border-strong)",
                    borderRadius: 8,
                    padding: "5px 10px",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--color-text)",
                    fontFamily: "inherit",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  Retry
                </button>
              </div>
            ) : (
              <select
                aria-label="Active dealership"
                className="dc-input app-shell-dealer"
                value={overrideId ?? ""}
                onChange={(e) => handleDealerSwitch(e.target.value)}
                disabled={dealers.length === 0}
                style={{
                  background: "var(--color-bg-subtle)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  padding: "6px 11px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--color-text)",
                  fontFamily: "inherit",
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                {dealers.length === 0 ? (
                  <option value="">Loading dealers…</option>
                ) : (
                  dealers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))
                )}
              </select>
            )
          ) : (
            <span
              className="app-shell-dealer"
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--color-text)",
                padding: "6px 0",
                whiteSpace: "nowrap",
              }}
            >
              {dealerName || "—"}
            </span>
          )}

          <div className="app-shell-spacer" style={{ flex: 1 }} />

          {isSuperAdmin && overrideId && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "var(--color-warning-subtle)",
                borderRadius: 8,
                padding: "5px 10px",
              }}
              title={`Superadmin is impersonating ${impersonatedDealer?.name ?? "a dealership"}`}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--color-warning)",
                  display: "inline-block",
                }}
                aria-hidden
              />
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--color-text)",
                  whiteSpace: "nowrap",
                }}
              >
                Impersonating
              </span>
              <button
                onClick={handleExitImpersonation}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--color-warning)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  padding: "0 0 0 2px",
                  transition: "opacity 120ms",
                }}
              >
                Exit
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={openPalette}
            className="rail-btn app-shell-secondary-action"
            aria-label="Search and commands"
            aria-keyshortcuts="Meta+K Control+K"
            title="Search and commands (⌘K)"
            style={railBtnStyle}
          >
            <SearchIcon />
          </button>

          <button
            onClick={openAiUpload}
            className="app-shell-ai-btn"
            aria-label="AI lender upload"
            title="AI lender upload"
            // Background + hover live in index.css (.app-shell-ai-btn) so the
            // hover state is plain CSS instead of JS style mutation.
            style={{
              color: "var(--on-primary, white)",
              border: "1px solid transparent",
              borderRadius: 6,
              padding: "7px 12px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: 7,
              whiteSpace: "nowrap",
            }}
          >
            <SparkleIcon />
            <span className="app-shell-ai-label">AI Lender Upload</span>
          </button>

          <button
            onClick={toggleTheme}
            className="rail-btn"
            aria-label="Toggle theme"
            style={railBtnStyle}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="rail-btn app-shell-secondary-action"
            aria-label="Settings"
            style={railBtnStyle}
          >
            <GearIcon />
          </button>

          <button
            onClick={() => navigate("/tools")}
            className="rail-btn app-shell-secondary-action"
            title="Finance tools"
            aria-label="Finance tools"
            style={railBtnStyle}
          >
            <WrenchIcon />
          </button>

          <div ref={menuRef} style={{ position: "relative", flexShrink: 0 }}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="rail-btn"
              title="Account"
              aria-label="Account menu"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                background: "var(--color-primary-subtle)",
                color: "var(--color-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                ...mono,
                border: "none",
                cursor: "pointer",
              }}
            >
              {initials}
            </button>
            {menuOpen && (
              <div
                role="menu"
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 8px)",
                  minWidth: 180,
                  background: "var(--color-bg)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-lg)",
                  boxShadow: "var(--shadow-md)",
                  padding: 6,
                  zIndex: 50,
                }}
              >
                {/* Touch entry point for the command palette: the ⌘K header
                    button hides at phone widths (.app-shell-secondary-action),
                    so the avatar menu is the only remaining path to it there. */}
                <button
                  role="menuitem"
                  className="rail-btn"
                  style={menuItemStyle}
                  onClick={() => {
                    setMenuOpen(false);
                    openPalette();
                  }}
                >
                  <SearchIcon />
                  Search
                </button>
                {(isSuperAdmin || isDealerAdmin) && (
                  <button
                    role="menuitem"
                    className="rail-btn"
                    style={menuItemStyle}
                    onClick={() => {
                      setMenuOpen(false);
                      navigate("/admin");
                    }}
                  >
                    <ShieldIcon />
                    {isSuperAdmin ? "Owner Console" : "Admin"}
                  </button>
                )}
                <button
                  role="menuitem"
                  className="rail-btn"
                  style={menuItemStyle}
                  onClick={() => {
                    setMenuOpen(false);
                    setIsSettingsOpen(true);
                  }}
                >
                  <GearIcon />
                  Settings
                </button>
                <button
                  role="menuitem"
                  className="rail-btn"
                  style={menuItemStyle}
                  onClick={() => {
                    setMenuOpen(false);
                    navigate("/tools");
                  }}
                >
                  <WrenchIcon />
                  Finance tools
                </button>
                <button
                  role="menuitem"
                  className="rail-btn"
                  style={menuItemStyle}
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <path d="M16 17l5-5-5-5M21 12H9" />
                  </svg>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>

        <nav
          aria-label="Primary"
          className="app-shell-nav"
          style={{ display: "flex", alignItems: "center", gap: 2, padding: "0 14px" }}
        >
          <NavLink to="/desk" className="tab-btn" style={({ isActive }) => tabStyle(isActive)}>
            The Desk
          </NavLink>
          <NavLink to="/pipeline" className="tab-btn" style={({ isActive }) => tabStyle(isActive)}>
            Pipeline
            <CountChip count={savedDeals.length} />
          </NavLink>
          <NavLink to="/inventory" className="tab-btn" style={({ isActive }) => tabStyle(isActive)}>
            Inventory
            <CountChip count={inventory.length} />
          </NavLink>
          <NavLink to="/lenders" className="tab-btn" style={({ isActive }) => tabStyle(isActive)}>
            Lenders
            <CountChip count={lenderProfiles.length} />
          </NavLink>
          <NavLink to="/reports" className="tab-btn" style={({ isActive }) => tabStyle(isActive)}>
            Reports
          </NavLink>
          <div className="app-shell-spacer" style={{ flex: 1 }} />
          {(isSuperAdmin || isDealerAdmin) && (
            <NavLink to="/admin" className="tab-btn" style={({ isActive }) => tabStyle(isActive)}>
              <ShieldIcon />
              {isSuperAdmin ? "Owner Console" : "Admin"}
            </NavLink>
          )}
        </nav>
      </header>

      {/* MAIN — routed screens */}
      <main id="main-content" tabIndex={-1} style={{ flex: 1, minWidth: 0, outline: "none" }}>
        {dataError ? (
          <div style={{ padding: "20px 24px" }}>
            <DataError
              title="Couldn't load your data"
              description={dataError}
              onRetry={refetchData}
            />
          </div>
        ) : dataLoading ? (
          <div style={{ padding: "20px 24px" }}>
            <SkeletonRows rows={8} label="Loading your dealership data" />
          </div>
        ) : (
          <>
            {location.pathname === "/desk" && (
              <GettingStarted
                dealerId={overrideId ?? currentUser?.dealer ?? "default"}
                inventoryCount={inventory.length}
                lenderCount={lenderProfiles.length}
                savedDealCount={savedDeals.length}
                canManageSetup={isSuperAdmin || isDealerAdmin}
                onImportInventory={() => navigate("/inventory")}
                onAddLenders={openAiUpload}
                onDeskDeal={() => document.getElementById("desk-search")?.focus()}
              />
            )}
            <Outlet context={outletContext} />
          </>
        )}
      </main>

      {/* Modals (moved from legacy MainLayout) — wrapped for lazy */}
      {/* Each heavy modal gets its own boundary so a crash inside Settings or the
          AI importer closes that dialog instead of taking the whole desk down. */}
      <SectionErrorBoundary label="Settings" onReset={() => setIsSettingsOpen(false)}>
        <Suspense fallback={null}>
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            settings={settings}
            onSave={setSettings}
          />
        </Suspense>
      </SectionErrorBoundary>

      <SectionErrorBoundary label="AI Lender Upload" onReset={() => setIsAiModalOpen(false)}>
        <Suspense fallback={null}>
          <AiLenderManagerModal
            isOpen={isAiModalOpen && !isAiMinimized}
            onClose={() => setIsAiModalOpen(false)}
            currentProfiles={lenderProfiles}
            onUpdateProfiles={setLenderProfiles}
            onMinimize={() => setIsAiMinimized(true)}
            isMinimized={isAiMinimized}
            settings={settings}
            onProgress={(progress, stage) => setAiUploadProgress({ progress, stage })}
          />
        </Suspense>
      </SectionErrorBoundary>

      <CommandPalette open={paletteOpen} onClose={closePalette} items={paletteItems} />

      {/* Visible only while the importer is open and minimized. */}
      <BackgroundUploadIndicator
        isProcessing={isAiModalOpen}
        isMinimized={isAiMinimized}
        overallProgress={aiUploadProgress.progress}
        currentStage={aiUploadProgress.stage}
        onRestore={() => setIsAiMinimized(false)}
      />
    </div>
  );
};

export default AppShell;
