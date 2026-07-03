import React, { useState, useEffect, lazy, Suspense } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useOutletContext,
  useSearchParams,
} from "react-router-dom";
import {
  isAuthenticated,
  onAuthStateChange,
  getCurrentUser,
  refreshSession,
} from "./lib/auth";
import { setSuperadminDealerOverride, getSuperadminDealerOverride } from "./lib/pocketbase";
import { identify } from "./lib/analytics";
import { OwnerLogin } from "./components/auth/OwnerLogin";
import { Login } from "./components/auth/Login";
import { Register } from "./components/auth/Register";
import { AuthLayout } from "./components/auth/AuthLayout";
import { DealProvider, useDealContext } from "./context/DealContext";
import * as Icons from "./components/common/Icons";
import { Toast } from "./components/common/Toast";
import { ConfirmDialog } from "./components/common/ConfirmDialog";
import { DataLoading } from "./components/common/states";
import { toast } from "./lib/toast";
import AppShell, { type ShellOutletContext } from "./components/shell/AppShell";
import DeskScreen from "./components/desk/DeskScreen";
import InventoryScreen from "./components/screens/InventoryScreen";
import PipelineScreen from "./components/screens/PipelineScreen";
import LendersScreen from "./components/screens/LendersScreen";
import ReportsScreen from "./components/screens/ReportsScreen";
// Code-split the heavy, conditionally-rendered surfaces so a salesperson on the
// default route never downloads the admin dashboards (~3,200 lines), the legal
// pages, or recharts (via FinanceTools) on first paint. [perf]
const PrivacyPolicy = lazy(() => import("./components/legal/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./components/legal/TermsOfService"));
const FinanceTools = lazy(() => import("./components/FinanceTools"));
const SuperAdminDashboard = lazy(() =>
  import("./components/admin/SuperAdminDashboard").then((m) => ({ default: m.SuperAdminDashboard }))
);
const DealerAdminDashboard = lazy(() =>
  import("./components/admin/DealerAdminDashboard").then((m) => ({
    default: m.DealerAdminDashboard,
  }))
);

const PageFallback = (
  <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)]">
    <Icons.SpinnerIcon className="w-8 h-8 text-[var(--color-primary)] animate-spin" />
  </div>
);

/** Desk route — wires the shell-owned AI upload modal into DeskScreen. */
const DeskRoute: React.FC = () => {
  const { openAiUpload } = useOutletContext<ShellOutletContext>();
  return <DeskScreen onOpenAiUpload={openAiUpload} />;
};

/** Finance tools drawer route — the old "scratchpad" tab, now at /tools. */
const ToolsRoute: React.FC = () => {
  const { scratchPadNotes, setScratchPadNotes, dealData, activeVehicle } = useDealContext();
  return (
    <Suspense fallback={<DataLoading label="Loading tools…" />}>
      <FinanceTools
        scratchPadNotes={scratchPadNotes}
        setScratchPadNotes={setScratchPadNotes}
        dealData={dealData}
        activeVehicle={activeVehicle}
      />
    </Suspense>
  );
};

/**
 * Bridges pre-redesign bookmarks (`/?tab=…`) to the new routes so saved links
 * and muscle memory keep working. `?tab=inventory` (or none) lands on the desk.
 */
const LegacyTabRedirect: React.FC = () => {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get("tab");
  const to =
    tab === "lenders"
      ? "/lenders"
      : tab === "saved"
        ? "/pipeline"
        : tab === "scratchpad"
          ? "/tools"
          : "/desk";
  return <Navigate to={to} replace />;
};

