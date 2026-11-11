export type Kind = "run" | "strength" | "tennis" | "other";
export type StrengthTag = "push" | "pull" | "legs";
export type SessionId = "tennis" | "run:short" | "run:long" | "strength:push" | "strength:pull" | "strength:legs";

export interface Workout {
  id: string;
  source: "whoop" | "manual";
  kind: Kind;
  sport: string;
  /** Local calendar date the workout started on (YYYY-MM-DD). */
  date: string;
  minutes: number;
  km?: number;
  strain?: number;
}

export interface Night {
  id: string;
  /** Local calendar date of the morning you woke up. */
  date: string;
  /** Minutes relative to midnight of `date`; negative means before midnight. */
  asleepAt: number;
  wokeAt: number;
  asleepMin: number;
  inBedMin: number;
}

export interface Recovery {
  date: string;
  score: number;
  hrv?: number;
  rhr?: number;
}

export interface BodyData {
  workouts: Workout[];
  nights: Night[];
  recoveries: Recovery[];
}

export interface Review {
  worked: string;
  blocked: string;
  change: string;
  savedAt: string;
}

/** Everything the user logs by hand. */
export interface Manual {
  supplements: Record<string, Record<string, boolean>>;
  tags: Record<string, StrengthTag>;
  distances: Record<string, number>;
  extra: Workout[];
  reviews: Record<string, Review>;
  seen: string[];
}

export interface Supplement {
  id: string;
  name: string;
  dose: string;
  stack: "breakfast" | "shake";
}

export interface Config {
  runMonthlyKm: number;
  /** Planned sessions per weekday, 0 = Sunday. */
  weekPlan: Record<number, SessionId[]>;
  sleep: {
    targetHours: number;
    minimumHours: number;
    inBed: string;
    asleepBy: string;
    wakeDefault: string;
    /** Weekday overrides, 0 = Sunday. */
    wake: Record<number, string>;
    graceMin: number;
  };
  supplements: Supplement[];
  cues: { breakfast: string; shake: string };
  minimums: { runKm: number; strengthMin: number };
}

export type Status = "done" | "todo" | "missed" | "pending";

export interface TodayItem {
  id: string;
  title: string;
  cue: string;
  target: string;
  minimum?: string;
  status: Status;
  detail?: string;
  carriedFrom?: string;
}

export interface SleepCheck {
  label: string;
  value: string;
  target: string;
  ok: boolean;
}

export interface Consistency {
  id: string;
  label: string;
  hits: number;
  total: number;
  pct: number | null;
  note?: string;
}

export interface Dashboard {
  today: string;
  recovery: { score: number; band: "green" | "yellow" | "red"; hrv?: number } | null;
  mode: "full" | "minimum";
  modeText: string;
  sessions: TodayItem[];
  supplements: { id: string; name: string; dose: string; stack: "breakfast" | "shake"; taken: boolean }[];
  cues: { breakfast: string; shake: string };
  lastNight: { checks: SleepCheck[] } | null;
  tonight: { inBed: string; asleepBy: string; wake: string };
  bounceBack: string[];
  wins: { id: string; text: string }[];
  needsTag: { id: string; date: string; minutes: number }[];
  needsKm: { id: string; date: string; minutes: number }[];
  week: {
    start: string;
    days: { date: string; planned: SessionId[]; done: { kind: Kind; label: string }[]; sleepOk: boolean | null; isToday: boolean }[];
    runs: { done: number; target: number; km: number };
    strength: { done: number; target: number; tags: StrengthTag[] };
    tennis: { done: number; target: number };
    votes: number;
    adjustment?: string;
  };
  month: {
    label: string;
    km: number;
    target: number;
    remaining: number;
    daysLeft: number;
    perWeekNeeded: number;
    expected: number;
    onPace: boolean;
    series: { day: number; km: number }[];
    daysInMonth: number;
  };
  consistency: Consistency[];
  insights: string[];
  review: { weekStart: string; due: boolean; summary: string[]; saved?: Review };
  config: Config;
}
