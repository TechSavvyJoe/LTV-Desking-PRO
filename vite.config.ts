import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, ".", "");

  // Prioritize process.env (CI/CD) over .env files
  // Do NOT embed API keys in client bundle; require runtime/proxy usage.
  const apiKey = env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || "";

  return {
    base: "/LTV-Desking-PRO/",
    server: {
      port: 3000,
      host: "0.0.0.0",
    },
    plugins: [react()],
    define: {
      // Keep empty to avoid leaking secrets into the client bundle
      "process.env.API_KEY": JSON.stringify(apiKey),
      "process.env.GEMINI_API_KEY": JSON.stringify(apiKey),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ["react", "react-dom"],
            genai: ["@google/genai"],
            utils: ["jspdf", "html2canvas"],
          },
        },
      },
    },
  };
});