const App: React.FC = () => {
  const [isAuth, setIsAuth] = useState(isAuthenticated());
  const [view, setView] = useState<"login" | "register">("login");
  const [isLoading, setIsLoading] = useState(true);
  const [, setImpersonationTick] = useState(0);

  // Persist viewMode in sessionStorage so it survives page reloads
  const [viewMode, setViewMode] = useState<"auto" | "dealer">(() => {
    const saved = sessionStorage.getItem("superadmin_view_mode");
    return saved === "dealer" ? "dealer" : "auto";
  });

  // Save viewMode to sessionStorage whenever it changes
  useEffect(() => {
    sessionStorage.setItem("superadmin_view_mode", viewMode);
  }, [viewMode]);

  const location = useLocation();
  const navigate = useNavigate();

  const currentUser = getCurrentUser();
  const isSuperAdmin = currentUser?.role === "superadmin";
  const isDealerAdmin = currentUser?.role === "admin";
  const isAdminRoute = location.pathname === "/admin" || location.pathname === "/owner";
  const isPublicRoute = location.pathname === "/privacy" || location.pathname === "/terms";

  useEffect(() => {
    setIsAuth(isAuthenticated());
    setIsLoading(false);

    const unsubscribe = onAuthStateChange((user) => {
      setIsAuth(!!user);
      if (user?.id) {
        identify(user.id, { role: user.role, dealer: user.dealer });
      }
    });

    // Keep the session alive: PB tokens hard-expire ~14 days after LOGIN (not
    // last use), which used to kill active users mid-deal with only a cryptic
    // "Failed to save". Refresh on boot and twice a day while open. [G65]
    void refreshSession();
    const refreshTimer = setInterval(() => void refreshSession(), 12 * 60 * 60 * 1000);

    // Global 401 broadcast from lib/pocketbase: show the login screen with an
    // explanation instead of a zombie "logged in" UI. The in-progress deal
    // survives in localStorage.
    const onSessionExpired = () => {
      setIsAuth(false);
      toast.warning("Your session expired. Sign in again — your in-progress deal is saved.");
    };
    window.addEventListener("sessionExpired", onSessionExpired);

    return () => {
      unsubscribe();
      clearInterval(refreshTimer);
      window.removeEventListener("sessionExpired", onSessionExpired);
    };
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      setImpersonationTick((n) => n + 1);
      // Exit-impersonation now lives in the AppShell pill; when the override is
      // cleared, fall back to console-first mode (the old handleExitImpersonation
      // reset viewMode the same way before navigating to /admin).
      if (!(e as CustomEvent<string | null>).detail) {
        setViewMode("auto");
      }
    };
    window.addEventListener("dealerOverrideChanged", handler);
    return () => window.removeEventListener("dealerOverrideChanged", handler);
  }, []);

  // Perform route redirects in an effect, not during render — calling navigate()
  // (a router state update) mid-render triggers React's "Cannot update a component
  // while rendering a different component" warning. The render branches below
  // return a neutral spinner (PageFallback) while these redirects settle.
  useEffect(() => {
    if (isLoading) return;
    if (isAdminRoute && isAuth && !isSuperAdmin && !isDealerAdmin) {
      // A sales/manager hit /admin — just send them to the dealer app. The old
      // logout() here ended their whole session and reloaded, destroying an
      // in-progress deal because of a mistyped URL. [C-auth]
      navigate("/desk", { replace: true });
    } else if (
      !isPublicRoute &&
      !isAdminRoute &&
      isAuth &&
      isSuperAdmin &&
      viewMode === "auto" &&
      !getSuperadminDealerOverride()
    ) {
      // Superadmin on a dealer route without an active impersonation defaults
      // to the Owner Console.
      navigate("/admin", { replace: true });
    }
  }, [
    isLoading,
    isAdminRoute,
    isPublicRoute,
    isAuth,
    isSuperAdmin,
    isDealerAdmin,
    viewMode,
    navigate,
  ]);

  if (isLoading) {
    return PageFallback;
  }

  // === OWNER (/admin) ELEMENT ===
  // OwnerLogin gate → SuperAdminDashboard (superadmin) / DealerAdminDashboard
  // (admin — the shell's "Admin" tab lands here). Sales/manager are redirected
  // by the effect above. DealProvider deliberately does NOT wrap this route.
  const adminElement = !isAuth ? (
    <OwnerLogin onSuccess={() => setIsAuth(true)} />
  ) : isSuperAdmin ? (
    <Suspense fallback={PageFallback}>
      <SuperAdminDashboard
        onSwitchToDealer={() => {
          setViewMode("dealer");
          navigate("/desk");
        }}
        onImpersonate={(dealerId) => {
          setSuperadminDealerOverride(dealerId);
          setViewMode("dealer");
          navigate("/desk");
        }}
      />
    </Suspense>
  ) : isDealerAdmin ? (
    <Suspense fallback={PageFallback}>
      <DealerAdminDashboard
        onSwitchToDealer={() => {
          setViewMode("dealer");
          navigate("/desk");
        }}
      />
    </Suspense>
  ) : (
    // Redirect handled by the effect above; render a neutral spinner meanwhile.
    PageFallback
  );

  // === DEALER SHELL (layout for all private dealer routes) ===
  // Unauthed users see the login/register card in place — the deep link is
  // preserved, so signing in lands them on the route they asked for.
  const dealerShellElement = !isAuth ? (
    <AuthLayout>
      {view === "login" ? (
        <Login onSuccess={() => setIsAuth(true)} onRegisterClick={() => setView("register")} />
      ) : (
        <Register onSuccess={() => setView("login")} onLoginClick={() => setView("login")} />
      )}
    </AuthLayout>
  ) : isSuperAdmin && viewMode === "auto" && !getSuperadminDealerOverride() ? (
    // Superadmin without an active impersonation defaults to /admin
    // (navigation performed by the redirect effect above).
    PageFallback
  ) : (
    <DealProvider>
      <AppShell />
    </DealProvider>
  );

  return (
    <>
      <Routes>
        {/* Public legal pages */}
        <Route
          path="/privacy"
          element={<Suspense fallback={PageFallback}>{<PrivacyPolicy />}</Suspense>}
        />
        <Route
          path="/terms"
          element={<Suspense fallback={PageFallback}>{<TermsOfService />}</Suspense>}
        />

        {/* Owner console */}
        <Route path="/admin" element={adminElement} />
        <Route path="/owner" element={<Navigate to="/admin" replace />} />

        {/* Authed dealer app — AppShell hosts the routed screens */}
        <Route element={dealerShellElement}>
          <Route path="/desk" element={<DeskRoute />} />
          <Route path="/pipeline" element={<PipelineScreen />} />
          <Route path="/inventory" element={<InventoryScreen />} />
          <Route path="/lenders" element={<LendersScreen />} />
          <Route path="/reports" element={<ReportsScreen />} />
          <Route path="/tools" element={<ToolsRoute />} />
          <Route path="/" element={<LegacyTabRedirect />} />
          <Route path="*" element={<Navigate to="/desk" replace />} />
        </Route>
      </Routes>

      {/* Global toast + confirm mounts (shared by dealer and admin surfaces) */}
      <Toast />
      <ConfirmDialog />
    </>
  );
};

export default App;
