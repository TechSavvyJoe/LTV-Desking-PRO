import type { Config } from "tailwindcss";

// The LTV Desk black/emerald design language lives in CSS custom properties (see index.css
// :root / .dark). Components reference them via bg-[var(--color-primary)] and
// friends — no bespoke palette entries are needed here. (The legacy "x-*"
// palette was removed once its last consumer, AiLenderManagerModal, was
// rethemed onto the tokens.)
export default {
  darkMode: "class",
  content: ["./index.html", "./**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
} satisfies Config;
