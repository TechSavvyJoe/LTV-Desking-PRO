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

// ============================================
// Helper Components
// ============================================

const StatCard: React.FC<{
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}> = ({ label, value, icon, color }) => (
  <div className={`bg-gradient-to-br ${color} rounded-2xl p-6 text-white shadow-xl`}>
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium opacity-80">{label}</p>
        <p className="text-4xl font-bold mt-1">{value.toLocaleString()}</p>
      </div>
      <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
        {icon}
      </div>
    </div>
  </div>
);

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}> = ({ active, onClick, icon, label }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium transition-all ${
      active
        ? "bg-blue-600 text-white shadow-lg"
        : "text-slate-400 hover:text-white hover:bg-slate-800"
    }`}
  >
    {icon}
    {label}
  </button>
);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
          <h3 className="text-lg font-semibold text-white">
            {step === "done" ? "Dealership ready" : "Add new dealership"}
          </h3>
          {step !== "done" && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white"
              aria-label="Close"
            >
              <Icons.XMarkIcon className="w-5 h-5" />
            </button>
          )}
        </div>

        {step !== "done" && (
          <div className="px-6 pt-4 flex items-center gap-2 text-xs">
            <span
              className={`px-3 py-1 rounded-full font-medium ${
                step === 1
                  ? "bg-blue-600 text-white"
                  : "bg-emerald-600/30 text-emerald-300"
              }`}
            >
              1. Dealership
            </span>
            <span className="text-slate-600">›</span>
            <span
              className={`px-3 py-1 rounded-full font-medium ${
                step === 2 ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-400"
              }`}
            >
              2. First admin user
            </span>
          </div>
        )}

        <div className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Name *</label>
                <input
                  type="text"
                  value={dealerForm.name}
                  onChange={(e) => setDealerForm({ ...dealerForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  placeholder="Acme Motors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Code *</label>
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
                <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
                <input
                  type="email"
                  value={dealerForm.email}
                  onChange={(e) => setDealerForm({ ...dealerForm, email: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  placeholder="contact@dealer.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Phone</label>
                <input
                  type="tel"
                  value={dealerForm.phone}
                  onChange={(e) => setDealerForm({ ...dealerForm, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  placeholder="(555) 123-4567"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-300 mb-1">Address</label>
                <input
                  type="text"
                  value={dealerForm.address}
                  onChange={(e) => setDealerForm({ ...dealerForm, address: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  placeholder="123 Auto Drive"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">City</label>
                <input
                  type="text"
                  value={dealerForm.city}
                  onChange={(e) => setDealerForm({ ...dealerForm, city: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  placeholder="Detroit"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">State</label>
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
                <label className="block text-sm font-medium text-slate-300 mb-1">First name *</label>
                <input
                  type="text"
                  value={adminForm.firstName}
                  onChange={(e) => setAdminForm({ ...adminForm, firstName: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  placeholder="Jane"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Last name *</label>
                <input
                  type="text"
                  value={adminForm.lastName}
                  onChange={(e) => setAdminForm({ ...adminForm, lastName: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  placeholder="Smith"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-300 mb-1">Email *</label>
                <input
                  type="email"
                  value={adminForm.email}
                  onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  placeholder="jane@dealer.com"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-300 mb-1">Phone</label>
                <input
                  type="tel"
                  value={adminForm.phone}
                  onChange={(e) => setAdminForm({ ...adminForm, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  placeholder="(555) 123-4567"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Password *</label>
                <input
                  type="password"
                  value={adminForm.password}
                  onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  placeholder="Min 8 characters"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
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
            <div className="text-center py-6 space-y-4">
              <div className="mx-auto w-14 h-14 bg-emerald-500/20 rounded-full flex items-center justify-center">
                <Icons.CheckCircleIcon className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <h4 className="text-xl font-semibold text-white">
                  {created.dealer.name} is ready
                </h4>
                <p className="text-slate-400 text-sm mt-1">
                  Share these details with the new admin so they can sign in at <code>/</code>.
                </p>
              </div>
              <div className="bg-slate-950 border border-slate-700 rounded-xl p-4 text-left space-y-2 max-w-md mx-auto">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Dealer code</span>
                  <code className="font-mono text-blue-400 font-bold">{created.dealer.code}</code>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Admin email</span>
                  <span className="text-white">{created.admin.email}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Admin name</span>
                  <span className="text-white">
                    {created.admin.firstName} {created.admin.lastName}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-700">
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
  onRefresh: () => void;
  onImpersonate: (dealerId: string) => void;
}> = ({ dealers, onRefresh, onImpersonate }) => {
  const [showWizard, setShowWizard] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Dealership Management</h2>
        <Button onClick={() => setShowWizard(true)} className="gap-2">
          <Icons.PlusIcon className="w-4 h-4" />
          Add Dealer
        </Button>
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
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold text-white mb-4">Edit Dealer</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                placeholder="Dealership Name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Code *</label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    code: e.target.value.toUpperCase(),
                  })
                }
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white uppercase"
                placeholder="DEALER01"
                maxLength={10}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                placeholder="contact@dealer.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                placeholder="(555) 123-4567"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">City</label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                placeholder="Detroit"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">State</label>
              <input
                type="text"
                value={formData.state}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    state: e.target.value.toUpperCase(),
                  })
                }
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white uppercase"
                placeholder="MI"
                maxLength={2}
              />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-sm font-medium text-slate-300 mb-1">Address</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                placeholder="123 Auto Drive"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="active"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                className="w-4 h-4 rounded"
              />
              <label htmlFor="active" className="text-sm text-slate-300">
                Active
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="secondary" onClick={resetForm}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!formData.name || !formData.code}>
              Save Changes
            </Button>
          </div>
        </div>
      )}

      {/* Dealers Table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">
                Code
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">
                Location
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">
                Contact
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase">
                Status
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {dealers.map((dealer) => (
              <tr key={dealer.id} className="hover:bg-slate-800/50 transition-colors">
                <td className="px-4 py-4">
                  <p className="font-medium text-white">{dealer.name}</p>
                </td>
                <td className="px-4 py-4">
                  <code className="px-2 py-1 bg-slate-900 rounded text-blue-400 text-sm">
                    {dealer.code}
                  </code>
                </td>
                <td className="px-4 py-4 text-slate-300">
                  {dealer.city && dealer.state ? `${dealer.city}, ${dealer.state}` : "—"}
                </td>
                <td className="px-4 py-4 text-slate-300 text-sm">
                  {dealer.email || dealer.phone || "—"}
                </td>
                <td className="px-4 py-4 text-center">
                  <button
                    onClick={() => handleToggleActive(dealer)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      dealer.active
                        ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                        : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                    }`}
                  >
                    {dealer.active ? "Active" : "Inactive"}
                  </button>
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => handleImpersonate(dealer)}
                      className="p-2 text-slate-400 hover:text-purple-400 hover:bg-slate-700 rounded-lg transition-colors"
                      title="View as this dealership"
                      disabled={!dealer.active}
                    >
                      <Icons.EyeIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleEdit(dealer)}
                      className="p-2 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Icons.PencilIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(dealer.id)}
                      className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Icons.TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {dealers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                  No dealers found. Click "Add Dealer" to create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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

  const filteredUsers = users.filter((user) => {
    if (filterDealer && user.dealer !== filterDealer) return false;
    if (filterRole && user.role !== filterRole) return false;
    return true;
  });

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-xl font-bold text-white">User Management</h2>
        <div className="flex items-center gap-3">
          <select
            value={filterDealer}
            onChange={(e) => setFilterDealer(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
          >
            <option value="">All Dealers</option>
            {dealers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
          >
            <option value="">All Roles</option>
            <option value="sales">Sales</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
            <option value="superadmin">SuperAdmin</option>
          </select>
          <Button onClick={() => setIsCreating(true)} className="gap-2">
            <Icons.PlusIcon className="w-4 h-4" />
            Add User
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-300">
          {error}
        </div>
      )}

      {/* Create/Edit Form */}
      {(isCreating || editingId) && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold text-white mb-4">
            {editingId ? "Edit User" : "Create New User"}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">First Name *</label>
              <input
                type="text"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                placeholder="John"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Last Name *</label>
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                placeholder="Doe"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Email *</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                placeholder="john@dealer.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                placeholder="(555) 123-4567"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Dealer *</label>
              <select
                value={formData.dealer}
                onChange={(e) => setFormData({ ...formData, dealer: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
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
              <label className="block text-sm font-medium text-slate-300 mb-1">Role *</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as User["role"] })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
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
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Password *
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                    placeholder="Min 8 characters"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Confirm Password *
                  </label>
                  <input
                    type="password"
                    value={formData.passwordConfirm}
                    onChange={(e) => setFormData({ ...formData, passwordConfirm: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                    placeholder="Re-enter password"
                  />
                </div>
              </>
            )}
          </div>
          <div className="flex justify-end gap-3 mt-6">
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
              {editingId ? "Save Changes" : "Create User"}
            </Button>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">
                User
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">
                Email
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">
                Dealer
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase">
                Role
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase">
                Created
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {filteredUsers.map((user) => (
              <tr key={user.id} className="hover:bg-slate-800/50 transition-colors">
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-medium">
                      {user.firstName?.[0]}
                      {user.lastName?.[0]}
                    </div>
                    <p className="font-medium text-white">
                      {user.firstName} {user.lastName}
                    </p>
                  </div>
                </td>
                <td className="px-4 py-4 text-slate-300 text-sm">{user.email}</td>
                <td className="px-4 py-4 text-slate-300">{getDealerName(user.dealer)}</td>
                <td className="px-4 py-4 text-center">
                  <select
                    value={user.role}
                    onChange={(e) => handleRoleChange(user.id, e.target.value as User["role"])}
                    className={`px-3 py-1 rounded-lg text-xs font-medium border-0 cursor-pointer ${getRoleBadgeColor(
                      user.role
                    )}`}
                  >
                    <option value="sales">Sales</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                    <option value="superadmin">SuperAdmin</option>
                  </select>
                </td>
                <td className="px-4 py-4 text-center text-slate-400 text-sm">
                  {new Date(user.created).toLocaleDateString()}
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => handleEdit(user)}
                      className="p-2 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Icons.PencilIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteUser(user.id)}
                      className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors"
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
                <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                  No users found matching the filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">System Settings</h2>
        {savedAt && (
          <span className="text-xs text-emerald-400">Saved {savedAt.toLocaleTimeString()}</span>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Support email</label>
          <input
            type="email"
            value={form.supportEmail || ""}
            onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
            placeholder="support@ltvdesking.com"
          />
          <p className="text-xs text-slate-500 mt-1">
            Shown to dealers in error messages and help screens.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            Announcement banner
          </label>
          <textarea
            value={form.announcementBanner || ""}
            onChange={(e) => setForm({ ...form, announcementBanner: e.target.value })}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white min-h-[60px]"
            placeholder="Scheduled maintenance Friday 10pm ET…"
          />
          <p className="text-xs text-slate-500 mt-1">
            Leave empty to hide. Displayed at the top of every page when set.
          </p>
        </div>

        <div className="flex items-center justify-between p-4 bg-slate-950 border border-slate-700 rounded-xl">
          <div>
            <p className="text-sm font-medium text-white">Allow new dealer signups</p>
            <p className="text-xs text-slate-500">
              When off, the public registration form on / is disabled.
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
          <label className="block text-sm font-medium text-slate-300 mb-1">
            Default LTV thresholds (JSON)
          </label>
          <textarea
            value={
              typeof form.defaultLtvThresholds === "string"
                ? form.defaultLtvThresholds
                : JSON.stringify(form.defaultLtvThresholds ?? {}, null, 2)
            }
            onChange={(e) => setForm({ ...form, defaultLtvThresholds: e.target.value })}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-xs min-h-[140px]"
            placeholder='{"700": 120, "650": 110}'
            spellCheck={false}
          />
          <p className="text-xs text-slate-500 mt-1">Applied as the default for new dealerships.</p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
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

  const currentUser = getCurrentUser();

  const loadData = useCallback(async () => {
    setIsLoading(true);
    const [statsData, dealersData, usersData] = await Promise.all([
      getSystemStats(),
      getAllDealers(),
      getAllUsers(),
    ]);
    setStats(statsData);
    setDealers(dealersData);
    setUsers(usersData);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Icons.SpinnerIcon className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-lg border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                <Icons.Cog6ToothIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Super Admin Console</h1>
                <p className="text-sm text-slate-400">LTV Desking PRO Management</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {onSwitchToDealer && (
                <Button variant="secondary" onClick={onSwitchToDealer} size="sm">
                  <Icons.ChevronLeftIcon className="w-4 h-4 mr-2" />
                  Dealer View
                </Button>
              )}
              <div className="flex items-center gap-3 px-4 py-2 bg-slate-800 rounded-xl">
                <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-sm font-medium">
                  {currentUser?.firstName?.[0]}
                  {currentUser?.lastName?.[0]}
                </div>
                <span className="text-sm font-medium">
                  {currentUser?.firstName} {currentUser?.lastName}
                </span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={logout}
                className="text-red-400 hover:bg-red-500/10"
              >
                <Icons.ArrowRightStartOnRectangleIcon className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex items-center gap-2 mb-8">
          <TabButton
            active={activeTab === "overview"}
            onClick={() => setActiveTab("overview")}
            icon={<Icons.ChartIcon className="w-5 h-5" />}
            label="Overview"
          />
          <TabButton
            active={activeTab === "dealers"}
            onClick={() => setActiveTab("dealers")}
            icon={<Icons.BuildingLibraryIcon className="w-5 h-5" />}
            label="Dealers"
          />
          <TabButton
            active={activeTab === "users"}
            onClick={() => setActiveTab("users")}
            icon={<Icons.UserIcon className="w-5 h-5" />}
            label="Users"
          />
          <TabButton
            active={activeTab === "settings"}
            onClick={() => setActiveTab("settings")}
            icon={<Icons.Cog6ToothIcon className="w-5 h-5" />}
            label="Settings"
          />
        </div>

        {/* Content */}
        {activeTab === "overview" && (
          <div className="space-y-8">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard
                label="Total Dealers"
                value={stats.totalDealers}
                icon={<Icons.BuildingLibraryIcon className="w-7 h-7" />}
                color="from-blue-600 to-blue-700"
              />
              <StatCard
                label="Active Dealers"
                value={stats.activeDealers}
                icon={<Icons.CheckCircleIcon className="w-7 h-7" />}
                color="from-emerald-600 to-emerald-700"
              />
              <StatCard
                label="Total Users"
                value={stats.totalUsers}
                icon={<Icons.UserIcon className="w-7 h-7" />}
                color="from-purple-600 to-purple-700"
              />
              <StatCard
                label="Total Deals"
                value={stats.totalDeals}
                icon={<Icons.ClipboardDocumentIcon className="w-7 h-7" />}
                color="from-amber-600 to-amber-700"
              />
            </div>

            {/* Quick Info */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent Dealers */}
              <div className="bg-slate-900/50 rounded-2xl border border-slate-800 p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Icons.BuildingLibraryIcon className="w-5 h-5 text-blue-400" />
                  Recent Dealers
                </h3>
                <div className="space-y-3">
                  {dealers.slice(0, 5).map((dealer) => (
                    <div
                      key={dealer.id}
                      className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl"
                    >
                      <div>
                        <p className="font-medium">{dealer.name}</p>
                        <p className="text-sm text-slate-400">
                          {dealer.city}, {dealer.state}
                        </p>
                      </div>
                      <span
                        className={`px-2 py-1 rounded-full text-xs ${
                          dealer.active
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-red-500/20 text-red-400"
                        }`}
                      >
                        {dealer.active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  ))}
                  {dealers.length === 0 && (
                    <p className="text-slate-500 text-center py-4">No dealers yet</p>
                  )}
                </div>
              </div>

              {/* Recent Users */}
              <div className="bg-slate-900/50 rounded-2xl border border-slate-800 p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Icons.UserIcon className="w-5 h-5 text-purple-400" />
                  Recent Users
                </h3>
                <div className="space-y-3">
                  {users.slice(0, 5).map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-sm font-medium">
                          {user.firstName?.[0]}
                          {user.lastName?.[0]}
                        </div>
                        <div>
                          <p className="font-medium">
                            {user.firstName} {user.lastName}
                          </p>
                          <p className="text-sm text-slate-400">{user.email}</p>
                        </div>
                      </div>
                      <span className="px-2 py-1 rounded-full text-xs bg-slate-700 text-slate-300 capitalize">
                        {user.role}
                      </span>
                    </div>
                  ))}
                  {users.length === 0 && (
                    <p className="text-slate-500 text-center py-4">No users yet</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "dealers" && (
          <DealerManagement
            dealers={dealers}
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
