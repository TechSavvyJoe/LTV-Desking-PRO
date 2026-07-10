import React, { useState } from "react";
import { Dealer, User } from "../../../lib/pocketbase";
import { createDealerWithAdmin } from "../../../lib/api";
import Button from "../../common/Button";
import * as Icons from "../../common/Icons";

/**
 * CreateDealerWizard (extracted from SuperAdminDashboard.tsx)
 *
 * Modal wizard to onboard a new dealership + its first admin user.
 * Used from main dashboard (onboard quick action) and from Dealers panel.
 * Keeps full functionality and styling identical.
 */

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
      const dealerPayload: Omit<Dealer, "id" | "created" | "updated"> = {
        ...dealerForm,
        settings: undefined,
      };
      const result = await createDealerWithAdmin({
        dealer: dealerPayload,
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create dealer and admin user");
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
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
                  Name *
                </label>
                <input
                  type="text"
                  value={dealerForm.name}
                  onChange={(e) => setDealerForm({ ...dealerForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
                  placeholder="Acme Motors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
                  Code *
                </label>
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
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={dealerForm.email}
                  onChange={(e) => setDealerForm({ ...dealerForm, email: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
                  placeholder="contact@dealer.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
                  Phone
                </label>
                <input
                  type="tel"
                  value={dealerForm.phone}
                  onChange={(e) => setDealerForm({ ...dealerForm, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
                  placeholder="(555) 123-4567"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
                  Address
                </label>
                <input
                  type="text"
                  value={dealerForm.address}
                  onChange={(e) => setDealerForm({ ...dealerForm, address: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
                  placeholder="123 Auto Drive"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
                  City
                </label>
                <input
                  type="text"
                  value={dealerForm.city}
                  onChange={(e) => setDealerForm({ ...dealerForm, city: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
                  placeholder="Detroit"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
                  State
                </label>
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
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
                  Email *
                </label>
                <input
                  type="email"
                  value={adminForm.email}
                  onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
                  placeholder="jane@dealer.com"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
                  Phone
                </label>
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
                <h4 className="text-xl font-semibold text-[var(--color-text)]">
                  {created.dealer.name} is ready
                </h4>
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
                  <span className="text-[var(--color-text-muted)] text-xs font-medium">
                    Dealer code
                  </span>
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
                  <span className="text-[var(--color-text-muted)] text-xs font-medium">
                    Admin email
                  </span>
                  <span className="text-[var(--color-text)]">{created.admin.email}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-3 text-sm">
                  <span className="text-[var(--color-text-muted)] text-xs font-medium">
                    Admin name
                  </span>
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

export { CreateDealerWizard };
export default CreateDealerWizard;
