import { config } from "@/lib/server/config";
import { json, withSession } from "@/lib/server/http";
import { providers } from "@/lib/server/providers";

/** Single-use ElevenLabs realtime Scribe token for the browser (API key never leaves the server). */
export const POST = withSession("stt-token", { perMinute: 12 }, async () => {
  const token = await providers.scribeToken();
  return json({ token, mock: config.mock, language: config.elevenlabs.sttLanguage });
});
