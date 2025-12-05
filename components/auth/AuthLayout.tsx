import React from "react";
import * as Icons from "../common/Icons";

interface AuthLayoutProps {
  children: React.ReactNode;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-[url('https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&q=80')] bg-cover bg-center bg-no-repeat bg-fixed relative">
      <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center mb-6">
          <div className="bg-blue-600 p-3 rounded-2xl shadow-lg">
            <Icons.TruckIcon className="w-10 h-10 text-white" />
          </div>
        </div>
        <h2 className="text-center text-3xl font-extrabold text-white mb-2">
          LTV Desking PRO
        </h2>
        <p className="text-center text-slate-300 text-sm">
          Advanced Deal Structuring & Finance Platform
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        {children}
      </div>
    </div>
  );
};
