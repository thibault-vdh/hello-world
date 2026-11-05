import { clientIp, error, ipKey, json, withSession } from "@/lib/server/http";
import { FlowError, phoneHash, sendConfirmSms } from "@/lib/server/pipeline";
import { checkPhone } from "@/lib/server/phone";
import { rateLimit } from "@/lib/server/ratelimit";
import { snapshot } from "@/lib/server/store";
import { verifyTurnstile } from "@/lib/server/turnstile";

/** Validate the spoken/typed number and text it a single-use confirm link. */
export const POST = withSession("phone", { perMinute: 6 }, async (req, s) => {
  if (!s.consentVerified || !s.sampleAudio) {
    throw new FlowError("samples_required", "Let’s finish reading the lines first.", 409);
  }
  const body = (await req.json().catch(() => ({}))) as { phone?: string; turnstileToken?: string };
  if (!(await verifyTurnstile(body.turnstileToken, clientIp(req)))) {
    return error("captcha", "We couldn’t verify you’re human. Please try again.", 403);
  }
  const check = checkPhone(body.phone);
  if (!check.ok) return error(check.code, check.message, 422);
  const hash = phoneHash(check.e164);
  if (!rateLimit(`sms-num:${hash}`, 3, 3600_000) || !rateLimit(`sms-ip:${ipKey(req)}`, 5, 3600_000)) {
    return error("rate_limited", "We’ve sent enough texts for now. Please try again later.", 429);
  }
  await sendConfirmSms(s, check);
  return json({ ok: true, snapshot: snapshot(s) });
});
