import type { NextRequest } from "next/server";
import { config } from "@/lib/server/config";
import { verifyToken } from "@/lib/server/crypto";
import { log } from "@/lib/server/log";
import { handleCallStatus } from "@/lib/server/pipeline";
import { store } from "@/lib/server/store";
import { isValidTwilioRequest } from "@/lib/server/twilio";

/** Twilio call status callback (initiated/ringing/answered/completed). */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => (params[k] = String(v)));
  const publicUrl = `${config.appBaseUrl}${req.nextUrl.pathname}${req.nextUrl.search}`;
  if (!isValidTwilioRequest(req.headers.get("x-twilio-signature"), publicUrl, params)) {
    log.warn("twilio.bad_signature", { note: "status" });
    return new Response("Forbidden", { status: 403 });
  }
  const payload = verifyToken<{ sid: string }>("status", req.nextUrl.searchParams.get("t"));
  const s = payload ? store.get(payload.sid) : null;
  // Ignore callbacks for an earlier attempt once a retry has been placed.
  if (s && (!s.call.sid || s.call.sid === params.CallSid)) {
    handleCallStatus(s.id, params.CallStatus ?? "", params.CallDuration);
  }
  return new Response(null, { status: 204 });
}
