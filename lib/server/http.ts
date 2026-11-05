import "server-only";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { config } from "./config";
import { keyedHash, signToken, verifyToken } from "./crypto";
import { log, scrub } from "./log";
import { FlowError } from "./pipeline";
import { rateLimit } from "./ratelimit";
import { store, type Session } from "./store";

export const SESSION_COOKIE = "dfd_session";

export function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export function ipKey(req: NextRequest): string {
  return keyedHash("ip", clientIp(req)).slice(0, 24);
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export function error(code: string, message: string, status = 400) {
  return json({ code, error: message }, status);
}

export async function setSessionCookie(id: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, signToken("session", { sid: id }, config.limits.sessionTtlMs), {
    httpOnly: true,
    sameSite: "lax",
    secure: config.appBaseUrl.startsWith("https://"),
    path: "/",
    maxAge: Math.floor(config.limits.sessionTtlMs / 1000),
  });
}

export async function currentSession(): Promise<Session | null> {
  const jar = await cookies();
  const payload = verifyToken<{ sid: string }>("session", jar.get(SESSION_COOKIE)?.value);
  return payload ? store.get(payload.sid) : null;
}

/** Wraps a handler: session required, per-IP rate limit, uniform error shape. */
export function withSession(
  name: string,
  limit: { perMinute: number },
  handler: (req: NextRequest, s: Session) => Promise<Response>,
) {
  return async (req: NextRequest) => {
    const ip = ipKey(req);
    if (!rateLimit(`${name}:${ip}`, limit.perMinute, 60_000)) {
      return error("rate_limited", "Slow down a little and try again in a minute.", 429);
    }
    const s = await currentSession();
    if (!s) return error("no_session", "Your session expired. Let’s start again.", 401);
    try {
      return await handler(req, s);
    } catch (e) {
      if (e instanceof FlowError) return error(e.code, e.message, e.status);
      log.error(`${name}.error`, { error: scrub(e) });
      return error("server_error", "Something went wrong on our side. Please try again.", 500);
    }
  };
}

export async function readBody(req: NextRequest, maxBytes: number): Promise<Uint8Array> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new FlowError("too_large", "Recording is too large.", 413);
  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.byteLength > maxBytes) throw new FlowError("too_large", "Recording is too large.", 413);
  return buf;
}
