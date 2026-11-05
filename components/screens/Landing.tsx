"use client";

import { motion } from "framer-motion";
import { MicIcon } from "../ui";

export function LandingScreen({ busy, onStart, notice }: { busy: boolean; onStart: () => void; notice: string | null }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="text-balance text-[clamp(2.6rem,11vw,4.75rem)] font-semibold leading-[0.98] tracking-[-0.04em]"
      >
        Hear your own <span className="text-brand">deepfake.</span>
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.6 }}
        className="mx-auto mt-5 max-w-sm text-balance text-[clamp(1.05rem,4.2vw,1.25rem)] leading-snug text-muted"
      >
        Read three short lines aloud. A minute later, an AI clone of your voice calls you.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.25, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative mt-14 flex h-44 w-44 items-center justify-center"
      >
        {!busy && (
          <>
            <span className="ripple absolute inset-4 rounded-full bg-brand/20" />
            <span className="ripple ripple-delay absolute inset-4 rounded-full bg-brand/15" />
          </>
        )}
        <button
          onClick={onStart}
          disabled={busy}
          aria-label="Start: allow microphone access"
          className="relative flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-[#7a6cff] to-brand-deep text-white shadow-[0_24px_60px_-18px_rgba(91,76,240,0.85)] transition active:scale-95 disabled:cursor-wait"
        >
          {busy ? (
            <motion.span
              className="h-10 w-10 rounded-full border-[3px] border-white/40 border-t-white"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
            />
          ) : (
            <MicIcon className="h-12 w-12" />
          )}
        </button>
      </motion.div>

      <p className="mt-6 text-[17px] font-semibold">{busy ? "Getting ready…" : "Tap to start"}</p>
      <p className="mx-auto mt-2 max-w-xs text-balance text-[14px] leading-snug text-muted" aria-live="polite">
        {notice ?? "We’ll ask for your microphone. Your voice is used once for this demo and deleted right after the call."}
      </p>
    </div>
  );
}
