import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "./config";

const b64u = (b: Buffer) => b.toString("base64url");

function mac(purpose: string, data: string): Buffer {
  return createHmac("sha256", config.signingSecret).update(`${purpose}.${data}`).digest();
}

/** Compact signed token: base64url(json).base64url(hmac). Purpose-bound. */
export function signToken(purpose: string, payload: Record<string, unknown>, ttlMs: number): string {
  const body = b64u(Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs })));
  return `${body}.${b64u(mac(purpose, body))}`;
}

export function verifyToken<T extends Record<string, unknown>>(purpose: string, token: string | null | undefined): (T & { exp: number }) | null {
  if (!token || token.length > 2048) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = mac(purpose, body);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function randomId(bytes = 16): string {
  return b64u(randomBytes(bytes));
}

/** Keyed hash so stored phone numbers / IPs can't be reversed by a dictionary. */
export function keyedHash(kind: string, value: string): string {
  return createHmac("sha256", config.signingSecret).update(`${kind}:${value}`).digest("hex");
}

export function randomInt(minInclusive: number, maxExclusive: number): number {
  const range = maxExclusive - minInclusive;
  const buf = randomBytes(4).readUInt32BE(0);
  return minInclusive + (buf % range);
}
