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
    <div className="w-full max-w-md p-6 sm:p-8 bg-white dark:bg-neutral-900 rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-800">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">Welcome back</h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Sign in to access your deals
        </p>
      </div>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1.5"
            >
              Email address
            </label>
            <div className="relative">
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 dark:focus:border-primary-400 transition-colors"
                placeholder="you@example.com"
              />
              <Icons.EnvelopeIcon className="absolute left-3 top-2.5 h-5 w-5 text-neutral-400" />
            </div>
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1.5"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 dark:focus:border-primary-400 transition-colors"
                placeholder="Enter your password"
              />
              <Icons.LockClosedIcon className="absolute left-3 top-2.5 h-5 w-5 text-neutral-400" />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end">
          <button
            type="button"
            className="text-sm font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
            onClick={() => toast.info("Please contact your administrator to reset password.")}
          >
            Forgot password?
          </button>
        </div>

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? <Icons.SpinnerIcon className="animate-spin h-4 w-4" /> : "Sign in"}
        </Button>
      </form>

      <div className="text-center mt-6 pt-4 border-t border-neutral-100 dark:border-neutral-800">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {"Don't have an account? "}
          <button
            onClick={onRegisterClick}
            className="font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
          >
            Register dealer
          </button>
        </p>
      </div>
    </div>
  );
};
