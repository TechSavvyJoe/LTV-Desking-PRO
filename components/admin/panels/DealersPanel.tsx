import React, { useState } from "react";
import type { Dealer, User } from "../../../lib/pocketbase";
import { updateDealer, deleteDealer } from "../../../lib/api";
import Button from "../../common/Button";
import * as Icons from "../../common/Icons";
import { confirmAction } from "../../../lib/confirm";
import { toast } from "../../../lib/toast";
import { SearchInput, SortHeader, StatusPill } from "./OwnerPanels";
import { EmptyState } from "../../common/states";
import { CreateDealerWizard } from "./CreateDealerWizard";

/**
 * DealersPanel (full extraction from SuperAdminDashboard.tsx)
 *
 * Contains the complete dealer list management UI: search, sort, table,
 * inline edit form, add via wizard, impersonate, delete, toggle active.
 * No functionality loss — identical logic and JSX to original DealerManagement.
 *
 * Create wizard is imported from sibling to avoid duplication.
 */

export interface DealersPanelProps {
  dealers: Dealer[];
  users: User[];
  onRefresh: () => void;
  onImpersonate: (dealerId: string) => void;
}

export const DealersPanel: React.FC<DealersPanelProps> = ({
  dealers,
  users,
  onRefresh,
  onImpersonate,
}) => {
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
          <h2 className="text-lg font-semibold text-[var(--color-text)] tracking-tight">
            Dealerships
          </h2>
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
              <p className="text-xs text-[var(--color-text-muted)]">
                Code cannot be changed after creation.
              </p>
            </div>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
                Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
                placeholder="Dealership Name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
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
                className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] uppercase focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
                placeholder="DEALER01"
                maxLength={10}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
                placeholder="contact@dealer.com"
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
                City
              </label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
                placeholder="Detroit"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
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
                className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] uppercase focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-subtle)]"
                placeholder="MI"
                maxLength={2}
              />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
                Address
              </label>
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
          <table className="w-full" aria-label="Dealers list">
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
                  <tr
                    key={dealer.id}
                    className="hover:bg-[var(--color-bg-muted)] transition-colors group"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-[var(--color-bg-muted)] ring-1 ring-[var(--color-border)] flex items-center justify-center text-[var(--color-primary)] text-xs font-bold flex-shrink-0">
                          {dealer.code?.slice(0, 2) || dealer.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[var(--color-text)] truncate">
                            {dealer.name}
                          </p>
                          {dealer.address && (
                            <p className="text-xs text-[var(--color-text-muted)] truncate">
                              {dealer.address}
                            </p>
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
                        : dealer.state ||
                          dealer.city || <span className="text-[var(--color-text-muted)]">—</span>}
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

export default DealersPanel;
