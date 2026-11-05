import "server-only";
import twilio from "twilio";
import { config } from "./config";

/**
 * Twilio REST (via the official SDK):
 *  - Messages: POST /2010-04-01/Accounts/{sid}/Messages.json  (To, From, Body)
 *  - Calls:    POST /2010-04-01/Accounts/{sid}/Calls.json     (To, From, Url, StatusCallback, StatusCallbackEvent[])
 * Webhooks are verified with twilio.validateRequest (X-Twilio-Signature).
 */

let client: ReturnType<typeof twilio> | null = null;
function getClient() {
  if (!client) client = twilio(config.twilio.accountSid, config.twilio.authToken);
  return client;
}

export async function sendSms(to: string, body: string): Promise<void> {
  await getClient().messages.create({ to, from: config.twilio.fromNumber, body });
}

export async function placeCall(opts: { to: string; twimlUrl: string; statusUrl: string }): Promise<string> {
  const call = await getClient().calls.create({
    to: opts.to,
    from: config.twilio.fromNumber,
    url: opts.twimlUrl,
    method: "POST",
    statusCallback: opts.statusUrl,
    statusCallbackMethod: "POST",
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    timeout: 30,
  });
  return call.sid;
}

/**
 * Validate X-Twilio-Signature. We sign against APP_BASE_URL + path + query
 * (the exact public URL we gave Twilio), so ngrok's Host rewriting is moot.
 */
export function isValidTwilioRequest(signature: string | null, publicUrl: string, params: Record<string, string>): boolean {
  if (config.mock) return true;
  if (!signature || !config.twilio.authToken) return false;
  return twilio.validateRequest(config.twilio.authToken, signature, publicUrl, params);
}

export function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
}
