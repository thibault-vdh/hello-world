// Lets an iPhone Shortcut send Apple Watch workouts (mainly run distance,
// which WHOOP does not always have). Protected by INGEST_TOKEN.

import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/auth";
import { isDate, loadManual, saveManual } from "@/lib/data";
import { whoopConfigured, whoopConnected } from "@/lib/whoop";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const token = process.env.INGEST_TOKEN;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!token || !safeEqual(given, token)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  const minutes = Number(b?.minutes);
  const km = b?.km == null ? undefined : Number(b.km);
  if (!b || !["run", "strength", "tennis"].includes(b.kind) || !isDate(b.date) || !(minutes > 0 && minutes < 600) || (km !== undefined && !(km > 0 && km < 100))) {
    return NextResponse.json({ error: "Expected { kind: run|strength|tennis, date: YYYY-MM-DD, minutes, km? }" }, { status: 400 });
  }
  const live = whoopConfigured() && (await whoopConnected());
  const manual = await loadManual(live);
  const id = `watch-${b.kind}-${b.date}-${Math.round(minutes)}`;
  if (!manual.extra.some((w) => w.id === id)) {
    manual.extra.push({ id, source: "manual", kind: b.kind, sport: b.kind, date: b.date, minutes, km: b.kind === "run" ? km : undefined });
    await saveManual(live, manual);
  }
  return NextResponse.json({ ok: true });
}
