import React, { useState, useEffect, useCallback } from "react";
import { getCurrentUser, User, Dealer } from "../../lib/pocketbase";
import {
  getSystemStats,
  getAllDealers,
  createDealer,
  updateDealer,
  deleteDealer,
  getAllUsers,
  updateUserRole,
  updateUser,
  deleteUser,
  SystemStats,
} from "../../lib/api";
import { logout } from "../../lib/auth";
import Button from "../common/Button";
import * as Icons from "../common/Icons";

// ============================================
// Helper Components
// ============================================

const StatCard: React.FC<{
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}> = ({ label, value, icon, color }) => (
  <div
    className={`bg-gradient-to-br ${color} rounded-2xl p-6 text-white shadow-xl`}
  >
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
// Dealer Management Component
// ============================================

const DealerManagement: React.FC<{
  dealers: Dealer[];
  onRefresh: () => void;
}> = ({ dealers, onRefresh }) => {
  const [isCreating, setIsCreating] = useState(false);
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
    setIsCreating(false);
    setEditingId(null);
  };

  const handleSubmit = async () => {
    if (editingId) {
      await updateDealer(editingId, formData);
    } else {
      await createDealer(formData);
    }
    resetForm();
    onRefresh();
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
      confirm(
        "Are you sure you want to delete this dealer? This will affect all associated users and data."
      )
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
        <Button onClick={() => setIsCreating(true)} className="gap-2">
          <Icons.PlusIcon className="w-4 h-4" />
          Add Dealer
        </Button>
      </div>

      {/* Create/Edit Form */}
      {(isCreating || editingId) && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold text-white mb-4">
            {editingId ? "Edit Dealer" : "Create New Dealer"}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                placeholder="Dealership Name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Code *
              </label>
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
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                placeholder="contact@dealer.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Phone
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                placeholder="(555) 123-4567"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                City
              </label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) =>
                  setFormData({ ...formData, city: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                placeholder="Detroit"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                State
              </label>
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
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Address
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) =>
                  setFormData({ ...formData, address: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                placeholder="123 Auto Drive"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="active"
                checked={formData.active}
                onChange={(e) =>
                  setFormData({ ...formData, active: e.target.checked })
                }
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
            <Button
              onClick={handleSubmit}
              disabled={!formData.name || !formData.code}
            >
              {editingId ? "Save Changes" : "Create Dealer"}
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
              <tr
                key={dealer.id}
                className="hover:bg-slate-800/50 transition-colors"
              >
                <td className="px-4 py-4">
                  <p className="font-medium text-white">{dealer.name}</p>
                </td>
                <td className="px-4 py-4">
                  <code className="px-2 py-1 bg-slate-900 rounded text-blue-400 text-sm">
                    {dealer.code}
                  </code>
                </td>
                <td className="px-4 py-4 text-slate-300">
                  {dealer.city && dealer.state
                    ? `${dealer.city}, ${dealer.state}`
                    : "—"}
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
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-slate-500"
                >
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
    if (confirm("Are you sure you want to delete this user?")) {
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
        </div>
      </div>

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
              <tr
                key={user.id}
                className="hover:bg-slate-800/50 transition-colors"
              >
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
                <td className="px-4 py-4 text-slate-300 text-sm">
                  {user.email}
                </td>
                <td className="px-4 py-4 text-slate-300">
                  {getDealerName(user.dealer)}
                </td>
                <td className="px-4 py-4 text-center">
                  <select
                    value={user.role}
                    onChange={(e) =>
                      handleRoleChange(user.id, e.target.value as User["role"])
                    }
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
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-slate-500"
                >
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
// Main SuperAdmin Dashboard
// ============================================

interface SuperAdminDashboardProps {
  onSwitchToDealer?: () => void;
}

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({
  onSwitchToDealer,
}) => {
  const [activeTab, setActiveTab] = useState<"overview" | "dealers" | "users">(
    "overview"
  );
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
                <p className="text-sm text-slate-400">
                  LTV Desking PRO Management
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {onSwitchToDealer && (
                <Button
                  variant="secondary"
                  onClick={onSwitchToDealer}
                  size="sm"
                >
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
                    <p className="text-slate-500 text-center py-4">
                      No dealers yet
                    </p>
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
                    <p className="text-slate-500 text-center py-4">
                      No users yet
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "dealers" && (
          <DealerManagement dealers={dealers} onRefresh={loadData} />
        )}

        {activeTab === "users" && (
          <UserManagement
            users={users}
            dealers={dealers}
            onRefresh={loadData}
          />
        )}
      </div>
    </div>
  );
};

export default SuperAdminDashboard;
