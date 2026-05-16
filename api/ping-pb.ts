import type { IncomingMessage, ServerResponse } from "node:http";
import PocketBase from "pocketbase";

export default function handler(_req: IncomingMessage, res: ServerResponse): void {
  // Just instantiate — don't call out
  const pb = new PocketBase("https://example.com");
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ ok: true, hasPb: typeof pb.collection === "function" }));
}
