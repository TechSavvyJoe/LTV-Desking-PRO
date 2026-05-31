import React from "react";
import { AnnouncementBanner } from "../common/AnnouncementBanner";
import { BrandMark } from "../common/BrandMark";

interface AuthLayoutProps {
  children: React.ReactNode;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen relative flex flex-col justify-center py-12 sm:px-6 lg:px-8 overflow-hidden">
      {/* Branded background: deep slate base + restrained navy radial glow + a
          subtle grid texture. One brand color only (navy) — no violet. No
          external image dependency (stays inside the strict CSP). */}
      <div className="absolute inset-0 bg-slate-950" />
      <div
        className="absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(30, 64, 175, 0.20) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 80% 100%, rgba(30, 58, 138, 0.14) 0%, transparent 50%)",
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

      <div className="absolute top-0 inset-x-0 z-20">
        <AnnouncementBanner />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center mb-8">
          <BrandMark className="w-16 h-16" />
        </div>
        <h1 className="text-center text-3xl font-semibold tracking-tight text-white">
          LTV Desking <span className="text-blue-400">PRO</span>
        </h1>
        <p className="text-center text-slate-400 text-sm mt-3 max-w-sm mx-auto">
          Precision deal structuring, lender intelligence, and F&amp;I tooling for US automotive
          dealerships.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">{children}</div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-md relative z-10 flex items-center justify-center gap-3 text-xs text-slate-500">
        <span>Built for US dealerships</span>
        <span aria-hidden>·</span>
        <a href="/privacy" className="hover:text-slate-300 transition-colors">
          Privacy
        </a>
        <span aria-hidden>·</span>
        <a href="/terms" className="hover:text-slate-300 transition-colors">
          Terms
        </a>
      </div>
    </div>
  );
};
