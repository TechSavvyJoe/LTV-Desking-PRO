import React, { useState } from "react";
import { login } from "../../lib/auth";
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter both email and password");
      return;
    }

    setLoading(true);
    try {
      await login(email, password);
      toast.success("Welcome back!");
      onSuccess();
    } catch (error) {
      console.error("Login error:", error);
      toast.error("Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md p-8 space-y-8 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 animate-fadeIn">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">
          Welcome Back
        </h2>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Sign in to access your deals
        </p>
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
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-blue-500 focus:border-blue-500"
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
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                placeholder="••••••••"
              />
              <Icons.LockClosedIcon className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm">
            <a
              href="#"
              className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
              onClick={(e) => {
                e.preventDefault();
                toast.info(
                  "Please contact your administrator to reset password."
                );
              }}
            >
              Forgot your password?
            </a>
          </div>
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Icons.SpinnerIcon className="animate-spin h-5 w-5" />
          ) : (
            "Sign in"
          )}
        </Button>
      </form>

      <div className="text-center mt-6">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Don't have an account?{" "}
          <button
            onClick={onRegisterClick}
            className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
          >
            Register dealer
          </button>
        </p>
      </div>
    </div>
  );
};
