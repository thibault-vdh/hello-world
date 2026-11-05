import type { NextRequest } from "next/server";
import { QUALITY_LINES } from "@/lib/lines";
import { assertProvidersConfigured, config } from "@/lib/server/config";
import { currentSession, error, ipKey, clientIp, json, setSessionCookie } from "@/lib/server/http";
import { createSession } from "@/lib/server/pipeline";
import { rateLimit } from "@/lib/server/ratelimit";
import { snapshot } from "@/lib/server/store";
import { verifyTurnstile } from "@/lib/server/turnstile";
import type { StartSessionResponse } from "@/lib/types";

/** Start a demo session (on the mic tap). Captcha-gated and rate limited per IP. */
export async function POST(req: NextRequest) {
  const ip = ipKey(req);
  if (!rateLimit(`session:${ip}`, 5, 60_000) || !rateLimit(`session-h:${ip}`, 20, 3600_000)) {
    return error("rate_limited", "Too many attempts from this network. Try again in a little while.", 429);
  }
  const missing = assertProvidersConfigured();
  if (missing) return error("not_configured", `The demo isn’t configured yet. ${missing}`, 503);

  const body = (await req.json().catch(() => ({}))) as { turnstileToken?: string };
  if (!(await verifyTurnstile(body.turnstileToken, clientIp(req)))) {
    return error("captcha", "We couldn’t verify you’re human. Please reload and try again.", 403);
  }

  const s = createSession(ip);
  await setSessionCookie(s.id);
  const res: StartSessionResponse = {
    snapshot: snapshot(s),
    consent: s.consent,
    lines: [s.consent.line, ...QUALITY_LINES],
    mockPhone: config.mock ? (config.allowedNumbers[0] ?? "+32470123456") : null,
  };
  return json(res);
}

export async function GET() {
  const s = await currentSession();
  if (!s) return error("no_session", "No active session.", 401);
  return json(snapshot(s));
}
