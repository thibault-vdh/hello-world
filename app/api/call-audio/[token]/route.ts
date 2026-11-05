import type { NextRequest } from "next/server";
import { verifyToken } from "@/lib/server/crypto";
import { store } from "@/lib/server/store";

/** Short-lived signed URL that Twilio <Play> fetches. Audio exists only in memory. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/call-audio/[token]">) {
  const { token } = await ctx.params;
  const payload = verifyToken<{ sid: string; a: string; p: "scenario" | "reveal" }>("audio", token);
  const s = payload ? store.get(payload.sid) : null;
  const buf = s?.audio && s.audio.id === payload!.a ? (payload!.p === "reveal" ? s.audio.reveal : s.audio.scenario) : null;
  if (!buf) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(buf.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
}
