"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AsYouType, isValidPhoneNumber } from "libphonenumber-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/client/api";
import { getTurnstileToken } from "@/lib/client/turnstile";
import { parseYesNo, spokenToPhoneDigits } from "@/lib/text";
import type { SessionSnapshot } from "@/lib/types";
import type { Voice } from "../useVoice";
import { useClock, useInterval } from "../useVoice";
import { GhostButton, Hint, PrimaryButton, StatusPill, VoiceOrb } from "../ui";

type Mode = "listening" | "confirm" | "sending" | "typing";

const DIGIT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const spokenForMock = (e164: string) => "plus " + e164.replace(/\D/g, "").split("").map((d) => DIGIT_WORDS[+d]).join(" ");

function format(e164: string): string {
  const f = new AsYouType().input(e164);
  return f || e164;
}

export function PhoneScreen({
  voice,
  mockPhone,
  onSent,
  onFatal,
}: {
  voice: Voice;
  mockPhone: string | null;
  onSent: (snap: SessionSnapshot) => void;
  onFatal: (e: unknown) => void;
}) {
  const { mic, transcript } = voice;
  const [mode, setMode] = useState<Mode>("listening");
  const [candidate, setCandidate] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "warn" | "neutral" } | null>(null);
  const [typed, setTyped] = useState("");
  const [startedAt, setStartedAt] = useState(0);
  const submitting = useRef(false);
  const clock = useClock(250, mode === "listening" || mode === "confirm");

  const listenForNumber = useCallback(
    (message?: { text: string; tone: "warn" | "neutral" }) => {
      transcript.reset();
      submitting.current = false;
      setStartedAt(performance.now());
      setCandidate(null);
      setNotice(message ?? null);
      setMode("listening");
      if (mockPhone) voice.setExpected(spokenForMock(mockPhone));
    },
    [mockPhone, transcript, voice],
  );

  useEffect(() => {
    voice
      .listen()
      .then(() => listenForNumber())
      .catch(onFatal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = useCallback(
    async (e164: string) => {
      if (submitting.current) return;
      submitting.current = true;
      setMode("sending");
      setNotice(null);
      try {
        const token = await getTurnstileToken().catch(() => null);
        const res = await api.phone(e164, token);
        voice.stop();
        onSent(res.snapshot);
      } catch (e) {
        if (e instanceof ApiError && e.status !== 401 && e.status < 500) {
          listenForNumber({ text: e.message, tone: "warn" });
        } else onFatal(e);
      }
    },
    [listenForNumber, onFatal, onSent, voice],
  );

  // Derived live values (re-rendered on every transcript change).
  const digits = mode === "listening" ? spokenToPhoneDigits(transcript.text()) : null;
  const valid = digits ? isValidPhoneNumber(digits) : false;

  // Voice state machine, checked a few times per second.
  useInterval(
    () => {
      const silentMs = performance.now() - Math.max(transcript.lastChangeAt, mic.lastVoiceAt);
      if (mode === "listening") {
        const d = spokenToPhoneDigits(transcript.text());
        if (d && isValidPhoneNumber(d) && silentMs > 1300) {
          setCandidate(d);
          setMode("confirm");
          transcript.reset();
          if (mockPhone) voice.setExpected("yes");
        }
      } else if (mode === "confirm") {
        const yn = parseYesNo(transcript.text());
        if (yn === "yes" && candidate) void submit(candidate);
        else if (yn === "no") listenForNumber({ text: "No problem. Say it again, starting with the country code.", tone: "neutral" });
      }
    },
    150,
    mode === "listening" || mode === "confirm",
  );

  const silentMs = clock.perf - Math.max(transcript.lastChangeAt, mic.lastVoiceAt);
  const incomplete = mode === "listening" && Boolean(digits) && !valid && silentMs > 3500;
  const idle = mode === "listening" && !digits && clock.perf - Math.max(startedAt, mic.lastVoiceAt) > 5000;
  const shown = mode === "confirm" || mode === "sending" ? candidate : digits;

  return (
    <div className="flex flex-1 flex-col items-center">
      <div className="flex w-full items-center justify-between">
        <StatusPill live={voice.stt === "live" && (mode === "listening" || mode === "confirm")}>
          {mode === "sending" ? "Sending text" : mode === "typing" ? "Typing" : "Listening"}
        </StatusPill>
      </div>

      <div className="mt-10 w-full text-center sm:mt-16">
        <AnimatePresence mode="wait">
          <motion.h1
            key={mode === "confirm" ? "c" : "l"}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
            className="text-balance text-[clamp(1.6rem,6.2vw,2.5rem)] font-semibold leading-tight tracking-[-0.025em]"
          >
            {mode === "confirm" || mode === "sending" ? (
              <>
                Is this right? <span className="text-brand">Say yes or no.</span>
              </>
            ) : mode === "typing" ? (
              "Type your mobile number"
            ) : (
              "Now say your phone number, starting with the country code."
            )}
          </motion.h1>
        </AnimatePresence>
      </div>

      <div className="mt-8 flex min-h-[5.5rem] w-full items-center justify-center">
        {mode === "typing" ? (
          <form
            className="flex w-full max-w-sm flex-col items-center gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const v = typed.replace(/[^\d+]/g, "");
              const e164 = v.startsWith("+") ? v : v.startsWith("00") ? `+${v.slice(2)}` : `+${v}`;
              if (!isValidPhoneNumber(e164)) {
                setNotice({ text: "That doesn’t look complete. Include the country code, like +32.", tone: "warn" });
                return;
              }
              setCandidate(e164);
              void submit(e164);
            }}
          >
            <label htmlFor="tel" className="sr-only">
              Mobile number with country code
            </label>
            <input
              id="tel"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              autoFocus
              placeholder="+32 470 12 34 56"
              value={typed}
              onChange={(e) => setTyped(new AsYouType().input(e.target.value))}
              className="w-full rounded-2xl border border-line bg-card px-5 py-4 text-center text-[clamp(1.5rem,6vw,2rem)] font-semibold tracking-tight tabular-nums outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15"
            />
            <PrimaryButton type="submit" className="w-full">
              Text me the link
            </PrimaryButton>
          </form>
        ) : (
          <motion.p
            layout
            aria-live="polite"
            className={`text-center text-[clamp(2rem,9vw,3.4rem)] font-semibold tabular-nums tracking-[-0.02em] transition-colors ${
              shown ? (mode === "confirm" || valid ? "text-ink" : "text-faint") : "text-line"
            }`}
          >
            {shown ? format(shown) : "+ ‒‒ ‒‒‒ ‒‒ ‒‒ ‒‒"}
          </motion.p>
        )}
      </div>

      {mode === "confirm" && (
        <div className="mt-2 flex gap-3">
          <button
            onClick={() => candidate && void submit(candidate)}
            className="min-h-11 rounded-full border border-line bg-card px-6 text-[15px] font-semibold text-ink transition hover:border-brand"
          >
            Yes
          </button>
          <button
            onClick={() => listenForNumber({ text: "No problem. Say it again, starting with the country code.", tone: "neutral" })}
            className="min-h-11 rounded-full border border-line bg-card px-6 text-[15px] font-semibold text-ink transition hover:border-brand"
          >
            No
          </button>
        </div>
      )}

      <div className="mt-auto flex flex-col items-center pt-6">
        <Hint show={Boolean(notice) || incomplete || idle || mode === "sending"} tone={notice?.tone === "warn" ? "warn" : "neutral"}>
          {mode === "sending"
            ? "Sending you a text…"
            : notice?.text ??
              (incomplete ? "That doesn’t look complete yet. Keep going, or start over with the country code." : "For example: “plus three two, four seven zero…”")}
        </Hint>
        {mode !== "typing" && <VoiceOrb mic={mic} active={voice.stt === "live" && mode !== "sending"} size={132} />}
        <div className="flex h-12 items-center gap-2">
          {mode === "listening" && digits && (
            <GhostButton onClick={() => listenForNumber()}>Start over</GhostButton>
          )}
          {mode !== "typing" && mode !== "sending" && (
            <GhostButton
              onClick={() => {
                setMode("typing");
                setNotice(null);
                setTyped(candidate ?? digits ?? "");
              }}
            >
              Type instead
            </GhostButton>
          )}
          {mode === "typing" && <GhostButton onClick={() => listenForNumber()}>Say it instead</GhostButton>}
        </div>
      </div>
    </div>
  );
}
