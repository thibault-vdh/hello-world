import { config } from "@/lib/server/config";
import { json, readBody, withSession } from "@/lib/server/http";
import { submitSamples } from "@/lib/server/pipeline";
import { snapshot } from "@/lib/server/store";

/** Lines 2-3 audio (WAV). Stored in memory only until the clone is created. */
export const POST = withSession("samples", { perMinute: 10 }, async (req, s) => {
  const body = await readBody(req, config.limits.maxUploadBytes);
  await submitSamples(s, body);
  return json({ ok: true, snapshot: snapshot(s) });
});
