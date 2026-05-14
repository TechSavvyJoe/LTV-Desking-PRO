import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "x-black": "#000000",
        "x-blue": "#1D9BF0",
        "x-border": "#2F3336",
        "x-hover-dark": "#181818",
        "x-hover-light": "#1D1F23",
        "x-text-primary": "#E7E9EA",
        "x-text-secondary": "#8899A6",
      },
    },
  },
} satisfies Config;
