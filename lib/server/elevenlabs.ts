import "server-only";
import { config } from "./config";
import { scrub } from "./log";

/**
 * ElevenLabs REST client (fetch, per the current API reference):
 *  - POST /v1/single-use-token/realtime_scribe   -> { token }  (15 min, single use)
 *  - POST /v1/speech-to-text  (multipart, model_id=scribe_v2)  -> { text, ... }
 *  - POST /v1/voices/add      (multipart, name, files[])       -> { voice_id }
 *  - POST /v1/text-to-speech/{voice_id}?output_format=...      -> audio bytes
 *  - DELETE /v1/voices/{voice_id}                              -> { status: "ok" }
 */

class ElevenLabsError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function call(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const res = await fetch(`${config.elevenlabs.baseUrl}${path}`, {
    ...init,
    headers: { "xi-api-key": config.elevenlabs.apiKey, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(init.timeoutMs ?? 30_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ElevenLabsError(res.status, `ElevenLabs ${path.split("?")[0]} ${res.status}: ${scrub(body)}`);
  }
  return res;
}

function wavBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as BlobPart], { type: "audio/wav" });
}

export async function createRealtimeScribeToken(): Promise<string> {
  const res = await call("/v1/single-use-token/realtime_scribe", { method: "POST" });
  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error("ElevenLabs returned no token");
  return data.token;
}

/** Batch transcription, used server-side to verify what was actually said. */
export async function transcribe(wav: Uint8Array): Promise<string> {
  const form = new FormData();
  form.set("model_id", "scribe_v2");
  form.set("language_code", config.elevenlabs.sttLanguage);
  form.set("tag_audio_events", "false");
  form.set("file", wavBlob(wav), "line.wav");
  const res = await call("/v1/speech-to-text", { method: "POST", body: form });
  const data = (await res.json()) as { text?: string };
  return data.text ?? "";
}

export async function createVoiceClone(wav: Uint8Array, name: string): Promise<string> {
  const form = new FormData();
  form.set("name", name);
  form.set("description", "Temporary, self-consented demo clone. Deleted automatically within minutes.");
  form.set("remove_background_noise", "false");
  form.append("files", wavBlob(wav), "sample.wav");
  const res = await call("/v1/voices/add", { method: "POST", body: form, timeoutMs: 60_000 });
  const data = (await res.json()) as { voice_id?: string };
  if (!data.voice_id) throw new Error("ElevenLabs returned no voice_id");
  return data.voice_id;
}

/** Text-to-speech. `text` must come from the hardcoded script table, never from a request. */
export async function synthesize(voiceId: string, text: string, opts: { clone: boolean }): Promise<Buffer> {
  const res = await call(`/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: config.elevenlabs.ttsModel,
      voice_settings: opts.clone
        ? { stability: 0.45, similarity_boost: 0.9, style: 0.15, use_speaker_boost: true }
        : { stability: 0.6, similarity_boost: 0.75, style: 0, use_speaker_boost: true },
    }),
    timeoutMs: 60_000,
  });
  return Buffer.from(await res.arrayBuffer());
}

export async function deleteVoice(voiceId: string): Promise<void> {
  try {
    await call(`/v1/voices/${encodeURIComponent(voiceId)}`, { method: "DELETE" });
  } catch (e) {
    // Already gone is fine; anything else is retried by the cleanup job.
    if (e instanceof ElevenLabsError && (e.status === 404 || e.status === 400)) return;
    throw e;
  }
}
