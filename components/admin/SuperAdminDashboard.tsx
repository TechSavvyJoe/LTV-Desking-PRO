
import React, { useState, useEffect, useCallback } from "react";
import { getCurrentUser, User, Dealer } from "../../lib/pocketbase";
import {
  getSystemStats,
  getAllDealers,
  createDealerWithAdmin,
  updateDealer,
  deleteDealer,
  getAllUsers,
  createUser,
  updateUserRole,
  updateUser,
  deleteUser,
  getSystemSettings,
  updateSystemSettings,
  SystemStats,
  SystemSettings,
} from "../../lib/api";
import { logout } from "../../lib/auth";
import Button from "../common/Button";
import * as Icons from "../common/Icons";
import { confirmAction } from "../../lib/confirm";
import { useForceDarkMode } from "../../hooks/useForceDarkMode";

// ============================================
// Helper Components
// ============================================

type StatAccent = "blue" | "emerald" | "violet" | "amber";

const STAT_ACCENTS: Record<
  StatAccent,
  { stripe: string; iconBg: string; iconText: string; valueText: string }
> = {
  blue: {
    stripe: "from-blue-500/0 via-blue-500 to-blue-500/0",
    iconBg: "bg-blue-500/10 ring-1 ring-blue-500/30",
    iconText: "text-blue-300",
    valueText: "text-white",
  },
  emerald: {
    stripe: "from-emerald-500/0 via-emerald-500 to-emerald-500/0",
    iconBg: "bg-emerald-500/10 ring-1 ring-emerald-500/30",
    iconText: "text-emerald-300",
    valueText: "text-white",
  },
  violet: {
    stripe: "from-violet-500/0 via-violet-500 to-violet-500/0",
    iconBg: "bg-violet-500/10 ring-1 ring-violet-500/30",
    iconText: "text-violet-300",
    valueText: "text-white",
  },
  amber: {
    stripe: "from-amber-500/0 via-amber-500 to-amber-500/0",
    iconBg: "bg-amber-500/10 ring-1 ring-amber-500/30",
    iconText: "text-amber-300",
    valueText: "text-white",
  },
};

const StatCard: React.FC<{
  label: string;
  value: number;
  hint?: string;
  icon: React.ReactNode;
  accent: StatAccent;
}> = ({ label, value, hint, icon, accent }) => {
  const a = STAT_ACCENTS[accent];
  return (
    <div className="relative overflow-hidden bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg hover:border-slate-700 transition-colors">
      <div
        className={`absolute top-0 left-4 right-4 h-px bg-gradient-to-r ${a.stripe}`}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
          <p className={`text-3xl font-semibold mt-2 tabular-nums tracking-tight ${a.valueText}`}>
            {value.toLocaleString()}
          </p>
          <p className={`text-xs mt-1 ${hint ? "text-slate-400" : "invisible select-none"}`}>
            {hint || "·"}
          </p>
        </div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${a.iconBg}`}>
          <span className={a.iconText}>{icon}</span>
        </div>
      </div>
    </div>
  );
};

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}> = ({ active, onClick, icon, label, badge }) => (
  <button
    onClick={onClick}
    className={`relative flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
      active
        ? "bg-slate-800 text-white shadow-sm ring-1 ring-slate-700"
        : "text-slate-300 hover:text-white hover:bg-slate-800/60"
    }`}
  >
    <span className={active ? "text-blue-400" : "text-slate-400"}>{icon}</span>
    <span>{label}</span>
    {typeof badge === "number" && (
      <span
        className={`px-1.5 py-0.5 text-[11px] font-semibold tabular-nums rounded-full ${
          active ? "bg-blue-500/25 text-blue-200" : "bg-slate-700 text-slate-200"
        }`}
      >
        {badge}
      </span>
    )}
    {active && (
      <span
        className="absolute -bottom-px left-3 right-3 h-px bg-gradient-to-r from-transparent via-blue-400 to-transparent"
        aria-hidden
      />
    )}
  </button>
);

const SearchInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}> = ({ value, onChange, placeholder = "Search…", autoFocus }) => (
  <div className="relative">
    <Icons.MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className="pl-9 pr-3 py-2 w-full sm:w-64 bg-slate-800/80 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
    />
    {value && (
      <button
        onClick={() => onChange("")}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-200"
        aria-label="Clear"
        type="button"
      >
        <Icons.XMarkIcon className="w-4 h-4" />
      </button>
    )}
  </div>
);

const SortHeader: React.FC<{
  label: string;
  field: string;
  current: { field: string; dir: "asc" | "desc" };
  onSort: (field: string) => void;
  align?: "left" | "center" | "right";
  className?: string;
}> = ({ label, field, current, onSort, align = "left", className = "" }) => {
  const isActive = current.field === field;
  return (
    <th
      className={`px-4 py-3 text-${align} text-xs font-semibold text-slate-200 uppercase tracking-wider ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 hover:text-white focus:outline-none ${
          isActive ? "text-white" : ""
        }`}
      >
        {label}
        <span className={isActive ? "text-blue-300" : "text-slate-400"}>
          {isActive ? (current.dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
};

const RefreshBar: React.FC<{
  loading: boolean;
  lastUpdated: Date | null;
  onRefresh: () => void;
}> = ({ loading, lastUpdated, onRefresh }) => {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const relative = lastUpdated ? relativeTime(lastUpdated, tick) : null;

  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={loading}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 bg-slate-800/60 border border-slate-700 hover:bg-slate-800 hover:text-white transition-colors disabled:opacity-50"
      title="Refresh data"
    >
      <Icons.ArrowPathIcon className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
      <span>{loading ? "Refreshing…" : `Updated ${relative || "just now"}`}</span>
    </button>
  );
};

const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center text-center py-14 px-4">
    <div className="w-12 h-12 rounded-2xl bg-slate-800 ring-1 ring-slate-700 flex items-center justify-center text-slate-400 mb-3">
      {icon}
    </div>
    <p className="text-sm font-semibold text-slate-100">{title}</p>
    {description && <p className="text-xs text-slate-400 mt-1 max-w-sm">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

const StatusPill: React.FC<{ active: boolean; onClick?: () => void; title?: string }> = ({
  active,
  onClick,
  title,
}) => {
  const cls = active
    ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25"
    : "bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-500/30 hover:bg-rose-500/25";
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${cls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-emerald-400" : "bg-rose-400"}`} />
      {active ? "Active" : "Inactive"}
    </button>
  );
};

