import React, { useState } from "react";
import { toast } from "../../lib/toast";
import { register } from "../../lib/auth";
import Button from "../common/Button";
import * as Icons from "../common/Icons";

interface RegisterProps {
  onSuccess: () => void;
  onLoginClick: () => void;
}

export const Register: React.FC<RegisterProps> = ({
  onSuccess,
  onLoginClick,
}) => {
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
      await register(
        formData.email,
        formData.password,
        formData.firstName,
        formData.lastName,
        formData.dealerCode
      );
      toast.success("Registration successful! Please login.");
      onLoginClick(); // Redirect to login after registration
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

  return (
    <div className="w-full max-w-md p-8 space-y-6 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 animate-fadeIn">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
          Create Account
        </h2>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Join your dealership team
        </p>
      </div>

      <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              First Name
            </label>
            <input
              name="firstName"
              required
              value={formData.firstName}
              onChange={handleChange}
              className="mt-1 w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Last Name
            </label>
            <input
              name="lastName"
              required
              value={formData.lastName}
              onChange={handleChange}
              className="mt-1 w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Email
          </label>
          <input
            name="email"
            type="email"
            required
            value={formData.email}
            onChange={handleChange}
            className="mt-1 w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Dealer Code
          </label>
          <div className="mt-1 relative">
            <input
              name="dealerCode"
              required
              value={formData.dealerCode}
              onChange={handleChange}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g. HERTZ"
            />
            <Icons.BuildingOfficeIcon className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Enter the code provided by your admin (e.g., HERTZ)
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Password
          </label>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            value={formData.password}
            onChange={handleChange}
            className="mt-1 w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Confirm Password
          </label>
          <input
            name="passwordConfirm"
            type="password"
            required
            minLength={8}
            value={formData.passwordConfirm}
            onChange={handleChange}
            className="mt-1 w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full flex justify-center mt-6 py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          {loading ? (
            <Icons.SpinnerIcon className="animate-spin h-5 w-5" />
          ) : (
            "Create Account"
          )}
        </Button>
      </form>

      <div className="text-center mt-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Already have an account?{" "}
          <button
            onClick={onLoginClick}
            className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
};
