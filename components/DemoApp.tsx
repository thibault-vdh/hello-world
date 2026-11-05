"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/client/api";
import { MicEngine, MicError } from "@/lib/client/mic";
import { getTurnstileToken, preloadTurnstile } from "@/lib/client/turnstile";
import type { SessionSnapshot, StartSessionResponse } from "@/lib/types";
import { CallingScreen } from "./screens/Calling";
import { LandingScreen } from "./screens/Landing";
import { PhoneScreen } from "./screens/Phone";
import { type ProblemKind, ProblemScreen } from "./screens/Problem";
import { ResultsScreen } from "./screens/Results";
import { ScenarioScreen } from "./screens/Scenario";
import { SmsWaitScreen } from "./screens/SmsWait";
import { TrainingScreen } from "./screens/Training";
import { useVoice } from "./useVoice";

type Step = "landing" | "training" | "phone" | "sms" | "scenario" | "calling" | "results";
const PROGRESS: Step[] = ["training", "phone", "sms", "scenario", "calling", "results"];

/** Live session snapshot over SSE (with a refetch when the tab comes back). */
function useSessionEvents(enabled: boolean, onExpired: () => void) {
  const [snap, setSnap] = useState<SessionSnapshot | null>(null);
  const expiredRef = useRef(onExpired);
  useEffect(() => {
    expiredRef.current = onExpired;
  });

  useEffect(() => {
    if (!enabled) return;
    let es: EventSource | null = null;
    let closed = false;
    const open = () => {
      es = new EventSource("/api/session/events");
      es.onmessage = (ev) => {
        try {
          setSnap(JSON.parse(ev.data));
        } catch {}
      };
      es.onerror = () => {
        // EventSource retries on its own; check whether the session is simply gone.
        api.snapshot().then(setSnap).catch((e) => {
          if (e instanceof ApiError && e.status === 401 && !closed) {
            es?.close();
            expiredRef.current();
          }
        });
      };
    };
    open();
    const onVisible = () => {
      if (document.visibilityState === "visible") api.snapshot().then(setSnap).catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      closed = true;
      es?.close();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);

  return [snap, setSnap] as const;
}

export function DemoApp() {
  const [rawStep, setStep] = useState<Step>("landing");
  const [busy, setBusy] = useState(false);
  const [landingNotice, setLandingNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ kind: ProblemKind; detail?: string } | null>(null);
  const [start, setStart] = useState<StartSessionResponse | null>(null);
  const [mock, setMock] = useState(false);
  const voice = useVoice(mock);

  const [liveSnap, setSnap] = useSessionEvents(Boolean(start), () => setProblem({ kind: "expired" }));
  const snap = liveSnap ?? start?.snapshot ?? null;

  useEffect(() => {
    preloadTurnstile();
  }, []);

  const fail = useCallback(
    (e: unknown) => {
      voice.stop();
      if (e instanceof MicError) {
        setProblem({ kind: e.kind === "denied" ? "mic-denied" : e.kind === "no-device" ? "no-device" : e.kind === "unsupported" ? "unsupported" : "generic" });
      } else if (e instanceof ApiError) {
        if (e.status === 401) setProblem({ kind: "expired" });
        else if (e.code === "not_configured") setProblem({ kind: "config", detail: e.message });
        else setProblem({ kind: "generic" });
      } else setProblem({ kind: "generic" });
    },
    [voice],
  );

  // The SMS link may be tapped on another device: the snapshot moves us on.
  const step = rawStep === "sms" && snap?.phone?.confirmed ? "scenario" : rawStep;
  // Realtime STT failures during voice-only steps become a recoverable error screen.
  const shownProblem = problem ?? (voice.stt === "error" && (step === "training" || step === "phone") ? { kind: "stt" as const } : null);

  const begin = async () => {
    setBusy(true);
    setLandingNotice(null);
    if (!MicEngine.supported()) {
      setProblem({ kind: "unsupported" });
      setBusy(false);
      return;
    }
    try {
      await voice.mic.start(); // permission prompt, inside the tap
      const token = await getTurnstileToken().catch(() => null);
      const s = await api.startSession(token);
      setMock(s.snapshot.mock);
      setStart(s);
      setStep("training");
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) setLandingNotice(e.message);
      else if (e instanceof ApiError && e.code === "captcha") setLandingNotice(e.message);
      else fail(e);
    } finally {
      setBusy(false);
    }
  };

  const recover = () => {
    const kind = shownProblem?.kind;
    setProblem(null);
    voice.stop();
    if (kind === "expired" || kind === "generic" || kind === "config" || kind === "unsupported" || !start) {
      window.location.reload();
      return;
    }
    // Mic or STT trouble mid-flow: retry the current step in place.
    setStep((s) => (s === "training" ? "landing" : s));
    if (step === "training") setStart(null);
  };

  const progressIdx = PROGRESS.indexOf(step);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-8">
      <header className="flex h-12 items-center justify-between">
        <span className="text-[15px] font-semibold tracking-tight">
          Noon <span className="font-normal text-muted">by Aikido</span>
        </span>
        <div className="flex items-center gap-3">
          {mock && <span className="rounded-full bg-warn-soft px-2.5 py-1 text-[12px] font-semibold text-warn">Mock mode</span>}
          {progressIdx >= 0 && (
            <div className="h-1 w-20 overflow-hidden rounded-full bg-line" aria-hidden="true">
              <motion.div
                className="h-full rounded-full bg-brand"
                animate={{ width: `${((progressIdx + 1) / PROGRESS.length) * 100}%` }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          )}
        </div>
      </header>

      <AnimatePresence mode="wait">
        <motion.section
          key={shownProblem ? `problem-${shownProblem.kind}` : step}
          initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -16, filter: "blur(8px)" }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-1 flex-col py-4"
        >
          {shownProblem ? (
            <ProblemScreen kind={shownProblem.kind} detail={problem?.detail} onAction={recover} />
          ) : step === "landing" ? (
            <LandingScreen busy={busy} onStart={begin} notice={landingNotice} />
          ) : step === "training" && start ? (
            <TrainingScreen lines={start.lines} voice={voice} onDone={() => setStep("phone")} onFatal={fail} />
          ) : step === "phone" && start ? (
            <PhoneScreen
              voice={voice}
              mockPhone={start.mockPhone}
              onSent={(s) => {
                setSnap(s);
                setStep("sms");
              }}
              onFatal={fail}
            />
          ) : step === "sms" && snap ? (
            <SmsWaitScreen key={snap.phone?.smsSentAt ?? 0} snap={snap} onSnapshot={setSnap} onChangeNumber={() => setStep("phone")} />
          ) : step === "scenario" ? (
            <ScenarioScreen
              voice={voice}
              onChosen={(s) => {
                setSnap(s);
                setStep("calling");
              }}
              onFatal={fail}
            />
          ) : step === "calling" && snap ? (
            <CallingWatcher snap={snap} onSnapshot={setSnap} onDone={() => setStep("results")} />
          ) : step === "results" && snap ? (
            <ResultsScreen snap={snap} voice={voice} />
          ) : null}
        </motion.section>
      </AnimatePresence>

      <div id="turnstile-slot" className="flex justify-center" />
      <footer className="pt-2 text-center text-[12px] text-faint">
        Calls only your own, verified number · Voice clone deleted right after the call
      </footer>
    </main>
  );
}

/** Moves on to results a moment after an answered call ends. */
function CallingWatcher({ snap, onSnapshot, onDone }: { snap: SessionSnapshot; onSnapshot: (s: SessionSnapshot) => void; onDone: () => void }) {
  const done = snap.call.status === "completed" && snap.call.answered;
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(onDone, 1200);
    return () => clearTimeout(t);
  }, [done, onDone]);
  return <CallingScreen snap={snap} onSnapshot={onSnapshot} onFinish={onDone} />;
}
