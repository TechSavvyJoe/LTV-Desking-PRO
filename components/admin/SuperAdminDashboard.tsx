import React, { useState, useEffect, useCallback } from "react";
import { getCurrentUser, User, Dealer, collections, pb } from "../../lib/pocketbase";
import {
  KpiTile,
  StatTile,
  ListCard,
  PersonRow,
  ActivePill,
  RoleChip,
  ConsoleHeader,
  ConsoleTab,
  initialsOf,
  panelCard,
  mono as adminMono,
} from "./panels/OwnerPanels";
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
  setUserActive,
  getSystemSettings,
  updateSystemSettings,
  getMaskedAiProviderKeys,
  updateAiProviderKeys,
  testAiProviderKey,
  listAuditLog,
  AuditLogEntry,
  SystemStats,
  SystemSettings,
  MaskedAiProviderKeys,
  AiProviderId,
} from "../../lib/api";
import { AI_MODELS, AI_PROVIDER_ORDER, DEFAULT_AI_SETTINGS } from "../../lib/aiModelRegistry";
import { logout } from "../../lib/auth";
import Button from "../common/Button";
import * as Icons from "../common/Icons";
import { confirmAction } from "../../lib/confirm";
import { toast } from "../../lib/toast";
import { useForceDarkMode } from "../../hooks/useForceDarkMode";

// ============================================
// Helper Components
// ============================================

const SearchInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}> = ({ value, onChange, placeholder = "Search…", autoFocus }) => (
  <div className="relative">
    <Icons.MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className="pl-9 pr-3 py-2 w-full sm:w-64 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)] focus:border-[var(--color-primary)]"
    />
    {value && (
      <button
        onClick={() => onChange("")}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
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
    <th className={`px-4 py-3 text-${align} text-xs font-semibold text-[var(--color-text)] ${className}`}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 hover:text-[var(--color-text)] focus:outline-none ${
          isActive ? "text-[var(--color-text)]" : ""
        }`}
      >
        {label}
        <span className={isActive ? "text-[var(--color-primary)]" : "text-[var(--color-text-muted)]"}>
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
      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-[var(--color-text-muted)] bg-[var(--color-bg-muted)] border border-[var(--color-border)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text)] transition-colors disabled:opacity-50"
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
    <div className="w-12 h-12 rounded-lg bg-[var(--color-bg-muted)] ring-1 ring-[var(--color-border)] flex items-center justify-center text-[var(--color-text-muted)] mb-3">
      {icon}
    </div>
    <p className="text-sm font-semibold text-[var(--color-text)]">{title}</p>
    {description && <p className="text-xs text-[var(--color-text-muted)] mt-1 max-w-sm">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

const StatusPill: React.FC<{ active: boolean; onClick?: () => void; title?: string }> = ({
  active,
  onClick,
  title,
}) => {
  const cls = active
    ? "bg-[var(--color-success-subtle)] text-[var(--color-success)] ring-1 ring-inset ring-[var(--color-success)] hover:bg-[var(--color-success-subtle)]"
    : "bg-[var(--color-danger-subtle)] text-[var(--color-danger)] ring-1 ring-inset ring-[var(--color-danger)] hover:bg-[var(--color-danger-subtle)]";
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${cls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-[var(--color-success)]" : "bg-[var(--color-danger)]"}`} />
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
        dealer: { ...dealerForm, settings: undefined } as Omit<
          Dealer,
          "id" | "created" | "updated"
        >,
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

  const Step = ({
    n,
    label,
    state,
  }: {
    n: number;
    label: string;
    state: "done" | "current" | "pending";
  }) => (
    <div className="flex items-center gap-2">
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ring-1 transition-colors ${
          state === "current"
            ? "bg-[var(--color-primary)] ring-[var(--color-primary)] text-[var(--on-primary)]"
            : state === "done"
              ? "bg-[var(--color-success-subtle)] ring-[var(--color-success)] text-[var(--color-success)]"
              : "bg-[var(--color-bg-muted)] ring-[var(--color-border-strong)] text-[var(--color-text-muted)]"
        }`}
      >
        {state === "done" ? <Icons.CheckCircleIcon className="w-4 h-4" /> : n}
      </div>
      <span
        className={`text-xs font-medium ${
          state === "current"
            ? "text-[var(--color-text)]"
            : state === "done"
              ? "text-[var(--color-success)]"
              : "text-[var(--color-text-muted)]"
        }`}
      >
        {label}
      </span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-fadeIn">
      <div className="w-full max-w-2xl bg-[var(--color-bg)] ring-1 ring-[var(--color-border)] rounded-lg shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4 bg-[var(--color-bg-subtle)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--color-primary)] flex items-center justify-center ring-1 ring-white/10">
              <Icons.BuildingLibraryIcon className="w-4 h-4 text-[var(--on-primary)]" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[var(--color-text)]">
                {step === "done" ? "Dealership ready" : "Add new dealership"}
              </h3>
              <p className="text-xs text-[var(--color-text-muted)]">
                {step === "done"
                  ? "Share the credentials below with the new admin."
                  : "We'll create the dealer record and its first admin user."}
              </p>
            </div>
          </div>
          {step !== "done" && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-muted)] transition-colors"
              aria-label="Close"
            >
              <Icons.XMarkIcon className="w-4 h-4" />
            </button>
          )}
        </div>

        {step !== "done" && (
          <div className="px-6 pt-5 pb-4 flex items-center gap-3 border-b border-[var(--color-border)]">
            <Step n={1} label="Dealership" state={step === 1 ? "current" : "done"} />
            <div className="flex-1 h-px bg-[var(--color-bg-muted)]" />
            <Step n={2} label="First admin user" state={step === 2 ? "current" : "pending"} />
          </div>
        )}

        <div className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg bg-[var(--color-danger-subtle)] border border-[var(--color-danger)] px-4 py-3 text-sm text-[var(--color-danger)] flex items-start gap-2">
              <Icons.ExclamationTriangleIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">Name *</label>
                <input
                  type="text"
                  value={dealerForm.name}
                  onChange={(e) => setDealerForm({ ...dealerForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
                  placeholder="Acme Motors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">Code *</label>
                <input
                  type="text"
                  value={dealerForm.code}
                  onChange={(e) =>
                    setDealerForm({ ...dealerForm, code: e.target.value.toUpperCase() })
                  }
                  maxLength={10}
                  className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] uppercase font-mono"
                  placeholder="ACME01"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">Email</label>
                <input
                  type="email"
                  value={dealerForm.email}
                  onChange={(e) => setDealerForm({ ...dealerForm, email: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
                  placeholder="contact@dealer.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">Phone</label>
                <input
                  type="tel"
                  value={dealerForm.phone}
                  onChange={(e) => setDealerForm({ ...dealerForm, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
                  placeholder="(555) 123-4567"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">Address</label>
                <input
                  type="text"
                  value={dealerForm.address}
                  onChange={(e) => setDealerForm({ ...dealerForm, address: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
                  placeholder="123 Auto Drive"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">City</label>
                <input
                  type="text"
                  value={dealerForm.city}
                  onChange={(e) => setDealerForm({ ...dealerForm, city: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
                  placeholder="Detroit"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">State</label>
                <input
                  type="text"
                  value={dealerForm.state}
                  onChange={(e) =>
                    setDealerForm({ ...dealerForm, state: e.target.value.toUpperCase() })
                  }
                  maxLength={2}
                  className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] uppercase"
                  placeholder="MI"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
                  First name *
                </label>
                <input
                  type="text"
                  value={adminForm.firstName}
                  onChange={(e) => setAdminForm({ ...adminForm, firstName: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
                  placeholder="Jane"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
                  Last name *
                </label>
                <input
                  type="text"
                  value={adminForm.lastName}
                  onChange={(e) => setAdminForm({ ...adminForm, lastName: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
                  placeholder="Smith"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">Email *</label>
                <input
                  type="email"
                  value={adminForm.email}
                  onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
                  placeholder="jane@dealer.com"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">Phone</label>
                <input
                  type="tel"
                  value={adminForm.phone}
                  onChange={(e) => setAdminForm({ ...adminForm, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
                  placeholder="(555) 123-4567"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
                  Password *
                </label>
                <input
                  type="password"
                  value={adminForm.password}
                  onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
                  placeholder="Min 8 characters"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
                  Confirm password *
                </label>
                <input
                  type="password"
                  value={adminForm.passwordConfirm}
                  onChange={(e) => setAdminForm({ ...adminForm, passwordConfirm: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
                  placeholder="Re-enter password"
                />
              </div>
            </div>
          )}

          {step === "done" && created && (
            <div className="text-center py-4 space-y-5">
              <div className="relative mx-auto w-16 h-16">
                <div className="absolute inset-0 bg-[var(--color-success-subtle)] rounded-full animate-ping" />
                <div className="relative w-16 h-16 bg-[var(--color-success-subtle)] ring-2 ring-[var(--color-success)] rounded-full flex items-center justify-center">
                  <Icons.CheckCircleIcon className="w-8 h-8 text-[var(--color-success)]" />
                </div>
              </div>
              <div>
                <h4 className="text-xl font-semibold text-[var(--color-text)]">{created.dealer.name} is ready</h4>
                <p className="text-[var(--color-text-muted)] text-sm mt-1">
                  Share these credentials with the new admin so they can sign in at{" "}
                  <code className="px-1.5 py-0.5 rounded bg-[var(--color-bg-muted)] text-[var(--color-text)] font-mono">
                    /
                  </code>
                  .
                </p>
              </div>
              <div className="bg-[var(--color-bg-subtle)] ring-1 ring-[var(--color-border)] rounded-xl divide-y divide-[var(--color-border)] max-w-md mx-auto text-left">
                <div className="flex justify-between items-center px-4 py-3 text-sm">
                  <span className="text-[var(--color-text-muted)] text-xs font-medium">Dealer code</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(created.dealer.code).catch(() => {});
                    }}
                    className="inline-flex items-center gap-2 font-mono text-[var(--color-primary)] font-bold hover:text-[var(--color-primary)]"
                    title="Click to copy"
                  >
                    {created.dealer.code}
                    <Icons.ClipboardDocumentIcon className="w-3.5 h-3.5 opacity-60" />
                  </button>
                </div>
                <div className="flex justify-between items-center px-4 py-3 text-sm">
                  <span className="text-[var(--color-text-muted)] text-xs font-medium">Admin email</span>
                  <span className="text-[var(--color-text)]">{created.admin.email}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-3 text-sm">
                  <span className="text-[var(--color-text-muted)] text-xs font-medium">Admin name</span>
                  <span className="text-[var(--color-text)]">
                    {created.admin.firstName} {created.admin.lastName}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-bg-subtle)]">
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
    try {
      await updateDealer(editingId, formData);
    } catch (err) {
      // Surface the real failure and keep the form open so nothing is lost. [C16]
      toast.error(err instanceof Error ? err.message : "Failed to update dealership");
      return;
    }
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
      try {
        await deleteDealer(id);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete dealership");
        return;
      }
      onRefresh();
    }
  };

  const handleToggleActive = async (dealer: Dealer) => {
    try {
      await updateDealer(dealer.id, { active: !dealer.active });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update dealership status");
      return;
    }
    onRefresh();
  };

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text)] tracking-tight">Dealerships</h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
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
        <div className="bg-[var(--color-bg)] ring-1 ring-[var(--color-border)] rounded-lg overflow-hidden shadow-sm">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)]">
            <div className="w-9 h-9 rounded-xl bg-[var(--color-primary-subtle)] ring-1 ring-[var(--color-border)] flex items-center justify-center">
              <Icons.PencilIcon className="w-4 h-4 text-[var(--color-primary)]" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[var(--color-text)]">Edit dealership</h3>
              <p className="text-xs text-[var(--color-text-muted)]">Code cannot be changed after creation.</p>
            </div>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
                placeholder="Dealership Name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">Code *</label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    code: e.target.value.toUpperCase(),
                  })
                }
                className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] uppercase focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
                placeholder="DEALER01"
                maxLength={10}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
                placeholder="contact@dealer.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
                placeholder="(555) 123-4567"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">City</label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
                placeholder="Detroit"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">State</label>
              <input
                type="text"
                value={formData.state}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    state: e.target.value.toUpperCase(),
                  })
                }
                className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] uppercase focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
                placeholder="MI"
                maxLength={2}
              />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">Address</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
                placeholder="123 Auto Drive"
              />
            </div>
            <div className="flex items-center gap-2 pt-7">
              <input
                type="checkbox"
                id="active"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                className="w-4 h-4 rounded accent-[var(--color-primary)]"
              />
              <label htmlFor="active" className="text-sm text-[var(--color-text)]">
                Active
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-bg-subtle)]">
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
      <div className="bg-[var(--color-bg)] rounded-lg ring-1 ring-[var(--color-border)] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[var(--color-bg)]">
              <tr className="border-b border-[var(--color-border)]">
                <SortHeader label="Dealer" field="name" current={sort} onSort={toggleSort} />
                <SortHeader label="Code" field="code" current={sort} onSort={toggleSort} />
                <SortHeader label="Location" field="location" current={sort} onSort={toggleSort} />
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text)]">
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
                <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--color-text)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {filteredDealers.map((dealer) => {
                const userCount = usersByDealer[dealer.id] ?? 0;
                return (
                  <tr key={dealer.id} className="hover:bg-[var(--color-bg-muted)] transition-colors group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-[var(--color-bg-muted)] ring-1 ring-[var(--color-border)] flex items-center justify-center text-[var(--color-primary)] text-xs font-bold flex-shrink-0">
                          {dealer.code?.slice(0, 2) || dealer.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[var(--color-text)] truncate">{dealer.name}</p>
                          {dealer.address && (
                            <p className="text-xs text-[var(--color-text-muted)] truncate">{dealer.address}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <code className="px-2 py-1 bg-[var(--color-bg-muted)] ring-1 ring-[var(--color-border)] rounded-md text-[var(--color-primary)] text-xs font-mono">
                        {dealer.code || "—"}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text)] text-sm">
                      {dealer.city && dealer.state
                        ? `${dealer.city}, ${dealer.state}`
                        : dealer.state || dealer.city || <span className="text-[var(--color-text-muted)]">—</span>}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text)] text-sm">
                      {dealer.email ? (
                        <span className="truncate block max-w-[200px]">{dealer.email}</span>
                      ) : dealer.phone ? (
                        dealer.phone
                      ) : (
                        <span className="text-[var(--color-text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium tabular-nums ${
                          userCount > 0
                            ? "bg-[var(--color-bg-muted)] text-[var(--color-text)] ring-1 ring-inset ring-[var(--color-border)]"
                            : "text-[var(--color-text-muted)]"
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
                          className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-muted)] rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title={
                            dealer.active ? "View as this dealership" : "Activate dealer first"
                          }
                          aria-label={`View as ${dealer.name}`}
                          disabled={!dealer.active}
                        >
                          <Icons.EyeIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEdit(dealer)}
                          className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-subtle)] rounded-md transition-colors"
                          title="Edit"
                          aria-label={`Edit ${dealer.name}`}
                        >
                          <Icons.PencilIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(dealer.id)}
                          className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-subtle)] rounded-md transition-colors"
                          title="Delete"
                          aria-label={`Delete ${dealer.name}`}
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
                      title={search ? "No dealers match your search" : "No dealers yet"}
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
  const currentUser = getCurrentUser();
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
    const ok = await confirmAction({
      title: "Change role?",
      message: `Change this user's role to ${newRole}? Their permissions update immediately.`,
      confirmLabel: "Change role",
    });
    if (ok) {
      try {
        await updateUserRole(userId, newRole);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to change role");
      }
    }
    // Refresh in every path so the controlled <select> resyncs with the server
    // state after a cancel or a failed write. [C16]
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
      try {
        await deleteUser(userId);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete user");
        return;
      }
      onRefresh();
    }
  };

  // Deactivation is the preferred offboarding path — it preserves the user's
  // deal history while revoking access on their next request. [G40]
  const handleToggleUserActive = async (user: User) => {
    const isActive = (user as User & { active?: boolean }).active ?? true;
    try {
      await setUserActive(user.id, !isActive);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update user status");
      return;
    }
    onRefresh();
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "superadmin":
        return "bg-[var(--color-bg-muted)] text-[var(--color-text-muted)]";
      case "admin":
        return "bg-[var(--color-primary-subtle)] text-[var(--color-primary)]";
      case "manager":
        return "bg-[var(--color-warning-subtle)] text-[var(--color-warning)]";
      default:
        return "bg-[var(--color-bg-muted)] text-[var(--color-text-muted)]";
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
          <h2 className="text-lg font-semibold text-[var(--color-text)] tracking-tight">Users</h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            {filteredUsers.length} of {users.length} users
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, email…" />
          <select
            value={filterDealer}
            onChange={(e) => setFilterDealer(e.target.value)}
            className="px-3 py-2 bg-[var(--color-bg-muted)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
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
            className="px-3 py-2 bg-[var(--color-bg-muted)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
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
        <div className="bg-[var(--color-danger-subtle)] border border-[var(--color-danger)] rounded-lg p-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}

      {/* Create/Edit Form */}
      {(isCreating || editingId) && (
        <div className="bg-[var(--color-bg)] ring-1 ring-[var(--color-border)] rounded-lg overflow-hidden shadow-sm">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)]">
            <div className="w-9 h-9 rounded-xl bg-[var(--color-bg-muted)] ring-1 ring-[var(--color-border)] flex items-center justify-center">
              <Icons.UserIcon className="w-4 h-4 text-[var(--color-text-muted)]" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[var(--color-text)]">
                {editingId ? "Edit user" : "Add new user"}
              </h3>
              <p className="text-xs text-[var(--color-text-muted)]">
                {editingId
                  ? "Email changes will require the user to sign in again."
                  : "Assign the user to a dealership and set their role."}
              </p>
            </div>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
                First Name *
              </label>
              <input
                type="text"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
                placeholder="John"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">Last Name *</label>
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
                placeholder="Doe"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">Email *</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
                placeholder="john@dealer.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
                placeholder="(555) 123-4567"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">Dealer *</label>
              <select
                value={formData.dealer}
                onChange={(e) => setFormData({ ...formData, dealer: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
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
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">Role *</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as User["role"] })}
                className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
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
                  <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
                    Password *
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
                    placeholder="Min 8 characters"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
                    Confirm Password *
                  </label>
                  <input
                    type="password"
                    value={formData.passwordConfirm}
                    onChange={(e) => setFormData({ ...formData, passwordConfirm: e.target.value })}
                    className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
                    placeholder="Re-enter password"
                  />
                </div>
              </>
            )}
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-bg-subtle)]">
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
      <div className="bg-[var(--color-bg)] rounded-lg ring-1 ring-[var(--color-border)] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[var(--color-bg)]">
              <tr className="border-b border-[var(--color-border)]">
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
                <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--color-text)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {filteredUsers.map((user) => {
                const isSelf = user.id === currentUser?.id;
                const isActive = (user as User & { active?: boolean }).active ?? true;
                return (
                  <tr
                    key={user.id}
                    className={`hover:bg-[var(--color-bg-muted)] transition-colors group ${
                      isActive ? "" : "opacity-60"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 bg-[var(--color-primary)] rounded-full flex items-center justify-center text-[var(--on-primary)] text-xs font-semibold ring-2 ring-[var(--color-bg)] flex-shrink-0">
                          {user.firstName?.[0]}
                          {user.lastName?.[0]}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[var(--color-text)] truncate">
                            {user.firstName} {user.lastName}
                            {!isActive && (
                              <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--color-bg-muted)] text-[var(--color-text-muted)] ring-1 ring-inset ring-[var(--color-border-strong)] align-middle">
                                Inactive
                              </span>
                            )}
                          </p>
                          {user.phone && (
                            <p className="text-xs text-[var(--color-text-muted)] truncate">{user.phone}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text)] text-sm truncate max-w-[220px]">
                      {user.email}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text)] text-sm">
                      {user.dealer ? (
                        getDealerName(user.dealer)
                      ) : (
                        <span className="text-[var(--color-text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value as User["role"])}
                        disabled={isSelf}
                        title={isSelf ? "You can't change your own role" : "Change role"}
                        className={`appearance-none px-2.5 py-1 rounded-full text-xs font-medium ring-1 ring-inset cursor-pointer focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                          user.role === "superadmin"
                            ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary)] ring-[var(--color-border)]"
                            : user.role === "admin"
                              ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary)] ring-[var(--color-border)]"
                              : user.role === "manager"
                                ? "bg-[var(--color-warning-subtle)] text-[var(--color-warning)] ring-[var(--color-warning)]"
                                : "bg-[var(--color-bg-muted)] text-[var(--color-text)] ring-[var(--color-border-strong)]"
                        }`}
                      >
                        <option value="sales">Sales</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                        <option value="superadmin">SuperAdmin</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-center text-[var(--color-text-muted)] text-xs tabular-nums">
                      {new Date(user.created).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleEdit(user)}
                          className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-subtle)] rounded-md transition-colors"
                          title="Edit"
                          aria-label={`Edit ${user.email}`}
                        >
                          <Icons.PencilIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleUserActive(user)}
                          disabled={isSelf}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium ring-1 ring-inset transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                            isActive
                              ? "bg-[var(--color-warning-subtle)] text-[var(--color-warning)] ring-[var(--color-warning)] hover:bg-[var(--color-warning-subtle)]"
                              : "bg-[var(--color-success-subtle)] text-[var(--color-success)] ring-[var(--color-success)] hover:bg-[var(--color-success-subtle)]"
                          }`}
                          title={
                            isSelf
                              ? "You can't deactivate your own account"
                              : isActive
                                ? "Deactivate user (keeps their history)"
                                : "Reactivate user"
                          }
                        >
                          {isActive ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          disabled={isSelf}
                          className="p-1.5 text-[var(--color-text-subtle)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-subtle)] rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title={
                            isSelf ? "You can't delete your own account" : "Delete permanently"
                          }
                          aria-label={`Delete ${user.email} permanently`}
                        >
                          <Icons.TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
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

