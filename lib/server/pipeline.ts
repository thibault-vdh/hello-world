import "server-only";
import { consentLine, CONSENT_PREFIX, QUALITY_LINES } from "../lines";
import type { ScenarioId } from "../scenarios";
import { matchLine, similarWord, textCoverage, tokenize } from "../text";
import { decodeWav, encodeWav, voicedSeconds } from "../wav";
import { config } from "./config";
import { keyedHash, randomId, randomInt, signToken, verifyToken } from "./crypto";
import { log, maskPhone, scrub } from "./log";
import { providers } from "./providers";
import { sweepRateLimits } from "./ratelimit";
import { REVEAL_TEXT, SCRIPTS } from "./scripts";
import { store, type Session } from "./store";

export class FlowError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Session + consent
// ---------------------------------------------------------------------------

/** Short, distinct, easy-to-recognise words (no homophones, no UK/US spelling splits). */
const CODE_WORDS = [
  "maple", "falcon", "copper", "lemon", "rocket", "violet", "canyon", "tiger", "marble", "pepper",
  "silver", "orbit", "cactus", "meadow", "pirate", "walnut", "zebra", "velvet", "glacier", "bamboo",
  "panda", "comet", "olive", "summit", "lantern", "puzzle", "dolphin", "thunder", "pickle", "banjo",
];

function pickCodeNumber(): number {
  // 21-99 without multiples of ten: avoids "fifteen/fifty" style confusions.
  let n: number;
  do n = randomInt(21, 100);
  while (n % 10 === 0);
  return n;
}

export function createSession(ipHash: string): Session {
  ensureCleanupLoop();
  const word = CODE_WORDS[randomInt(0, CODE_WORDS.length)];
  const number = pickCodeNumber();
  const now = Date.now();
  const s: Session = {
    id: randomId(18),
    createdAt: now,
    expiresAt: now + config.limits.sessionTtlMs,
    ipHash,
    consent: { word, number, line: consentLine(word, number) },
    consentVerified: false,
    consentAttempts: 0,
    consentAudio: null,
    sampleAudio: null,
    voiceSeconds: null,
    phone: null,
    clone: { status: "idle", voiceId: null, startedAt: null, readyAt: null, promise: null },
    scenarioId: null,
    audio: null,
    synthSeconds: null,
    call: { status: "idle", sid: null, attempts: 0, answered: false, error: null },
    leadEmail: null,
    smsTotal: 0,
    mockConfirmUrl: null,
  };
  store.create(s);
  log.info("session.created", { sessionId: s.id.slice(0, 6) });
  return s;
}

/** The anti-abuse gate: the spoken line must contain this session's fresh code. */
export function transcriptHasConsent(transcript: string, word: string, num: number): boolean {
  const heard = tokenize(transcript);
  const statement = matchLine(tokenize(CONSENT_PREFIX), heard).ratio;
  if (statement < 0.6) return false;
  for (let i = 0; i < heard.length; i++) {
    if (!similarWord(word, heard[i])) continue;
    // The number must follow the word closely ("maple 47", "maple, forty-seven").
    for (let k = i + 1; k <= i + 3 && k < heard.length; k++) {
      if (heard[k] === String(num)) return true;
    }
  }
  return false;
}

function parseUpload(bytes: Uint8Array, minSec: number, maxSec: number) {
  if (bytes.byteLength > config.limits.maxUploadBytes) throw new FlowError("too_large", "Recording is too large.", 413);
  const wav = decodeWav(bytes);
  if (!wav) throw new FlowError("bad_audio", "We couldn’t read that recording.");
  if (wav.seconds < minSec) throw new FlowError("too_short", "That was a bit short. Please read the whole line.");
  if (wav.seconds > maxSec) throw new FlowError("too_long", "That recording is too long.");
  return wav;
}

export async function verifyConsent(s: Session, bytes: Uint8Array): Promise<boolean> {
  if (s.consentVerified) return true;
  if (s.consentAttempts >= 5) throw new FlowError("too_many_attempts", "Too many attempts. Please start over.", 429);
  s.consentAttempts++;
  const wav = parseUpload(bytes, 1.5, 30);
  const transcript = await providers.transcribe(encodeWav(wav.samples, wav.sampleRate), s.consent.line);
  const ok = transcriptHasConsent(transcript, s.consent.word, s.consent.number);
  log.info("consent.checked", { sessionId: s.id.slice(0, 6), status: ok ? "ok" : "mismatch", attempt: s.consentAttempts });
  if (ok) {
    store.update(s.id, (x) => {
      x.consentVerified = true;
      x.consentAudio = { sampleRate: wav.sampleRate, samples: wav.samples };
    });
  }
  return ok;
}

