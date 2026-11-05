"use client";

import { normalize, numberWordsToDigits } from "../text";
import type { MicEngine } from "./mic";

/**
 * Realtime speech-to-text in the browser, straight to ElevenLabs Scribe v2
 * Realtime over WebSocket, authenticated with a single-use token minted by
 * our server. Protocol (per ElevenLabs API reference):
 *   wss://api.elevenlabs.io/v1/speech-to-text/realtime
 *     ?model_id=scribe_v2_realtime&token=...&audio_format=pcm_16000
 *     &commit_strategy=vad&language_code=en
 *   -> { message_type: "input_audio_chunk", audio_base_64, commit: false, sample_rate: 16000 }
 *   <- session_started | partial_transcript | committed_transcript | <error types>
 */

export type SttErrorKind = "auth" | "quota" | "network" | "server";

export interface SttHandlers {
  onPartial: (text: string) => void;
  onCommitted: (text: string) => void;
  onError: (kind: SttErrorKind, detail: string) => void;
}

export interface SttConnection {
  close(): void;
  /** Mock mode only: the text the fake recogniser "hears". */
  setExpected?(text: string): void;
}

const ERROR_TYPES: Record<string, SttErrorKind> = {
  auth_error: "auth",
  unaccepted_terms: "auth",
  quota_exceeded: "quota",
  rate_limited: "quota",
  resource_exhausted: "quota",
  session_time_limit_exceeded: "server",
  error: "server",
  input_error: "server",
  invalid_request: "server",
  chunk_size_exceeded: "server",
  queue_overflow: "server",
  transcriber_error: "server",
  commit_throttled: "server",
};

function toBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as unknown as number[]);
  }
  return btoa(bin);
}

export function connectScribe(mic: MicEngine, token: string, language: string, h: SttHandlers): SttConnection {
  const params = new URLSearchParams({
    model_id: "scribe_v2_realtime",
    token,
    audio_format: "pcm_16000",
    commit_strategy: "vad",
    vad_silence_threshold_secs: "0.8",
    language_code: language,
  });
  const ws = new WebSocket(`wss://api.elevenlabs.io/v1/speech-to-text/realtime?${params}`);
  const queue: string[] = [];
  let closedByUs = false;
  let errored = false;

  const send = (pcm: Int16Array) => {
    const msg = JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: toBase64(pcm), commit: false, sample_rate: 16000 });
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    else if (ws.readyState === WebSocket.CONNECTING && queue.length < 30) queue.push(msg);
  };
  const unsubscribe = mic.onPcm16k(send);

  ws.onopen = () => {
    while (queue.length) ws.send(queue.shift()!);
  };
  ws.onmessage = (ev) => {
    let msg: { message_type?: string; text?: string; error?: string };
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    switch (msg.message_type) {
      case "partial_transcript":
        h.onPartial(msg.text ?? "");
        break;
      case "committed_transcript":
        h.onCommitted(msg.text ?? "");
        break;
      case "session_started":
      case "warning":
      case "insufficient_audio_activity":
        break;
      default:
        if (msg.message_type && ERROR_TYPES[msg.message_type]) {
          errored = true;
          h.onError(ERROR_TYPES[msg.message_type], msg.message_type);
        }
    }
  };
  ws.onerror = () => {
    if (!closedByUs && !errored) {
      errored = true;
      h.onError("network", "socket_error");
    }
  };
  ws.onclose = (ev) => {
    unsubscribe();
    if (!closedByUs && !errored) {
      errored = true;
      h.onError(ev.code === 1008 ? "auth" : "network", `closed_${ev.code}`);
    }
  };

  return {
    close() {
      closedByUs = true;
      unsubscribe();
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close(1000);
    },
  };
}

/**
 * MOCK_PROVIDERS mode: pretends to recognise `expected`, one word every
 * ~230 ms while the mic hears something. Lets the full UI run without keys.
 */
export function connectMockScribe(mic: MicEngine, h: SttHandlers): SttConnection {
  let words: string[] = [];
  let i = 0;
  let idleSince = 0;
  const timer = setInterval(() => {
    if (!words.length) return;
    const speaking = mic.level > 0.01;
    if (i < words.length && speaking) {
      i++;
      h.onPartial(words.slice(0, i).join(" "));
      idleSince = performance.now();
    } else if (i >= words.length && performance.now() - idleSince > 500) {
      h.onCommitted(words.join(" "));
      words = [];
      i = 0;
    }
  }, 230);
  return {
    close() {
      clearInterval(timer);
    },
    setExpected(text: string) {
      // Like the real service, flush whatever was "heard" so far as a commit.
      if (i > 0) h.onCommitted(words.slice(0, i).join(" "));
      words = text.split(/\s+/).filter(Boolean);
      i = 0;
    },
  };
}

/**
 * Accumulates partial + committed transcripts, with a cheap reset() so each
 * screen/line only sees what was said after it appeared. Words already in
 * the in-flight partial at reset time are skipped when they get committed.
 */
export class Transcript {
  private segs: string[][] = [];
  private partial: string[] = [];
  private skip = 0;
  version = 0;
  lastChangeAt = 0;

  reset() {
    this.segs = [];
    this.skip = this.partial.length;
    this.version++;
    this.lastChangeAt = performance.now();
  }
  onPartial(text: string) {
    const words = normalize(text).split(" ").filter(Boolean);
    if (words.join(" ") !== this.partial.join(" ")) this.lastChangeAt = performance.now();
    this.partial = words;
    this.version++;
  }
  onCommitted(text: string) {
    const words = normalize(text).split(" ").filter(Boolean);
    this.segs.push(words.slice(this.skip));
    this.skip = 0;
    this.partial = [];
    this.version++;
    this.lastChangeAt = performance.now();
  }
  /** Normalised words since the last reset. */
  words(): string[] {
    return [...this.segs.flat(), ...this.partial.slice(this.skip)];
  }
  /** Words with spoken numbers collapsed to digits (for matching). */
  tokens(): string[] {
    return numberWordsToDigits(this.words());
  }
  text(): string {
    return this.words().join(" ");
  }
}
