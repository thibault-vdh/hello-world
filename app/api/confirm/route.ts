import type { NextRequest } from "next/server";
import { error, ipKey, json } from "@/lib/server/http";
import { confirmLink } from "@/lib/server/pipeline";
import { rateLimit } from "@/lib/server/ratelimit";

/**
 * Called by the /c/[token] page via fetch (not on GET), so link-preview bots
 * that fetch SMS links can't burn the single-use token.
 */
export async function POST(req: NextRequest) {
  if (!rateLimit(`confirm:${ipKey(req)}`, 10, 60_000)) return error("rate_limited", "Too many attempts.", 429);
  const body = (await req.json().catch(() => ({}))) as { token?: string };
  if (typeof body.token !== "string") return error("invalid", "Invalid link.", 400);
  const result = confirmLink(body.token);
  return json({ result });
}
