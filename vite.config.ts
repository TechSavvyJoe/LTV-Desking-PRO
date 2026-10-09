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
      // HTML test reports are output, not application pages. Regenerating them
      // must not trigger a full reload and discard an in-progress desk/PDF.
      watch: {
        ignored: ["**/coverage/**", "**/playwright-report/**", "**/test-results/**"],
      },
    },
    plugins: [react(), tailwindcss(), aiRoutesPlugin()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
    build: {
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          // Core vendor + dynamic chunks for heavy libs.
          // jspdf/html2canvas/tesseract remain fully dynamic (see pdfGenerator.ts,
          // DocumentScanner.tsx). Add more here only for static imports.
          manualChunks(id) {
            if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
              return "vendor";
            }
            if (id.includes("node_modules/@tanstack")) {
              return "tanstack";
            }
            if (id.includes("node_modules/react-router")) {
              return "router";
            }
          },
          // (For deeper analysis in future: `npm i -D rollup-plugin-visualizer`
          // then import visualizer from 'rollup-plugin-visualizer' and add to plugins.)
        },
      },
    },
  };
});
