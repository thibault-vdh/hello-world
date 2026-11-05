import { config } from "@/lib/server/config";
import { json, readBody, withSession } from "@/lib/server/http";
import { verifyConsent } from "@/lib/server/pipeline";
import { snapshot } from "@/lib/server/store";

/** Line 1 audio (WAV). Server-side STT must hear this session's random code. */
export const POST = withSession("consent", { perMinute: 10 }, async (req, s) => {
  const body = await readBody(req, config.limits.maxUploadBytes);
  const ok = await verifyConsent(s, body);
  return json({ ok, snapshot: snapshot(s) });
});