const relativeTime = (date: Date, _tick: number): string => {
  void _tick; // force re-render via tick prop
  const diff = Math.max(0, Date.now() - date.getTime());
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return date.toLocaleDateString();
};

// ============================================
// Create Dealer Wizard
// ============================================

const CreateDealerWizard: React.FC<{
  onClose: () => void;
  onCreated: () => void;
}> = ({ onClose, onCreated }) => {
  const [step, setStep] = useState<1 | 2 | "done">(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ dealer: Dealer; admin: User } | null>(null);

  const [dealerForm, setDealerForm] = useState({
    name: "",
    code: "",
    address: "",
    city: "",
    state: "",
    phone: "",
    email: "",
    active: true,
  });

  const [adminForm, setAdminForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    passwordConfirm: "",
  });

  const canAdvanceStep1 = dealerForm.name.trim() && dealerForm.code.trim();
  const canSubmit =
    adminForm.firstName.trim() &&
    adminForm.lastName.trim() &&
    adminForm.email.trim() &&
    adminForm.password.length >= 8 &&
    adminForm.password === adminForm.passwordConfirm;

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const result = await createDealerWithAdmin({
        dealer: { ...dealerForm, settings: undefined } as Omit<Dealer, "id" | "created" | "updated">,
        admin: {
          email: adminForm.email,
          password: adminForm.password,
          firstName: adminForm.firstName,
          lastName: adminForm.lastName,
          phone: adminForm.phone,
        },
      });
      setCreated(result);
      setStep("done");
    } catch (e: any) {
      setError(e?.message || "Failed to create dealer and admin user");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinish = () => {
    onCreated();
  };

  const Step = ({ n, label, state }: { n: number; label: string; state: "done" | "current" | "pending" }) => (
    <div className="flex items-center gap-2">
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ring-1 transition-colors ${
          state === "current"
            ? "bg-blue-500 ring-blue-400 text-white"
            : state === "done"
              ? "bg-emerald-500/20 ring-emerald-500/40 text-emerald-300"
              : "bg-slate-800 ring-slate-600 text-slate-300"
        }`}
      >
        {state === "done" ? <Icons.CheckCircleIcon className="w-4 h-4" /> : n}
      </div>
      <span
        className={`text-xs font-medium ${
          state === "current" ? "text-white" : state === "done" ? "text-emerald-300" : "text-slate-300"
        }`}
      >
        {label}
      </span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-fadeIn">
      <div className="w-full max-w-2xl bg-slate-900 ring-1 ring-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-900 to-blue-950/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center ring-1 ring-white/10 shadow-lg shadow-blue-500/20">
              <Icons.BuildingLibraryIcon className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">
                {step === "done" ? "Dealership ready" : "Add new dealership"}
              </h3>
              <p className="text-xs text-slate-300">
                {step === "done"
                  ? "Share the credentials below with the new admin."
                  : "We'll create the dealer record and its first admin user."}
              </p>
            </div>
          </div>
          {step !== "done" && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              aria-label="Close"
            >
              <Icons.XMarkIcon className="w-4 h-4" />
            </button>
          )}
        </div>

        {step !== "done" && (
          <div className="px-6 pt-5 pb-4 flex items-center gap-3 border-b border-slate-800/60">
            <Step n={1} label="Dealership" state={step === 1 ? "current" : "done"} />
            <div className="flex-1 h-px bg-slate-800" />
            <Step n={2} label="First admin user" state={step === 2 ? "current" : "pending"} />
          </div>
        )}

        <div className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 px-4 py-3 text-sm text-rose-200 flex items-start gap-2">
              <Icons.ExclamationTriangleIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">Name *</label>
                <input
                  type="text"
                  value={dealerForm.name}
                  onChange={(e) => setDealerForm({ ...dealerForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  placeholder="Acme Motors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">Code *</label>
                <input
                  type="text"
                  value={dealerForm.code}
                  onChange={(e) =>
                    setDealerForm({ ...dealerForm, code: e.target.value.toUpperCase() })
                  }
                  maxLength={10}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white uppercase font-mono"
                  placeholder="ACME01"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">Email</label>
                <input
                  type="email"
                  value={dealerForm.email}
                  onChange={(e) => setDealerForm({ ...dealerForm, email: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  placeholder="contact@dealer.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">Phone</label>
                <input
                  type="tel"
                  value={dealerForm.phone}
                  onChange={(e) => setDealerForm({ ...dealerForm, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  placeholder="(555) 123-4567"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">Address</label>
                <input
                  type="text"
                  value={dealerForm.address}
                  onChange={(e) => setDealerForm({ ...dealerForm, address: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  placeholder="123 Auto Drive"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">City</label>
                <input
                  type="text"
                  value={dealerForm.city}
                  onChange={(e) => setDealerForm({ ...dealerForm, city: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  placeholder="Detroit"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">State</label>
                <input
                  type="text"
                  value={dealerForm.state}
                  onChange={(e) =>
                    setDealerForm({ ...dealerForm, state: e.target.value.toUpperCase() })
                  }
                  maxLength={2}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white uppercase"
                  placeholder="MI"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">First name *</label>
                <input
                  type="text"
                  value={adminForm.firstName}
                  onChange={(e) => setAdminForm({ ...adminForm, firstName: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  placeholder="Jane"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">Last name *</label>
                <input
                  type="text"
                  value={adminForm.lastName}
                  onChange={(e) => setAdminForm({ ...adminForm, lastName: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  placeholder="Smith"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">Email *</label>
                <input
                  type="email"
                  value={adminForm.email}
                  onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  placeholder="jane@dealer.com"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">Phone</label>
                <input
                  type="tel"
                  value={adminForm.phone}
                  onChange={(e) => setAdminForm({ ...adminForm, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  placeholder="(555) 123-4567"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">Password *</label>
                <input
                  type="password"
                  value={adminForm.password}
                  onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  placeholder="Min 8 characters"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">
                  Confirm password *
                </label>
                <input
                  type="password"
                  value={adminForm.passwordConfirm}
                  onChange={(e) =>
                    setAdminForm({ ...adminForm, passwordConfirm: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  placeholder="Re-enter password"
                />
              </div>
            </div>
          )}

          {step === "done" && created && (
            <div className="text-center py-4 space-y-5">
              <div className="relative mx-auto w-16 h-16">
                <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping" />
                <div className="relative w-16 h-16 bg-emerald-500/20 ring-2 ring-emerald-500/40 rounded-full flex items-center justify-center">
                  <Icons.CheckCircleIcon className="w-8 h-8 text-emerald-400" />
                </div>
              </div>
              <div>
                <h4 className="text-xl font-semibold text-white">{created.dealer.name} is ready</h4>
                <p className="text-slate-400 text-sm mt-1">
                  Share these credentials with the new admin so they can sign in at{" "}
                  <code className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 font-mono">/</code>.
                </p>
              </div>
              <div className="bg-slate-950 ring-1 ring-slate-800 rounded-xl divide-y divide-slate-800 max-w-md mx-auto text-left">
                <div className="flex justify-between items-center px-4 py-3 text-sm">
                  <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">
                    Dealer code
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(created.dealer.code).catch(() => {});
                    }}
                    className="inline-flex items-center gap-2 font-mono text-blue-300 font-bold hover:text-blue-200"
                    title="Click to copy"
                  >
                    {created.dealer.code}
                    <Icons.ClipboardDocumentIcon className="w-3.5 h-3.5 opacity-60" />
                  </button>
                </div>
                <div className="flex justify-between items-center px-4 py-3 text-sm">
                  <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">
                    Admin email
                  </span>
                  <span className="text-slate-100">{created.admin.email}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-3 text-sm">
                  <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">
                    Admin name
                  </span>
                  <span className="text-slate-100">
                    {created.admin.firstName} {created.admin.lastName}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-800 bg-slate-900/50">
          {step === 1 && (
            <>
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={() => setStep(2)} disabled={!canAdvanceStep1}>
                Next: Admin user
              </Button>
            </>
          )}
          {step === 2 && (
            <>
              <Button variant="secondary" onClick={() => setStep(1)} disabled={submitting}>
                Back
              </Button>
              <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
                {submitting ? "Creating…" : "Create dealership"}
              </Button>
            </>
          )}
          {step === "done" && <Button onClick={handleFinish}>Done</Button>}
        </div>
      </div>
    </div>
  );
};

// ============================================
// Dealer Management Component
// ============================================

const DealerManagement: React.FC<{
  dealers: Dealer[];
  users: User[];
  onRefresh: () => void;
  onImpersonate: (dealerId: string) => void;
}> = ({ dealers, users, onRefresh, onImpersonate }) => {
  const [showWizard, setShowWizard] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ field: string; dir: "asc" | "desc" }>({
    field: "name",
    dir: "asc",
  });

  const usersByDealer = users.reduce<Record<string, number>>((acc, u) => {
    if (u.dealer) acc[u.dealer] = (acc[u.dealer] ?? 0) + 1;
    return acc;
  }, {});

  const filteredDealers = (() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? dealers.filter(
          (d) =>
            d.name.toLowerCase().includes(q) ||
            d.code?.toLowerCase().includes(q) ||
            d.city?.toLowerCase().includes(q) ||
            d.state?.toLowerCase().includes(q) ||
            d.email?.toLowerCase().includes(q)
        )
      : [...dealers];

    filtered.sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      const get = (d: Dealer): string | number => {
        switch (sort.field) {
          case "code":
            return (d.code || "").toLowerCase();
          case "location":
            return `${d.state || ""}-${d.city || ""}`.toLowerCase();
          case "users":
            return usersByDealer[d.id] ?? 0;
          case "status":
            return d.active ? 1 : 0;
          case "created":
            return d.created || "";
          default:
            return d.name.toLowerCase();
        }
      };
      const av = get(a);
      const bv = get(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return filtered;
  })();

  const toggleSort = (field: string) =>
    setSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "asc" }
    );
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    address: "",
    city: "",
    state: "",
    phone: "",
    email: "",
    active: true,
  });

  const resetForm = () => {
    setFormData({
      name: "",
      code: "",
      address: "",
      city: "",
      state: "",
      phone: "",
      email: "",
      active: true,
    });
    setEditingId(null);
  };

  const handleSubmit = async () => {
    if (!editingId) return;
    await updateDealer(editingId, formData);
    resetForm();
    onRefresh();
  };

  const handleImpersonate = async (dealer: Dealer) => {
    const ok = await confirmAction({
      title: `View as ${dealer.name}?`,
      message:
        "You will see the app exactly as this dealership sees it. Use this only for support and demos. You can exit at any time from the banner at the top.",
      confirmLabel: "Enter dealership",
    });
    if (ok) {
      onImpersonate(dealer.id);
    }
  };

  const handleEdit = (dealer: Dealer) => {
    setFormData({
      name: dealer.name,
      code: dealer.code,
      address: dealer.address || "",
      city: dealer.city || "",
      state: dealer.state || "",
      phone: dealer.phone || "",
      email: dealer.email || "",
      active: dealer.active,
    });
    setEditingId(dealer.id);
  };

  const handleDelete = async (id: string) => {
    if (
      await confirmAction({
        title: "Delete dealer?",
        message:
          "Are you sure you want to delete this dealer? This will affect all associated users and data.",
        confirmLabel: "Delete",
        tone: "danger",
      })
    ) {
      await deleteDealer(id);
      onRefresh();
    }
  };

  const handleToggleActive = async (dealer: Dealer) => {
    await updateDealer(dealer.id, { active: !dealer.active });
    onRefresh();
  };

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white tracking-tight">Dealerships</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {filteredDealers.length} of {dealers.length} dealers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search name, code, city, state, email…"
          />
          <Button onClick={() => setShowWizard(true)} className="gap-2 whitespace-nowrap">
            <Icons.PlusIcon className="w-4 h-4" />
            Add Dealer
          </Button>
        </div>
      </div>

      {showWizard && (
        <CreateDealerWizard
          onClose={() => setShowWizard(false)}
          onCreated={() => {
            setShowWizard(false);
            onRefresh();
          }}
        />
      )}

      {/* Edit Form */}
      {editingId && (
        <div className="bg-slate-900/60 ring-1 ring-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-800 bg-gradient-to-r from-slate-900 to-blue-950/30">
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 ring-1 ring-blue-500/30 flex items-center justify-center">
              <Icons.PencilIcon className="w-4 h-4 text-blue-300" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Edit dealership</h3>
              <p className="text-xs text-slate-300">Code cannot be changed after creation.</p>
            </div>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                placeholder="Dealership Name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">Code *</label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    code: e.target.value.toUpperCase(),
                  })
                }
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 uppercase focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                placeholder="DEALER01"
                maxLength={10}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                placeholder="contact@dealer.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                placeholder="(555) 123-4567"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">City</label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                placeholder="Detroit"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">State</label>
              <input
                type="text"
                value={formData.state}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    state: e.target.value.toUpperCase(),
                  })
                }
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 uppercase focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                placeholder="MI"
                maxLength={2}
              />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">Address</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                placeholder="123 Auto Drive"
              />
            </div>
            <div className="flex items-center gap-2 pt-7">
              <input
                type="checkbox"
                id="active"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                className="w-4 h-4 rounded accent-emerald-500"
              />
              <label htmlFor="active" className="text-sm text-slate-200">
                Active
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-800 bg-slate-900/50">
            <Button variant="secondary" onClick={resetForm}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!formData.name || !formData.code}>
              Save changes
            </Button>
          </div>
        </div>
      )}

      {/* Dealers Table */}
      <div className="bg-slate-900/60 rounded-2xl ring-1 ring-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-900/80 backdrop-blur">
              <tr className="border-b border-slate-800">
                <SortHeader label="Dealer" field="name" current={sort} onSort={toggleSort} />
                <SortHeader label="Code" field="code" current={sort} onSort={toggleSort} />
                <SortHeader label="Location" field="location" current={sort} onSort={toggleSort} />
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-200 uppercase tracking-wider">
                  Contact
                </th>
                <SortHeader
                  label="Users"
                  field="users"
                  current={sort}
                  onSort={toggleSort}
                  align="center"
                />
                <SortHeader
                  label="Status"
                  field="status"
                  current={sort}
                  onSort={toggleSort}
                  align="center"
                />
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-200 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredDealers.map((dealer) => {
                const userCount = usersByDealer[dealer.id] ?? 0;
                return (
                  <tr
                    key={dealer.id}
                    className="hover:bg-slate-800/40 transition-colors group"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-slate-800 ring-1 ring-slate-700 flex items-center justify-center text-blue-300 text-xs font-bold flex-shrink-0">
                          {dealer.code?.slice(0, 2) || dealer.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white truncate">{dealer.name}</p>
                          {dealer.address && (
                            <p className="text-xs text-slate-400 truncate">{dealer.address}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <code className="px-2 py-1 bg-slate-800 ring-1 ring-slate-700 rounded-md text-blue-300 text-xs font-mono">
                        {dealer.code || "—"}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-slate-200 text-sm">
                      {dealer.city && dealer.state
                        ? `${dealer.city}, ${dealer.state}`
                        : dealer.state || dealer.city || (
                            <span className="text-slate-400">—</span>
                          )}
                    </td>
                    <td className="px-4 py-3 text-slate-200 text-sm">
                      {dealer.email ? (
                        <span className="truncate block max-w-[200px]">{dealer.email}</span>
                      ) : dealer.phone ? (
                        dealer.phone
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium tabular-nums ${
                          userCount > 0
                            ? "bg-slate-800 text-slate-100 ring-1 ring-inset ring-slate-700"
                            : "text-slate-400"
                        }`}
                      >
                        <Icons.UserIcon className="w-3 h-3 opacity-60" />
                        {userCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusPill
                        active={dealer.active}
                        onClick={() => handleToggleActive(dealer)}
                        title={dealer.active ? "Click to deactivate" : "Click to activate"}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleImpersonate(dealer)}
                          className="p-1.5 text-slate-400 hover:text-violet-300 hover:bg-violet-500/10 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title={dealer.active ? "View as this dealership" : "Activate dealer first"}
                          disabled={!dealer.active}
                        >
                          <Icons.EyeIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEdit(dealer)}
                          className="p-1.5 text-slate-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-md transition-colors"
                          title="Edit"
                        >
                          <Icons.PencilIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(dealer.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-md transition-colors"
                          title="Delete"
                        >
                          <Icons.TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredDealers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-0">
                    <EmptyState
                      icon={<Icons.BuildingLibraryIcon className="w-5 h-5" />}
                      title={
                        search
                          ? "No dealers match your search"
                          : "No dealers yet"
                      }
                      description={
                        search
                          ? "Try a different search term."
                          : "Click 'Add Dealer' to onboard your first dealership."
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ============================================
// User Management Component
// ============================================

const UserManagement: React.FC<{
  users: User[];
  dealers: Dealer[];
  onRefresh: () => void;
}> = ({ users, dealers, onRefresh }) => {
  const [filterDealer, setFilterDealer] = useState<string>("");
  const [filterRole, setFilterRole] = useState<string>("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ field: string; dir: "asc" | "desc" }>({
    field: "created",
    dir: "desc",
  });
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    passwordConfirm: "",
    firstName: "",
    lastName: "",
    phone: "",
    role: "sales" as User["role"],
    dealer: "",
  });

  const resetForm = () => {
    setFormData({
      email: "",
      password: "",
      passwordConfirm: "",
      firstName: "",
      lastName: "",
      phone: "",
      role: "sales",
      dealer: dealers[0]?.id || "",
    });
    setIsCreating(false);
    setEditingId(null);
    setError(null);
  };

  const handleSubmit = async () => {
    setError(null);
    try {
      if (editingId) {
        // Update existing user
        await updateUser(editingId, {
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone,
          role: formData.role,
          dealer: formData.dealer,
        });
      } else {
        // Create new user
        if (formData.password !== formData.passwordConfirm) {
          setError("Passwords do not match");
          return;
        }
        if (formData.password.length < 8) {
          setError("Password must be at least 8 characters");
          return;
        }
        await createUser(formData);
      }
      resetForm();
      onRefresh();
    } catch (err: any) {
      setError(err?.data?.message || err?.message || "Failed to save user");
    }
  };

  const handleEdit = (user: User) => {
    setFormData({
      email: user.email,
      password: "",
      passwordConfirm: "",
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      phone: user.phone || "",
      role: user.role,
      dealer: user.dealer || "",
    });
    setEditingId(user.id);
    setError(null);
  };

  const filteredUsers = (() => {
    const q = search.trim().toLowerCase();
    const result = users.filter((user) => {
      if (filterDealer && user.dealer !== filterDealer) return false;
      if (filterRole && user.role !== filterRole) return false;
      if (q) {
        const hay =
          `${user.firstName} ${user.lastName} ${user.email} ${user.phone ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const dealerName = (id: string) => dealers.find((d) => d.id === id)?.name || "";
    result.sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      const get = (u: User): string | number => {
        switch (sort.field) {
          case "name":
            return `${u.firstName} ${u.lastName}`.toLowerCase();
          case "email":
            return u.email.toLowerCase();
          case "role":
            return u.role;
          case "dealer":
            return dealerName(u.dealer || "").toLowerCase();
          case "created":
          default:
            return u.created || "";
        }
      };
      const av = get(a);
      const bv = get(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return result;
  })();

  const toggleSort = (field: string) =>
    setSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "asc" }
    );

  const handleRoleChange = async (userId: string, newRole: User["role"]) => {
    await updateUserRole(userId, newRole);
    onRefresh();
  };

  const handleDeleteUser = async (userId: string) => {
    if (
      await confirmAction({
        title: "Delete user?",
        message: "Are you sure you want to delete this user?",
        confirmLabel: "Delete",
        tone: "danger",
      })
    ) {
      await deleteUser(userId);
      onRefresh();
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "superadmin":
        return "bg-purple-500/20 text-purple-400";
      case "admin":
        return "bg-blue-500/20 text-blue-400";
      case "manager":
        return "bg-amber-500/20 text-amber-400";
      default:
        return "bg-slate-500/20 text-slate-400";
    }
  };

  const getDealerName = (dealerId: string) => {
    const dealer = dealers.find((d) => d.id === dealerId);
    return dealer?.name || "Unknown";
  };

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white tracking-tight">Users</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {filteredUsers.length} of {users.length} users
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, email…" />
          <select
            value={filterDealer}
            onChange={(e) => setFilterDealer(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          >
            <option value="">All dealers</option>
            {dealers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          >
            <option value="">All roles</option>
            <option value="sales">Sales</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
            <option value="superadmin">SuperAdmin</option>
          </select>
          <Button onClick={() => setIsCreating(true)} className="gap-2 whitespace-nowrap">
            <Icons.PlusIcon className="w-4 h-4" />
            Add User
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {/* Create/Edit Form */}
      {(isCreating || editingId) && (
        <div className="bg-slate-900/60 ring-1 ring-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-800 bg-gradient-to-r from-slate-900 to-violet-950/30">
            <div className="w-9 h-9 rounded-xl bg-violet-500/15 ring-1 ring-violet-500/30 flex items-center justify-center">
              <Icons.UserIcon className="w-4 h-4 text-violet-300" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">
                {editingId ? "Edit user" : "Add new user"}
              </h3>
              <p className="text-xs text-slate-300">
                {editingId
                  ? "Email changes will require the user to sign in again."
                  : "Assign the user to a dealership and set their role."}
              </p>
            </div>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">First Name *</label>
              <input
                type="text"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                placeholder="John"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">Last Name *</label>
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                placeholder="Doe"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">Email *</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                placeholder="john@dealer.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                placeholder="(555) 123-4567"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">Dealer *</label>
              <select
                value={formData.dealer}
                onChange={(e) => setFormData({ ...formData, dealer: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              >
                <option value="">Select Dealer</option>
                {dealers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">Role *</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as User["role"] })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              >
                <option value="sales">Sales</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
                <option value="superadmin">SuperAdmin</option>
              </select>
            </div>
            {!editingId && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">
                    Password *
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    placeholder="Min 8 characters"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">
                    Confirm Password *
                  </label>
                  <input
                    type="password"
                    value={formData.passwordConfirm}
                    onChange={(e) => setFormData({ ...formData, passwordConfirm: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    placeholder="Re-enter password"
                  />
                </div>
              </>
            )}
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-800 bg-slate-900/50">
            <Button variant="secondary" onClick={resetForm}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                !formData.firstName ||
                !formData.lastName ||
                !formData.email ||
                !formData.dealer ||
                (!editingId && !formData.password)
              }
            >
              {editingId ? "Save changes" : "Create user"}
            </Button>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-slate-900/60 rounded-2xl ring-1 ring-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-900/80 backdrop-blur">
              <tr className="border-b border-slate-800">
                <SortHeader label="User" field="name" current={sort} onSort={toggleSort} />
                <SortHeader label="Email" field="email" current={sort} onSort={toggleSort} />
                <SortHeader label="Dealer" field="dealer" current={sort} onSort={toggleSort} />
                <SortHeader
                  label="Role"
                  field="role"
                  current={sort}
                  onSort={toggleSort}
                  align="center"
                />
                <SortHeader
                  label="Created"
                  field="created"
                  current={sort}
                  onSort={toggleSort}
                  align="center"
                />
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-200 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredUsers.map((user) => (
                <tr
                  key={user.id}
                  className="hover:bg-slate-800/40 transition-colors group"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-violet-500 rounded-full flex items-center justify-center text-white text-xs font-semibold ring-2 ring-slate-900 flex-shrink-0">
                        {user.firstName?.[0]}
                        {user.lastName?.[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {user.firstName} {user.lastName}
                        </p>
                        {user.phone && (
                          <p className="text-xs text-slate-400 truncate">{user.phone}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-200 text-sm truncate max-w-[220px]">
                    {user.email}
                  </td>
                  <td className="px-4 py-3 text-slate-200 text-sm">
                    {user.dealer ? (
                      getDealerName(user.dealer)
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value as User["role"])}
                      className={`appearance-none px-2.5 py-1 rounded-full text-xs font-medium ring-1 ring-inset cursor-pointer focus:outline-none focus:ring-2 ${
                        user.role === "superadmin"
                          ? "bg-violet-500/15 text-violet-200 ring-violet-500/30"
                          : user.role === "admin"
                            ? "bg-blue-500/15 text-blue-200 ring-blue-500/30"
                            : user.role === "manager"
                              ? "bg-amber-500/15 text-amber-200 ring-amber-500/30"
                              : "bg-slate-700/50 text-slate-200 ring-slate-600"
                      }`}
                    >
                      <option value="sales">Sales</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                      <option value="superadmin">SuperAdmin</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-400 text-xs tabular-nums">
                    {new Date(user.created).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleEdit(user)}
                        className="p-1.5 text-slate-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-md transition-colors"
                        title="Edit"
                      >
                        <Icons.PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-md transition-colors"
                        title="Delete"
                      >
                        <Icons.TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-0">
                    <EmptyState
                      icon={<Icons.UserIcon className="w-5 h-5" />}
                      title={
                        search || filterDealer || filterRole
                          ? "No users match your filters"
                          : "No users yet"
                      }
                      description={
                        search || filterDealer || filterRole
                          ? "Try clearing the filters or adjusting your search."
                          : "Click 'Add User' to create your first user."
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ============================================
// System Settings Panel
// ============================================

const SystemSettingsPanel: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [form, setForm] = useState<SystemSettings>({
    supportEmail: "",
    announcementBanner: "",
    signupsEnabled: true,
    defaultLtvThresholds: "",
  });

  useEffect(() => {
    let cancelled = false;
    getSystemSettings()
      .then((s) => {
        if (cancelled) return;
        setForm({
          supportEmail: s.supportEmail || "",
          announcementBanner: s.announcementBanner || "",
          signupsEnabled: s.signupsEnabled !== false,
          defaultLtvThresholds:
            typeof s.defaultLtvThresholds === "string"
              ? s.defaultLtvThresholds
              : JSON.stringify(s.defaultLtvThresholds ?? {}, null, 2),
        });
      })
      .catch((e) => !cancelled && setError(e?.message || "Failed to load settings"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    setError(null);
    let thresholds: unknown = {};
    if (form.defaultLtvThresholds && typeof form.defaultLtvThresholds === "string") {
      try {
        thresholds = JSON.parse(form.defaultLtvThresholds);
      } catch {
        setError("Default LTV thresholds must be valid JSON");
        return;
      }
    }

    setSaving(true);
    try {
      await updateSystemSettings({
        supportEmail: form.supportEmail,
        announcementBanner: form.announcementBanner,
        signupsEnabled: form.signupsEnabled,
        defaultLtvThresholds: thresholds,
      });
      setSavedAt(new Date());
    } catch (e: any) {
      setError(e?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Icons.SpinnerIcon className="w-6 h-6 text-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fadeIn">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white tracking-tight">System Settings</h2>
          <p className="text-xs text-slate-400 mt-0.5">Affects every dealership on the platform.</p>
        </div>
        {savedAt && (
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Saved {savedAt.toLocaleTimeString()}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 px-4 py-3 text-sm text-rose-200 max-w-3xl">
          {error}
        </div>
      )}

      <div className="max-w-3xl bg-slate-900/60 ring-1 ring-slate-800 rounded-2xl p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-200 mb-1.5">Support email</label>
          <input
            type="email"
            value={form.supportEmail || ""}
            onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            placeholder="support@ltvdesking.com"
          />
          <p className="text-xs text-slate-400 mt-1.5">
            Shown to dealers in error messages and help screens.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-200 mb-1.5">
            Announcement banner
          </label>
          <textarea
            value={form.announcementBanner || ""}
            onChange={(e) => setForm({ ...form, announcementBanner: e.target.value })}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 min-h-[60px] focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            placeholder="Scheduled maintenance Friday 10pm ET…"
          />
          <p className="text-xs text-slate-400 mt-1.5">
            Leave empty to hide. Displayed at the top of every page when set.
          </p>
        </div>

        <div className="flex items-center justify-between p-4 bg-slate-950 ring-1 ring-slate-800 rounded-xl">
          <div>
            <p className="text-sm font-medium text-white">Allow new dealer signups</p>
            <p className="text-xs text-slate-400 mt-0.5">
              When off, the public registration form on <code className="text-slate-300">/</code> is
              disabled.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={form.signupsEnabled !== false}
              onChange={(e) => setForm({ ...form, signupsEnabled: e.target.checked })}
            />
            <div className="w-11 h-6 bg-slate-700 peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-200 mb-1.5">
            Default LTV thresholds (JSON)
          </label>
          <textarea
            value={
              typeof form.defaultLtvThresholds === "string"
                ? form.defaultLtvThresholds
                : JSON.stringify(form.defaultLtvThresholds ?? {}, null, 2)
            }
            onChange={(e) => setForm({ ...form, defaultLtvThresholds: e.target.value })}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 font-mono text-xs min-h-[140px] focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            placeholder='{"700": 120, "650": 110}'
            spellCheck={false}
          />
          <p className="text-xs text-slate-400 mt-1.5">Applied as the default for new dealerships.</p>
        </div>
      </div>

      <div className="max-w-3xl flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </div>
  );
};

// ============================================
// Overview Tab
// ============================================

const OverviewTab: React.FC<{
  stats: SystemStats;
  dealers: Dealer[];
  users: User[];
  onJumpTab: (tab: "overview" | "dealers" | "users" | "settings") => void;
  onImpersonate: (dealerId: string) => void;
}> = ({ stats, dealers, users, onJumpTab, onImpersonate }) => {
  const inactiveCount = Math.max(0, stats.totalDealers - stats.activeDealers);
  const usersByRole = users.reduce<Record<string, number>>((acc, u) => {
    acc[u.role] = (acc[u.role] ?? 0) + 1;
    return acc;
  }, {});

  const recentDealers = [...dealers]
    .sort((a, b) => (b.created || "").localeCompare(a.created || ""))
    .slice(0, 5);
  const recentUsers = [...users]
    .sort((a, b) => (b.created || "").localeCompare(a.created || ""))
    .slice(0, 5);

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Page header (matches Dealers / Users / Settings) */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white tracking-tight">Overview</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {stats.totalDealers.toLocaleString()} dealership{stats.totalDealers === 1 ? "" : "s"} ·{" "}
            {stats.totalUsers.toLocaleString()} user{stats.totalUsers === 1 ? "" : "s"} ·{" "}
            {stats.totalDeals.toLocaleString()} deal{stats.totalDeals === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Dealers"
          value={stats.totalDealers}
          hint={inactiveCount > 0 ? `${inactiveCount} inactive` : "All active"}
          accent="blue"
          icon={<Icons.BuildingLibraryIcon className="w-5 h-5" />}
        />
        <StatCard
          label="Active Dealers"
          value={stats.activeDealers}
          hint={
            stats.totalDealers > 0
              ? `${Math.round((stats.activeDealers / stats.totalDealers) * 100)}% of total`
              : undefined
          }
          accent="emerald"
          icon={<Icons.CheckCircleIcon className="w-5 h-5" />}
        />
        <StatCard
          label="Total Users"
          value={stats.totalUsers}
          hint={
            usersByRole.admin
              ? `${usersByRole.admin} admin · ${usersByRole.sales ?? 0} sales`
              : undefined
          }
          accent="violet"
          icon={<Icons.UserIcon className="w-5 h-5" />}
        />
        <StatCard
          label="Total Deals"
          value={stats.totalDeals}
          hint={stats.totalInventory > 0 ? `${stats.totalInventory.toLocaleString()} in inventory` : undefined}
          accent="amber"
          icon={<Icons.ClipboardDocumentIcon className="w-5 h-5" />}
        />
      </div>

      {/* Quick actions */}
      <div className="bg-slate-900/60 ring-1 ring-slate-800 rounded-2xl p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-3">
          Quick actions
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onJumpTab("dealers")}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-500/15 text-blue-200 ring-1 ring-inset ring-blue-500/30 hover:bg-blue-500/25 transition-colors"
          >
            <Icons.PlusIcon className="w-4 h-4" /> Onboard new dealer
          </button>
          <button
            onClick={() => onJumpTab("users")}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-violet-500/15 text-violet-200 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 transition-colors"
          >
            <Icons.UserIcon className="w-4 h-4" /> Manage users
          </button>
          <button
            onClick={() => onJumpTab("settings")}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-700/50 text-slate-200 ring-1 ring-inset ring-slate-600 hover:bg-slate-700 transition-colors"
          >
            <Icons.Cog6ToothIcon className="w-4 h-4" /> System settings
          </button>
        </div>
      </div>

      {/* Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-slate-900/60 ring-1 ring-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Icons.BuildingLibraryIcon className="w-4 h-4 text-blue-400" />
              Recent dealers
            </h3>
            <button
              onClick={() => onJumpTab("dealers")}
              className="text-xs text-slate-300 hover:text-white"
            >
              View all →
            </button>
          </div>
          {recentDealers.length === 0 ? (
            <EmptyState
              icon={<Icons.BuildingLibraryIcon className="w-5 h-5" />}
              title="No dealers yet"
              description="Onboard your first dealership to get started."
              action={
                <button
                  onClick={() => onJumpTab("dealers")}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-500/15 text-blue-200 ring-1 ring-inset ring-blue-500/30 hover:bg-blue-500/25"
                >
                  <Icons.PlusIcon className="w-4 h-4" /> Onboard new dealer
                </button>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-800">
              {recentDealers.map((dealer) => (
                <li
                  key={dealer.id}
                  className="flex items-center justify-between py-2.5 group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 ring-1 ring-slate-700 flex items-center justify-center text-blue-300 text-xs font-bold">
                      {dealer.code?.slice(0, 2) || dealer.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-100 truncate">{dealer.name}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {dealer.code}
                        {dealer.city ? ` · ${dealer.city}${dealer.state ? `, ${dealer.state}` : ""}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill active={dealer.active} />
                    <button
                      onClick={() => onImpersonate(dealer.id)}
                      className="opacity-0 group-hover:opacity-100 text-xs text-slate-300 hover:text-white px-2 py-1 rounded-md hover:bg-slate-800 transition"
                      title="View as this dealership"
                    >
                      View as →
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-slate-900/60 ring-1 ring-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Icons.UserIcon className="w-4 h-4 text-violet-400" />
              Recent users
            </h3>
            <button
              onClick={() => onJumpTab("users")}
              className="text-xs text-slate-300 hover:text-white"
            >
              View all →
            </button>
          </div>
          {recentUsers.length === 0 ? (
            <EmptyState
              icon={<Icons.UserIcon className="w-5 h-5" />}
              title="No users yet"
              description="Users will appear here as they are added to dealerships."
            />
          ) : (
            <ul className="divide-y divide-slate-800">
              {recentUsers.map((user) => (
                <li key={user.id} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-xs font-semibold text-white ring-2 ring-slate-900">
                      {user.firstName?.[0]}
                      {user.lastName?.[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-100 truncate">
                        {user.firstName} {user.lastName}
                      </p>
                      <p className="text-xs text-slate-400 truncate">{user.email}</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-medium uppercase tracking-wider bg-slate-800 text-slate-100 ring-1 ring-inset ring-slate-600">
                    {user.role}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================
// Main SuperAdmin Dashboard
// ============================================

interface SuperAdminDashboardProps {
  onSwitchToDealer?: () => void;
  onImpersonate?: (dealerId: string) => void;
}

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({
  onSwitchToDealer,
  onImpersonate,
}) => {
  useForceDarkMode();
  const [activeTab, setActiveTab] = useState<
    "overview" | "dealers" | "users" | "settings"
  >("overview");
  const [stats, setStats] = useState<SystemStats>({
    totalDealers: 0,
    activeDealers: 0,
    totalUsers: 0,
    totalDeals: 0,
    totalInventory: 0,
  });
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const currentUser = getCurrentUser();

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    const [statsData, dealersData, usersData] = await Promise.all([
      getSystemStats(),
      getAllDealers(),
      getAllUsers(),
    ]);
    setStats(statsData);
    setDealers(dealersData);
    setUsers(usersData);
    setLastUpdated(new Date());
    setIsLoading(false);
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Icons.SpinnerIcon className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.08),_transparent_50%),_radial-gradient(ellipse_at_bottom_right,_rgba(139,92,246,0.08),_transparent_50%)] bg-slate-950 text-white">
      {/* Header */}
      <header className="bg-slate-900/70 backdrop-blur-xl border-b border-slate-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 via-indigo-500 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 ring-1 ring-white/10">
                <Icons.Cog6ToothIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-base font-semibold tracking-tight text-white">
                  Owner Console
                </h1>
                <p className="text-xs text-slate-400">LTV Desking PRO</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {onSwitchToDealer && (
                <Button variant="secondary" onClick={onSwitchToDealer} size="sm">
                  <Icons.ChevronLeftIcon className="w-4 h-4 mr-2" />
                  Dealer view
                </Button>
              )}
              <div className="hidden md:flex items-center gap-2.5 pl-2 pr-3 py-1.5 bg-slate-800/70 ring-1 ring-slate-700 rounded-full">
                <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-violet-500 rounded-full flex items-center justify-center text-xs font-semibold ring-2 ring-slate-900">
                  {currentUser?.firstName?.[0]}
                  {currentUser?.lastName?.[0]}
                </div>
                <span className="text-xs font-medium text-slate-200">
                  {currentUser?.firstName} {currentUser?.lastName}
                </span>
              </div>
              <button
                onClick={logout}
                className="p-2 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                title="Sign out"
              >
                <Icons.ArrowRightStartOnRectangleIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tabs (inside header) — single-line scroll on narrow viewports */}
          <div className="mt-4 flex items-center gap-1.5 overflow-x-auto -mx-2 px-2 pb-1 sm:overflow-visible sm:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabButton
              active={activeTab === "overview"}
              onClick={() => setActiveTab("overview")}
              icon={<Icons.ChartIcon className="w-4 h-4" />}
              label="Overview"
            />
            <TabButton
              active={activeTab === "dealers"}
              onClick={() => setActiveTab("dealers")}
              icon={<Icons.BuildingLibraryIcon className="w-4 h-4" />}
              label="Dealers"
              badge={stats.totalDealers}
            />
            <TabButton
              active={activeTab === "users"}
              onClick={() => setActiveTab("users")}
              icon={<Icons.UserIcon className="w-4 h-4" />}
              label="Users"
              badge={stats.totalUsers}
            />
            <TabButton
              active={activeTab === "settings"}
              onClick={() => setActiveTab("settings")}
              icon={<Icons.Cog6ToothIcon className="w-4 h-4" />}
              label="Settings"
            />
            <div className="sm:ml-auto shrink-0">
              <RefreshBar
                loading={isRefreshing}
                lastUpdated={lastUpdated}
                onRefresh={() => loadData(true)}
              />
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* tabs moved into header */}

        {/* Content */}
        {activeTab === "overview" && (
          <OverviewTab
            stats={stats}
            dealers={dealers}
            users={users}
            onJumpTab={setActiveTab}
            onImpersonate={(id) => onImpersonate?.(id)}
          />
        )}

        {activeTab === "dealers" && (
          <DealerManagement
            dealers={dealers}
            users={users}
            onRefresh={loadData}
            onImpersonate={(dealerId) => onImpersonate?.(dealerId)}
          />
        )}

        {activeTab === "users" && (
          <UserManagement users={users} dealers={dealers} onRefresh={loadData} />
        )}

        {activeTab === "settings" && <SystemSettingsPanel />}
      </div>
    </div>
  );
};

export default SuperAdminDashboard;