export async function submitSamples(s: Session, bytes: Uint8Array): Promise<void> {
  if (!s.consentVerified || !s.consentAudio) throw new FlowError("consent_required", "Please read the first line again.", 409);
  if (s.clone.status !== "idle") return;
  const wav = parseUpload(bytes, 3, 90);
  if (wav.sampleRate !== s.consentAudio.sampleRate) throw new FlowError("bad_audio", "Recording format changed. Please start over.");
  const expected = QUALITY_LINES.join(" ");
  const transcript = await providers.transcribe(encodeWav(wav.samples, wav.sampleRate), expected);
  const coverage = textCoverage(expected, transcript);
  if (coverage < 0.5) {
    log.info("samples.rejected", { sessionId: s.id.slice(0, 6), code: "coverage" });
    throw new FlowError("mismatch", "We couldn’t quite catch those lines. Let’s read them once more.");
  }
  const total = (wav.samples.length + s.consentAudio.samples.length) / wav.sampleRate;
  const voiced = voicedSeconds(wav.samples, wav.sampleRate) + voicedSeconds(s.consentAudio.samples, wav.sampleRate);
  if (!config.mock && total < config.limits.minSampleSeconds) {
    throw new FlowError("too_short", "We need a little more of your voice. Let’s read those lines once more, nice and steady.");
  }
  store.update(s.id, (x) => {
    x.sampleAudio = { sampleRate: wav.sampleRate, samples: wav.samples };
    x.voiceSeconds = Math.round(total * 10) / 10;
  });
  log.info("samples.accepted", { sessionId: s.id.slice(0, 6), seconds: Math.round(total), ms: Math.round(voiced * 1000) });
}

// ---------------------------------------------------------------------------
// Phone + SMS confirmation
// ---------------------------------------------------------------------------

export function phoneHash(e164: string) {
  return keyedHash("phone", e164);
}

export async function sendConfirmSms(s: Session, check: { e164: string; region: string; callingCode: string }): Promise<void> {
  const lim = config.limits;
  const hash = phoneHash(check.e164);
  if (store.isNumberUsed(hash)) throw new FlowError("number_used", "This number already got its demo call. One call per number.", 409);
  if (s.phone && s.phone.hash !== hash && s.phone.confirmed) throw new FlowError("already_confirmed", "A number is already confirmed for this session.", 409);

  const sameNumber = s.phone?.hash === hash;
  const count = sameNumber ? s.phone!.smsCount : 0;
  if (count >= lim.maxSmsPerSession || s.smsTotal >= lim.maxSmsPerSession + 1) throw new FlowError("sms_limit", "We’ve sent enough texts for now. Please try again later.", 429);
  if (sameNumber && s.phone!.smsSentAt && Date.now() - s.phone!.smsSentAt < lim.smsResendMs) {
    throw new FlowError("too_soon", "Give it a few more seconds before we resend.", 429);
  }

  const nonce = randomId(12);
  const token = signToken("confirm", { sid: s.id, n: nonce }, lim.linkTtlMs);
  const link = `${config.appBaseUrl}/c/${token}`;
  const body = `Heads up: Noon is about to call you with an AI clone of your voice. Tap to confirm: ${link} Wasn't you? Just ignore this message.`;
  const masked = maskPhone(check.e164, check.callingCode);

  await providers.sendSms(check.e164, body, link);
  store.update(s.id, (x) => {
    x.phone = {
      e164: check.e164,
      hash,
      masked,
      region: check.region,
      smsSentAt: Date.now(),
      smsCount: count + 1,
      linkNonce: nonce,
      confirmed: false,
    };
    x.smsTotal++;
    x.mockConfirmUrl = config.mock ? link : null;
  });
  log.info("sms.sent", { sessionId: s.id.slice(0, 6), phoneMasked: masked, attempt: count + 1 });
}

export type ConfirmResult = "confirmed" | "already" | "expired" | "invalid";

export function confirmLink(token: string): ConfirmResult {
  const payload = verifyToken<{ sid: string; n: string }>("confirm", token);
  if (!payload) return "expired";
  const s = store.get(payload.sid);
  if (!s || !s.phone) return "expired";
  if (s.phone.confirmed) return "already";
  // Single use: the nonce must be the latest one and is consumed now.
  if (!s.phone.linkNonce || s.phone.linkNonce !== payload.n) return "invalid";
  store.update(s.id, (x) => {
    x.phone!.confirmed = true;
    x.phone!.linkNonce = null;
  });
  log.info("phone.confirmed", { sessionId: s.id.slice(0, 6), phoneMasked: s.phone.masked });
  // Start cloning now so the call is ready the moment a scenario is picked.
  startClone(s);
  return "confirmed";
}

// ---------------------------------------------------------------------------
// Clone -> synthesize -> delete clone -> call
// ---------------------------------------------------------------------------

