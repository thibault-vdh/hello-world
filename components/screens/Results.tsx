"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/client/api";
import { spokenToEmail } from "@/lib/text";
import type { SessionSnapshot } from "@/lib/types";
import type { Voice } from "../useVoice";
import { CheckIcon, MicIcon, PrimaryButton } from "../ui";

export function ResultsScreen({ snap, voice }: { snap: SessionSnapshot; voice: Voice }) {
  const t = snap.timings;
  const total = Math.round((t.voiceSeconds ?? 0) + (t.cloneSeconds ?? 0) + (t.synthSeconds ?? 0));
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [dictating, setDictating] = useState(false);
  const base = useRef("");

  // Belt and braces: wipe clone + audio as soon as the visitor lands here.
  useEffect(() => {
    api.finish().catch(() => {});
  }, []);

  // Voice dictation for the email ("jane dot doe at acme dot com").
  useEffect(() => {
    if (!dictating) return;
    const heard = voice.transcript.text();
    if (heard) setEmail(spokenToEmail(`${base.current} ${heard}`));
  }, [voice.version, dictating, voice.transcript]);

  const toggleDictation = async () => {
    if (dictating) {
      voice.stop();
      setDictating(false);
      return;
    }
    try {
      base.current = "";
      await voice.listen();
      voice.transcript.reset();
      voice.setExpected("jane dot doe at acme dot com");
      setDictating(true);
    } catch {
      setError("Microphone unavailable. Type your email instead.");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    voice.stop();
    setDictating(false);
    setState("sending");
    setError(null);
    try {
      await api.lead(email);
      setState("done");
    } catch (err) {
      setState("idle");
      setError(err instanceof ApiError ? err.message : "Couldn’t send that. Try again?");
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="mt-8 text-center sm:mt-14"
      >
        <p className="text-[15px] font-medium text-muted">{snap.call.answered ? "You just heard yourself." : "Your clone was ready."}</p>
        <h1 className="mt-3 text-balance text-[clamp(2.1rem,8.5vw,3.6rem)] font-semibold leading-[1.05] tracking-[-0.03em]">
          That took <span className="text-brand tabular-nums">{total > 0 ? total : "under 60"}</span> seconds.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-balance text-[clamp(1.15rem,4.6vw,1.45rem)] font-medium leading-snug text-ink">
          Imagine this call reaching your finance team.
        </p>
      </motion.div>

      <motion.ul
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35 }}
        className="mt-8 w-full max-w-md space-y-2.5 text-[15px] text-muted"
      >
        {[
          `${t.voiceSeconds ? Math.round(t.voiceSeconds) : "~20"} seconds of your voice was enough.`,
          "Your clone and every recording are already deleted.",
          "Noon trains teams to pause, verify, and call back.",
        ].map((line) => (
          <li key={line} className="flex items-start gap-2.5">
            <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-ok" />
            <span>{line}</span>
          </li>
        ))}
      </motion.ul>

      <div className="mt-auto w-full max-w-md pt-10">
        <AnimatePresence mode="wait">
          {state === "done" ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-3xl border border-line bg-card p-6 text-center"
            >
              <p className="text-[18px] font-semibold">Thanks! We’ll be in touch.</p>
              <p className="mt-1 text-[15px] text-muted">Your team simulation is on its way.</p>
            </motion.div>
          ) : (
            <motion.form key="form" onSubmit={submit} className="rounded-3xl border border-line bg-card p-5 shadow-[0_20px_50px_-30px_rgba(17,17,20,0.35)]">
              <label htmlFor="email" className="block text-[16px] font-semibold">
                See a simulation for your team
              </label>
              <p className="mt-1 text-[14px] text-muted">Say or enter your work email.</p>
              <div className="mt-4 flex items-center gap-2">
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="min-h-12 min-w-0 flex-1 rounded-2xl border border-line bg-paper px-4 text-[16px] outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15"
                />
                <button
                  type="button"
                  onClick={toggleDictation}
                  aria-pressed={dictating}
                  aria-label={dictating ? "Stop dictation" : "Say your email"}
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border transition ${
                    dictating ? "border-brand bg-brand text-white" : "border-line bg-paper text-brand hover:border-brand"
                  }`}
                >
                  <MicIcon className="h-5 w-5" />
                </button>
              </div>
              {error && <p className="mt-2 text-[14px] text-warn">{error}</p>}
              <PrimaryButton type="submit" disabled={state === "sending" || !email} className="mt-4 w-full">
                {state === "sending" ? "Sending…" : "Show me"}
              </PrimaryButton>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
