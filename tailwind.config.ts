import type { Config } from "tailwindcss";

// Dealer Trust design language lives in CSS custom properties (see index.css
// :root / .dark). New components reference them via bg-[var(--color-primary)].
//
// The legacy "x-*" palette (originally a Twitter-clone dark theme) is still used
// by AiLenderManagerModal, FavoritesTable, and FloatingToolsPanel. Rather than
// rip it out (which would leave invisible text), we keep the class names but
// REMAP their values onto the Dealer Trust palette — institutional slate + navy
// instead of pure-black + bright Twitter-blue. Those screens shift on-brand for
// free, and nothing breaks.
export default {
  darkMode: "class",
  content: ["./index.html", "./**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "x-black": "#0f172a", // slate-900 — dark surface (was #000000)
        "x-blue": "#3b82f6", // blue-500 — navy primary on dark (was #1D9BF0)
        "x-border": "#334155", // slate-700
        "x-hover-dark": "#1e293b", // slate-800
        "x-hover-light": "#334155", // slate-700
        "x-text-primary": "#f1f5f9", // slate-100
        "x-text-secondary": "#94a3b8", // slate-400
      },
    },
  },
} satisfies Config;
