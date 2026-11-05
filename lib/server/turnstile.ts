import "server-only";
import { config } from "./config";
import { log } from "./log";

let warned = false;

/** Verifies a Cloudflare Turnstile token. Skipped (with a warning) when not configured outside production. */
export async function verifyTurnstile(token: unknown, ip: string): Promise<boolean> {
  const secret = config.turnstile.secretKey;
  if (!secret) {
    if (config.isProd && !config.mock) return false;
    if (!warned) {
      warned = true;
      log.warn("turnstile.disabled", { note: "TURNSTILE_SECRET_KEY not set; captcha check skipped in dev" });
    }
    return true;
  }
  if (typeof token !== "string" || !token || token.length > 4096) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token, remoteip: ip === "unknown" ? undefined : ip }),
    });
    const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (!data.success) log.warn("turnstile.failed", { code: (data["error-codes"] ?? []).join(",") });
    return Boolean(data.success);
  } catch (e) {
    log.error("turnstile.error", { error: String(e).slice(0, 200) });
    return false;
  }
}
