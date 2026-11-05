import { error, json, withSession } from "@/lib/server/http";
import { log } from "@/lib/server/log";
import { store } from "@/lib/server/store";

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;

/** Work email for the team simulation CTA. Kept in memory only (prototype). */
export const POST = withSession("lead", { perMinute: 5 }, async (req, s) => {
  const body = (await req.json().catch(() => ({}))) as { email?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL.test(email)) return error("invalid", "That email doesn’t look quite right.", 422);
  store.update(s.id, (x) => (x.leadEmail = email));
  log.info("lead.captured", { sessionId: s.id.slice(0, 6) });
  return json({ ok: true });
});
