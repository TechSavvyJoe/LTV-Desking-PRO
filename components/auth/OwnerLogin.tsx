import React, { useState } from "react";
import { login } from "../../lib/auth";
import { pb, getCurrentUser } from "../../lib/pocketbase";
import Button from "../common/Button";
import * as Icons from "../common/Icons";
import { AnnouncementBanner } from "../common/AnnouncementBanner";
import { BrandMark } from "../common/BrandMark";
import { toast } from "../../lib/toast";

interface OwnerLoginProps {
  onSuccess: () => void;
}

export const OwnerLogin: React.FC<OwnerLoginProps> = ({ onSuccess }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("Please enter both email and password");
      return;
    }

    setLoading(true);
    try {
      const result = await login(email, password);
      if (!result.success) {
        setError(result.error || "Invalid email or password");
        return;
      }

      if (getCurrentUser()?.role !== "superadmin") {
        // Clear the token WITHOUT logout() — logout() reloads the page, which
        // unmounted this component before the error could ever render. [C-auth]
        pb.authStore.clear();
        setError("Owner access required. This account is not authorized for the Owner Console.");
        return;
      }

      toast.success("Welcome to the Owner Console");
      onSuccess();
    } catch (err) {
      // Owner login failure surfaced via UI toast.
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-bg min-h-screen text-[var(--color-text)] flex flex-col relative overflow-hidden">
      {/* Branded background — the shared .auth-bg grid + radial glow (tokens),
          forced dark so the Owner Console keeps its deeper look. [dc-redesign] */}

      <div className="relative z-10">
        <AnnouncementBanner />
      </div>
      <div className="flex-1 flex items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-md p-8 space-y-7 bg-[var(--color-bg)] rounded-lg shadow-md border border-[var(--color-border)] animate-fadeIn">
          <div className="flex flex-col items-center text-center">
            <BrandMark className="w-14 h-14 mb-4" />
            <h1 className="text-2xl font-semibold tracking-tight">
              Owner <span className="text-[var(--color-primary)]">Console</span>
            </h1>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              LTV Desking <span className="text-[var(--color-primary)] font-semibold">PRO</span>
              <span className="mx-2 text-[var(--color-text-subtle)]">·</span>
              Authorized personnel only
            </p>
          </div>

          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="owner-email"
                  className="block text-sm font-medium text-[var(--color-text-muted)]"
                >
                  Email address
                </label>
                <div className="mt-1 relative">
                  <input
                    id="owner-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="dc-input w-full pl-10 pr-4 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] text-[var(--color-text)] rounded-lg"
                    placeholder="owner@example.com"
                  />
                  <Icons.EnvelopeIcon className="absolute left-3 top-2.5 h-5 w-5 text-[var(--color-text-subtle)]" />
                </div>
              </div>

              <div>
                <label
                  htmlFor="owner-password"
                  className="block text-sm font-medium text-[var(--color-text-muted)]"
                >
                  Password
                </label>
                <div className="mt-1 relative">
                  <input
                    id="owner-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="dc-input w-full pl-10 pr-4 py-2 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] text-[var(--color-text)] rounded-lg"
                    placeholder="••••••••"
                  />
                  <Icons.LockClosedIcon className="absolute left-3 top-2.5 h-5 w-5 text-[var(--color-text-subtle)]" />
                </div>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                aria-live="assertive"
                className="rounded-lg bg-[var(--color-danger-subtle)] border border-[var(--color-danger)]/30 px-4 py-3 text-sm text-[var(--color-danger)]"
              >
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex justify-center py-2 px-4 rounded shadow-sm text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Icons.SpinnerIcon className="animate-spin h-5 w-5" />
              ) : (
                "Sign in to Owner Console"
              )}
            </Button>
          </form>

          <p className="text-center text-xs text-[var(--color-text-subtle)]">
            Need dealer access? Visit the main app at{" "}
            <a
              href="/"
              className="font-mono text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors"
            >
              /
            </a>
            .
          </p>
        </div>
      </div>
      <div className="relative z-10 pb-6 text-center text-xs text-[var(--color-text-subtle)] flex items-center justify-center gap-3">
        <a href="/privacy" className="hover:text-[var(--color-text-muted)] transition-colors">
          Privacy
        </a>
        <span aria-hidden>·</span>
        <a href="/terms" className="hover:text-[var(--color-text-muted)] transition-colors">
          Terms
        </a>
      </div>
    </div>
  );
};

export default OwnerLogin;
