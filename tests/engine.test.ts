import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, emptyManual } from "@/lib/config";
import { localParts, weekStart } from "@/lib/dates";
import { demoData } from "@/lib/demo";
import { buildDashboard } from "@/lib/engine";
import type { BodyData, Night, Workout } from "@/lib/types";
import { classifySport, normalizeSleep, normalizeWorkout } from "@/lib/whoop";

// Wednesday 11 November 2026; the week starts Monday 9 November.
const TODAY = "2026-11-11";
const cfg = DEFAULT_CONFIG;

const run = (date: string, km?: number, minutes = 45): Workout => ({ id: `run-${date}`, source: "whoop", kind: "run", sport: "running", date, minutes, km });
const lift = (date: string, minutes = 45): Workout => ({ id: `lift-${date}`, source: "whoop", kind: "strength", sport: "weightlifting", date, minutes });
const night = (date: string, asleepAt: number, wokeAt: number, asleepMin: number): Night => ({ id: `n-${date}`, date, asleepAt, wokeAt, asleepMin, inBedMin: wokeAt - asleepAt });
const body = (p: Partial<BodyData> = {}): BodyData => ({ workouts: [], nights: [], recoveries: [], ...p });
const dash = (b: BodyData, m = emptyManual(), today = TODAY) => buildDashboard(b, m, cfg, today);

describe("dates", () => {
  it("finds the Monday of a week", () => {
    expect(weekStart(TODAY)).toBe("2026-11-09");
    expect(weekStart("2026-11-15")).toBe("2026-11-09");
  });
  it("converts an instant to local wall-clock time", () => {
    expect(localParts("2026-11-10T21:25:00.000Z", "+01:00")).toEqual({ date: "2026-11-10", minutes: 22 * 60 + 25 });
    expect(localParts("2026-11-10T23:30:00.000Z", "+01:00").date).toBe("2026-11-11");
  });
});

describe("WHOOP normalisation", () => {
  it("classifies sports", () => {
    expect(classifySport("running")).toBe("run");
    expect(classifySport("Tennis")).toBe("tennis");
    expect(classifySport("table tennis")).toBe("other");
    expect(classifySport("weightlifting")).toBe("strength");
    expect(classifySport("functional fitness")).toBe("strength");
    expect(classifySport("cycling")).toBe("other");
  });
  it("reads distance only when WHOOP has it", () => {
    const base = { id: "a", start: "2026-11-07T08:00:00Z", end: "2026-11-07T09:00:00Z", timezone_offset: "+01:00", sport_name: "running" };
    expect(normalizeWorkout({ ...base, score: { distance_meter: 10200 } })).toMatchObject({ kind: "run", km: 10.2, minutes: 60, date: "2026-11-07" });
    expect(normalizeWorkout({ ...base, score: {} })?.km).toBeUndefined();
  });
  it("turns a sleep into a night dated by the morning", () => {
    const n = normalizeSleep({
      id: "s", nap: false, score_state: "SCORED", timezone_offset: "+01:00",
      start: "2026-11-10T21:20:00Z", end: "2026-11-11T05:12:00Z",
      score: { stage_summary: { total_in_bed_time_milli: 472 * 60000, total_awake_time_milli: 22 * 60000, total_no_data_time_milli: 0 } },
    });
    expect(n).toMatchObject({ date: "2026-11-11", asleepAt: -100, wokeAt: 372, asleepMin: 450 });
    expect(normalizeSleep({ nap: true })).toBeNull();
  });
});

describe("today", () => {
  it("asks for the minimum on a red recovery day", () => {
    const d = dash(body({ recoveries: [{ date: TODAY, score: 25 }] }));
    expect(d.recovery?.band).toBe("red");
    expect(d.mode).toBe("minimum");
    expect(dash(body({ recoveries: [{ date: TODAY, score: 80 }] })).mode).toBe("full");
  });

  it("carries a missed session forward instead of dropping it", () => {
    // Monday tennis and Tuesday push were planned; neither happened.
    const d = dash(body());
    expect(d.sessions.map((s) => [s.title, s.status])).toEqual([["Tennis", "missed"], ["Strength: push", "missed"]]);
  });

  it("counts the minimum version as done", () => {
    const d = dash(body({ workouts: [lift("2026-11-10", 15)] }));
    expect(d.sessions.find((s) => s.title === "Strength: push")).toBeUndefined();
    expect(d.week.strength.done).toBe(1);
    // 10 minutes is under the 15 minute minimum.
    expect(dash(body({ workouts: [lift("2026-11-10", 10)] })).week.strength.done).toBe(0);
  });

  it("matches a session done today to today's plan, not to an older open one", () => {
    const thursday = "2026-11-12"; // short run planned; Tuesday's push still open
    const d = dash(body({ workouts: [run(thursday, 7)] }), emptyManual(), thursday);
    expect(d.sessions.find((s) => s.title === "Short run")?.status).toBe("done");
    expect(d.sessions.find((s) => s.title === "Strength: push")?.status).toBe("missed");
  });

  it("uses the strength tag to close the right session", () => {
    const m = emptyManual();
    m.tags["lift-2026-11-11"] = "pull";
    const friday = "2026-11-13"; // pull planned
    const d = dash(body({ workouts: [lift("2026-11-11")] }), m, friday);
    expect(d.sessions.some((s) => s.title === "Strength: pull")).toBe(true);
    expect(d.sessions.find((s) => s.title === "Strength: pull")?.status).toBe("done");
    expect(d.sessions.find((s) => s.title === "Strength: push")?.status).toBe("missed");
  });
});

