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
      fontFamily: {
        // Manrope = UI/body, Bricolage Grotesque = display/headings, IBM Plex Mono = money/tabular
        sans: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Bricolage Grotesque", "ui-sans-serif", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      colors: {
        // Legacy x-* aliases remapped onto the unified near-black + green identity.
        "x-black": "#0e1117", // near-black surface (was slate-900)
        "x-blue": "#43c05a", // brand green (was navy/blue)
        "x-border": "#232a36",
        "x-hover-dark": "#161a23",
        "x-hover-light": "#1b212d",
        "x-text-primary": "#eaeff7",
        "x-text-secondary": "#9aa4b6",
      },
    },
  },
} satisfies Config;
