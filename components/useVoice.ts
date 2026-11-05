"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { MicEngine } from "@/lib/client/mic";
import { connectMockScribe, connectScribe, type SttConnection, type SttErrorKind, Transcript } from "@/lib/client/stt";

export type SttState = "idle" | "connecting" | "live" | "error";

export interface Voice {
  mic: MicEngine;
  transcript: Transcript;
  /** Bumps on every transcript change (drives re-renders). */
  version: number;
  stt: SttState;
  sttError: SttErrorKind | null;
  /** Start mic + realtime STT. Throws MicError on mic problems. */
  listen: () => Promise<void>;
  /** Stop STT and the mic tracks. */
  stop: () => void;
  /** Mock mode: what the fake recogniser should "hear" next. */
  setExpected: (text: string) => void;
}

export function useVoice(mock: boolean): Voice {
  const mic = useMemo(() => new MicEngine(), []);
  const transcript = useMemo(() => new Transcript(), []);
  const [version, setVersion] = useState(0);
  const [stt, setStt] = useState<SttState>("idle");
  const [sttError, setSttError] = useState<SttErrorKind | null>(null);
  const conn = useRef<SttConnection | null>(null);
  const connecting = useRef<Promise<void> | null>(null);
  const connectSeq = useRef(0);
  const retries = useRef(0);
  const expected = useRef("");
  const mockRef = useRef(mock);
  const reconnect = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    mockRef.current = mock;
    // Test hook: expose the mic engine in mock mode only.
    if (mock) Object.assign(window, { __dfdMic: mic, __dfdTranscript: transcript });
  }, [mock, mic, transcript]);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const connect = useCallback(async (): Promise<void> => {
    if (conn.current) return;
    if (connecting.current) return connecting.current;
    setStt("connecting");
    const handlers = {
      onPartial: (t: string) => {
        transcript.onPartial(t);
        bump();
      },
      onCommitted: (t: string) => {
        transcript.onCommitted(t);
        bump();
      },
      onError: (kind: SttErrorKind) => {
        conn.current?.close();
        conn.current = null;
        // One silent reconnect for blips; then surface a friendly error.
        if (kind === "network" && retries.current < 1) {
          retries.current++;
          reconnect.current().catch(() => {
            setStt("error");
            setSttError("network");
          });
          return;
        }
        setStt("error");
        setSttError(kind);
      },
    };
    const seq = ++connectSeq.current;
    const attempt = (async () => {
      await null; // ensure `connecting.current` is assigned before `finally` runs
      try {
        if (mockRef.current) {
          conn.current = connectMockScribe(mic, handlers);
          if (expected.current) conn.current.setExpected?.(expected.current);
        } else {
          const { token, language } = await api.sttToken();
          conn.current = connectScribe(mic, token, language, handlers);
        }
        setStt("live");
        setSttError(null);
      } catch (e) {
        setStt("error");
        setSttError("network");
        throw e;
      } finally {
        if (connectSeq.current === seq) connecting.current = null;
      }
    })();
    connecting.current = attempt;
    return attempt;
  }, [bump, mic, transcript]);

  useEffect(() => {
    reconnect.current = connect;
  }, [connect]);

  const listen = useCallback(async () => {
    await mic.start();
    retries.current = 0;
    await connect();
  }, [connect, mic]);

  const stop = useCallback(() => {
    conn.current?.close();
    conn.current = null;
    mic.stop();
    setStt("idle");
  }, [mic]);

  const setExpected = useCallback((text: string) => {
    expected.current = text;
    conn.current?.setExpected?.(text);
  }, []);

  useEffect(() => () => {
    conn.current?.close();
    mic.stop();
  }, [mic]);

  return { mic, transcript, version, stt, sttError, listen, stop, setExpected };
}

/** A clock in state, refreshed every `ms`: `perf` (performance.now) and `wall` (Date.now). */
export function useClock(ms: number, active = true) {
  const [clock, setClock] = useState({ perf: 0, wall: 0 });
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setClock({ perf: performance.now(), wall: Date.now() }), ms);
    return () => clearInterval(id);
  }, [ms, active]);
  return clock;
}

/** Run the latest `fn` every `ms` (state-machine checks live here, not in render). */
export function useInterval(fn: () => void, ms: number, active = true) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => ref.current(), ms);
    return () => clearInterval(id);
  }, [ms, active]);
}
