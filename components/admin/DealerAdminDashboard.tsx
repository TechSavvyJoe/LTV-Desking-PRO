import React, { useState, useEffect, useCallback } from "react";
import { getCurrentUser, User, Dealer } from "../../lib/pocketbase";
import {
  getDealerUsers,
  createDealerUser,
  updateDealerUser,
  deleteDealerUser,
  getCurrentDealerDetails,
  updateCurrentDealer,
  setUserActive,
} from "../../lib/api";
import Button from "../common/Button";
import * as Icons from "../common/Icons";
import { confirmAction } from "../../lib/confirm";
import { toast } from "../../lib/toast";
import { ConsoleHeader, ConsoleTab } from "./panels/OwnerPanels";

interface DealerAdminDashboardProps {
  onSwitchToDealer: () => void;
}

export const DealerAdminDashboard: React.FC<DealerAdminDashboardProps> = ({ onSwitchToDealer }) => {
  const [activeTab, setActiveTab] = useState<"users" | "dealership">("users");
  const [users, setUsers] = useState<User[]>([]);
  const [dealer, setDealer] = useState<Dealer | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // User form state
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userError, setUserError] = useState<string | null>(null);
  const [userFormData, setUserFormData] = useState({
    email: "",
    password: "",
    passwordConfirm: "",
    firstName: "",
    lastName: "",
    phone: "",
    role: "sales" as User["role"],
  });

  // Dealer form state
  const [isEditingDealer, setIsEditingDealer] = useState(false);
  const [dealerFormData, setDealerFormData] = useState({
    name: "",
    address: "",
    city: "",
    state: "",
    phone: "",
    email: "",
  });

  const loadData = useCallback(async () => {
    setIsLoading(true);
    const [fetchedUsers, fetchedDealer] = await Promise.all([
      getDealerUsers(),
      getCurrentDealerDetails(),
    ]);
    setUsers(fetchedUsers);
    setDealer(fetchedDealer);

    if (fetchedDealer) {
      setDealerFormData({
        name: fetchedDealer.name || "",
        address: fetchedDealer.address || "",
        city: fetchedDealer.city || "",
        state: fetchedDealer.state || "",
        phone: fetchedDealer.phone || "",
        email: fetchedDealer.email || "",
      });
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // --- User Management Handlers ---

  const resetUserForm = () => {
    setUserFormData({
      email: "",
      password: "",
      passwordConfirm: "",
      firstName: "",
      lastName: "",
      phone: "",
      role: "sales",
    });
    setIsCreatingUser(false);
    setEditingUserId(null);
    setUserError(null);
  };

  const handleUserSubmit = async () => {
    setUserError(null);
    try {
      if (editingUserId) {
        await updateDealerUser(editingUserId, {
          firstName: userFormData.firstName,
          lastName: userFormData.lastName,
          email: userFormData.email,
          phone: userFormData.phone,
          role: userFormData.role,
        });
        toast.success("User updated successfully");
      } else {
        if (userFormData.password !== userFormData.passwordConfirm) {
          setUserError("Passwords do not match");
          return;
        }
        if (userFormData.password.length < 8) {
          setUserError("Password must be at least 8 characters");
          return;
        }
        await createDealerUser(userFormData);
        toast.success("User created successfully");
      }
      resetUserForm();
      loadData();
    } catch (err: any) {
      setUserError(err?.message || "Failed to save user");
    }
  };

  const handleEditUser = (u: User) => {
    setUserFormData({
      email: u.email,
      password: "",
      passwordConfirm: "",
      firstName: u.firstName || "",
      lastName: u.lastName || "",
      phone: u.phone || "",
      role: u.role,
    });
    setEditingUserId(u.id);
    setUserError(null);
  };

  const handleDeleteUser = async (userId: string) => {
    if (
      await confirmAction({
        title: "Delete user?",
        message: "Are you sure you want to delete this user? They will lose access immediately.",
        confirmLabel: "Delete",
        tone: "danger",
      })
    ) {
      try {
        await deleteDealerUser(userId);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete user");
        return;
      }
      toast.success("User deleted");
      loadData();
    }
  };

  const handleRoleChange = async (userId: string, newRole: User["role"]) => {
    try {
      await updateDealerUser(userId, { role: newRole });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
      loadData(); // resync the role select after a rejected change
      return;
    }
    loadData();
  };

  // Deactivation is the preferred offboarding path — it revokes access while
  // preserving the user's deal history and attribution. [G40]
  const handleToggleUserActive = async (u: User) => {
    const isActive = (u as User & { active?: boolean }).active ?? true;
    try {
      await setUserActive(u.id, !isActive);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update user status");
      return;
    }
    toast.success(isActive ? "User deactivated" : "User reactivated");
    loadData();
  };

  // --- Dealership Management Handlers ---

  const handleDealerSubmit = async () => {
    if (!dealer) return;
    try {
      // Dealer-admin-scoped update; the superadmin-only updateDealer silently
      // no-oped for this audience. [C13]
      await updateCurrentDealer(dealerFormData);
      toast.success("Dealership details updated");
      setIsEditingDealer(false);
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update dealership details");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center">
        <Icons.SpinnerIcon className="w-8 h-8 text-[var(--color-primary)] animate-spin" />
      </div>
    );
  }

  const currentUser = getCurrentUser();

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

  return (
    <div
      className="min-h-screen bg-[var(--color-bg-subtle)] text-[var(--color-text)]"
      style={{ fontFamily: "var(--font-sans)" }}
    >
      {/* 58px console header — owner-console idiom scoped to one dealership */}
      <ConsoleHeader
        label="ADMIN CONSOLE"
        title={dealer ? `${dealer.name} (${dealer.code})` : "—"}
        sub={
          `${currentUser?.firstName ?? ""} ${currentUser?.lastName ?? ""}`.trim() ||
          currentUser?.email
        }
        right={
          <Button onClick={onSwitchToDealer} variant="primary" className="gap-2">
            <Icons.ChevronLeftIcon className="w-4 h-4" />
            Back to Dashboard
          </Button>
        }
      />

      {/* Sub-tab bar — .tab-btn idiom */}
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
          active={activeTab === "users"}
          onClick={() => setActiveTab("users")}
          label="Users"
          badge={users.length}
        />
        <ConsoleTab
          active={activeTab === "dealership"}
          onClick={() => setActiveTab("dealership")}
          label="Dealership Details"
        />
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === "users" && (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[var(--color-text)]">Team Members</h2>
              <Button onClick={() => setIsCreatingUser(true)} className="gap-2">
                <Icons.PlusIcon className="w-4 h-4" />
                Add User
              </Button>
            </div>

            {userError && (
              <div className="bg-[var(--color-danger-subtle)] border border-[var(--color-danger)] rounded-lg p-4 text-[var(--color-danger)]">
                {userError}
              </div>
            )}

            {(isCreatingUser || editingUserId) && (
              <div className="bg-[var(--color-bg)] rounded-xl p-6 border border-[var(--color-border)] shadow-sm">
                <h3 className="text-lg font-semibold text-[var(--color-text)] mb-4">
                  {editingUserId ? "Edit Team Member" : "Add New Team Member"}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1">
                      First Name *
                    </label>
                    <input
                      type="text"
                      value={userFormData.firstName}
                      onChange={(e) =>
                        setUserFormData({ ...userFormData, firstName: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
                      placeholder="Jane"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      value={userFormData.lastName}
                      onChange={(e) =>
                        setUserFormData({ ...userFormData, lastName: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
                      placeholder="Smith"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1">
                      Email *
                    </label>
                    <input
                      type="email"
                      value={userFormData.email}
                      onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                      className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
                      placeholder="jane@dealership.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={userFormData.phone}
                      onChange={(e) => setUserFormData({ ...userFormData, phone: e.target.value })}
                      className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
                      placeholder="(555) 123-4567"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1">
                      Role *
                    </label>
                    <select
                      value={userFormData.role}
                      onChange={(e) =>
                        setUserFormData({ ...userFormData, role: e.target.value as User["role"] })
                      }
                      className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
                    >
                      <option value="sales">Sales</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  {!editingUserId && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1">
                          Password *
                        </label>
                        <input
                          type="password"
                          value={userFormData.password}
                          onChange={(e) =>
                            setUserFormData({ ...userFormData, password: e.target.value })
                          }
                          className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
                          placeholder="Min 8 characters"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1">
                          Confirm Password *
                        </label>
                        <input
                          type="password"
                          value={userFormData.passwordConfirm}
                          onChange={(e) =>
                            setUserFormData({ ...userFormData, passwordConfirm: e.target.value })
                          }
                          className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
                          placeholder="Re-enter password"
                        />
                      </div>
                    </>
                  )}
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <Button variant="secondary" onClick={resetUserForm}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleUserSubmit}
                    disabled={
                      !userFormData.firstName ||
                      !userFormData.lastName ||
                      !userFormData.email ||
                      (!editingUserId && !userFormData.password)
                    }
                  >
                    {editingUserId ? "Save Changes" : "Create User"}
                  </Button>
                </div>
              </div>
            )}

            <div className="bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] overflow-hidden shadow-sm">
              <table className="w-full text-left">
                <thead className="bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)]">
                  <tr>
                    <th className="px-4 py-3 text-xs font-semibold text-[var(--color-text-muted)]">
                      User
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-[var(--color-text-muted)]">
                      Email
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-[var(--color-text-muted)] text-center">
                      Role
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-[var(--color-text-muted)] text-center">
                      Joined
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-[var(--color-text-muted)] text-center">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {users.map((u) => {
                    const isSelf = u.id === currentUser?.id;
                    const isActive = (u as User & { active?: boolean }).active ?? true;
                    return (
                      <tr
                        key={u.id}
                        className={`hover:bg-[var(--color-bg-muted)] transition-colors ${
                          isActive ? "" : "opacity-60"
                        }`}
                      >
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-[var(--color-primary-subtle)] text-[var(--color-primary)] rounded-full flex items-center justify-center font-bold">
                              {u.firstName?.[0]}
                              {u.lastName?.[0]}
                            </div>
                            <div>
                              <p className="font-medium text-[var(--color-text)]">
                                {u.firstName} {u.lastName}
                                {!isActive && (
                                  <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--color-bg-muted)] text-[var(--color-text-muted)] align-middle">
                                    Inactive
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-[var(--color-text-subtle)]">{u.phone}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm text-[var(--color-text-muted)]">
                          {u.email}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <select
                            value={u.role}
                            onChange={(e) => handleRoleChange(u.id, e.target.value as User["role"])}
                            disabled={isSelf}
                            className={`px-3 py-1 rounded-lg text-xs font-medium border-0 cursor-pointer outline-none ${getRoleBadgeColor(
                              u.role
                            )}`}
                          >
                            <option value="sales">Sales</option>
                            <option value="manager">Manager</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td className="px-4 py-4 text-center text-sm text-[var(--color-text-muted)]">
                          {new Date(u.created).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleEditUser(u)}
                              className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-bg-muted)] rounded-lg transition-colors"
                              title="Edit"
                              aria-label={`Edit ${u.email}`}
                            >
                              <Icons.PencilIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleToggleUserActive(u)}
                              disabled={isSelf}
                              className={`px-2.5 py-1 rounded-lg text-xs font-medium ring-1 ring-inset transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
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
                            {!isSelf && (
                              <button
                                onClick={() => handleDeleteUser(u.id)}
                                className="p-2 text-[var(--color-text-subtle)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-subtle)] rounded-lg transition-colors"
                                title="Delete permanently"
                                aria-label={`Delete ${u.email} permanently`}
                              >
                                <Icons.TrashIcon className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-[var(--color-text-subtle)]">
                        No team members found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "dealership" && dealer && (
          <div className="space-y-6 animate-fadeIn max-w-3xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[var(--color-text)]">
                Dealership Information
              </h2>
              {!isEditingDealer && (
                <Button
                  onClick={() => setIsEditingDealer(true)}
                  variant="secondary"
                  className="gap-2"
                >
                  <Icons.PencilIcon className="w-4 h-4" />
                  Edit Details
                </Button>
              )}
            </div>

            <div className="bg-[var(--color-bg)] rounded-xl p-6 border border-[var(--color-border)] shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1">
                    Dealership Name
                  </label>
                  {isEditingDealer ? (
                    <input
                      type="text"
                      value={dealerFormData.name}
                      onChange={(e) =>
                        setDealerFormData({ ...dealerFormData, name: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
                    />
                  ) : (
                    <p className="text-[var(--color-text)] font-medium">{dealer.name}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1">
                    Dealer Code
                  </label>
                  <p className="text-[var(--color-text-muted)] font-mono bg-[var(--color-bg-subtle)] px-3 py-2 rounded-lg border border-[var(--color-border)] inline-block">
                    {dealer.code}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">Code cannot be changed.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1">
                    Email Contact
                  </label>
                  {isEditingDealer ? (
                    <input
                      type="email"
                      value={dealerFormData.email}
                      onChange={(e) =>
                        setDealerFormData({ ...dealerFormData, email: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
                    />
                  ) : (
                    <p className="text-[var(--color-text)]">
                      {dealer.email || "Not provided"}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1">
                    Phone Contact
                  </label>
                  {isEditingDealer ? (
                    <input
                      type="tel"
                      value={dealerFormData.phone}
                      onChange={(e) =>
                        setDealerFormData({ ...dealerFormData, phone: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
                    />
                  ) : (
                    <p className="text-[var(--color-text)]">
                      {dealer.phone || "Not provided"}
                    </p>
                  )}
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1">
                    Address
                  </label>
                  {isEditingDealer ? (
                    <input
                      type="text"
                      value={dealerFormData.address}
                      onChange={(e) =>
                        setDealerFormData({ ...dealerFormData, address: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
                    />
                  ) : (
                    <p className="text-[var(--color-text)]">
                      {dealer.address || "Not provided"}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1">
                    City
                  </label>
                  {isEditingDealer ? (
                    <input
                      type="text"
                      value={dealerFormData.city}
                      onChange={(e) =>
                        setDealerFormData({ ...dealerFormData, city: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
                    />
                  ) : (
                    <p className="text-[var(--color-text)]">
                      {dealer.city || "Not provided"}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1">
                    State
                  </label>
                  {isEditingDealer ? (
                    <input
                      type="text"
                      value={dealerFormData.state}
                      onChange={(e) =>
                        setDealerFormData({
                          ...dealerFormData,
                          state: e.target.value.toUpperCase(),
                        })
                      }
                      maxLength={2}
                      className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] uppercase"
                    />
                  ) : (
                    <p className="text-[var(--color-text)] uppercase">
                      {dealer.state || "--"}
                    </p>
                  )}
                </div>
              </div>

              {isEditingDealer && (
                <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-[var(--color-border)]">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setIsEditingDealer(false);
                      loadData(); // Reset form data
                    }}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleDealerSubmit} disabled={!dealerFormData.name}>
                    Save Changes
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
