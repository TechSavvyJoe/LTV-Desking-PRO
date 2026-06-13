import React from "react";
import * as Icons from "../common/Icons";

interface RegisterProps {
  onSuccess: () => void;
  onLoginClick: () => void;
}

// Pilot model is invite-only: public self-registration is disabled and the
// tightened API rules would reject the unauthenticated dealers lookup anyway.
// Accounts are created by a dealership admin (or the platform owner).
export const Register: React.FC<RegisterProps> = ({ onLoginClick }) => {
  return (
    <div className="w-full max-w-md p-8 space-y-6 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-800 animate-fadeIn text-center">
      <Icons.LockClosedIcon className="w-10 h-10 mx-auto text-slate-400" />
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
        Registration is by invitation
      </h2>
      <p className="text-slate-600 dark:text-slate-400 text-sm">
        Ask your dealership administrator to create your account, or contact support.
      </p>
      <button
        onClick={onLoginClick}
        className="text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
      >
        Back to sign in
      </button>
    </div>
  );
};
