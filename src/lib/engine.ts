// Pure habit logic: takes body data + manual logs + config and produces
// everything the screens show. No I/O, so it is fully unit-testable.

import { SESSION_LABEL } from "./config";
import {
  addDays, daysInMonth, diffDays, formatClock, formatHours, monthName, monthStart,
  parseClock, weekStart, weekday, weekdayName,
} from "./dates";
import type {
  BodyData, Config, Consistency, Dashboard, Kind, Manual, Night, SessionId,
  SleepCheck, StrengthTag, TodayItem, Workout,
} from "./types";

const kindOf = (s: SessionId): Kind => s.split(":")[0] as Kind;
const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Apply manual distance fixes and fold hand-logged sessions into the Whoop ones. */
export function mergeWorkouts(body: BodyData, manual: Manual): Workout[] {
  const out = body.workouts.map((w) => ({ ...w, km: manual.distances[w.id] ?? w.km }));
  for (const e of manual.extra) {
    const twin = out.find((w) => w.source === "whoop" && w.kind === e.kind && w.date === e.date);
    if (twin) {
      if (twin.km == null && e.km != null) twin.km = e.km;
    } else {
      out.push({ ...e, km: manual.distances[e.id] ?? e.km });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Does this workout count as a session? The minimum version counts. */
export function counts(w: Workout, config: Config): boolean {
  if (w.kind === "run") return w.km != null ? w.km >= config.minimums.runKm : w.minutes >= 15;
  if (w.kind === "strength") return w.minutes >= config.minimums.strengthMin;
  return w.kind === "tennis";
}

function asleepByMin(config: Config): number {
  const m = parseClock(config.sleep.asleepBy);
  return m >= 720 ? m - 1440 : m;
}

function wakeTarget(config: Config, date: string): string {
  return config.sleep.wake[weekday(date)] ?? config.sleep.wakeDefault;
}

export function sleepChecks(n: Night, config: Config): { duration: boolean; asleep: boolean; wake: boolean } {
  const g = config.sleep.graceMin;
  return {
    duration: n.asleepMin >= config.sleep.targetHours * 60,
    asleep: n.asleepAt <= asleepByMin(config) + g,
    wake: Math.abs(n.wokeAt - parseClock(wakeTarget(config, n.date))) <= g,
  };
}

interface Planned { id: SessionId; date: string; by?: Workout }

/** Match the sessions done in a week to the sessions planned for it. */
function matchWeek(ws: string, upTo: string, workouts: Workout[], manual: Manual, config: Config) {
  const planned: Planned[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(ws, i);
    for (const id of config.weekPlan[weekday(date)] ?? []) planned.push({ id, date });
  }
  const done = workouts.filter((w) => w.date >= ws && w.date <= upTo && diffDays(w.date, ws) < 7 && counts(w, config));
  const free = new Set(done);
  const tagOf = (w: Workout) => (w.kind === "strength" ? manual.tags[w.id] : undefined);
  const passes: ((p: Planned, w: Workout) => boolean)[] = [
    (p, w) => p.date === w.date && p.id === `strength:${tagOf(w)}`,
    (p, w) => p.date === w.date && kindOf(p.id) === w.kind,
    (p, w) => p.id === `strength:${tagOf(w)}`,
    (p, w) => kindOf(p.id) === w.kind,
  ];
  for (const pass of passes) {
    for (const p of planned) {
      if (p.by) continue;
      const w = [...free].find((x) => pass(p, x));
      if (w) { p.by = w; free.delete(w); }
    }
  }
  const target = (k: Kind) => planned.filter((p) => kindOf(p.id) === k).length;
  const doneOf = (k: Kind) => done.filter((w) => w.kind === k);
  return { planned, done, target, doneOf };
}

function describe(w: Workout): string {
  const parts = [];
  if (w.km != null) parts.push(`${round1(w.km)} km`);
  parts.push(`${Math.round(w.minutes)} min`);
  return parts.join(" · ");
}

function supplementsDone(manual: Manual, config: Config, date: string): boolean {
  const day = manual.supplements[date] ?? {};
  return config.supplements.every((s) => day[s.id]);
}

export function buildDashboard(body: BodyData, manual: Manual, config: Config, today: string): Dashboard {
  const workouts = mergeWorkouts(body, manual);
  const nights = new Map<string, Night>();
  for (const n of body.nights) {
    const prev = nights.get(n.date);
    if (!prev || n.asleepMin > prev.asleepMin) nights.set(n.date, n);
  }
  const recoveries = new Map(body.recoveries.map((r) => [r.date, r]));

  // --- Recovery decides whether today asks for the full or the minimum version.
  const rec = recoveries.get(today);
  const band = rec ? (rec.score >= 67 ? "green" : rec.score >= 34 ? "yellow" : "red") : null;
  const mode = band === "red" ? "minimum" : "full";
  const modeText =
    band === "red" ? "Low recovery. The minimum version counts today; showing up is the win."
    : band === "yellow" ? "Moderate recovery. Do the planned session, keep the effort controlled."
    : band === "green" ? "High recovery. Good day for the full session."
    : "No recovery score yet today. Plan as normal.";

  // --- This week.
  const ws = weekStart(today);
  const wk = matchWeek(ws, today, workouts, manual, config);

  const item = (p: Planned): TodayItem => {
    const kind = kindOf(p.id);
    const target = p.id === "run:short" ? "6–8 km" : p.id === "run:long" ? "8–12 km" : kind === "tennis" ? "Class" : "Full session";
    const minimum = kind === "run" ? `${config.minimums.runKm} km easy` : kind === "strength" ? `${config.minimums.strengthMin} min` : undefined;
    return {
      id: `${p.id}@${p.date}`,
      title: SESSION_LABEL[p.id],
      cue: p.date === today ? "Planned for today" : `Open from ${weekdayName(p.date)}`,
      target,
      minimum,
      status: p.by ? "done" : p.date === today ? "todo" : "missed",
      detail: p.by ? describe(p.by) : undefined,
      carriedFrom: p.date === today ? undefined : weekdayName(p.date),
    };
  };
  const sessions = [
    ...wk.planned.filter((p) => p.date === today),
    ...wk.planned.filter((p) => p.date < today && !p.by),
  ].map(item);

  // --- Sleep.
  const last = nights.get(today);
  let lastNight: Dashboard["lastNight"] = null;
  if (last) {
    const c = sleepChecks(last, config);
    const checks: SleepCheck[] = [
      { label: "Sleep", value: formatHours(last.asleepMin), target: `${config.sleep.targetHours}h+`, ok: c.duration },
      { label: "Asleep", value: formatClock(last.asleepAt), target: `by ${config.sleep.asleepBy}`, ok: c.asleep },
      { label: "Awake", value: formatClock(last.wokeAt), target: wakeTarget(config, today), ok: c.wake },
    ];
    lastNight = { checks };
  }
  const tonight = { inBed: config.sleep.inBed, asleepBy: config.sleep.asleepBy, wake: wakeTarget(config, addDays(today, 1)) };

  // --- Never miss twice.
  const bounceBack: string[] = [];
  const prev = nights.get(addDays(today, -1));
  if (last && !sleepChecks(last, config).duration) {
    bounceBack.push(
      prev && !sleepChecks(prev, config).duration
        ? `Two short nights in a row. Tonight, protect the minimum: lights out by ${config.sleep.asleepBy} for at least ${config.sleep.minimumHours}h.`
        : `Short night (${formatHours(last.asleepMin)}). One miss is noise; tonight is the one that counts. In bed by ${config.sleep.inBed}.`,
    );
  }
  const logDates = Object.keys(manual.supplements).filter((d) => Object.values(manual.supplements[d]).some(Boolean)).sort();
  const firstLog = logDates[0];
  const y1 = addDays(today, -1), y2 = addDays(today, -2);
  if (firstLog && firstLog <= y1 && !supplementsDone(manual, config, today) && !supplementsDone(manual, config, y1)) {
    bounceBack.push(
      firstLog <= y2 && !supplementsDone(manual, config, y2)
        ? "Supplements missed two days running. Shrink it: just the breakfast stack today, nothing else required."
        : "Supplements missed yesterday. Never miss twice: take them with breakfast today.",
    );
  }

  // --- Month of running.
  const ms = monthStart(today);
  const dim = daysInMonth(today);
  const dayNo = Number(today.slice(8, 10));
  const monthRuns = workouts.filter((w) => w.kind === "run" && w.date >= ms && w.date <= today);
  const series: { day: number; km: number }[] = [];
  let acc = 0;
  for (let d = 1; d <= dayNo; d++) {
    const date = addDays(ms, d - 1);
    acc += monthRuns.filter((w) => w.date === date).reduce((s, w) => s + (w.km ?? 0), 0);
    series.push({ day: d, km: round1(acc) });
  }
  const km = round1(acc);
  const remaining = round1(Math.max(0, config.runMonthlyKm - km));
  const daysLeft = dim - dayNo;
  const perWeekNeeded = round1(remaining / ((daysLeft + 1) / 7));
  const expected = round1((config.runMonthlyKm * dayNo) / dim);
  const month: Dashboard["month"] = {
    label: monthName(today), km, target: config.runMonthlyKm, remaining, daysLeft,
    perWeekNeeded, expected, onPace: remaining === 0 || perWeekNeeded <= 20, series, daysInMonth: dim,
  };

  // --- Wins: feedback the moment something lands.
  const wins: Dashboard["wins"] = [];
  const seen = new Set(manual.seen);
  for (const w of workouts) {
    if (w.date < y1 || w.date > today || !counts(w, config) || seen.has(w.id)) continue;
    if (w.kind === "run") {
      wins.push({ id: w.id, text: w.km != null ? `Run logged: ${round1(w.km)} km. ${km} of ${config.runMonthlyKm} km this month.` : "Run logged. Add the distance to count it toward your month." });
    } else if (w.kind === "strength") {
      wins.push({ id: w.id, text: `Strength session logged: ${wk.doneOf("strength").length} of ${wk.target("strength")} this week.` });
    } else if (w.kind === "tennis") {
      wins.push({ id: w.id, text: "Tennis logged." });
    }
  }
  if (lastNight && lastNight.checks.every((c) => c.ok) && !seen.has(`sleep:${today}`)) {
    const [d, a, w] = lastNight.checks;
    wins.push({ id: `sleep:${today}`, text: `Full sleep target hit: ${d.value}, asleep ${a.value}, up ${w.value}.` });
  }

  // --- Things only you can tell the app.
  // Tags only matter for matching this week's plan, so only ask about this week.
  const needsTag = wk.doneOf("strength")
    .filter((w) => !manual.tags[w.id])
    .map((w) => ({ id: w.id, date: w.date, minutes: Math.round(w.minutes) }));
  const needsKm = monthRuns
    .filter((w) => w.km == null)
    .map((w) => ({ id: w.id, date: w.date, minutes: Math.round(w.minutes) }));

  // --- Week view.
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(ws, i);
    const n = nights.get(date);
    return {
      date,
      planned: config.weekPlan[weekday(date)] ?? [],
      done: wk.done.filter((w) => w.date === date).map((w) => ({
        kind: w.kind,
        label: w.kind === "run" ? (w.km != null ? `Run ${round1(w.km)} km` : "Run") : w.kind === "strength" ? `Strength${manual.tags[w.id] ? ` (${manual.tags[w.id]})` : ""}` : "Tennis",
      })),
      sleepOk: n ? sleepChecks(n, config).duration : null,
      isToday: date === today,
    };
  });
  let votes = wk.done.length;
  for (let i = 0; i < 7; i++) {
    const date = addDays(ws, i);
    if (date > today) break;
    votes += config.supplements.filter((s) => manual.supplements[date]?.[s.id]).length;
    const n = nights.get(date);
    if (n) votes += Object.values(sleepChecks(n, config)).filter(Boolean).length;
  }
  const lastReviewKey = Object.keys(manual.reviews).filter((k) => manual.reviews[k].change.trim()).sort().pop();
  const week: Dashboard["week"] = {
    start: ws,
    days,
    runs: { done: wk.doneOf("run").length, target: wk.target("run"), km: round1(wk.doneOf("run").reduce((s, w) => s + (w.km ?? 0), 0)) },
    strength: { done: wk.doneOf("strength").length, target: wk.target("strength"), tags: wk.doneOf("strength").map((w) => manual.tags[w.id]).filter(Boolean) as StrengthTag[] },
    tennis: { done: wk.doneOf("tennis").length, target: wk.target("tennis") },
    votes,
    adjustment: lastReviewKey ? manual.reviews[lastReviewKey].change.trim() : undefined,
  };

  // --- Consistency over streaks: a rolling 30 days, so one miss never resets anything.
  const from = addDays(today, -29);
  const window = [...nights.values()].filter((n) => n.date >= from && n.date <= today);
  const rate = (id: string, label: string, hits: number, total: number, note?: string): Consistency =>
    ({ id, label, hits, total, pct: total ? Math.round((100 * hits) / total) : null, note });
  const sleepRate = (id: string, label: string, key: "duration" | "asleep" | "wake") =>
    rate(id, label, window.filter((n) => sleepChecks(n, config)[key]).length, window.length, window.length ? undefined : "No nights recorded yet");

  let supHits = 0, supTotal = 0;
  if (firstLog) {
    for (let d = firstLog > from ? firstLog : from; d <= y1; d = addDays(d, 1)) {
      supTotal++;
      if (supplementsDone(manual, config, d)) supHits++;
    }
  }
  const firstData = [...workouts.map((w) => w.date), ...body.nights.map((n) => n.date)].sort()[0];
  let trainHits = 0, trainTotal = 0;
  for (let i = 1; i <= 4; i++) {
    const s = addDays(ws, -7 * i);
    if (!firstData || s < firstData) continue;
    const m = matchWeek(s, addDays(s, 6), workouts, manual, config);
    trainTotal += m.planned.length;
    trainHits += m.planned.filter((p) => p.by).length;
  }
  const consistency: Consistency[] = [
    rate("training", "Training sessions", trainHits, trainTotal, trainTotal ? "Last 4 full weeks" : "Needs one full week of data"),
    sleepRate("sleep", `${config.sleep.targetHours}h+ of sleep`, "duration"),
    sleepRate("asleep", `Asleep by ${config.sleep.asleepBy}`, "asleep"),
    sleepRate("wake", "Wake time on target", "wake"),
    rate("supplements", "All supplements taken", supHits, supTotal, firstLog ? (supTotal ? undefined : "Counting starts tomorrow") : "Starts with your first tick"),
  ];

  // --- Insights: what your own data says the habits buy you.
  const insights: string[] = [];
  const pairs = [...nights.values()].flatMap((n) => {
    const r = recoveries.get(n.date);
    return r ? [{ n, r }] : [];
  });
  const compare = (key: "duration" | "asleep", yes: string, no: string) => {
    const a = pairs.filter((p) => sleepChecks(p.n, config)[key]);
    const b = pairs.filter((p) => !sleepChecks(p.n, config)[key]);
    if (a.length < 5 || b.length < 5) return false;
    const ra = Math.round(mean(a.map((p) => p.r.score))), rb = Math.round(mean(b.map((p) => p.r.score)));
    const ha = a.filter((p) => p.r.hrv != null), hb = b.filter((p) => p.r.hrv != null);
    const hrv = ha.length && hb.length ? ` HRV: ${Math.round(mean(ha.map((p) => p.r.hrv!)))} vs ${Math.round(mean(hb.map((p) => p.r.hrv!)))} ms.` : "";
    insights.push(`${yes}, your recovery averages ${ra}%. ${no}, ${rb}%.${hrv} (${a.length} vs ${b.length} nights)`);
    return true;
  };
  const got1 = compare("duration", `After nights with ${config.sleep.targetHours}h+ of sleep`, "After shorter nights");
  const got2 = compare("asleep", `When you are asleep by ${config.sleep.asleepBy}`, "When you are later");
  if (!got1 && !got2) insights.push("Insights appear once there are at least 5 nights on each side of a target to compare.");

  // --- Weekly review: on Sunday for this week, otherwise for last week until saved.
  const reviewWeek = weekday(today) === 0 ? ws : addDays(ws, -7);
  const rEnd = addDays(reviewWeek, 6) < today ? addDays(reviewWeek, 6) : today;
  const rm = matchWeek(reviewWeek, rEnd, workouts, manual, config);
  let nightsHit = 0, nightsSeen = 0, supDays = 0;
  for (let d = reviewWeek; d <= rEnd; d = addDays(d, 1)) {
    const n = nights.get(d);
    if (n) { nightsSeen++; if (sleepChecks(n, config).duration) nightsHit++; }
    if (supplementsDone(manual, config, d)) supDays++;
  }
  const hasData = !!firstData && firstData <= rEnd;
  const review: Dashboard["review"] = {
    weekStart: reviewWeek,
    due: hasData && !manual.reviews[reviewWeek],
    summary: [
      `Sessions: ${rm.planned.filter((p) => p.by).length} of ${rm.planned.length} planned`,
      `Running: ${round1(rm.doneOf("run").reduce((s, w) => s + (w.km ?? 0), 0))} km`,
      `Sleep target: ${nightsHit} of ${nightsSeen} nights`,
      `Supplements: ${supDays} of ${diffDays(rEnd, reviewWeek) + 1} days complete`,
    ],
    saved: manual.reviews[reviewWeek],
  };

  return {
    today,
    recovery: rec && band ? { score: Math.round(rec.score), band, hrv: rec.hrv != null ? Math.round(rec.hrv) : undefined } : null,
    mode, modeText, sessions,
    supplements: config.supplements.map((s) => ({ ...s, taken: !!manual.supplements[today]?.[s.id] })),
    cues: config.cues,
    lastNight, tonight, bounceBack, wins, needsTag, needsKm, week, month, consistency, insights, review, config,
  };
}
