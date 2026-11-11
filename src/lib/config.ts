import type { Config, Manual, SessionId } from "./types";

export const SESSION_LABEL: Record<SessionId, string> = {
  tennis: "Tennis",
  "run:short": "Short run",
  "run:long": "Long run",
  "strength:push": "Strength: push",
  "strength:pull": "Strength: pull",
  "strength:legs": "Strength: core & legs",
};

export const SESSION_IDS = Object.keys(SESSION_LABEL) as SessionId[];

export const DEFAULT_CONFIG: Config = {
  runMonthlyKm: 60,
  weekPlan: {
    1: ["tennis"],
    2: ["strength:push"],
    3: [],
    4: ["run:short"],
    5: ["strength:pull"],
    6: ["run:long"],
    0: ["strength:legs"],
  },
  sleep: {
    targetHours: 7.5,
    minimumHours: 7,
    inBed: "22:00",
    asleepBy: "22:30",
    wakeDefault: "06:30",
    wake: { 1: "06:10", 3: "06:10" },
    graceMin: 15,
  },
  supplements: [
    { id: "omega3", name: "Omega-3", dose: "4 caps", stack: "breakfast" },
    { id: "d3", name: "Vitamin D3", dose: "2000 IU", stack: "breakfast" },
    { id: "creatine", name: "Creatine", dose: "1 serving", stack: "shake" },
    { id: "protein", name: "Protein shake", dose: "1 shake", stack: "shake" },
  ],
  cues: {
    breakfast: "Right after breakfast",
    shake: "After training, or with breakfast on rest days",
  },
  minimums: { runKm: 3, strengthMin: 15 },
};

export function emptyManual(): Manual {
  return { supplements: {}, tags: {}, distances: {}, extra: [], reviews: {}, seen: [] };
}

/** Merge a stored (possibly partial or older) config over the defaults. */
export function resolveConfig(stored?: Partial<Config> | null): Config {
  if (!stored) return DEFAULT_CONFIG;
  return {
    ...DEFAULT_CONFIG,
    ...stored,
    sleep: { ...DEFAULT_CONFIG.sleep, ...stored.sleep },
    cues: { ...DEFAULT_CONFIG.cues, ...stored.cues },
    minimums: { ...DEFAULT_CONFIG.minimums, ...stored.minimums },
    weekPlan: { ...DEFAULT_CONFIG.weekPlan, ...stored.weekPlan },
    supplements: DEFAULT_CONFIG.supplements,
  };
}
