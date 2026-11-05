"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";
import type { MicEngine } from "@/lib/client/mic";

// ---------------------------------------------------------------------------
// Voice orb: a Siri-style level indicator drawn on canvas (no React re-renders).
// ---------------------------------------------------------------------------

export function VoiceOrb({ mic, active, size = 168 }: { mic: MicEngine | null; active: boolean; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    let raf = 0;
    let level = 0;
    let t = 0;
    let last = performance.now();
    const c = size / 2;
    const base = size * 0.24;

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt * (reduced ? 0.2 : 1);
      const target = active && mic ? mic.level : 0;
      level += (target - level) * 0.18;
      const breathe = active ? 0 : Math.sin(t * 1.6) * 0.02;
      ctx.clearRect(0, 0, size, size);

      // Glow
      const glowR = Math.min(c - 1, base * (1.55 + level * 0.5));
      const glow = ctx.createRadialGradient(c, c, base * 0.6, c, c, glowR);
      glow.addColorStop(0, `rgba(91,76,240,${0.22 + level * 0.25})`);
      glow.addColorStop(1, "rgba(91,76,240,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(c, c, glowR, 0, Math.PI * 2);
      ctx.fill();

      // Wavy rings
      const rings = [
        { k: 0, color: "rgba(91,76,240,0.55)", freq: 3, speed: 1.3 },
        { k: 1, color: "rgba(140,120,255,0.40)", freq: 4, speed: -1.0 },
        { k: 2, color: "rgba(67,52,214,0.30)", freq: 5, speed: 0.8 },
      ];
      for (const r of rings) {
        ctx.beginPath();
        const amp = (active ? 1.5 + level * 16 : 1.2) * (1 - r.k * 0.18);
        for (let i = 0; i <= 96; i++) {
          const a = (i / 96) * Math.PI * 2;
          const rr = base * (1.08 + r.k * 0.07 + breathe) + Math.sin(a * r.freq + t * r.speed * 2 + r.k) * amp + Math.sin(a * 2 - t * 1.7) * amp * 0.4;
          const x = c + Math.cos(a) * rr;
          const y = c + Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = r.color;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Core
      const coreR = base * (0.9 + level * 0.22 + breathe);
      const core = ctx.createLinearGradient(c - coreR, c - coreR, c + coreR, c + coreR);
      core.addColorStop(0, "#7a6cff");
      core.addColorStop(1, "#4334d6");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(c, c, coreR, 0, Math.PI * 2);
      ctx.fill();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [mic, active, size, reduced]);

  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden="true" />;
}

// ---------------------------------------------------------------------------
// Buttons & small bits
// ---------------------------------------------------------------------------

export function MicIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="8.5" y="3" width="7" height="12" rx="3.5" fill="currentColor" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function PhoneIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M6.6 3.5h2.2l1.5 4-2 1.3a11 11 0 0 0 6.9 6.9l1.3-2 4 1.5v2.2a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button
      {...rest}
      className={`inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-brand px-7 text-[17px] font-semibold text-white shadow-[0_8px_24px_-8px_rgba(91,76,240,0.6)] transition active:scale-[0.98] enabled:hover:bg-brand-deep disabled:opacity-50 ${className}`}
    />
  );
}

export function GhostButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button
      {...rest}
      className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 text-[15px] font-medium text-muted underline-offset-4 transition hover:text-ink hover:underline disabled:opacity-40 ${className}`}
    />
  );
}

export function StatusPill({ live, children }: { live: boolean; children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-line bg-card/80 px-3.5 py-1.5 text-[13px] font-medium text-muted backdrop-blur">
      <span className="relative flex h-2 w-2">
        {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${live ? "bg-brand" : "bg-faint"}`} />
      </span>
      {children}
    </div>
  );
}

/** Gentle, animated helper text (silence hints, retries). */
export function Hint({ show, tone = "neutral", children }: { show: boolean; tone?: "neutral" | "warn"; children: React.ReactNode }) {
  return (
    <div className="min-h-12" aria-live="polite">
      <AnimatePresence>
        {show && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className={`mx-auto max-w-sm text-center text-[15px] leading-snug ${tone === "warn" ? "text-warn" : "text-muted"}`}
          >
            {children}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-brand">{children}</p>;
}
