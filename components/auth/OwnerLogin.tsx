import React, { useState } from "react";
import { login, logout } from "../../lib/auth";
import { getCurrentUser } from "../../lib/pocketbase";
import Button from "../common/Button";
import * as Icons from "../common/Icons";
import { AnnouncementBanner } from "../common/AnnouncementBanner";
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
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <AnnouncementBanner />
      <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-md p-8 space-y-8 bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 animate-fadeIn">
        <div className="text-center">
          <div className="mx-auto w-14 h-14 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mb-4">
            <Icons.Cog6ToothIcon className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold">Owner Console</h2>
          <p className="mt-2 text-slate-400">LTV Desking PRO &middot; Authorized personnel only</p>
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
              <label htmlFor="owner-password" className="block text-sm font-medium text-slate-300">
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
            {loading ? <Icons.SpinnerIcon className="animate-spin h-5 w-5" /> : "Sign in to Owner Console"}
          </Button>
        </form>

        <p className="text-center text-xs text-slate-500">
          Need dealer access? Visit the main app at <span className="font-mono text-slate-400">/</span>.
        </p>
      </div>
      </div>
    </div>
  );
};

export default OwnerLogin;