describe("sleep", () => {
  it("checks duration, time asleep and the weekday wake time", () => {
    // Wednesday: wake target 06:10.
    const good = dash(body({ nights: [night(TODAY, -95, 372, 452)] })).lastNight!.checks;
    expect(good.map((c) => c.ok)).toEqual([true, true, true]);
    const bad = dash(body({ nights: [night(TODAY, -30, 400, 400)] })).lastNight!.checks;
    expect(bad.map((c) => c.ok)).toEqual([false, false, false]);
    // 06:30 is on target on a Thursday but not on a Wednesday.
    expect(dash(body({ nights: [night("2026-11-12", -95, 390, 460)] }), emptyManual(), "2026-11-12").lastNight!.checks[2].ok).toBe(true);
    expect(dash(body({ nights: [night(TODAY, -95, 390, 460)] })).lastNight!.checks[2].ok).toBe(false);
  });

  it("escalates only on the second miss in a row", () => {
    const one = dash(body({ nights: [night(TODAY, -60, 370, 400)] })).bounceBack;
    expect(one[0]).toMatch(/One miss is noise/);
    const two = dash(body({ nights: [night("2026-11-10", -60, 390, 400), night(TODAY, -60, 370, 400)] })).bounceBack;
    expect(two[0]).toMatch(/Two short nights in a row/);
  });
});

describe("supplements", () => {
  it("stays quiet until the routine has started, then nudges after a miss", () => {
    expect(dash(body()).bounceBack).toEqual([]);
    const m = emptyManual();
    m.supplements["2026-11-08"] = { omega3: true, d3: true, creatine: true, protein: true };
    m.supplements["2026-11-09"] = { omega3: true, d3: true, creatine: true, protein: true };
    const d = dash(body(), m);
    expect(d.bounceBack[0]).toMatch(/Never miss twice/);
    const sup = d.consistency.find((c) => c.id === "supplements")!;
    expect([sup.hits, sup.total]).toEqual([2, 3]);
  });
});

describe("running month", () => {
  it("adds up the month and says what is still needed", () => {
    const d = dash(body({ workouts: [run("2026-10-31", 10), run("2026-11-01", 10), run("2026-11-05", 7), run("2026-11-07", 11)] }));
    expect(d.month.km).toBe(28);
    expect(d.month.remaining).toBe(32);
    expect(d.month.daysLeft).toBe(19);
    expect(d.month.perWeekNeeded).toBe(11.2);
    expect(d.month.onPace).toBe(true);
  });

  it("asks for the distance when WHOOP has none, and a manual fix counts", () => {
    const b = body({ workouts: [run("2026-11-07", undefined, 60)] });
    expect(dash(b).needsKm).toHaveLength(1);
    const m = emptyManual();
    m.distances["run-2026-11-07"] = 10.5;
    const d = dash(b, m);
    expect(d.needsKm).toHaveLength(0);
    expect(d.month.km).toBe(10.5);
  });

  it("does not double count a watch run that WHOOP also recorded", () => {
    const m = emptyManual();
    m.extra.push({ id: "watch-1", source: "manual", kind: "run", sport: "run", date: "2026-11-07", minutes: 61, km: 10.4 });
    const d = dash(body({ workouts: [run("2026-11-07", undefined, 60)] }), m);
    expect(d.month.km).toBe(10.4);
    expect(d.month.series.at(-1)?.km).toBe(10.4);
  });
});

describe("wins and review", () => {
  it("shows a new workout once, until it is acknowledged", () => {
    const b = body({ workouts: [run("2026-11-10", 7)] });
    expect(dash(b).wins).toHaveLength(1);
    const m = emptyManual();
    m.seen.push("run-2026-11-10");
    expect(dash(b, m).wins).toHaveLength(0);
  });

  it("asks for last week's review until it is saved, and surfaces the adjustment", () => {
    const b = body({ workouts: [run("2026-11-07", 9)] });
    const d = dash(b);
    expect(d.review).toMatchObject({ weekStart: "2026-11-02", due: true });
    const m = emptyManual();
    m.reviews["2026-11-02"] = { worked: "a", blocked: "b", change: "Run before work on Thursday", savedAt: "" };
    const after = dash(b, m);
    expect(after.review.due).toBe(false);
    expect(after.week.adjustment).toBe("Run before work on Thursday");
  });

  it("reviews the current week on a Sunday", () => {
    expect(dash(body({ workouts: [run("2026-11-14", 9)] }), emptyManual(), "2026-11-15").review.weekStart).toBe("2026-11-09");
  });
});

describe("sample data", () => {
  it("is stable for a given day and produces a full dashboard", () => {
    expect(demoData(TODAY)).toEqual(demoData(TODAY));
    const d = dash(demoData(TODAY));
    expect(d.consistency.every((c) => c.pct === null || (c.pct >= 0 && c.pct <= 100))).toBe(true);
    expect(d.week.days).toHaveLength(7);
    expect(d.insights.length).toBeGreaterThan(0);
  });
});
