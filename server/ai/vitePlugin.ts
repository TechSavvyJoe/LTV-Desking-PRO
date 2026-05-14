import type { Plugin } from "vite";
import { handleAiRequest } from "./routes";

export const aiRoutesPlugin = (): Plugin => ({
  name: "ltv-ai-routes",
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      void handleAiRequest(request, response, next);
    });
  },
});
