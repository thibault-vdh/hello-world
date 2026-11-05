"use client";

import type { SessionSnapshot, StartSessionResponse } from "../types";

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { credentials: "same-origin", cache: "no-store", ...init });
  } catch {
    throw new ApiError("network", "You seem to be offline. Check your connection and try again.", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.code ?? "error", data.error ?? "Something went wrong.", res.status);
  return data as T;
}

const jsonInit = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const wavInit = (wav: Uint8Array): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "audio/wav" },
  body: new Blob([wav as BlobPart], { type: "audio/wav" }),
});

type WithSnap = { ok: boolean; snapshot: SessionSnapshot };

export const api = {
  startSession: (turnstileToken: string | null) => request<StartSessionResponse>("/api/session", jsonInit({ turnstileToken })),
  snapshot: () => request<SessionSnapshot>("/api/session"),
  sttToken: () => request<{ token: string; mock: boolean; language: string }>("/api/stt-token", { method: "POST" }),
  consent: (wav: Uint8Array) => request<WithSnap>("/api/consent", wavInit(wav)),
  samples: (wav: Uint8Array) => request<WithSnap>("/api/samples", wavInit(wav)),
  phone: (phone: string, turnstileToken: string | null) => request<WithSnap>("/api/phone", jsonInit({ phone, turnstileToken })),
  resend: () => request<WithSnap>("/api/phone/resend", { method: "POST" }),
  confirm: (token: string) => request<{ result: "confirmed" | "already" | "expired" | "invalid" }>("/api/confirm", jsonInit({ token })),
  scenario: (scenarioId: string) => request<WithSnap>("/api/scenario", jsonInit({ scenarioId })),
  retryCall: () => request<WithSnap>("/api/call/retry", { method: "POST" }),
  finish: () => request<WithSnap>("/api/finish", { method: "POST" }),
  lead: (email: string) => request<{ ok: boolean }>("/api/lead", jsonInit({ email })),
};
