"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { ApiError, api } from "@/lib/client/api";
import type { SessionSnapshot } from "@/lib/types";
import { useClock } from "../useVoice";
import { GhostButton, Hint } from "../ui";

const RESEND_MS = 30_000;

export function SmsWaitScreen({
  snap,
  onSnapshot,
  onChangeNumber,
}: {
  snap: SessionSnapshot;
  onSnapshot: (s: SessionSnapshot) => void;
  onChangeNumber: () => void;
}) {
  const clock = useClock(500);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const phone = snap.phone;
  // Keyed by smsSentAt in the parent, so this remounts on every (re)send.
  const [mountedAt] = useState(() => Date.now());
  const elapsed = clock.wall ? clock.wall - mountedAt : 0;
  const left = Math.max(0, Math.ceil((RESEND_MS - elapsed) / 1000));
  const canResend = left === 0 && (phone?.smsSendsLeft ?? 0) > 0;

  const resend = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const r = await api.resend();
      onSnapshot(r.snapshot);
      setNotice("Sent again. It can take a few seconds to arrive.");
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Couldn’t resend right now.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center">
      <div className="mt-6 flex h-56 w-full items-center justify-center sm:mt-12">
        <PhoneIllustration />
      </div>

      <h1 className="mt-6 text-balance text-center text-[clamp(1.8rem,7vw,2.75rem)] font-semibold leading-tight tracking-[-0.025em]">
        Check your phone and tap the link.
      </h1>
      <p className="mt-3 text-center text-[17px] text-muted">
        We texted <span className="font-semibold tabular-nums text-ink">{phone?.masked}</span>. This page updates by itself.
      </p>

      {snap.mockConfirmUrl && (
        <a
          href={new URL(snap.mockConfirmUrl).pathname}
          target="_blank"
          rel="noreferrer"
          className="mt-4 rounded-full bg-warn-soft px-4 py-2 text-[14px] font-semibold text-warn"
        >
          Mock mode: open the SMS link
        </a>
      )}

      <div className="mt-auto flex flex-col items-center pt-8">
        <Hint show={Boolean(notice)}>{notice}</Hint>
        <div className="flex flex-wrap items-center justify-center gap-1">
          <GhostButton onClick={resend} disabled={!canResend || busy}>
            {(phone?.smsSendsLeft ?? 0) === 0 ? "No more resends" : left > 0 ? `Resend in ${left}s` : "Resend text"}
          </GhostButton>
          <span className="text-faint" aria-hidden="true">
            ·
          </span>
          <GhostButton onClick={onChangeNumber}>Use a different number</GhostButton>
        </div>
      </div>
    </div>
  );
}

function PhoneIllustration() {
  return (
    <div className="relative">
      <span className="ripple absolute inset-0 rounded-[2.2rem] border-2 border-brand/40" />
      <span className="ripple ripple-delay absolute inset-0 rounded-[2.2rem] border-2 border-brand/30" />
      <div className="relative flex h-52 w-28 flex-col items-center rounded-[2.2rem] border border-line bg-card p-2.5 shadow-[0_24px_60px_-24px_rgba(17,17,20,0.35)]">
        <div className="mb-3 mt-1 h-1.5 w-10 rounded-full bg-line" />
        <motion.div
          initial={{ opacity: 0, y: 14, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="w-full rounded-2xl rounded-bl-md bg-brand-soft p-2.5"
        >
          <div className="h-1.5 w-12 rounded-full bg-brand/50" />
          <div className="mt-1.5 h-1.5 w-16 rounded-full bg-brand/30" />
          <motion.div
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ repeat: Infinity, duration: 1.8 }}
            className="mt-2 rounded-md bg-brand px-1.5 py-1 text-center text-[9px] font-semibold text-white"
          >
            Tap to confirm
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
