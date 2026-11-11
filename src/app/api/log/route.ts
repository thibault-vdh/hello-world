import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { SESSION_IDS } from "@/lib/config";
import { isDate, loadConfig, loadManual, loadState, saveConfig, saveManual } from "@/lib/data";
import type { Kind, SessionId, StrengthTag } from "@/lib/types";
import { disconnect, whoopConfigured, whoopConnected } from "@/lib/whoop";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });
const text = (v: unknown, max = 600) => (typeof v === "string" ? v.slice(0, max) : "");

export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b || !isDate(b.today)) return bad("Missing date");
  const live = whoopConfigured() && (await whoopConnected());
  const manual = await loadManual(live);
  const config = await loadConfig();

  switch (b.action) {
    case "supplement": {
      const ids = config.supplements.filter((s) => s.id === b.id || s.stack === b.stack).map((s) => s.id);
      if (!ids.length) return bad("Unknown supplement");
      const day = (manual.supplements[b.today] ??= {});
      for (const id of ids) day[id] = b.taken !== false;
      break;
    }
    case "tag": {
      if (!["push", "pull", "legs"].includes(b.tag)) return bad("Unknown tag");
      manual.tags[text(b.workoutId, 80)] = b.tag as StrengthTag;
      break;
    }
    case "km": {
      const km = Number(b.km);
      if (!(km > 0 && km < 100)) return bad("Distance must be between 0 and 100 km");
      manual.distances[text(b.workoutId, 80)] = km;
      break;
    }
    case "addWorkout": {
      const kind = b.kind as Kind;
      const minutes = Number(b.minutes);
      const km = b.km === "" || b.km == null ? undefined : Number(b.km);
      if (!["run", "strength", "tennis"].includes(kind)) return bad("Unknown session type");
      if (!isDate(b.date) || b.date > b.today) return bad("Pick a date that is not in the future");
      if (!(minutes > 0 && minutes < 600)) return bad("Duration must be between 1 and 600 minutes");
      if (km !== undefined && !(km > 0 && km < 100)) return bad("Distance must be between 0 and 100 km");
      manual.extra.push({ id: `manual-${Date.now()}`, source: "manual", kind, sport: kind, date: b.date, minutes, km: kind === "run" ? km : undefined });
      break;
    }
    case "seen": {
      if (!Array.isArray(b.ids)) return bad("Missing ids");
      manual.seen = [...new Set([...manual.seen, ...b.ids.map((i: unknown) => text(i, 80))])].slice(-200);
      break;
    }
    case "review": {
      if (!isDate(b.weekStart)) return bad("Missing week");
      manual.reviews[b.weekStart] = { worked: text(b.worked), blocked: text(b.blocked), change: text(b.change), savedAt: new Date().toISOString() };
      break;
    }
    case "plan": {
      const plan: Record<number, SessionId[]> = {};
      for (let d = 0; d < 7; d++) {
        const list = Array.isArray(b.weekPlan?.[d]) ? b.weekPlan[d] : [];
        plan[d] = list.filter((s: SessionId) => SESSION_IDS.includes(s)).slice(0, 3);
      }
      config.weekPlan = plan;
      if (b.cues) config.cues = { breakfast: text(b.cues.breakfast, 80) || config.cues.breakfast, shake: text(b.cues.shake, 80) || config.cues.shake };
      await saveConfig(config);
      break;
    }
    case "disconnect":
      await disconnect();
      break;
    default:
      return bad("Unknown action");
  }
  if (b.action !== "plan" && b.action !== "disconnect") await saveManual(live, manual);
  return NextResponse.json(await loadState(b.today));
}
