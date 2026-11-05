"use client";

/**
 * Invisible Cloudflare Turnstile. Only shows UI if Cloudflare decides an
 * interaction is needed (appearance: "interaction-only").
 */

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      execute: (idOrEl: string | HTMLElement) => void;
      reset: (id: string) => void;
      remove: (id: string) => void;
    };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
let loader: Promise<void> | null = null;

function load(): Promise<void> {
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    if (window.turnstile) return resolve();
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loader = null;
      reject(new Error("turnstile_load"));
    };
    document.head.appendChild(s);
  });
  return loader;
}

export function preloadTurnstile() {
  if (SITE_KEY) load().catch(() => {});
}

/** Returns a fresh single-use token, or null when Turnstile isn't configured. */
export async function getTurnstileToken(): Promise<string | null> {
  if (!SITE_KEY) return null;
  await load();
  const host = document.getElementById("turnstile-slot");
  if (!host || !window.turnstile) throw new Error("turnstile_unavailable");
  const el = document.createElement("div");
  host.appendChild(el);
  return new Promise((resolve, reject) => {
    let id = "";
    const done = (fn: () => void) => {
      clearTimeout(timer);
      fn();
      setTimeout(() => {
        try {
          window.turnstile?.remove(id);
        } catch {}
        el.remove();
      }, 0);
    };
    const timer = setTimeout(() => done(() => reject(new Error("turnstile_timeout"))), 20_000);
    id = window.turnstile!.render(el, {
      sitekey: SITE_KEY,
      appearance: "interaction-only",
      theme: "light",
      callback: (token: string) => done(() => resolve(token)),
      "error-callback": () => done(() => reject(new Error("turnstile_error"))),
    });
  });
}
