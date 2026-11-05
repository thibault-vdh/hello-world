"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { ApiError, api } from "@/lib/client/api";
import type { SessionSnapshot } from "@/lib/types";
import { CheckIcon, GhostButton, Hint, PhoneIcon, PrimaryButton } from "../ui";

type StageKey = "clone" | "write" | "call" | "reveal";

const ERRORS: Record<string, string> = {
  prototype: "This prototype only calls pre-approved numbers, so we stopped before dialing.",
  number_used: "This number already received its demo call. One call per number.",
  attempts: "We’ve already called twice.",
  prepare_failed: "We couldn’t prepare your call. Your recordings have been deleted.",
  clone_failed: "We couldn’t create the voice clone. Your recordings have been deleted.",
  dial_failed: "We couldn’t place the call just now.",
};

export function CallingScreen({
  snap,
  onSnapshot,
  onFinish,
}: {
  snap: SessionSnapshot;
  onSnapshot: (s: SessionSnapshot) => void;
  onFinish: () => void;
}) {
  const [retrying, setRetrying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const c = snap.call;
  const missed = ["no-answer", "busy", "canceled"].includes(c.status) || (c.status === "failed" && c.error === null);
  const failed = c.status === "failed" && c.error !== null;

  const stage: StageKey =
    snap.clone === "cloning" || (c.status === "preparing" && snap.clone !== "ready" && snap.clone !== "deleted")
      ? "clone"
      : c.status === "preparing"
        ? "write"
        : c.status === "in-progress" || c.status === "completed"
          ? "reveal"
          : "call";

  const headline = failed
    ? "We couldn’t call you"
    : missed
      ? "Looks like you missed it"
      : c.status === "in-progress"
        ? "Listen closely…"
        : c.status === "ringing"
          ? "Your phone is ringing. Pick up!"
          : c.status === "queued"
            ? "Calling you now…"
            : stage === "clone"
              ? "Cloning your voice…"
              : "Writing your call…";

  const sub = failed
    ? ERRORS[c.error ?? ""] ?? "Something went wrong."
    : missed
      ? c.canRetry
        ? "No worries. We can call you once more."
        : "That was our last try. Your clone and recordings are deleted."
      : c.status === "in-progress"
        ? "That’s you. Except it isn’t."
        : c.status === "ringing" || c.status === "queued"
          ? `Calling ${snap.phone?.masked ?? "your phone"}`
          : "This usually takes a few seconds.";

  const retry = async () => {
    setRetrying(true);
    setNotice(null);
    try {
      onSnapshot((await api.retryCall()).snapshot);
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Couldn’t call again.");
    } finally {
      setRetrying(false);
    }
  };

  const ringing = !failed && !missed;

  return (
    <div className="flex flex-1 flex-col items-center">
      <div className="mt-10 flex h-52 items-center justify-center sm:mt-16">
        <div className="relative flex h-28 w-28 items-center justify-center">
          {ringing && (
            <>
              <span className="ripple absolute inset-0 rounded-full bg-brand/25" />
              <span className="ripple ripple-delay absolute inset-0 rounded-full bg-brand/20" />
            </>
          )}
          <motion.div
            animate={c.status === "ringing" ? { rotate: [0, -12, 12, -12, 12, 0] } : { rotate: 0 }}
            transition={c.status === "ringing" ? { repeat: Infinity, duration: 1.1, repeatDelay: 0.6 } : {}}
            className={`relative flex h-24 w-24 items-center justify-center rounded-full text-white shadow-[0_18px_50px_-14px_rgba(91,76,240,0.7)] ${
              failed || missed ? "bg-faint" : "bg-brand"
            }`}
          >
            <PhoneIcon className="h-10 w-10" />
          </motion.div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={headline}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35 }}
          className="text-center"
          aria-live="polite"
        >
          <h1 className="text-balance text-[clamp(1.8rem,7vw,2.75rem)] font-semibold leading-tight tracking-[-0.025em]">{headline}</h1>
          <p className="mt-3 text-[17px] text-muted">{sub}</p>
        </motion.div>
      </AnimatePresence>

      {!failed && !missed && <Stages stage={stage} />}

      <div className="mt-auto flex w-full flex-col items-center gap-2 pt-8">
        <Hint show={Boolean(notice)} tone="warn">
          {notice}
        </Hint>
        {missed && c.canRetry && (
          <PrimaryButton onClick={retry} disabled={retrying} className="w-full max-w-xs">
            {retrying ? "Calling…" : "Call me again"}
          </PrimaryButton>
        )}
        {(failed || (missed && !c.canRetry)) && (
          <PrimaryButton onClick={onFinish} className="w-full max-w-xs">
            Continue
          </PrimaryButton>
        )}
        {missed && c.canRetry && <GhostButton onClick={onFinish}>Skip the call</GhostButton>}
      </div>
    </div>
  );
}

function Stages({ stage }: { stage: StageKey }) {
  const order: { key: StageKey; label: string }[] = [
    { key: "clone", label: "Clone voice" },
    { key: "write", label: "Generate call" },
    { key: "call", label: "Call you" },
    { key: "reveal", label: "The reveal" },
  ];
  const idx = order.findIndex((o) => o.key === stage);
  return (
    <ol className="mt-10 flex w-full max-w-md items-center justify-between gap-2">
      {order.map((o, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <li key={o.key} className="flex flex-1 flex-col items-center gap-2">
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-semibold transition-colors duration-500 ${
                done ? "bg-brand text-white" : active ? "bg-brand-soft text-brand ring-2 ring-brand" : "bg-line/70 text-faint"
              }`}
            >
              {done ? <CheckIcon className="h-4 w-4" /> : i + 1}
            </span>
            <span className={`text-center text-[12px] font-medium ${active ? "text-ink" : "text-muted"}`}>{o.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
