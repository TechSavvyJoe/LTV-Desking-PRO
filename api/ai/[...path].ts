import type { IncomingMessage, ServerResponse } from "node:http";
import { handleAiRequest } from "../../server/ai/routes";

/**
 * Vercel serverless catch-all for /api/ai/*.
 *
 * Vercel's Node runtime gives us req/res that extend Node's IncomingMessage
 * and ServerResponse, which is exactly what handleAiRequest expects. We
 * disable Vercel's body parser so handleAiRequest can stream-read the body
 * itself (matches the dev Vite plugin path).
 *
 * Keys come from the PocketBase `ai_provider_keys` collection at request
 * time via server/ai/keyResolver.ts. Vercel env vars required:
 *   PB_INTERNAL_URL       — e.g. https://ltv-desking-pro-api.fly.dev
 *   PB_SERVICE_EMAIL      — a PocketBase _superusers email
 *   PB_SERVICE_PASSWORD   — the password for that superuser
 *
 * Request body size: Vercel caps Node functions at ~4.5 MB. For lender PDF
 * extraction, files larger than ~3 MB (base64 inflates ~33%) will reject.
 */

export const config = {
  api: {
    bodyParser: false,
  },
  // Fluid Compute default is 300s. Lender PDF extraction with grounding can
  // take 60-120s on the larger models; this gives headroom.
  maxDuration: 300,
};

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await handleAiRequest(req, res);
}
