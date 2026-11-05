"use client";

import { motion } from "framer-motion";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { CheckIcon } from "@/components/ui";

type State = "working" | "confirmed" | "already" | "expired" | "invalid" | "error";

const COPY: Record<Exclude<State, "working">, { title: string; body: string }> = {
  confirmed: { title: "Confirmed.", body: "Head back to the demo and pick a scenario. Your phone will ring a few seconds later." },
  already: { title: "Already confirmed.", body: "You’re all set. Head back to the demo." },
  expired: { title: "This link expired.", body: "Links only work for 10 minutes. Request a new text from the demo." },
  invalid: { title: "This link was replaced.", body: "Use the most recent text we sent you." },
  error: { title: "Something went wrong.", body: "Please try the link again in a moment." },
};

/** Confirms via POST from the browser so SMS link-preview bots can't consume the token. */
export function ConfirmClient() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<State>("working");
  const once = useRef(false);

  useEffect(() => {
    if (once.current || !token) return;
    once.current = true;
    api
      .confirm(token)
      .then((r) => setState(r.result))
      .catch(() => setState("error"));
  }, [token]);

  const ok = state === "confirmed" || state === "already";
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 18 }}
        className={`flex h-20 w-20 items-center justify-center rounded-full ${
          state === "working" ? "bg-brand-soft text-brand" : ok ? "bg-ok text-white" : "bg-warn-soft text-warn"
        }`}
      >
        {state === "working" ? (
          <motion.span
            className="h-8 w-8 rounded-full border-[3px] border-brand/30 border-t-brand"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
          />
        ) : ok ? (
          <CheckIcon className="h-10 w-10" />
        ) : (
          <span className="text-3xl font-bold">!</span>
        )}
      </motion.div>
      <h1 className="mt-6 text-[clamp(2rem,9vw,2.75rem)] font-semibold tracking-[-0.03em]" aria-live="polite">
        {state === "working" ? "Confirming…" : COPY[state].title}
      </h1>
      {state !== "working" && <p className="mt-3 text-balance text-[17px] leading-snug text-muted">{COPY[state].body}</p>}
      <p className="mt-10 text-[13px] text-faint">Noon by Aikido</p>
    </main>
  );
}
