import { error, ipKey, json, withSession } from "@/lib/server/http";
import { sendConfirmSms } from "@/lib/server/pipeline";
import { checkPhone } from "@/lib/server/phone";
import { rateLimit } from "@/lib/server/ratelimit";
import { snapshot } from "@/lib/server/store";

/** Resend the confirm SMS to the same number (30 s cooldown, max 3 per session). */
export const POST = withSession("resend", { perMinute: 4 }, async (req, s) => {
  if (!s.phone || s.phone.confirmed) return error("no_phone", "Nothing to resend.", 409);
  const check = checkPhone(s.phone.e164);
  if (!check.ok) return error(check.code, check.message, 422);
  if (!rateLimit(`sms-num:${s.phone.hash}`, 3, 3600_000) || !rateLimit(`sms-ip:${ipKey(req)}`, 5, 3600_000)) {
    return error("rate_limited", "We’ve sent enough texts for now. Please try again later.", 429);
  }
  await sendConfirmSms(s, check);
  return json({ ok: true, snapshot: snapshot(s) });
});
