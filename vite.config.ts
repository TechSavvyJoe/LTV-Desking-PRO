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
          manualChunks: {
            vendor: ["react", "react-dom"],
            utils: ["jspdf", "html2canvas"],
          },
        },
      },
    },
  };
});
