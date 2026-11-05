import "server-only";

/**
 * Structured logger. NEVER pass audio, transcripts, full phone numbers,
 * emails or tokens in `meta`; use maskPhone() for numbers.
 */
type Meta = Record<string, string | number | boolean | null | undefined>;

const FORBIDDEN_KEYS = /transcript|audio|text|phone|number|email|token|secret/i;
const ALLOWED_KEYS = new Set(["phoneMasked", "status", "error", "code", "note", "sessionId", "attempt", "seconds", "ms", "scenario", "region", "callStatus", "answered"]);

function clean(meta?: Meta): Meta | undefined {
  if (!meta) return meta;
  const out: Meta = {};
  for (const [k, v] of Object.entries(meta)) {
    out[k] = FORBIDDEN_KEYS.test(k) && !ALLOWED_KEYS.has(k) ? "[redacted]" : v;
  }
  return out;
}

function emit(level: "info" | "warn" | "error", event: string, meta?: Meta) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...clean(meta) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (event: string, meta?: Meta) => emit("info", event, meta),
  warn: (event: string, meta?: Meta) => emit("warn", event, meta),
  error: (event: string, meta?: Meta) => emit("error", event, meta),
};

/** "+32 4•• ••• •34" style mask: country code + last two digits only. */
export function maskPhone(e164: string, callingCode?: string): string {
  const digits = e164.replace(/\D/g, "");
  const cc = callingCode ?? digits.slice(0, Math.min(3, digits.length - 4));
  const rest = digits.slice(cc.length);
  return `+${cc} ${"•".repeat(Math.max(0, rest.length - 2))}${rest.slice(-2)}`;
}

/** Error messages from providers can echo numbers back; strip digit runs. */
export function scrub(msg: unknown): string {
  const s = msg instanceof Error ? msg.message : String(msg);
  return s.replace(/\+?\d[\d\s-]{5,}\d/g, "[digits]").slice(0, 300);
}
