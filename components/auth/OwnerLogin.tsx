import React, { useState } from "react";
import { login, logout } from "../../lib/auth";
import { getCurrentUser } from "../../lib/pocketbase";
import Button from "../common/Button";
import * as Icons from "../common/Icons";
import { AnnouncementBanner } from "../common/AnnouncementBanner";
import { BrandMark } from "../common/BrandMark";
import { toast } from "../../lib/toast";
import { useForceDarkMode } from "../../hooks/useForceDarkMode";

interface OwnerLoginProps {
  onSuccess: () => void;
}

export const OwnerLogin: React.FC<OwnerLoginProps> = ({ onSuccess }) => {
  useForceDarkMode();
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
        logout();
        setError("Owner access required. This account is not authorized for the Owner Console.");
        return;
      }

      toast.success("Welcome to the Owner Console");
      onSuccess();
    } catch (err) {
      console.error("Owner login error:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen text-white flex flex-col relative overflow-hidden">
      {/* Branded background — deep slate base, purple-tinted radial for
          the Owner-Console surface (visually distinct from the dealer
          login's blue-tinted variant). */}
      <div className="absolute inset-0 bg-slate-950" />
      <div
        className="absolute inset-0 opacity-50"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(139, 92, 246, 0.20) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 20% 100%, rgba(59, 130, 246, 0.12) 0%, transparent 50%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(148, 163, 184, 0.45) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.45) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <div className="relative z-10">
        <AnnouncementBanner />
      </div>
      <div className="flex-1 flex items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-md p-8 space-y-7 bg-slate-900/80 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-800 animate-fadeIn">
          <div className="flex flex-col items-center text-center">
            <BrandMark className="w-14 h-14 mb-4 drop-shadow-[0_8px_24px_rgba(139,92,246,0.35)]" />
            <h1 className="text-3xl font-bold tracking-tight">
              Owner <span className="text-purple-400">Console</span>
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              LTV Desking <span className="text-blue-400 font-semibold">PRO</span>
              <span className="mx-2 text-slate-600">·</span>
              Authorized personnel only
            </p>
          </div>

          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label htmlFor="owner-email" className="block text-sm font-medium text-slate-300">
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
                    className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-700 text-slate-100 rounded-lg focus:ring-purple-500 focus:border-purple-500"
                    placeholder="owner@example.com"
                  />
                  <Icons.EnvelopeIcon className="absolute left-3 top-2.5 h-5 w-5 text-slate-500" />
                </div>
              </div>

              <div>
                <label
                  htmlFor="owner-password"
                  className="block text-sm font-medium text-slate-300"
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
                    className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-700 text-slate-100 rounded-lg focus:ring-purple-500 focus:border-purple-500"
                    placeholder="••••••••"
                  />
                  <Icons.LockClosedIcon className="absolute left-3 top-2.5 h-5 w-5 text-slate-500" />
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 rounded-lg shadow-sm text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Icons.SpinnerIcon className="animate-spin h-5 w-5" />
              ) : (
                "Sign in to Owner Console"
              )}
            </Button>
          </form>

          <p className="text-center text-xs text-slate-500">
            Need dealer access? Visit the main app at{" "}
            <a href="/" className="font-mono text-slate-400 hover:text-blue-400 transition-colors">
              /
            </a>
            .
          </p>
        </div>
      </div>
      <div className="relative z-10 pb-6 text-center text-xs text-slate-600 flex items-center justify-center gap-3">
        <a href="/privacy" className="hover:text-slate-400 transition-colors">
          Privacy
        </a>
        <span aria-hidden>·</span>
        <a href="/terms" className="hover:text-slate-400 transition-colors">
          Terms
        </a>
      </div>
    </div>
  );
};

export default OwnerLogin;
