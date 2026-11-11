// Sample data shown until WHOOP is connected. Deterministic per calendar date,
// so the same day always looks the same.

import { addDays, weekday } from "./dates";
import type { BodyData } from "./types";

function rng(seed: string): () => number {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export function demoData(today: string): BodyData {
  const data: BodyData = { workouts: [], nights: [], recoveries: [] };
  for (let i = 59; i >= 0; i--) {
    const date = addDays(today, -i);
    const r = rng(date);
    const wd = weekday(date);

    const late = r() < 0.3;
    const asleepAt = -90 + (late ? 25 + r() * 50 : -15 + r() * 25);
    const target = wd === 1 || wd === 3 ? 370 : 390;
    const wokeAt = target + (r() < 0.2 ? 20 + r() * 40 : -8 + r() * 16);
    const inBedMin = wokeAt - asleepAt;
    const asleepMin = inBedMin * (0.9 + r() * 0.05);
    data.nights.push({ id: `demo-night-${date}`, date, asleepAt, wokeAt, asleepMin, inBedMin });

    const score = Math.max(12, Math.min(98, 28 + (asleepMin - 400) * 0.45 + r() * 40));
    data.recoveries.push({ date, score, hrv: 42 + score * 0.28 + r() * 8, rhr: 58 - score * 0.08 });

    const add = (kind: "run" | "strength" | "tennis", sport: string, minutes: number, km?: number) =>
      data.workouts.push({ id: `demo-${kind}-${date}`, source: "whoop", kind, sport, date, minutes, km });
    // Leave today open so the Today screen has something to do.
    if (i === 0) continue;
    if (wd === 1 && r() < 0.92) add("tennis", "tennis", 60);
    if (wd === 2 && r() < 0.8) add("strength", "weightlifting", 40 + r() * 20);
    if (wd === 4 && r() < 0.8) { const km = 6 + r() * 2; add("run", "running", km * 5.6, km); }
    if (wd === 5 && r() < 0.7) add("strength", "weightlifting", 35 + r() * 25);
    if (wd === 6 && r() < 0.85) { const km = 8 + r() * 4; add("run", "running", km * 5.9, km); }
    if (wd === 0 && r() < 0.6) add("strength", "functional fitness", 30 + r() * 20);
  }
  return data;
}
