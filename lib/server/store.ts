import "server-only";
import type { ScenarioId } from "../scenarios";
import type { CallStatus, SessionSnapshot } from "../types";
import { config } from "./config";

/**
 * In-memory session store with TTL. Lives on globalThis so every route
 * handler (and dev hot reloads) share one instance. Prototype only: a
 * multi-instance deployment needs Redis or similar.
 */
export interface Session {
  id: string;
  createdAt: number;
  expiresAt: number;
  ipHash: string;
  consent: { word: string; number: number; line: string };
  consentVerified: boolean;
  consentAttempts: number;
  /** Raw PCM of the verified consent line; wiped right after cloning. */
  consentAudio: { sampleRate: number; samples: Int16Array } | null;
  /** Raw PCM of the quality lines; wiped right after cloning. */
  sampleAudio: { sampleRate: number; samples: Int16Array } | null;
  voiceSeconds: number | null;
  phone: null | {
    e164: string;
    hash: string;
    masked: string;
    region: string;
    smsSentAt: number | null;
    smsCount: number;
    /** Nonce embedded in the current SMS link; rotated on resend. */
    linkNonce: string | null;
    confirmed: boolean;
  };
  clone: {
    status: "idle" | "cloning" | "ready" | "failed" | "deleted";
    voiceId: string | null;
    startedAt: number | null;
    readyAt: number | null;
    promise: Promise<void> | null;
  };
  scenarioId: ScenarioId | null;
  /** Generated call audio (mp3). Wiped when the call ends or at cleanup. */
  audio: { id: string; scenario: Buffer; reveal: Buffer | null } | null;
  synthSeconds: number | null;
  call: {
    status: CallStatus;
    sid: string | null;
    attempts: number;
    answered: boolean;
    error: string | null;
  };
  leadEmail: string | null;
  /** SMS sent by this session across all numbers (caps number-hopping). */
  smsTotal: number;
  /** MOCK_PROVIDERS only. */
  mockConfirmUrl: string | null;
}

interface StoreState {
  sessions: Map<string, Session>;
  listeners: Map<string, Set<(s: SessionSnapshot) => void>>;
  /** Keyed hashes of numbers that already received (answered) a demo call. */
  usedNumbers: Set<string>;
}

const g = globalThis as unknown as { __dfdStore?: StoreState };
const state: StoreState = (g.__dfdStore ??= {
  sessions: new Map(),
  listeners: new Map(),
  usedNumbers: new Set(),
});

export const store = {
  create(s: Session) {
    state.sessions.set(s.id, s);
  },
  get(id: string | null | undefined): Session | null {
    if (!id) return null;
    const s = state.sessions.get(id);
    if (!s) return null;
    if (s.expiresAt < Date.now()) return null;
    return s;
  },
  /** Mutate a session and push the new snapshot to any SSE listeners. */
  update(id: string, fn: (s: Session) => void): Session | null {
    const s = state.sessions.get(id);
    if (!s) return null;
    fn(s);
    this.emit(s);
    return s;
  },
  emit(s: Session) {
    const ls = state.listeners.get(s.id);
    if (!ls) return;
    const snap = snapshot(s);
    for (const l of ls) l(snap);
  },
  subscribe(id: string, fn: (s: SessionSnapshot) => void): () => void {
    let set = state.listeners.get(id);
    if (!set) state.listeners.set(id, (set = new Set()));
    set.add(fn);
    return () => {
      set!.delete(fn);
      if (!set!.size) state.listeners.delete(id);
    };
  },
  all(): Session[] {
    return [...state.sessions.values()];
  },
  delete(id: string) {
    state.sessions.delete(id);
    state.listeners.delete(id);
  },
  isNumberUsed(hash: string) {
    return state.usedNumbers.has(hash);
  },
  markNumberUsed(hash: string) {
    state.usedNumbers.add(hash);
  },
};

export function snapshot(s: Session): SessionSnapshot {
  const lim = config.limits;
  const terminalMiss = ["no-answer", "busy", "failed", "canceled"].includes(s.call.status);
  return {
    id: s.id,
    mock: config.mock,
    consentVerified: s.consentVerified,
    samplesReady: Boolean(s.sampleAudio) || s.clone.status !== "idle",
    phone: s.phone && {
      masked: s.phone.masked,
      smsSentAt: s.phone.smsSentAt,
      resendAvailableAt: s.phone.smsSentAt ? s.phone.smsSentAt + lim.smsResendMs : null,
      smsSendsLeft: Math.max(0, lim.maxSmsPerSession - s.phone.smsCount),
      confirmed: s.phone.confirmed,
    },
    clone: s.clone.status,
    scenarioId: s.scenarioId,
    call: {
      status: s.call.status,
      attempts: s.call.attempts,
      canRetry: terminalMiss && !s.call.answered && s.call.attempts < lim.maxCallAttempts && Boolean(s.audio),
      answered: s.call.answered,
      error: s.call.error,
    },
    timings: {
      voiceSeconds: s.voiceSeconds,
      cloneSeconds: s.clone.readyAt && s.clone.startedAt ? (s.clone.readyAt - s.clone.startedAt) / 1000 : null,
      synthSeconds: s.synthSeconds,
    },
    expiresAt: s.expiresAt,
    mockConfirmUrl: config.mock ? s.mockConfirmUrl : null,
  };
}
