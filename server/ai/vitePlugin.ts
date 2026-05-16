import type { Plugin } from "vite";
import { handleAiRequest } from "../../api/_lib/ai/routes";

export const aiRoutesPlugin = (): Plugin => ({
  name: "ltv-ai-routes",
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      void handleAiRequest(request, response, next);
    });
  },
});