function startClone(s: Session): Promise<void> {
  if (s.clone.promise) return s.clone.promise;
  if (!s.consentAudio || !s.sampleAudio) {
    store.update(s.id, (x) => (x.clone.status = "failed"));
    return Promise.resolve();
  }
  // The verified consent audio is always part of the clone input.
  const rate = s.consentAudio.sampleRate;
  const merged = new Int16Array(s.consentAudio.samples.length + s.sampleAudio.samples.length);
  merged.set(s.consentAudio.samples, 0);
  merged.set(s.sampleAudio.samples, s.consentAudio.samples.length);
  const wav = encodeWav(merged, rate);

  const p = (async () => {
    store.update(s.id, (x) => {
      x.clone.status = "cloning";
      x.clone.startedAt = Date.now();
    });
    try {
      const voiceId = await providers.cloneVoice(wav, `noon-demo-${randomId(6)}`);
      store.update(s.id, (x) => {
        x.clone.voiceId = voiceId;
        x.clone.status = "ready";
        x.clone.readyAt = Date.now();
      });
      log.info("clone.ready", { sessionId: s.id.slice(0, 6), ms: Date.now() - (s.clone.startedAt ?? Date.now()) });
    } catch (e) {
      log.error("clone.failed", { sessionId: s.id.slice(0, 6), error: scrub(e) });
      store.update(s.id, (x) => (x.clone.status = "failed"));
    } finally {
      // Raw recordings are no longer needed once the clone exists (or failed).
      store.update(s.id, (x) => {
        x.consentAudio = null;
        x.sampleAudio = null;
      });
    }
  })();
  s.clone.promise = p;
  return p;
}

async function destroyVoice(s: Session, reason: string) {
  const voiceId = s.clone.voiceId;
  if (!voiceId) return;
  try {
    await providers.deleteVoice(voiceId);
    store.update(s.id, (x) => {
      x.clone.voiceId = null;
      x.clone.status = "deleted";
    });
    log.info("clone.deleted", { sessionId: s.id.slice(0, 6), note: reason });
  } catch (e) {
    // Left in place; the cleanup loop retries.
    log.error("clone.delete_failed", { sessionId: s.id.slice(0, 6), error: scrub(e) });
  }
}

export function purgeAudio(s: Session, reason: string) {
  if (!s.audio && !s.consentAudio && !s.sampleAudio) return;
  store.update(s.id, (x) => {
    x.audio = null;
    x.consentAudio = null;
    x.sampleAudio = null;
  });
  log.info("audio.purged", { sessionId: s.id.slice(0, 6), note: reason });
}

export async function chooseScenario(s: Session, scenarioId: ScenarioId): Promise<void> {
  if (!s.phone?.confirmed) throw new FlowError("not_confirmed", "Please confirm your number first.", 409);
  if (s.scenarioId) return; // idempotent: one scenario per session
  store.update(s.id, (x) => {
    x.scenarioId = scenarioId;
    x.call.status = "preparing";
  });

  // Run in the background; the browser follows along over SSE.
  void (async () => {
    try {
      await startClone(s);
      if (s.clone.status !== "ready" || !s.clone.voiceId) throw new FlowError("clone_failed", "We couldn’t create the voice clone.");
      const t0 = Date.now();
      const script = SCRIPTS[scenarioId];
      const [scenarioAudio, reveal] = await Promise.all([
        providers.synthesize(s.clone.voiceId, script, true),
        config.elevenlabs.revealVoiceId && !config.mock
          ? providers.synthesize(config.elevenlabs.revealVoiceId, REVEAL_TEXT, false)
          : Promise.resolve(null),
      ]);
      store.update(s.id, (x) => {
        x.audio = { id: randomId(9), scenario: scenarioAudio, reveal };
        x.synthSeconds = (Date.now() - t0) / 1000;
      });
      log.info("tts.ready", { sessionId: s.id.slice(0, 6), scenario: scenarioId, ms: Date.now() - t0 });
    } catch (e) {
      log.error("prepare.failed", { sessionId: s.id.slice(0, 6), error: scrub(e) });
      store.update(s.id, (x) => {
        x.call.status = "failed";
        x.call.error = "prepare_failed";
      });
      return;
    } finally {
      // The clone has done its job: delete it before we even dial.
      await destroyVoice(s, "after_tts");
    }
    await dial(s);
  })();
}

