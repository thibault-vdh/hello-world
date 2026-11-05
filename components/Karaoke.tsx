"use client";

import { motion } from "framer-motion";
import { Fragment, useMemo } from "react";
import { tokenize } from "@/lib/text";

/**
 * Renders a line word by word. Words up to `highlightCount` (in token space)
 * animate from muted to brand colour. `codeFrom` marks the consent code words.
 */
export function Karaoke({ text, highlightCount, codeFrom }: { text: string; highlightCount: number; codeFrom?: number }) {
  const words = useMemo(() => {
    const raw = text.split(/\s+/);
    const counts = raw.map((w) => tokenize(w).length);
    return raw.map((w, i) => {
      const before = counts.slice(0, i).reduce((a, b) => a + b, 0);
      const n = counts[i];
      return { w, i, n, lastToken: before + Math.max(n, 1) - 1 };
    });
  }, [text]);

  return (
    <p className="text-balance text-[clamp(1.85rem,7.2vw,3.1rem)] font-semibold leading-[1.18] tracking-[-0.025em]">
      {words.map(({ w, i, lastToken, n }) => {
        const on = n > 0 && lastToken < highlightCount;
        const isCode = codeFrom !== undefined && i >= codeFrom;
        return (
          <Fragment key={i}>
            <motion.span
              className={`inline-block ${isCode ? `rounded-xl px-1.5 ring-2 ring-inset transition-shadow duration-300 ${on ? "bg-brand-soft ring-brand/50" : "ring-faint/40"}` : ""}`}
              initial={false}
              animate={{
                color: on ? "#5b4cf0" : "#85858f",
                y: on ? 0 : 1,
                scale: on ? 1 : 0.995,
              }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {w}
            </motion.span>
            {" "}
          </Fragment>
        );
      })}
    </p>
  );
}
