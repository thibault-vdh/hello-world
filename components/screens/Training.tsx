"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api } from "@/lib/client/api";
import { concatPcm, trimSilence } from "@/lib/client/mic";
import { matchLine, tokenize } from "@/lib/text";
import { encodeWav } from "@/lib/wav";
import { Karaoke } from "../Karaoke";
import type { Voice } from "../useVoice";
import { useClock, useInterval } from "../useVoice";
import { GhostButton, Hint, StatusPill, VoiceOrb } from "../ui";

const ADVANCE_RATIO = 0.8;
const TAIL_MS = 450;

type Phase = "reading" | "checking";

export function TrainingScreen({
  lines,
  voice,
  onDone,
  onFatal,
}: {
  lines: string[];
  voice: Voice;
  onDone: () => void;
  onFatal: (e: unknown) => void;
}) {
  const { mic, transcript } = voice;
  const [line, setLine] = useState(0);
  const [phase, setPhase] = useState<Phase>("reading");
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [lineShownAt, setLineShownAt] = useState(0);

  const lineRef = useRef(0);
  const lineStart = useRef<number[]>([0, 0, 0]);
  const lineAudio = useRef<(Int16Array | null)[]>([null, null, null]);
  const consentCheck = useRef<Promise<boolean> | null>(null);
  const advancing = useRef(false);
  const generation = useRef(0); // invalidates in-flight work after a restart

  const clock = useClock(250, phase === "reading");

  // Consent code words (last two words of line 1) get a special treatment.
  const codeFrom = useMemo(() => lines[0].split(/\s+/).length - 2, [lines]);
  const targets = useMemo(() => lines.map((l) => tokenize(l)), [lines]);

  const showLine = useCallback(
    (i: number, startSample: number) => {
      lineRef.current = i;
      lineStart.current[i] = startSample;
      setLineShownAt(performance.now());
      transcript.reset();
      voice.setExpected(lines[i]);
      setLine(i);
    },
    [lines, transcript, voice],
  );

  const restartFrom = useCallback(
    (i: 0 | 1, message: string) => {
      generation.current++;
      advancing.current = false;
      if (i === 0) consentCheck.current = null;
      mic.startRecording();
      setNotice(message);
      setPhase("reading");
      showLine(i, 0);
    },
    [mic, showLine],
  );

  // Start listening + recording once.
  useEffect(() => {
    let cancelled = false;
    voice
      .listen()
      .then(() => {
        if (cancelled) return;
        mic.startRecording();
        showLine(0, 0);
        setReady(true);
      })
      .catch(onFatal);
    return () => {
      cancelled = true;
      mic.stopRecording();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = useCallback(
    async (gen: number) => {
      setPhase("checking");
      mic.stopRecording();
      const consentOk = await consentCheck.current;
      if (gen !== generation.current || !consentOk) return; // a restart already happened
      try {
        const pcm = concatPcm([lineAudio.current[1]!, lineAudio.current[2]!]);
        await api.samples(encodeWav(pcm, mic.sampleRate));
        if (gen === generation.current) onDone();
      } catch (e) {
        if (gen !== generation.current) return;
        if (e instanceof ApiError && ["mismatch", "too_short", "bad_audio"].includes(e.code)) {
          restartFrom(1, e.message);
        } else onFatal(e);
      }
    },
    [mic, onDone, onFatal, restartFrom],
  );

  const advance = useCallback(async () => {
    if (advancing.current) return;
    advancing.current = true;
    const gen = generation.current;
    const i = lineRef.current;
    await new Promise((r) => setTimeout(r, TAIL_MS)); // catch the last syllable
    if (gen !== generation.current) return;
    const end = mic.position();
    const audio = trimSilence(mic.slice(lineStart.current[i], end), mic.sampleRate);
    lineAudio.current[i] = audio;
    setNotice(null);

    if (i === 0) {
      // Server-side gate: batch STT on the real audio must contain the code.
      consentCheck.current = api
        .consent(encodeWav(audio, mic.sampleRate))
        .then((r) => {
          if (!r.ok && gen === generation.current) {
            restartFrom(0, "Let’s read the first line once more. Make sure to say your code clearly.");
          }
          return r.ok;
        })
        .catch((e) => {
          if (gen !== generation.current) return false;
          if (e instanceof ApiError && ["too_short", "bad_audio"].includes(e.code)) {
            restartFrom(0, "We didn’t quite catch that. Let’s read the first line once more.");
          } else onFatal(e);
          return false;
        });
    }

    if (i < lines.length - 1) {
      showLine(i + 1, end);
      advancing.current = false;
    } else {
      void finish(gen);
    }
  }, [finish, lines.length, mic, onFatal, restartFrom, showLine]);

  // Live matching (re-rendered on every transcript change).
  const match = matchLine(targets[line], transcript.tokens());

  // Auto-advance check, a few times per second.
  useInterval(
    () => {
      if (advancing.current) return;
      const m = matchLine(targets[lineRef.current], transcript.tokens());
      const silentMs = performance.now() - Math.max(transcript.lastChangeAt, mic.lastVoiceAt);
      // Line 1 ends with the code: be patient before advancing without it.
      const needSilence = lineRef.current === 0 ? 2500 : 1200;
      if (m.ratio >= ADVANCE_RATIO && (m.lastMatched || silentMs > needSilence)) void advance();
    },
    150,
    ready && phase === "reading",
  );

  const quietOnLine = clock.perf - Math.max(mic.lastVoiceAt, lineShownAt, transcript.lastChangeAt);
  const showSilenceHint = ready && phase === "reading" && match.ratio < ADVANCE_RATIO && quietOnLine > 4000;
  const showManual = ready && phase === "reading" && clock.perf - lineShownAt > 9000 && match.ratio >= 0.4;

  return (
    <div className="flex flex-1 flex-col items-center">
      <div className="flex w-full items-center justify-between">
        <StatusPill live={voice.stt === "live" && phase === "reading"}>
          {phase === "checking" ? "Checking" : voice.stt === "live" ? "Listening" : "Connecting…"}
        </StatusPill>
        <div className="flex gap-1.5" aria-label={`Line ${line + 1} of ${lines.length}`}>
          {lines.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-500 ${i < line ? "w-6 bg-brand" : i === line ? "w-10 bg-brand/70" : "w-6 bg-line"}`}
            />
          ))}
        </div>
      </div>

      <div className="mt-8 w-full text-center sm:mt-14">
        <p className="text-[15px] font-medium text-muted">
          {line === 0 ? "Read this aloud, including your code" : "Great. Keep reading"}
        </p>
      </div>

      <div className="relative mt-6 flex min-h-[11.5rem] w-full items-center justify-center text-center sm:min-h-[13rem]">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${line}-${phase}`}
            initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -14, filter: "blur(6px)" }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="w-full"
          >
            {phase === "checking" ? (
              <p className="shimmer-text text-[clamp(1.6rem,6vw,2.4rem)] font-semibold tracking-[-0.02em]">
                Listening back to make sure it’s really you…
              </p>
            ) : (
              <Karaoke text={lines[line]} highlightCount={match.highlightCount} codeFrom={line === 0 ? codeFrom : undefined} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-auto flex flex-col items-center pt-6">
        <Hint show={Boolean(notice) || showSilenceHint} tone={notice ? "warn" : "neutral"}>
          {notice ?? "Take your time, start whenever you’re ready."}
        </Hint>
        <VoiceOrb mic={mic} active={phase === "reading" && voice.stt === "live"} size={150} />
        <div className="h-12">
          {showManual && (
            <GhostButton onClick={() => void advance()} className="text-[14px]">
              I’ve read it, next line
            </GhostButton>
          )}
        </div>
      </div>
    </div>
  );
}