async function dial(s: Session): Promise<void> {
  const fresh = store.get(s.id);
  if (!fresh || !fresh.phone?.confirmed || !fresh.audio) return;
  const reasons: string[] = [];
  if (config.prototypeMode && !config.allowedNumbers.includes(fresh.phone.e164)) reasons.push("prototype");
  if (store.isNumberUsed(fresh.phone.hash)) reasons.push("number_used");
  if (fresh.call.attempts >= config.limits.maxCallAttempts) reasons.push("attempts");
  if (reasons.length) {
    log.warn("call.refused", { sessionId: s.id.slice(0, 6), code: reasons.join(",") });
    store.update(s.id, (x) => {
      x.call.status = "failed";
      x.call.error = reasons[0];
    });
    purgeAudio(fresh, "call_refused");
    return;
  }

  const attempt = fresh.call.attempts + 1;
  store.update(s.id, (x) => {
    x.call.attempts = attempt;
    x.call.status = "queued";
    x.call.error = null;
  });
  const statusToken = signToken("status", { sid: s.id }, 20 * 60_000);
  const voiceToken = signToken("voice", { sid: s.id, a: fresh.audio.id }, 10 * 60_000);
  try {
    const callSid = await providers.placeCall(
      {
        to: fresh.phone.e164,
        twimlUrl: `${config.appBaseUrl}/api/twilio/voice?t=${voiceToken}`,
        statusUrl: `${config.appBaseUrl}/api/twilio/status?t=${statusToken}`,
        attempt,
      },
      { onStatus: (status, params) => handleCallStatus(s.id, status, params.CallDuration) },
    );
    store.update(s.id, (x) => (x.call.sid = callSid));
    log.info("call.placed", { sessionId: s.id.slice(0, 6), phoneMasked: fresh.phone.masked, attempt });
  } catch (e) {
    log.error("call.failed", { sessionId: s.id.slice(0, 6), error: scrub(e) });
    store.update(s.id, (x) => {
      x.call.status = "failed";
      x.call.error = "dial_failed";
    });
  }
}

const TERMINAL = new Set(["completed", "no-answer", "busy", "failed", "canceled"]);

export function handleCallStatus(sessionId: string, status: string, duration?: string) {
  const s = store.get(sessionId);
  if (!s) return;
  const known = ["queued", "initiated", "ringing", "in-progress", "completed", "no-answer", "busy", "failed", "canceled"];
  if (!known.includes(status)) return;
  const mapped = (status === "initiated" ? "queued" : status) as Session["call"]["status"];
  // Ignore late/out-of-order events once a terminal state was recorded for this attempt.
  if (TERMINAL.has(s.call.status) && !TERMINAL.has(mapped)) return;
  const answered = s.call.answered || mapped === "in-progress" || (mapped === "completed" && Number(duration ?? 0) > 0);
  store.update(sessionId, (x) => {
    x.call.status = mapped;
    x.call.answered = answered;
  });
  log.info("call.status", { sessionId: sessionId.slice(0, 6), callStatus: mapped, answered });

  if (answered && s.phone) store.markNumberUsed(s.phone.hash);
  if (TERMINAL.has(mapped)) {
    const finalAttempt = answered || s.call.attempts >= config.limits.maxCallAttempts;
    if (finalAttempt) purgeAudio(s, "call_ended");
    // A failed or unanswered first attempt keeps the audio for one retry (cleanup still applies).
  }
}

export async function retryCall(s: Session) {
  const terminalMiss = ["no-answer", "busy", "failed", "canceled"].includes(s.call.status);
  if (!terminalMiss || s.call.answered || !s.audio) throw new FlowError("no_retry", "There’s nothing to retry.", 409);
  if (s.call.attempts >= config.limits.maxCallAttempts) throw new FlowError("no_retry", "We can only call back once.", 409);
  await dial(s);
}

/** Visitor left the call screen (results): nothing more will be played, wipe everything now. */
export async function finishSession(s: Session) {
  if (s.clone.voiceId) await destroyVoice(s, "finished");
  const inFlight = ["queued", "ringing", "in-progress"].includes(s.call.status);
  if (!inFlight) purgeAudio(s, "finished");
}

// ---------------------------------------------------------------------------
// Cleanup: clone + audio are destroyed 10 minutes after start, regardless.
// ---------------------------------------------------------------------------

const g = globalThis as unknown as { __dfdCleanup?: NodeJS.Timeout };

export function ensureCleanupLoop() {
  if (g.__dfdCleanup) return;
  g.__dfdCleanup = setInterval(() => {
    void sweep();
  }, 20_000);
  g.__dfdCleanup.unref?.();
}

export async function sweep() {
  const now = Date.now();
  for (const s of store.all()) {
    const age = now - s.createdAt;
    if (age > config.limits.cleanupAfterMs) {
      if (s.clone.voiceId) await destroyVoice(s, "ttl");
      purgeAudio(s, "ttl");
    }
    if (now > s.expiresAt + 5 * 60_000 && !s.clone.voiceId) store.delete(s.id);
  }
  sweepRateLimits();
}
