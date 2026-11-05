import type { NextRequest } from "next/server";
import { config } from "@/lib/server/config";
import { signToken, verifyToken } from "@/lib/server/crypto";
import { log } from "@/lib/server/log";
import { REVEAL_TEXT } from "@/lib/server/scripts";
import { store } from "@/lib/server/store";
import { escapeXml, isValidTwilioRequest } from "@/lib/server/twilio";

function twiml(xml: string) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${xml}</Response>`, {
    headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" },
  });
}

/** TwiML for the answered call: scenario audio (clone) then the reveal (neutral voice). */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => (params[k] = String(v)));
  const publicUrl = `${config.appBaseUrl}${req.nextUrl.pathname}${req.nextUrl.search}`;
  if (!isValidTwilioRequest(req.headers.get("x-twilio-signature"), publicUrl, params)) {
    log.warn("twilio.bad_signature", { note: "voice" });
    return new Response("Forbidden", { status: 403 });
  }

  const payload = verifyToken<{ sid: string; a: string }>("voice", req.nextUrl.searchParams.get("t"));
  const s = payload ? store.get(payload.sid) : null;
  if (!s || !s.audio || s.audio.id !== payload!.a || (s.call.sid && params.CallSid && s.call.sid !== params.CallSid)) {
    return twiml("<Hangup/>");
  }

  const audioUrl = (part: "scenario" | "reveal") =>
    escapeXml(`${config.appBaseUrl}/api/call-audio/${signToken("audio", { sid: s.id, a: s.audio!.id, p: part }, 3 * 60_000)}`);

  const reveal = s.audio.reveal
    ? `<Play>${audioUrl("reveal")}</Play>`
    : `<Say voice="${escapeXml(config.twilio.revealSayVoice)}">${escapeXml(REVEAL_TEXT)}</Say>`;

  return twiml(`<Pause length="1"/><Play>${audioUrl("scenario")}</Play><Pause length="2"/>${reveal}<Hangup/>`);
}
