import React, { useEffect, useState } from "react";
import { toast } from "../../lib/toast";
import { register } from "../../lib/auth";
import { getSystemSettings, getCachedSystemSettings } from "../../lib/api";
import Button from "../common/Button";
import * as Icons from "../common/Icons";

interface RegisterProps {
  onSuccess: () => void;
  onLoginClick: () => void;
}

export const Register: React.FC<RegisterProps> = ({ onSuccess, onLoginClick }) => {
  const [signupsEnabled, setSignupsEnabled] = useState<boolean>(() => {
    const cached = getCachedSystemSettings();
    return cached?.signupsEnabled !== false;
  });

  useEffect(() => {
    let cancelled = false;
    getSystemSettings()
      .then((s) => {
        if (!cancelled) setSignupsEnabled(s.signupsEnabled !== false);
      })
      .catch(() => {
        // Silent — default to enabled if request fails
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    passwordConfirm: "",
    firstName: "",
    lastName: "",
    dealerCode: "",
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.password !== formData.passwordConfirm) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const result = await register(
        formData.email,
        formData.password,
        formData.firstName,
        formData.lastName,
        formData.dealerCode
      );
      if (result.success) {
        toast.success("Registration successful! Logging you in...");
        onSuccess();
      } else {
        toast.error(result.error || "Registration failed");
      }
    } catch (error: any) {
      console.error("Registration error:", error);
      toast.error(error.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  if (!signupsEnabled) {
    return (
      <div className="w-full max-w-md p-6 sm:p-8 bg-white dark:bg-neutral-900 rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-800 text-center space-y-4">
        <Icons.LockClosedIcon className="w-10 h-10 mx-auto text-neutral-400" />
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">Signups disabled</h2>
        <p className="text-neutral-500 dark:text-neutral-400 text-sm">
          New dealership signups are temporarily turned off. Please contact your administrator.
        </p>
        <button
          onClick={onLoginClick}
          className="text-sm font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  const inputClasses =
    "w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 dark:focus:border-primary-400 transition-colors";

  return (
    <div className="w-full max-w-md p-6 sm:p-8 bg-white dark:bg-neutral-900 rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-800">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">Create account</h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Join your dealership team
        </p>
      </div>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1.5">
              First Name
            </label>
            <input
              name="firstName"
              required
              value={formData.firstName}
              onChange={handleChange}
              className={inputClasses}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1.5">
              Last Name
            </label>
            <input
              name="lastName"
              required
              value={formData.lastName}
              onChange={handleChange}
              className={inputClasses}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1.5">
            Email
          </label>
          <input
            name="email"
            type="email"
            required
            value={formData.email}
            onChange={handleChange}
            className={inputClasses}
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1.5">
            Dealer Code
          </label>
          <div className="relative">
            <input
              name="dealerCode"
              required
              value={formData.dealerCode}
              onChange={handleChange}
              className={`${inputClasses} pl-10`}
              placeholder="e.g. HERTZ"
            />
            <Icons.BuildingOfficeIcon className="absolute left-3 top-2.5 h-5 w-5 text-neutral-400" />
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            Enter the code provided by your administrator
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1.5">
            Password
          </label>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            value={formData.password}
            onChange={handleChange}
            className={inputClasses}
            placeholder="At least 8 characters"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1.5">
            Confirm Password
          </label>
          <input
            name="passwordConfirm"
            type="password"
            required
            minLength={8}
            value={formData.passwordConfirm}
            onChange={handleChange}
            className={inputClasses}
            placeholder="Confirm your password"
          />
        </div>

        <Button type="submit" disabled={loading} className="w-full mt-2">
          {loading ? <Icons.SpinnerIcon className="animate-spin h-4 w-4" /> : "Create account"}
        </Button>
      </form>

      <div className="text-center mt-6 pt-4 border-t border-neutral-100 dark:border-neutral-800">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Already have an account?{" "}
          <button
            onClick={onLoginClick}
            className="font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
};
