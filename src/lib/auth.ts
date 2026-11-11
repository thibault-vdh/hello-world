// Single-user protection: one password (APP_PASSWORD) and a signed cookie.

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const COOKIE = "foundations_session";

export const passwordSet = () => !!process.env.APP_PASSWORD;

export function sessionValue(): string {
  return createHmac("sha256", process.env.APP_PASSWORD ?? "").update("foundations-session-v1").digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** True when the request may see the app. Without a password the app is open (sample data only). */
export async function isAuthed(): Promise<boolean> {
  if (!passwordSet()) return true;
  const c = (await cookies()).get(COOKIE)?.value;
  return !!c && safeEqual(c, sessionValue());
}
