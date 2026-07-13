import React, { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCurrentUser, type User, type Dealer } from "../../lib/pocketbase";
import { ConsoleHeader, ConsoleTab, RefreshBar } from "./panels/OwnerPanels";
import { getSystemStats, getAllDealers, getAllUsers, type SystemStats } from "../../lib/api";
import { logout } from "../../lib/auth";
import * as Icons from "../common/Icons";
import { DealersPanel } from "./panels/DealersPanel";
import { CreateDealerWizard } from "./panels/CreateDealerWizard";
import { UsersPanel } from "./panels/UsersPanel";
import { SystemSettingsPanel } from "./panels/SystemSettingsPanel";
import { OverviewPanel } from "./panels/OverviewPanel";
import { queryClient, queryKeys } from "../../lib/queryClient";

interface SuperAdminDashboardProps {
  onSwitchToDealer?: () => void;
  onImpersonate?: (dealerId: string) => void;
}

const EMPTY_STATS: SystemStats = {
  totalDealers: 0,
  activeDealers: 0,
  totalUsers: 0,
  totalDeals: 0,
  totalInventory: 0,
};

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({
  onSwitchToDealer,
  onImpersonate,
}) => {
  const [activeTab, setActiveTab] = useState<"overview" | "dealers" | "users" | "settings">(
    "overview"
  );
  const [showOnboard, setShowOnboard] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const currentUser = getCurrentUser();

  const statsQuery = useQuery({
    queryKey: queryKeys.systemStats,
    queryFn: getSystemStats,
  });
  const dealersQuery = useQuery({
    queryKey: queryKeys.dealers,
    queryFn: getAllDealers,
  });
  const usersQuery = useQuery({
    queryKey: queryKeys.users,
    queryFn: getAllUsers,
  });

  const stats = statsQuery.data ?? EMPTY_STATS;
  const dealers = dealersQuery.data ?? [];
  const users = usersQuery.data ?? [];
  const isLoading = statsQuery.isLoading || dealersQuery.isLoading || usersQuery.isLoading;
  const isRefreshing =
    !isLoading && (statsQuery.isFetching || dealersQuery.isFetching || usersQuery.isFetching);

  useEffect(() => {
    if (statsQuery.isSuccess && dealersQuery.isSuccess && usersQuery.isSuccess) {
      setLastUpdated(new Date());
    }
  }, [
    statsQuery.isSuccess,
    dealersQuery.isSuccess,
    usersQuery.isSuccess,
    statsQuery.dataUpdatedAt,
    dealersQuery.dataUpdatedAt,
    usersQuery.dataUpdatedAt,
  ]);

  const loadData = useCallback(async (_isRefresh = false) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.systemStats }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dealers }),
      queryClient.invalidateQueries({ queryKey: queryKeys.users }),
    ]);
  }, []);

  const refreshBar = useMemo(
    () => (
      <RefreshBar
        loading={isRefreshing}
        lastUpdated={lastUpdated}
        onRefresh={() => loadData(true)}
      />
    ),
    [isRefreshing, lastUpdated, loadData]
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center">
        <Icons.SpinnerIcon className="w-8 h-8 text-[var(--color-primary)] animate-spin" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen text-[var(--color-text)]"
      style={{ background: "var(--color-bg-subtle)", fontFamily: "var(--font-sans)" }}
    >
      <ConsoleHeader
        label="OWNER CONSOLE"
        title={
          `${currentUser?.firstName ?? ""} ${currentUser?.lastName ?? ""}`.trim() ||
          currentUser?.email ||
          "—"
        }
        sub={currentUser?.role === "superadmin" ? "Superadmin" : "Admin"}
        right={
          <>
            {onSwitchToDealer && (
              <button
                onClick={onSwitchToDealer}
                className="transition-colors"
                style={{
                  background: "transparent",
                  border: "1px solid var(--color-border-strong)",
                  color: "var(--color-text)",
                  borderRadius: 8,
                  padding: "8px 13px",
                  fontSize: 13.5,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Dealer view
              </button>
            )}
            <button
              onClick={() => setShowOnboard(true)}
              className="transition-colors btn-primary"
              style={{
                border: "1px solid transparent",
                borderRadius: 8,
                padding: "8px 13px",
                fontSize: 13.5,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                gap: 7,
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              Onboard new dealer
            </button>
            <button
              onClick={logout}
              className="rail-btn"
              style={{
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
              }}
              title="Sign out"
              aria-label="Sign out"
            >
              <Icons.ArrowRightStartOnRectangleIcon className="w-4 h-4" />
            </button>
          </>
        }
      />

      <div
        style={{
          padding: "0 24px",
          background: "var(--color-bg)",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <ConsoleTab
          active={activeTab === "overview"}
          onClick={() => setActiveTab("overview")}
          label="Overview"
        />
        <ConsoleTab
          active={activeTab === "dealers"}
          onClick={() => setActiveTab("dealers")}
          label="Dealers"
          badge={stats.totalDealers}
        />
        <ConsoleTab
          active={activeTab === "users"}
          onClick={() => setActiveTab("users")}
          label="Users"
          badge={stats.totalUsers}
        />
        <ConsoleTab
          active={activeTab === "settings"}
          onClick={() => setActiveTab("settings")}
          label="Settings"
        />
        <div style={{ marginLeft: "auto" }}>{refreshBar}</div>
      </div>

      {showOnboard && (
        <CreateDealerWizard
          onClose={() => setShowOnboard(false)}
          onCreated={() => {
            setShowOnboard(false);
            void loadData(true);
          }}
        />
      )}

      <div style={{ padding: 24 }}>
        {activeTab === "overview" && (
          <OverviewPanel
            stats={stats}
            dealers={dealers}
            users={users}
            onJumpTab={setActiveTab}
            onImpersonate={(id) => onImpersonate?.(id)}
            onOnboard={() => setShowOnboard(true)}
          />
        )}

        {activeTab === "dealers" && (
          <DealersPanel
            dealers={dealers}
            users={users}
            onRefresh={loadData}
            onImpersonate={(dealerId) => onImpersonate?.(dealerId)}
          />
        )}

        {activeTab === "users" && (
          <UsersPanel users={users} dealers={dealers} onRefresh={loadData} />
        )}

        {activeTab === "settings" && <SystemSettingsPanel />}
      </div>
    </div>
  );
};

export default SuperAdminDashboard;
