import React, { useState, useEffect } from "react";
import { collections, pb, type Dealer, type User } from "../../../lib/pocketbase";
import type { SystemStats } from "../../../lib/api";
import {
  KpiTile,
  StatTile,
  ListCard,
  PersonRow,
  ActivePill,
  RoleChip,
  initialsOf,
  panelCard,
  mono as adminMono,
} from "./OwnerPanels";
import { EmptyState } from "../../common/states";
import * as Icons from "../../common/Icons";

/**
 * OverviewPanel (extracted from SuperAdminDashboard.tsx)
 *
 * Cross-dealer KPI overview, pipeline stats (count-only), dealer performance grid,
 * quick actions and recent lists. Data fetching for counts remains local to this
 * panel (uses superadmin PB list rules for honest totals without full scans).
 * [P7 split]
 */

// ============================================
// Overview Panel
// ============================================

/**
 * Cross-dealer pipeline counts the data layer can answer honestly (count-only
 * getList queries — superadmin list rules allow them). Sums that would need a
 * full table scan (e.g. financed dollars) stay "—", never fabricated. [P7]
 */
interface PipelineCounts {
  funded: number;
  declined: number;
  approvedPlusFunded: number;
}

const dealerPerfGrid = "2fr 0.85fr 1.2fr 0.8fr 1.3fr 0.9fr";

const perfHeadCell: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.08em",
  ...adminMono,
  color: "var(--color-text-subtle)",
};

export interface OverviewPanelProps {
  stats: SystemStats;
  dealers: Dealer[];
  users: User[];
  onJumpTab: (tab: "overview" | "dealers" | "users" | "settings") => void;
  onImpersonate: (dealerId: string) => void;
  onOnboard: () => void;
}