// ============================================
// AI Provider Keys Card
// ============================================

const PROVIDER_META: { id: AiProviderId; label: string; placeholder: string }[] = [
  { id: "openai", label: "OpenAI", placeholder: "sk-…" },
  { id: "anthropic", label: "Anthropic", placeholder: "sk-ant-…" },
  { id: "gemini", label: "Google Gemini", placeholder: "AIza…" },
];

const AiProvidersCard: React.FC = () => {
  const [data, setData] = useState<MaskedAiProviderKeys | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AiProviderId | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<AiProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await getMaskedAiProviderKeys();
      setData(next);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load AI provider keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startEdit = (provider: AiProviderId) => {
    setEditing(provider);
    setDraft("");
    setError(null);
  };

  const cancelEdit = () => {
    setEditing(null);
    setDraft("");
  };

  const saveKey = async (provider: AiProviderId) => {
    if (!draft.trim()) {
      setError("Paste a key before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateAiProviderKeys({ [`${provider}ApiKey`]: draft.trim() });
      setEditing(null);
      setDraft("");
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save key");
    } finally {
      setSaving(false);
    }
  };

  const clearKey = async (provider: AiProviderId) => {
    const ok = await confirmAction({
      title: "Remove provider key",
      message: `Remove the ${provider} key? AI requests routed to this provider will start failing.`,
      tone: "danger",
      confirmLabel: "Remove",
    });
    if (!ok) return;
    setSaving(true);
    setError(null);
    try {
      await updateAiProviderKeys({ clear: [provider] });
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to clear key");
    } finally {
      setSaving(false);
    }
  };

  const testKey = async (provider: AiProviderId) => {
    setTesting(provider);
    setError(null);
    try {
      await testAiProviderKey(provider);
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTesting(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl bg-[var(--color-bg)] ring-1 ring-[var(--color-border)] rounded-lg p-6">
        <Icons.SpinnerIcon className="w-5 h-5 text-[var(--color-primary)] animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl bg-[var(--color-bg)] ring-1 ring-[var(--color-border)] rounded-lg p-6 space-y-5">
      <div>
        <h3 className="text-base font-semibold text-[var(--color-text)] tracking-tight">AI Providers</h3>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          Keys are stored in your PocketBase backend and read by the AI proxy at request time. The
          frontend never sees full keys.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-[var(--color-danger-subtle)] border border-[var(--color-danger)] px-3 py-2 text-xs text-[var(--color-danger)]">
          {error}
        </div>
      )}

      <div className="divide-y divide-[var(--color-border)] -mx-2">
        {PROVIDER_META.map((p) => {
          const configured = data?.configured[p.id] ?? false;
          const masked = (data?.[`${p.id}ApiKey` as const] as string | undefined) ?? "";
          const lastTest = data?.lastTested[p.id];
          const isEditing = editing === p.id;
          return (
            <div key={p.id} className="px-2 py-3 flex flex-wrap items-center gap-3">
              <div className="min-w-[120px]">
                <p className="text-sm font-medium text-[var(--color-text)]">{p.label}</p>
                <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                  {configured ? "Configured" : "Not configured"}
                </p>
              </div>
              <div className="flex-1 min-w-[200px]">
                {isEditing ? (
                  <input
                    type="password"
                    autoComplete="off"
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={p.placeholder}
                    className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
                  />
                ) : (
                  <span className="inline-block px-2 py-1 rounded bg-[var(--color-bg-subtle)] ring-1 ring-[var(--color-border)] text-xs font-mono text-[var(--color-text-muted)]">
                    {configured ? masked || "••••" : "—"}
                  </span>
                )}
                {p.id === "gemini" && (
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
                    Use a paid-tier (billed project) Gemini key — free-tier keys allow Google to
                    train on submitted data.
                  </p>
                )}
                {lastTest && !isEditing && (
                  <p
                    className={`text-[11px] mt-1 ${
                      lastTest.ok ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"
                    }`}
                  >
                    {lastTest.ok ? "Live ✓" : "Failed ✗"} {" · "}
                    {new Date(lastTest.at).toLocaleString()}
                    {lastTest.error && !lastTest.ok && (
                      <span className="text-[var(--color-danger)]"> — {lastTest.error}</span>
                    )}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <>
                    <button
                      type="button"
                      onClick={() => saveKey(p.id)}
                      disabled={saving}
                      className="px-3 py-1.5 rounded-md bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--on-primary)] text-xs font-medium disabled:opacity-50"
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      disabled={saving}
                      className="px-3 py-1.5 rounded-md bg-[var(--color-bg-muted)] hover:bg-[var(--color-bg-muted)] text-[var(--color-text)] text-xs font-medium"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => startEdit(p.id)}
                      className="px-3 py-1.5 rounded-md bg-[var(--color-bg-muted)] hover:bg-[var(--color-bg-muted)] text-[var(--color-text)] text-xs font-medium"
                    >
                      {configured ? "Replace" : "Add key"}
                    </button>
                    {configured && (
                      <>
                        <button
                          type="button"
                          onClick={() => testKey(p.id)}
                          disabled={testing === p.id}
                          className="px-3 py-1.5 rounded-md bg-[var(--color-bg-muted)] hover:bg-[var(--color-bg-muted)] text-[var(--color-text)] text-xs font-medium disabled:opacity-50"
                        >
                          {testing === p.id ? "Testing…" : "Test"}
                        </button>
                        <button
                          type="button"
                          onClick={() => clearKey(p.id)}
                          disabled={saving}
                          className="px-3 py-1.5 rounded-md bg-[var(--color-danger-subtle)] hover:bg-[var(--color-danger-subtle)] ring-1 ring-[var(--color-danger)] text-[var(--color-danger)] text-xs font-medium"
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================
// AI Defaults Card (provider + per-task model)
// ============================================

const AiDefaultsCard: React.FC = () => {
  const [provider, setProvider] = useState<AiProviderId>(DEFAULT_AI_SETTINGS.provider);
  const [lenderExtractModel, setLenderExtractModel] = useState(
    DEFAULT_AI_SETTINGS.lenderExtractModel
  );
  const [dealAnalysisModel, setDealAnalysisModel] = useState(DEFAULT_AI_SETTINGS.dealAnalysisModel);
  const [quickModel, setQuickModel] = useState(DEFAULT_AI_SETTINGS.quickModel);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getSystemSettings().then((s) => {
      if (cancelled) return;
      const ai = s.aiDefaults;
      if (ai?.provider) setProvider(ai.provider);
      if (ai?.lenderExtractModel) setLenderExtractModel(ai.lenderExtractModel);
      if (ai?.dealAnalysisModel) setDealAnalysisModel(ai.dealAnalysisModel);
      if (ai?.quickModel) setQuickModel(ai.quickModel);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const modelsFor = (task: "lenderExtract" | "dealAnalysis" | "quick") =>
    AI_MODELS.filter((m) => m.provider === provider && m.tasks.includes(task));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const current = await getSystemSettings();
      await updateSystemSettings({
        supportEmail: current.supportEmail,
        announcementBanner: current.announcementBanner,
        signupsEnabled: current.signupsEnabled,
        defaultLtvThresholds: current.defaultLtvThresholds,
        aiDefaults: { provider, lenderExtractModel, dealAnalysisModel, quickModel },
      });
      setSavedAt(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save AI defaults");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl bg-[var(--color-bg)] ring-1 ring-[var(--color-border)] rounded-lg p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-base font-semibold text-[var(--color-text)] tracking-tight">AI Defaults</h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            Default provider and model per task. Dealer-level settings override these.
          </p>
        </div>
        {savedAt && (
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-success)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" />
            Saved {savedAt.toLocaleTimeString()}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-[var(--color-danger-subtle)] border border-[var(--color-danger)] px-3 py-2 text-xs text-[var(--color-danger)]">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Provider</label>
          <select
            value={provider}
            onChange={(e) => {
              const next = e.target.value as AiProviderId;
              setProvider(next);
              const first = (task: "lenderExtract" | "dealAnalysis" | "quick") =>
                AI_MODELS.find((m) => m.provider === next && m.tasks.includes(task))?.id ?? "";
              setLenderExtractModel(first("lenderExtract"));
              setDealAnalysisModel(first("dealAnalysis"));
              setQuickModel(first("quick"));
            }}
            className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
          >
            {AI_PROVIDER_ORDER.map((id) => (
              <option key={id} value={id}>
                {id === "openai" ? "OpenAI" : id === "anthropic" ? "Anthropic" : "Google Gemini"}
              </option>
            ))}
          </select>
        </div>

        {(
          [
            ["Lender extract", lenderExtractModel, setLenderExtractModel, "lenderExtract"],
            ["Deal analysis", dealAnalysisModel, setDealAnalysisModel, "dealAnalysis"],
            ["Quick tasks", quickModel, setQuickModel, "quick"],
          ] as const
        ).map(([label, value, setter, task]) => (
          <div key={task}>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{label}</label>
            <select
              value={value}
              onChange={(e) => setter(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
            >
              {modelsFor(task).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} {m.isPreview ? "(preview)" : ""}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save AI defaults"}
        </Button>
      </div>
    </div>
  );
};

// ============================================
// Audit Log Card
// ============================================

const formatAuditAction = (action: string): string => {
  switch (action) {
    case "ai_key_updated":
      return "Updated key";
    case "ai_key_cleared":
      return "Removed key";
    case "ai_key_tested":
      return "Tested key";
    default:
      return action;
  }
};

const AuditLogCard: React.FC = () => {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listAuditLog(25);
      setEntries(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="max-w-3xl bg-[var(--color-bg)] ring-1 ring-[var(--color-border)] rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-base font-semibold text-[var(--color-text)] tracking-tight">Audit Log</h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            Most recent 25 entries. Append-only — entries cannot be edited or deleted.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="px-3 py-1.5 rounded-md bg-[var(--color-bg-muted)] hover:bg-[var(--color-bg-muted)] text-[var(--color-text)] text-xs font-medium disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-[var(--color-danger-subtle)] border border-[var(--color-danger)] px-3 py-2 text-xs text-[var(--color-danger)]">
          {error}
        </div>
      )}

      {!loading && entries.length === 0 && !error && (
        <p className="text-xs text-[var(--color-text-muted)] italic">No entries yet.</p>
      )}

      {entries.length > 0 && (
        <div className="divide-y divide-[var(--color-border)] -mx-2">
          {entries.map((entry) => {
            const actor = entry.expand?.actor;
            const actorName = actor
              ? `${actor.firstName ?? ""} ${actor.lastName ?? ""}`.trim() ||
                actor.email ||
                entry.actor
              : entry.actor;
            const details = entry.details as { ok?: boolean; error?: string } | null;
            return (
              <div
                key={entry.id}
                className="px-2 py-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1"
              >
                <span className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
                  {new Date(entry.created).toLocaleString()}
                </span>
                <span className="text-xs font-medium text-[var(--color-text)]">{actorName}</span>
                <span className="text-xs text-[var(--color-text-muted)]">{formatAuditAction(entry.action)}</span>
                {entry.target && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--color-bg-muted)] text-[var(--color-text-muted)] font-mono">
                    {entry.target}
                  </span>
                )}
                {details?.ok === false && details?.error && (
                  <span className="text-[11px] text-[var(--color-danger)]">— {details.error}</span>
                )}
                {details?.ok === true && (
                  <span className="text-[11px] text-[var(--color-success)]">— live</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

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
        <Icons.SpinnerIcon className="w-6 h-6 text-[var(--color-primary)] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fadeIn">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text)] tracking-tight">System Settings</h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Affects every dealership on the platform.</p>
        </div>
        {savedAt && (
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-success)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" />
            Saved {savedAt.toLocaleTimeString()}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-[var(--color-danger-subtle)] border border-[var(--color-danger)] px-4 py-3 text-sm text-[var(--color-danger)] max-w-3xl">
          {error}
        </div>
      )}

      <div className="max-w-3xl bg-[var(--color-bg)] ring-1 ring-[var(--color-border)] rounded-lg p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Support email</label>
          <input
            type="email"
            value={form.supportEmail || ""}
            onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
            className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
            placeholder="support@ltvdesking.com"
          />
          <p className="text-xs text-[var(--color-text-muted)] mt-1.5">
            Shown to dealers in error messages and help screens.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
            Announcement banner
          </label>
          <textarea
            value={form.announcementBanner || ""}
            onChange={(e) => setForm({ ...form, announcementBanner: e.target.value })}
            className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] min-h-[60px] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
            placeholder="Scheduled maintenance Friday 10pm ET…"
          />
          <p className="text-xs text-[var(--color-text-muted)] mt-1.5">
            Leave empty to hide. Displayed at the top of every page when set.
          </p>
        </div>

        <div className="flex items-center justify-between p-4 bg-[var(--color-bg-subtle)] ring-1 ring-[var(--color-border)] rounded-xl">
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">Allow new dealer signups</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              When off, the public registration form on <code className="text-[var(--color-text-muted)]">/</code> is
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
            <div className="w-11 h-6 bg-[var(--color-bg-muted)] peer-focus:ring-2 peer-focus:ring-[var(--color-primary)] rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--color-primary)]"></div>
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
            Default LTV thresholds (JSON)
          </label>
          <textarea
            value={
              typeof form.defaultLtvThresholds === "string"
                ? form.defaultLtvThresholds
                : JSON.stringify(form.defaultLtvThresholds ?? {}, null, 2)
            }
            onChange={(e) => setForm({ ...form, defaultLtvThresholds: e.target.value })}
            className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] font-mono text-xs min-h-[140px] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
            placeholder='{"700": 120, "650": 110}'
            spellCheck={false}
          />
          <p className="text-xs text-[var(--color-text-muted)] mt-1.5">
            Applied as the default for new dealerships.
          </p>
        </div>
      </div>

      <div className="max-w-3xl flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>

      <AiProvidersCard />
      <AiDefaultsCard />
      <AuditLogCard />
    </div>
  );
};

// ============================================
// Overview Tab
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

const OverviewTab: React.FC<{
  stats: SystemStats;
  dealers: Dealer[];
  users: User[];
  onJumpTab: (tab: "overview" | "dealers" | "users" | "settings") => void;
  onImpersonate: (dealerId: string) => void;
  onOnboard: () => void;
}> = ({ stats, dealers, users, onJumpTab, onImpersonate, onOnboard }) => {
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 16 }}>
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 16 }}>
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
      <div
        className="dc-card"
        style={{ ...panelCard, overflow: "hidden", marginBottom: 16 }}
      >
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
          <span style={perfHeadCell}>DEALER</span>
          <span style={{ ...perfHeadCell, textAlign: "right" }}>UNITS</span>
          <span style={{ ...perfHeadCell, textAlign: "right" }}>AVG APPROVAL</span>
          <span style={{ ...perfHeadCell, textAlign: "right" }}>DEALS</span>
          <span style={{ ...perfHeadCell, textAlign: "right" }}>INVENTORY VALUE</span>
          <span style={{ ...perfHeadCell, textAlign: "right" }}>STATUS</span>
        </div>
        {dealers.length === 0 && (
          <div style={{ padding: "30px 18px", textAlign: "center", fontSize: 13, color: "var(--color-text-muted)" }}>
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
                <span style={{ fontSize: 14.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {dealer.name}
                </span>
              </div>
              <span style={{ fontSize: 14, textAlign: "right", ...adminMono }}>
                {p ? p.units.toLocaleString() : "—"}
              </span>
              <span style={{ fontSize: 14, textAlign: "right", ...adminMono, color: "var(--color-text-subtle)" }} title="Approval scoring runs inside a dealer context">
                —
              </span>
              <span style={{ fontSize: 14, textAlign: "right", ...adminMono, color: "var(--color-text-muted)" }}>
                {p ? p.deals.toLocaleString() : "—"}
              </span>
              <span style={{ fontSize: 14, textAlign: "right", ...adminMono, color: "var(--color-text-subtle)" }}>
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
            className="lift-btn btn-primary"
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
            className="lift-btn"
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
            className="lift-btn"
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
                    {dealer.city ? ` · ${dealer.city}${dealer.state ? `, ${dealer.state}` : ""}` : ""}
                  </span>
                }
                right={
                  dealer.active ? (
                    <ActivePill />
                  ) : (
                    <span style={{ fontSize: 12, fontWeight: 600, background: "var(--color-bg-muted)", color: "var(--color-text-muted)", padding: "4px 9px", borderRadius: 6 }}>
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
  const [activeTab, setActiveTab] = useState<"overview" | "dealers" | "users" | "settings">(
    "overview"
  );
  // Header/quick-action "Onboard new dealer" → the existing create-dealer
  // wizard, hoisted to the dashboard level. [P7]
  const [showOnboard, setShowOnboard] = useState(false);
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
      <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center">
        <Icons.SpinnerIcon className="w-8 h-8 text-[var(--color-primary)] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen text-[var(--color-text)]" style={{ background: "var(--color-bg-subtle)", fontFamily: "var(--font-sans)" }}>
      {/* 58px console header — mockup lines 761-771 */}
      <ConsoleHeader
        label="OWNER CONSOLE"
        title={`${currentUser?.firstName ?? ""} ${currentUser?.lastName ?? ""}`.trim() || currentUser?.email || "—"}
        sub={currentUser?.role === "superadmin" ? "Superadmin" : "Admin"}
        right={
          <>
            {onSwitchToDealer && (
              <button
                onClick={onSwitchToDealer}
                className="lift-btn"
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
              className="lift-btn btn-primary"
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

      {/* Sub-tab bar — .tab-btn idiom, counts live */}
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
        <ConsoleTab active={activeTab === "overview"} onClick={() => setActiveTab("overview")} label="Overview" />
        <ConsoleTab active={activeTab === "dealers"} onClick={() => setActiveTab("dealers")} label="Dealers" badge={stats.totalDealers} />
        <ConsoleTab active={activeTab === "users"} onClick={() => setActiveTab("users")} label="Users" badge={stats.totalUsers} />
        <ConsoleTab active={activeTab === "settings"} onClick={() => setActiveTab("settings")} label="Settings" />
        <div style={{ marginLeft: "auto" }}>
          <RefreshBar
            loading={isRefreshing}
            lastUpdated={lastUpdated}
            onRefresh={() => loadData(true)}
          />
        </div>
      </div>

      {showOnboard && (
        <CreateDealerWizard
          onClose={() => setShowOnboard(false)}
          onCreated={() => {
            setShowOnboard(false);
            loadData(true);
          }}
        />
      )}

      <div style={{ padding: 24 }}>
        {/* Content */}
        {activeTab === "overview" && (
          <OverviewTab
            stats={stats}
            dealers={dealers}
            users={users}
            onJumpTab={setActiveTab}
            onImpersonate={(id) => onImpersonate?.(id)}
            onOnboard={() => setShowOnboard(true)}
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
