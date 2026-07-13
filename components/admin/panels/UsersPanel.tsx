import React, { useState } from "react";
import { getCurrentUser, User, Dealer } from "../../../lib/pocketbase";
import {
  createUser,
  updateUser,
  updateUserRole,
  deleteUser,
  setUserActive,
} from "../../../lib/api";
import Button from "../../common/Button";
import * as Icons from "../../common/Icons";
import { confirmAction } from "../../../lib/confirm";
import { toast } from "../../../lib/toast";
import { SearchInput, SortHeader } from "./OwnerPanels";
import { EmptyState } from "../../common/states";
import { PASSWORD_MIN_LENGTH } from "../../../lib/passwordPolicy";

/**
 * UsersPanel (extracted from SuperAdminDashboard.tsx)
 *
 * Full user management: filters (dealer/role), search, sort, create/edit form,
 * role change with confirm, deactivate/activate, delete (self-protection).
 * Preserves all comments, edge cases, and UI behavior exactly.
 */

export interface UsersPanelProps {
  users: User[];
  dealers: Dealer[];
  onRefresh: () => void;
}

export const UsersPanel: React.FC<UsersPanelProps> = ({ users, dealers, onRefresh }) => {
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
  const [formData, setFormData] = useState<{
    email: string;
    password: string;
    passwordConfirm: string;
    firstName: string;
    lastName: string;
    phone: string;
    role: User["role"];
    dealer: string;
  }>({
    email: "",
    password: "",
    passwordConfirm: "",
    firstName: "",
    lastName: "",
    phone: "",
    role: "sales",
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
        if (formData.password.length < PASSWORD_MIN_LENGTH) {
          setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
          return;
        }
        await createUser({ ...formData, role: formData.role });
      }
      resetForm();
      onRefresh();
    } catch (err: unknown) {
      const errObj: Record<string, unknown> | null =
        err && typeof err === "object" ? (err as Record<string, unknown>) : null;
      const data: Record<string, unknown> | null =
        errObj && typeof errObj.data === "object" && errObj.data !== null
          ? (errObj.data as Record<string, unknown>)
          : null;
      const msg =
        (typeof data?.message === "string" ? data.message : null) ||
        (err instanceof Error ? err.message : null) ||
        "Failed to save user";
      setError(msg);
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
    const isActive = user.active ?? true;
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
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
                Last Name *
              </label>
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
                placeholder="Doe"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
                Email *
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
                placeholder="john@dealer.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
                Phone
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
                placeholder="(555) 123-4567"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
                Dealer *
              </label>
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
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
                Role *
              </label>
              <select
                value={formData.role}
                onChange={(e) => {
                  const val = e.target.value;
                  const role = (["sales", "manager", "admin", "superadmin"] as const).includes(
                    val as User["role"]
                  )
                    ? (val as User["role"])
                    : "sales";
                  setFormData({ ...formData, role });
                }}
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
                    placeholder="12+ chars, upper/lower/number"
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
          <table className="w-full" aria-label="Users list">
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
                const isActive = user.active ?? true;
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
                            <p className="text-xs text-[var(--color-text-muted)] truncate">
                              {user.phone}
                            </p>
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
                        onChange={(e) => {
                          const val = e.target.value;
                          const role = (
                            ["sales", "manager", "admin", "superadmin"] as const
                          ).includes(val as User["role"])
                            ? (val as User["role"])
                            : "sales";
                          handleRoleChange(user.id, role);
                        }}
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

export default UsersPanel;

// Alias for naming consistency with extraction task (UserManagementPanel)
export { UsersPanel as UserManagementPanel };
