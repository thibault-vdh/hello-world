import "server-only";
import { randomBytes } from "node:crypto";
import { log } from "./log";

function list(v: string | undefined): string[] {
  return (v ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function bool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

const isProd = process.env.NODE_ENV === "production";

let devSecret: string | null = null;
function signingSecret(): string {
  const s = process.env.LINK_SIGNING_SECRET;
  if (s && s.length >= 32) return s;
  if (isProd && !bool(process.env.MOCK_PROVIDERS, false)) {
    throw new Error("LINK_SIGNING_SECRET must be set (32+ chars) in production");
  }
  if (!devSecret) {
    devSecret = randomBytes(32).toString("hex");
    log.warn("config.ephemeral_signing_secret", { note: "LINK_SIGNING_SECRET missing; using a random per-process secret" });
  }
  return devSecret;
}

export const config = {
  get isProd() {
    return isProd;
  },
  /** Fake ElevenLabs/Twilio so the whole flow can be clicked through locally. */
  get mock() {
    return bool(process.env.MOCK_PROVIDERS, false);
  },
  /** PROTOTYPE MODE (default ON): only ALLOWED_NUMBERS can be texted or called. */
  get prototypeMode() {
    return bool(process.env.PROTOTYPE_MODE, true);
  },
  get allowedNumbers(): string[] {
    return list(process.env.ALLOWED_NUMBERS);
  },
  /** ISO 3166 regions (BE, NL, US) and/or calling codes (+32, 1). */
  get allowedCountryCodes(): string[] {
    const v = list(process.env.ALLOWED_COUNTRY_CODES);
    return v.length ? v : ["BE", "NL", "FR", "DE", "GB", "IE", "US", "CA"];
  },
  get appBaseUrl(): string {
    return (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  },
  get signingSecret(): string {
    return signingSecret();
  },
  turnstile: {
    get siteKey() {
      return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
    },
    get secretKey() {
      return process.env.TURNSTILE_SECRET_KEY ?? "";
    },
  },
  elevenlabs: {
    get apiKey() {
      return process.env.ELEVENLABS_API_KEY ?? "";
    },
    get baseUrl() {
      return (process.env.ELEVENLABS_BASE_URL ?? "https://api.elevenlabs.io").replace(/\/+$/, "");
    },
    get ttsModel() {
      return process.env.ELEVENLABS_TTS_MODEL ?? "eleven_multilingual_v2";
    },
    /** Optional premade voice for the reveal; falls back to Twilio <Say>. */
    get revealVoiceId() {
      return process.env.ELEVENLABS_REVEAL_VOICE_ID ?? "";
    },
    get sttLanguage() {
      return process.env.STT_LANGUAGE ?? "en";
    },
  },
  twilio: {
    get accountSid() {
      return process.env.TWILIO_ACCOUNT_SID ?? "";
    },
    get authToken() {
      return process.env.TWILIO_AUTH_TOKEN ?? "";
    },
    get fromNumber() {
      return process.env.TWILIO_FROM_NUMBER ?? "";
    },
    get revealSayVoice() {
      return process.env.TWILIO_REVEAL_VOICE ?? "Polly.Joanna-Neural";
    },
  },
  limits: {
    sessionTtlMs: 15 * 60_000,
    /** Hard cap: clone + audio are destroyed this long after session start. */
    cleanupAfterMs: 10 * 60_000,
    linkTtlMs: 10 * 60_000,
    smsResendMs: 30_000,
    maxSmsPerSession: 3,
    maxCallAttempts: 2,
    minSampleSeconds: Number(process.env.MIN_SAMPLE_SECONDS ?? 12),
    maxUploadBytes: 6 * 1024 * 1024,
  },
};

export function assertProvidersConfigured(): string | null {
  if (config.mock) return null;
  const missing: string[] = [];
  if (!config.elevenlabs.apiKey) missing.push("ELEVENLABS_API_KEY");
  if (!config.twilio.accountSid) missing.push("TWILIO_ACCOUNT_SID");
  if (!config.twilio.authToken) missing.push("TWILIO_AUTH_TOKEN");
  if (!config.twilio.fromNumber) missing.push("TWILIO_FROM_NUMBER");
  return missing.length ? `Missing env: ${missing.join(", ")}` : null;
}
