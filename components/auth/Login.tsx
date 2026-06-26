import React, { useState } from "react";
import { login, requestPasswordReset } from "../../lib/auth";
import Button from "../common/Button";
import * as Icons from "../common/Icons";
import { toast } from "../../lib/toast";

interface LoginProps {
  onSuccess: () => void;
  onRegisterClick: () => void;
}

export const Login: React.FC<LoginProps> = ({ onSuccess, onRegisterClick }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetStatus, setResetStatus] = useState<"idle" | "sent" | "error">("idle");

  const handleResetSubmit = async () => {
    const target = resetEmail.trim();
    if (!target) {
      toast.error("Please enter your email address");
      return;
    }
    setResetLoading(true);
    setResetStatus("idle");
    try {
      const ok = await requestPasswordReset(target);
      setResetStatus(ok ? "sent" : "error");
    } finally {
      setResetLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter both email and password");
      return;
    }

    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.success) {
        toast.success("Welcome back!");
        onSuccess();
      } else {
        toast.error(result.error || "Invalid email or password");
      }
    } catch (error) {
      console.error("Login error:", error);
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md p-8 space-y-8 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-800 animate-fadeIn">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Welcome Back</h2>
        <p className="mt-2 text-slate-600 dark:text-slate-400">Sign in to access your deals</p>
      </div>

      <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Email address
            </label>
            <div className="mt-1 relative">
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-green-500 focus:border-green-500"
                placeholder="you@example.com"
              />
              <Icons.EnvelopeIcon className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
            </div>
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Password
            </label>
            <div className="mt-1 relative">
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-green-500 focus:border-green-500"
                placeholder="••••••••"
              />
              <Icons.LockClosedIcon className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm">
            <button
              type="button"
              className="font-medium text-green-600 hover:text-green-500 dark:text-green-400"
              aria-expanded={showReset}
              aria-controls="password-reset-panel"
              onClick={() => {
                setShowReset((prev) => !prev);
                setResetStatus("idle");
              }}
            >
              Forgot your password?
            </button>
          </div>
        </div>

        {showReset && (
          <div
            id="password-reset-panel"
            className="p-4 space-y-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
          >
            {resetStatus === "sent" ? (
              <p className="text-sm text-slate-600 dark:text-slate-400" role="status">
                If an account exists for that email, a reset link is on its way. (Email delivery
                requires the server&apos;s SMTP to be configured.)
              </p>
            ) : (
              <>
                <label
                  htmlFor="reset-email"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Email for password reset
                </label>
                <input
                  id="reset-email"
                  name="reset-email"
                  type="email"
                  autoComplete="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleResetSubmit();
                    }
                  }}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-green-500 focus:border-green-500"
                  placeholder="you@example.com"
                />
                <button
                  type="button"
                  disabled={resetLoading}
                  onClick={() => void handleResetSubmit()}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {resetLoading ? (
                    <Icons.SpinnerIcon className="animate-spin h-5 w-5" />
                  ) : (
                    "Send reset link"
                  )}
                </button>
                {resetStatus === "error" && (
                  <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                    Could not send the reset email. Please try again, or contact your administrator.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        <Button
          type="submit"
          disabled={loading}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <Icons.SpinnerIcon className="animate-spin h-5 w-5" /> : "Sign in"}
        </Button>
      </form>

      <div className="text-center mt-6">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Don't have an account?{" "}
          <button
            onClick={onRegisterClick}
            className="font-medium text-green-600 hover:text-green-500 dark:text-green-400"
          >
            Register dealer
          </button>
        </p>
      </div>
    </div>
  );
};
