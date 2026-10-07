import React, { useEffect, useState } from "react";
import Button from "../common/Button";
import { useLocalStorage } from "../../hooks/useLocalStorage";

export interface GettingStartedProps {
  /** Scopes the dismissal so hiding it for one dealer never hides it for another. */
  dealerId: string;
  inventoryCount: number;
  lenderCount: number;
  savedDealCount: number;
  /**
   * Whether this user can perform dealership setup actions — import
   * inventory (Inventory screen is admin-gated) and upload lender programs
   * (lender_profiles createRule is SAME_DEALER_ADMIN_CREATE) — i.e.
   * superadmin or dealer admin. Required rather than defaulted: a caller
   * that forgets to pass it should fail closed (no admin-only action shown),
   * not fail open to every role.
   */
  canManageSetup: boolean;
  onImportInventory: () => void;
  onAddLenders: () => void;
  onDeskDeal: () => void;
}

interface Step {
  id: string;
  title: string;
  body: string;
  done: boolean;
  action?: string;
  onAction?: () => void;
}

const CheckGlyph: React.FC<{ done: boolean }> = ({ done }) => (
  <span
    aria-hidden="true"
    style={{
      width: 22,
      height: 22,
      borderRadius: "50%",
      flexShrink: 0,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      border: done ? "none" : "1.5px solid var(--color-border-strong)",
      background: done ? "var(--color-primary)" : "transparent",
      color: "var(--on-primary, white)",
    }}
  >
    {done && (
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    )}
  </span>
);

/** Below this width the checklist starts as a one-line strip so it never pushes the desk down. */
const COMPACT_QUERY = "(max-width: 1199px)";

const useIsCompact = (): boolean => {
  const [compact, setCompact] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(COMPACT_QUERY).matches
      : false
  );
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(COMPACT_QUERY);
    const sync = () => setCompact(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);
  return compact;
};

/**
 * First-run activation checklist. A new dealership lands on an empty desk and
 * has no idea what to do first; this card turns the three setup steps into
 * one-click actions and disappears once they're done (or when the user hides
 * it — remembered per dealer). [takeover: activation]
 */
export const GettingStarted: React.FC<GettingStartedProps> = ({
  dealerId,
  inventoryCount,
  lenderCount,
  savedDealCount,
  canManageSetup,
  onImportInventory,
  onAddLenders,
  onDeskDeal,
}) => {
  const [dismissed, setDismissed] = useLocalStorage<boolean>(
    `ltv.gettingStarted.dismissed.${dealerId}`,
    false
  );
  // At tablet/phone widths the card defaults to a one-line strip the user can
  // expand; on wide screens it is always open. [R24]
  const isCompact = useIsCompact();
  const [expanded, setExpanded] = useState(false);

  const steps: Step[] = [
    {
      id: "inventory",
      title: "Import your inventory",
      body: canManageSetup
        ? "Upload the CSV your DMS exports — vAuto, DealerSocket, CDK and Frazer headers are recognized automatically."
        : "Ask your admin to import inventory.",
      done: inventoryCount > 0,
      ...(canManageSetup ? { action: "Import inventory", onAction: onImportInventory } : {}),
    },
    {
      id: "lenders",
      title: "Load your lender programs",
      body: canManageSetup
        ? "Drop in a rate sheet and the AI importer drafts the tiers. You review every number before it's saved."
        : "Ask your admin to load lender programs.",
      done: lenderCount > 0,
      ...(canManageSetup ? { action: "Upload a rate sheet", onAction: onAddLenders } : {}),
    },
    {
      id: "deal",
      title: "Desk and save your first deal",
      body: "Pick a unit, set the terms, and save it to the pipeline.",
      done: savedDealCount > 0,
      action: "Search inventory",
      onAction: onDeskDeal,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  if (dismissed || doneCount === steps.length) return null;
  const pct = Math.round((doneCount / steps.length) * 100);

  // Someone who can't import inventory or load lenders only needs the step they
  // can actually take; the admin-only steps are noise for them. [R24]
  const visibleSteps = canManageSetup ? steps : steps.filter((s) => !s.done && s.onAction);
  if (visibleSteps.length === 0) return null;
  const adminStepsPending = !canManageSetup && steps.some((s) => !s.done && !s.onAction);
  const collapsed = isCompact && !expanded;

  // One tree for both states: the header row, and the toggle button inside it,
  // stay mounted at the same position, so keyboard focus survives expanding and
  // collapsing. Only the count, the dismiss button and the body come and go. [R24]
  return (
    <section
      aria-labelledby="getting-started-title"
      className="getting-started-card"
      style={
        collapsed
          ? {
              margin: "12px 16px 0",
              background: "var(--color-bg)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "6px 8px 6px 14px",
            }
          : {
              margin: "16px 16px 0",
              background: "var(--color-bg)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow)",
              padding: "16px 18px",
            }
      }
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: collapsed ? 10 : 12,
          flexWrap: collapsed ? "nowrap" : "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2
            id="getting-started-title"
            style={
              collapsed
                ? {
                    margin: 0,
                    fontSize: 13,
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }
                : { fontSize: 15, fontWeight: 700, margin: 0 }
            }
          >
            Set up your dealership
          </h2>
          {!collapsed && (
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--color-text-muted)" }}>
              {doneCount} of {steps.length} done —{" "}
              {adminStepsPending
                ? "your admin is finishing the rest of setup."
                : "about ten minutes to a fully working desk."}
            </p>
          )}
        </div>
        {collapsed && (
          <span
            style={{
              fontSize: 13,
              color: "var(--color-text-muted)",
              whiteSpace: "nowrap",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {doneCount} of {steps.length} done
          </span>
        )}
        {isCompact && (
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={!collapsed}
            onClick={() => setExpanded(collapsed)}
          >
            {collapsed ? "Show steps" : "Hide steps"}
          </Button>
        )}
        {!collapsed && (
          <Button
            variant="ghost"
            size="sm"
            aria-label="Hide setup card"
            onClick={() => setDismissed(true)}
          >
            Hide
          </Button>
        )}
      </div>

      {!collapsed && (
        <>
          <div
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={0}
            aria-valuemax={steps.length}
            aria-valuenow={doneCount}
            style={{
              height: 4,
              borderRadius: 2,
              background: "var(--color-bg-muted)",
              margin: "12px 0 14px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: "100%",
                background: "var(--color-primary)",
                transition: "width var(--duration-fast, 150ms) ease",
              }}
            />
          </div>

          <ol
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            }}
          >
            {visibleSteps.map((s) => (
              <li key={s.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <CheckGlyph done={s.done} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      textDecoration: s.done ? "line-through" : "none",
                      color: s.done ? "var(--color-text-muted)" : "var(--color-text)",
                    }}
                  >
                    <span className="sr-only">
                      {s.done ? "Done: " : `Step ${steps.indexOf(s) + 1}: `}
                    </span>
                    {s.title}
                  </div>
                  <p
                    style={{
                      margin: "2px 0 8px",
                      fontSize: 12,
                      color: "var(--color-text-muted)",
                      lineHeight: 1.45,
                    }}
                  >
                    {s.body}
                  </p>
                  {!s.done && s.action && s.onAction && (
                    <Button variant="secondary" size="sm" onClick={s.onAction}>
                      {s.action}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
};

export default GettingStarted;
