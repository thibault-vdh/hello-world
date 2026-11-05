"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/client/api";
import { MicError } from "@/lib/client/mic";
import { parseScenario, SCENARIOS, type ScenarioId } from "@/lib/scenarios";
import type { SessionSnapshot } from "@/lib/types";
import type { Voice } from "../useVoice";
import { useInterval } from "../useVoice";
import { CheckIcon, Hint, MicIcon, StatusPill, VoiceOrb } from "../ui";

export function ScenarioScreen({
  voice,
  onChosen,
  onFatal,
}: {
  voice: Voice;
  onChosen: (snap: SessionSnapshot) => void;
  onFatal: (e: unknown) => void;
}) {
  const { mic, transcript } = voice;
  const [selected, setSelected] = useState<ScenarioId | null>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const sent = useRef(false);

  const startListening = useCallback(async () => {
    try {
      await voice.listen();
      transcript.reset();
      voice.setExpected("number two");
      // Back from the SMS app, iOS may have suspended audio until the next tap.
      setNeedsTap(mic.ctx?.state !== "running");
    } catch (e) {
      if (e instanceof MicError) setNeedsTap(true);
      else setNotice("Voice isn’t available right now. Tap a scenario instead.");
    }
  }, [mic, transcript, voice]);

  useEffect(() => {
    const t = setTimeout(() => void startListening(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = useCallback(
    async (id: ScenarioId) => {
      if (sent.current) return;
      sent.current = true;
      setSelected(id);
      await new Promise((r) => setTimeout(r, 650)); // let the selection land visually
      try {
        const r = await api.scenario(id);
        voice.stop();
        onChosen(r.snapshot);
      } catch (e) {
        sent.current = false;
        setSelected(null);
        if (e instanceof ApiError && e.status < 500 && e.status !== 401) setNotice(e.message);
        else onFatal(e);
      }
    },
    [onChosen, onFatal, voice],
  );

  useInterval(
    () => {
      if (sent.current) return;
      const id = parseScenario(transcript.text());
      if (id) void choose(id);
    },
    150,
    !selected,
  );

  return (
    <div className="flex flex-1 flex-col items-center">
      <div className="flex w-full items-center justify-between">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-3 py-1.5 text-[13px] font-semibold text-ok"
        >
          <CheckIcon className="h-4 w-4" /> Number confirmed
        </motion.div>
        {!needsTap && <StatusPill live={voice.stt === "live" && !selected}>Listening</StatusPill>}
      </div>

      <h1 className="mt-8 text-balance text-center text-[clamp(1.6rem,6.2vw,2.5rem)] font-semibold leading-tight tracking-[-0.025em] sm:mt-12">
        Pick a scenario. Say <span className="text-brand">“one”</span>, <span className="text-brand">“two”</span> or{" "}
        <span className="text-brand">“three”</span>.
      </h1>

      <ul className="mt-8 grid w-full gap-3 sm:grid-cols-3">
        {SCENARIOS.map((s, i) => {
          const isSel = selected === s.id;
          const dim = selected && !isSel;
          return (
            <motion.li
              key={s.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: dim ? 0.4 : 1, y: 0, scale: isSel ? 1.02 : 1 }}
              transition={{ delay: selected ? 0 : 0.08 * i, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <button
                onClick={() => void choose(s.id)}
                disabled={Boolean(selected)}
                className={`flex h-full w-full items-start gap-4 rounded-3xl border bg-card p-5 text-left transition sm:flex-col ${
                  isSel ? "border-brand shadow-[0_12px_40px_-16px_rgba(91,76,240,0.55)] ring-2 ring-brand" : "border-line hover:border-brand/50"
                }`}
              >
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[19px] font-bold ${isSel ? "bg-brand text-white" : "bg-brand-soft text-brand"}`}
                >
                  {isSel ? <CheckIcon className="h-5 w-5" /> : s.number}
                </span>
                <span>
                  <span className="block text-[18px] font-semibold tracking-tight">{s.title}</span>
                  <span className="mt-1 block text-[15px] leading-snug text-muted">{s.blurb}</span>
                </span>
              </button>
            </motion.li>
          );
        })}
      </ul>

      <div className="mt-auto flex flex-col items-center pt-6">
        <Hint show={Boolean(notice) || Boolean(selected)} tone={notice ? "warn" : "neutral"}>
          {notice ?? "Great choice. Cloning your voice now…"}
        </Hint>
        {needsTap ? (
          <button
            onClick={() => void startListening()}
            className="flex h-16 items-center gap-2 rounded-full bg-brand px-6 text-[16px] font-semibold text-white"
          >
            <MicIcon className="h-5 w-5" /> Tap to talk
          </button>
        ) : (
          <VoiceOrb mic={mic} active={voice.stt === "live" && !selected} size={120} />
        )}
      </div>
    </div>
  );
}
