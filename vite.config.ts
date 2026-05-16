import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { aiRoutesPlugin } from "./server/ai/vitePlugin";

export default defineConfig(() => {
  return {
    base: "/",
    server: {
      port: 3000,
      host: "0.0.0.0",
    },
    plugins: [react(), tailwindcss(), aiRoutesPlugin()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          // Only force-chunk React. jspdf, html2canvas, tesseract.js are
          // dynamically imported on demand (see services/pdfGenerator.ts
          // and components/DocumentScanner.tsx) — listing them here would
          // defeat the lazy-load and inflate first-paint.
          manualChunks: {
            vendor: ["react", "react-dom"],
          },
        },
      },
    },
  };
});
