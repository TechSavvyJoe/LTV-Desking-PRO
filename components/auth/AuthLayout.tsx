import React from "react";
import { AnnouncementBanner } from "../common/AnnouncementBanner";
import { BrandMark } from "../common/BrandMark";

interface AuthLayoutProps {
  children: React.ReactNode;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen relative flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-neutral-50 dark:bg-neutral-950">
      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.02] dark:opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgb(0 0 0) 1px, transparent 1px), linear-gradient(90deg, rgb(0 0 0) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="absolute top-0 inset-x-0 z-20">
        <AnnouncementBanner />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center mb-6">
          <BrandMark className="w-12 h-12" />
        </div>
        <h1 className="text-center text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
          LTV Desking <span className="text-primary-500">PRO</span>
        </h1>
        <p className="text-center text-neutral-500 dark:text-neutral-400 text-sm mt-2 max-w-sm mx-auto">
          Precision deal structuring and lender intelligence for automotive dealerships.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">{children}</div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-md relative z-10 flex items-center justify-center gap-3 text-xs text-neutral-400 dark:text-neutral-500">
        <span>Built for US dealerships</span>
        <span className="text-neutral-300 dark:text-neutral-700">·</span>
        <a
          href="/privacy"
          className="hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
        >
          Privacy
        </a>
        <span className="text-neutral-300 dark:text-neutral-700">·</span>
        <a
          href="/terms"
          className="hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
        >
          Terms
        </a>
      </div>
    </div>
  );
};
