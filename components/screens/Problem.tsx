"use client";

import { motion } from "framer-motion";
import { MicIcon, PrimaryButton } from "../ui";

export type ProblemKind = "mic-denied" | "no-device" | "unsupported" | "stt" | "expired" | "config" | "generic";

function micHelp(): string {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "On iPhone: tap “aA” in the address bar → Website Settings → Microphone → Allow.";
  if (/Android/.test(ua)) return "Tap the lock icon next to the address → Permissions → Microphone → Allow.";
  return "Click the icon at the left of the address bar, allow the microphone, then try again.";
}

const COPY: Record<ProblemKind, { title: string; body: string; action: string }> = {
  "mic-denied": { title: "Microphone access is off", body: "", action: "Try again" },
  "no-device": { title: "We can’t find a microphone", body: "Plug in or enable a microphone, then try again.", action: "Try again" },
  unsupported: {
    title: "This browser can’t record audio",
    body: "Open this page in a recent Safari, Chrome, Edge or Firefox over https.",
    action: "Reload",
  },
  stt: {
    title: "We lost the connection",
    body: "Our transcription service didn’t respond. Check your connection and try again.",
    action: "Try again",
  },
  expired: { title: "This session expired", body: "For your privacy, sessions only last a few minutes. Let’s start fresh.", action: "Start again" },
  config: { title: "The demo isn’t set up yet", body: "", action: "Reload" },
  generic: { title: "Something went wrong", body: "Please try again in a moment.", action: "Start again" },
};

export function ProblemScreen({ kind, detail, onAction }: { kind: ProblemKind; detail?: string | null; onAction: () => void }) {
  const c = COPY[kind];
  const body = kind === "mic-denied" ? micHelp() : kind === "config" ? (detail ?? "") : c.body;
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center" role="alert">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative flex h-20 w-20 items-center justify-center rounded-full bg-warn-soft text-warn"
      >
        <MicIcon className="h-9 w-9" />
        {(kind === "mic-denied" || kind === "no-device") && <span className="absolute h-0.5 w-12 rotate-45 rounded bg-warn" />}
      </motion.div>
      <h1 className="mt-6 text-balance text-[clamp(1.7rem,6.6vw,2.4rem)] font-semibold tracking-[-0.025em]">{c.title}</h1>
      <p className="mx-auto mt-3 max-w-sm text-balance text-[16px] leading-snug text-muted">{body}</p>
      <PrimaryButton onClick={onAction} className="mt-8 w-full max-w-xs">
        {c.action}
      </PrimaryButton>
    </div>
  );
}
