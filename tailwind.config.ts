import type { Config } from "tailwindcss";

// The dark/green design language lives in CSS custom properties (see index.css
// :root / .dark). New components reference them via bg-[var(--color-primary)].
//
// The legacy "x-*" palette (originally a Twitter-clone dark theme) is still used
// by AiLenderManagerModal, FavoritesTable, and FloatingToolsPanel. Rather than
// rip it out (which would leave invisible text), we keep the class names but
// REMAP their values onto the dark/green palette — near-black surfaces + mint
// green instead of pure-black + bright Twitter-blue. Those screens shift
// on-brand for free, and nothing breaks.
export default {
  darkMode: "class",
  content: ["./index.html", "./**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "x-black": "#14171c", // card surface (was #000000)
        "x-blue": "#2fdd96", // mint-green primary (was #1D9BF0)
        "x-border": "rgba(255,255,255,0.07)",
        "x-hover-dark": "#1c2027",
        "x-hover-light": "#1c2027",
        "x-text-primary": "#f1f0e9",
        "x-text-secondary": "#969ca4",
      },
    },
  },
} satisfies Config;