export const OverviewPanel: React.FC<OverviewPanelProps> = ({
  stats,
  dealers,
  users,
  onJumpTab,
  onImpersonate,
  onOnboard,
}) => {
  const inactiveCount = Math.max(0, stats.totalDealers - stats.activeDealers);
  const usersByRole = users.reduce<Record<string, number>>((acc, u) => {
    acc[u.role] = (acc[u.role] ?? 0) + 1;
    return acc;
  }, {});

  const [pipeline, setPipeline] = useState<PipelineCounts | null>(null);
  const [perf, setPerf] = useState<Record<string, { units: number; deals: number }> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [funded, declined, approved] = await Promise.all([
          collections.savedDeals.getList(1, 1, { filter: 'status = "funded"' }),
          collections.savedDeals.getList(1, 1, {
            filter: 'status = "declined" || status = "cancelled"',
          }),
          collections.savedDeals.getList(1, 1, {
            filter: 'status = "approved" || status = "funded"',
          }),
        ]);
        if (!cancelled) {
          setPipeline({
            funded: funded.totalItems,
            declined: declined.totalItems,
            approvedPlusFunded: approved.totalItems,
          });
        }
      } catch {
        /* leave null → rendered as "—" */
      }
    })();
    (async () => {
      try {
        // Per-dealer count queries (2 per dealer, capped) — real numbers only.
        const targets = dealers.slice(0, 12);
        const rows = await Promise.all(
          targets.map(async (d) => {
            const [inv, deals] = await Promise.all([
              collections.inventory.getList(1, 1, {
                filter: pb.filter("dealer = {:d}", { d: d.id }),
              }),
              collections.savedDeals.getList(1, 1, {
                filter: pb.filter("dealer = {:d}", { d: d.id }),
              }),
            ]);
            return [d.id, { units: inv.totalItems, deals: deals.totalItems }] as const;
          })
        );
        if (!cancelled) setPerf(Object.fromEntries(rows));
      } catch {
        /* leave null → rendered as "—" */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dealers]);

  const approvalRate =
    pipeline && stats.totalDeals > 0
      ? Math.round((pipeline.approvedPlusFunded / stats.totalDeals) * 100)
      : null;

  const recentDealers = [...dealers]
    .sort((a, b) => (b.created || "").localeCompare(a.created || ""))
    .slice(0, 5);
  const recentUsers = [...users]
    .sort((a, b) => (b.created || "").localeCompare(a.created || ""))
    .slice(0, 5);

  return (
    <div className="animate-fadeIn" style={{ maxWidth: 1200 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 4px" }}>
          Overview
        </h1>
        <p style={{ fontSize: 14, color: "var(--color-text-muted)", margin: 0 }}>
          {stats.totalDealers.toLocaleString()} dealership{stats.totalDealers === 1 ? "" : "s"} ·{" "}
          {stats.totalUsers.toLocaleString()} user{stats.totalUsers === 1 ? "" : "s"} ·{" "}
          {stats.totalDeals.toLocaleString()} deal{stats.totalDeals === 1 ? "" : "s"} in pipeline
        </p>
      </div>

      {/* KPI tiles */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 14,
          marginBottom: 16,
        }}
      >
        <KpiTile
          label="Total dealers"
          value={stats.totalDealers.toLocaleString()}
          sub={inactiveCount > 0 ? `${inactiveCount} inactive` : "All active"}
          icon={<Icons.BuildingLibraryIcon className="w-4 h-4" />}
        />
        <KpiTile
          label="Active dealers"
          value={stats.activeDealers.toLocaleString()}
          sub={
            stats.totalDealers > 0
              ? `${Math.round((stats.activeDealers / stats.totalDealers) * 100)}% of total`
              : undefined
          }
          icon={<Icons.CheckCircleIcon className="w-4 h-4" />}
        />
        <KpiTile
          label="Total users"
          value={stats.totalUsers.toLocaleString()}
          sub={
            usersByRole.admin
              ? `${usersByRole.admin} admin · ${usersByRole.sales ?? 0} sales`
              : undefined
          }
          icon={<Icons.UserIcon className="w-4 h-4" />}
        />
        <KpiTile
          label="Total deals"
          value={stats.totalDeals.toLocaleString()}
          sub={
            stats.totalInventory > 0
              ? `${stats.totalInventory.toLocaleString()} in inventory`
              : undefined
          }
          icon={<Icons.ClipboardDocumentIcon className="w-4 h-4" />}
        />
      </div>

      {/* Pipeline stat cards — only real cross-dealer numbers, "—" otherwise */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 14,
          marginBottom: 16,
        }}
      >
        <StatTile label="Pipeline financed" value="—" />
        <StatTile
          label="Approval rate"
          value={approvalRate === null ? "—" : `${approvalRate}%`}
          color={approvalRate === null ? undefined : "var(--color-success)"}
        />
        <StatTile label="Working deals" value={stats.totalDeals.toLocaleString()} />
        <StatTile
          label="Funded"
          value={pipeline ? pipeline.funded.toLocaleString() : "—"}
          color={pipeline ? "var(--color-primary)" : undefined}
        />
      </div>

      {/* Dealer performance */}
      <div className="dc-card" style={{ ...panelCard, overflow: "hidden", marginBottom: 16 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: dealerPerfGrid,
            columnGap: 14,
            alignItems: "center",
            padding: "11px 18px",
            background: "var(--color-bg-subtle)",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <span style={perfHeadCell}>Dealer</span>
          <span style={{ ...perfHeadCell, textAlign: "right" }}>Units</span>
          <span style={{ ...perfHeadCell, textAlign: "right" }}>Avg approval</span>
          <span style={{ ...perfHeadCell, textAlign: "right" }}>Deals</span>
          <span style={{ ...perfHeadCell, textAlign: "right" }}>Inventory value</span>
          <span style={{ ...perfHeadCell, textAlign: "right" }}>Status</span>
        </div>
        {dealers.length === 0 && (
          <div
            style={{
              padding: "30px 18px",
              textAlign: "center",
              fontSize: 13,
              color: "var(--color-text-muted)",
            }}
          >
            No dealerships yet — onboard your first dealer to get started.
          </div>
        )}
        {dealers.map((dealer) => {
          const p = perf?.[dealer.id];
          return (
            <div
              key={dealer.id}
              className="inv-row"
              role="button"
              tabIndex={0}
              title={dealer.active ? "View as this dealership" : "Dealer is inactive"}
              onClick={() => dealer.active && onImpersonate(dealer.id)}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && dealer.active) {
                  e.preventDefault();
                  onImpersonate(dealer.id);
                }
              }}
              style={{
                display: "grid",
                gridTemplateColumns: dealerPerfGrid,
                columnGap: 14,
                alignItems: "center",
                padding: "13px 18px",
                borderBottom: "1px solid var(--color-border)",
                cursor: dealer.active ? "pointer" : "default",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    background: "var(--color-bg-muted)",
                    color: "var(--color-text-muted)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    ...adminMono,
                    flexShrink: 0,
                  }}
                >
                  {dealer.code?.slice(0, 2) || dealer.name.slice(0, 2).toUpperCase()}
                </div>
                <span
                  style={{
                    fontSize: 14.5,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {dealer.name}
                </span>
              </div>
              <span style={{ fontSize: 14, textAlign: "right", ...adminMono }}>
                {p ? p.units.toLocaleString() : "—"}
              </span>
              <span
                style={{
                  fontSize: 14,
                  textAlign: "right",
                  ...adminMono,
                  color: "var(--color-text-subtle)",
                }}
                title="Approval scoring runs inside a dealer context"
              >
                —
              </span>
              <span
                style={{
                  fontSize: 14,
                  textAlign: "right",
                  ...adminMono,
                  color: "var(--color-text-muted)",
                }}
              >
                {p ? p.deals.toLocaleString() : "—"}
              </span>
              <span
                style={{
                  fontSize: 14,
                  textAlign: "right",
                  ...adminMono,
                  color: "var(--color-text-subtle)",
                }}
              >
                —
              </span>
              <span style={{ textAlign: "right" }}>
                {dealer.active ? (
                  <ActivePill />
                ) : (
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      background: "var(--color-bg-muted)",
                      color: "var(--color-text-muted)",
                      padding: "4px 9px",
                      borderRadius: 6,
                    }}
                  >
                    Inactive
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* Quick actions */}
      <div className="dc-card" style={{ ...panelCard, padding: 17, marginBottom: 16 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.1em",
            ...adminMono,
            color: "var(--color-text-subtle)",
            marginBottom: 13,
          }}
        >
          QUICK ACTIONS
        </div>
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
          <button
            onClick={onOnboard}
            className="transition-colors btn-primary"
            style={{
              border: "1px solid transparent",
              borderRadius: 9,
              padding: "9px 15px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <Icons.PlusIcon className="w-4 h-4" /> Onboard new dealer
          </button>
          <button
            onClick={() => onJumpTab("users")}
            className="transition-colors"
            style={{
              background: "transparent",
              border: "1px solid var(--color-border-strong)",
              color: "var(--color-text)",
              borderRadius: 9,
              padding: "9px 15px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <Icons.UserIcon className="w-4 h-4" /> Manage users
          </button>
          <button
            onClick={() => onJumpTab("settings")}
            className="transition-colors"
            style={{
              background: "transparent",
              border: "1px solid var(--color-border-strong)",
              color: "var(--color-text)",
              borderRadius: 9,
              padding: "9px 15px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <Icons.Cog6ToothIcon className="w-4 h-4" /> System settings
          </button>
        </div>
      </div>

      {/* Recent dealers + Recent users */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <ListCard title="Recent dealers" onViewAll={() => onJumpTab("dealers")}>
          {recentDealers.length === 0 ? (
            <EmptyState
              icon={<Icons.BuildingLibraryIcon className="w-5 h-5" />}
              title="No dealers yet"
              description="Onboard your first dealership to get started."
            />
          ) : (
            recentDealers.map((dealer) => (
              <PersonRow
                key={dealer.id}
                initials={dealer.code?.slice(0, 2) || dealer.name.slice(0, 2).toUpperCase()}
                title={dealer.name}
                sub={
                  <span style={adminMono}>
                    {dealer.code}
                    {dealer.city
                      ? ` · ${dealer.city}${dealer.state ? `, ${dealer.state}` : ""}`
                      : ""}
                  </span>
                }
                right={
                  dealer.active ? (
                    <ActivePill />
                  ) : (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        background: "var(--color-bg-muted)",
                        color: "var(--color-text-muted)",
                        padding: "4px 9px",
                        borderRadius: 6,
                      }}
                    >
                      Inactive
                    </span>
                  )
                }
              />
            ))
          )}
        </ListCard>
        <ListCard title="Recent users" onViewAll={() => onJumpTab("users")}>
          {recentUsers.length === 0 ? (
            <EmptyState
              icon={<Icons.UserIcon className="w-5 h-5" />}
              title="No users yet"
              description="Users will appear here as they are added to dealerships."
            />
          ) : (
            recentUsers.map((user) => (
              <PersonRow
                key={user.id}
                compact
                highlight={user.role === "superadmin"}
                initials={initialsOf(user.firstName, user.lastName, user.email)}
                title={`${user.firstName} ${user.lastName}`.trim() || user.email}
                sub={user.email}
                right={<RoleChip role={user.role} />}
              />
            ))
          )}
        </ListCard>
      </div>
    </div>
  );
};

export default OverviewPanel;
