import type { ScenarioId } from "./scenarios";

export type CallStatus =
  | "idle"
  | "preparing"
  | "queued"
  | "ringing"
  | "in-progress"
  | "completed"
  | "no-answer"
  | "busy"
  | "failed"
  | "canceled";

/** What the browser is allowed to know about a session. No secrets, no full number. */
export interface SessionSnapshot {
  id: string;
  mock: boolean;
  consentVerified: boolean;
  samplesReady: boolean;
  phone: null | {
    masked: string;
    smsSentAt: number | null;
    resendAvailableAt: number | null;
    smsSendsLeft: number;
    confirmed: boolean;
  };
  clone: "idle" | "cloning" | "ready" | "failed" | "deleted";
  scenarioId: ScenarioId | null;
  call: {
    status: CallStatus;
    attempts: number;
    canRetry: boolean;
    answered: boolean;
    error: string | null;
  };
  timings: {
    voiceSeconds: number | null;
    cloneSeconds: number | null;
    synthSeconds: number | null;
  };
  expiresAt: number;
  /** Only in MOCK_PROVIDERS mode: lets you "tap" the SMS link from the waiting screen. */
  mockConfirmUrl?: string | null;
}

export interface StartSessionResponse {
  snapshot: SessionSnapshot;
  consent: { word: string; number: number; line: string };
  lines: string[];
  mockPhone: string | null;
}

export interface ApiError {
  error: string;
  code: string;
}
