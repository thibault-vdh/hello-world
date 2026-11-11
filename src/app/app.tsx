"use client";

import { useCallback, useEffect, useState } from "react";
import { SESSION_IDS, SESSION_LABEL } from "@/lib/config";
import type { AppState } from "@/lib/data";
import type { Dashboard, SessionId, StrengthTag } from "@/lib/types";

type Tab = "today" | "week" | "progress" | "settings";
type Act = (body: Record<string, unknown>) => Promise<boolean>;

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmt = (date: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
const shortDay = (date: string) => fmt(date, { weekday: "short", day: "numeric", month: "short" });
const TAGS: { id: StrengthTag; label: string }[] = [
  { id: "push", label: "Push" },
  { id: "pull", label: "Pull" },
  { id: "legs", label: "Core & legs" },
];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [tab, setTab] = useState<Tab>("today");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handle = useCallback(async (res: Response) => {
    if (res.status === 401) {
      window.location.href = "/login";
      return false;
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "Something went wrong. Try again.");
      return false;
    }
    setError("");
    setState(json);
    return true;
  }, []);

  const load = useCallback(async (sync = false) => {
    setBusy(true);
    try {
      await handle(await fetch(`/api/state?today=${localToday()}${sync ? "&sync=1" : ""}`, { cache: "no-store" }));
    } catch {
      setError("Could not reach the app. Check your connection.");
    }
    setBusy(false);
  }, [handle]);

  const act: Act = useCallback(async (body) => {
    try {
      return await handle(await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ today: localToday(), ...body }),
      }));
    } catch {
      setError("Could not save. Check your connection.");
      return false;
    }
  }, [handle]);

  useEffect(() => {
    load();
    // Refresh when the app comes back to the foreground, so new workouts show up.
    const onShow = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [load]);

  if (!state) {
    return <main className="shell"><p className="muted center">{error || "Loading your day"}</p></main>;
  }
  const d = state.dashboard;

  return (
    <main className="shell">
      <header className="top">
        <div>
          <p className="eyebrow">{fmt(d.today, { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1>{tab === "today" ? "Today" : tab === "week" ? "This week" : tab === "progress" ? "Progress" : "Settings"}</h1>
        </div>
        {state.source === "sample" && <span className="pill">Sample data</span>}
      </header>

      {error && <p className="error card" role="alert">{error}</p>}
      {state.whoop.error && <p className="error card" role="alert">WHOOP sync failed, showing the last saved data. Reconnect in Settings if this keeps happening.</p>}

      {tab === "today" && <Today d={d} act={act} />}
      {tab === "week" && <Week d={d} act={act} />}
      {tab === "progress" && <Progress d={d} />}
      {tab === "settings" && <Settings state={state} act={act} sync={() => load(true)} busy={busy} />}

      <nav className="tabs" aria-label="Sections">
        {(["today", "week", "progress", "settings"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "on" : ""} aria-current={tab === t ? "page" : undefined} onClick={() => { setTab(t); window.scrollTo(0, 0); }}>
            {t === "today" ? "Today" : t === "week" ? "Week" : t === "progress" ? "Progress" : "Settings"}
          </button>
        ))}
      </nav>
    </main>
  );
}

function Today({ d, act }: { d: Dashboard; act: Act }) {
  const stacks = (["breakfast", "shake"] as const).map((s) => ({ id: s, cue: d.cues[s], items: d.supplements.filter((x) => x.stack === s) }));
  return (
    <>
      {d.wins.length > 0 && (
        <section className="card win" aria-label="New wins">
          {d.wins.map((w) => <p key={w.id}>{w.text}</p>)}
          <button className="btn small" onClick={() => act({ action: "seen", ids: d.wins.map((w) => w.id) })}>Nice, got it</button>
        </section>
      )}

      <section className={`card recovery ${d.recovery?.band ?? "none"}`}>
        <div className="score">
          <strong>{d.recovery ? `${d.recovery.score}%` : "–"}</strong>
          <span>Recovery</span>
        </div>
        <p>{d.modeText}</p>
      </section>

      {d.bounceBack.map((m) => <p key={m} className="card nudge">{m}</p>)}

      <h2>Training</h2>
      {d.sessions.length === 0 && <p className="card muted">Rest day. Nothing planned, nothing open.</p>}
      {d.sessions.map((s) => (
        <article key={s.id} className={`card session ${s.status}`}>
          <div>
            <p className="eyebrow">{s.cue}</p>
            <h3>{s.title}</h3>
            {s.status === "done" ? (
              <p className="muted">{s.detail}</p>
            ) : d.mode === "minimum" && s.minimum ? (
              <p><strong>Today: {s.minimum}.</strong> <span className="muted">Full version: {s.target}.</span></p>
            ) : (
              <p className="muted">{s.target}{s.minimum ? `. Minimum that still counts: ${s.minimum}.` : "."}</p>
            )}
          </div>
          <span className={`chip ${s.status}`}>{s.status === "done" ? "Done" : s.status === "missed" ? "Still open" : "To do"}</span>
        </article>
      ))}

      {d.needsTag.map((w) => (
        <div key={w.id} className="card ask">
          <p>Strength on {shortDay(w.date)} ({w.minutes} min). Which session was it?</p>
          <div className="row">
            {TAGS.map((t) => <button key={t.id} className="btn small" onClick={() => act({ action: "tag", workoutId: w.id, tag: t.id })}>{t.label}</button>)}
          </div>
        </div>
      ))}
      {d.needsKm.map((w) => <KmAsk key={w.id} w={w} act={act} />)}

      <h2>Supplements</h2>
      {stacks.map((s) => {
        const all = s.items.every((i) => i.taken);
        return (
          <section key={s.id} className="card">
            <div className="row between">
              <p className="eyebrow">{s.cue}</p>
              {!all && <button className="btn small" onClick={() => act({ action: "supplement", stack: s.id })}>Took all</button>}
            </div>
            {s.items.map((i) => (
              <button key={i.id} className={`check ${i.taken ? "on" : ""}`} role="checkbox" aria-checked={i.taken} onClick={() => act({ action: "supplement", id: i.id, taken: !i.taken })}>
                <span className="box" aria-hidden="true">{i.taken ? "✓" : ""}</span>
                <span className="grow">{i.name}</span>
                <span className="muted">{i.dose}</span>
              </button>
            ))}
          </section>
        );
      })}

      <h2>Sleep</h2>
      <section className="card">
        <p className="eyebrow">Last night</p>
        {d.lastNight ? (
          <div className="trio">
            {d.lastNight.checks.map((c) => (
              <div key={c.label} className={c.ok ? "ok" : "off"}>
                <strong>{c.value}</strong>
                <span>{c.label} · {c.ok ? "on target" : `target ${c.target}`}</span>
              </div>
            ))}
          </div>
        ) : <p className="muted">No sleep recorded yet.</p>}
        <p className="eyebrow gap">Tonight</p>
        <p>In bed {d.tonight.inBed}, book down by {d.tonight.asleepBy}, up at {d.tonight.wake}.</p>
      </section>
    </>
  );
}

function KmAsk({ w, act }: { w: { id: string; date: string; minutes: number }; act: Act }) {
  const [km, setKm] = useState("");
  return (
    <form className="card ask" onSubmit={(e) => { e.preventDefault(); act({ action: "km", workoutId: w.id, km }); }}>
      <label htmlFor={`km-${w.id}`}>Run on {shortDay(w.date)} ({w.minutes} min) has no distance. How far was it?</label>
      <div className="row">
        <input id={`km-${w.id}`} inputMode="decimal" placeholder="km" value={km} onChange={(e) => setKm(e.target.value.replace(",", "."))} />
        <button className="btn small" disabled={!km}>Save</button>
      </div>
    </form>
  );
}

function Week({ d, act }: { d: Dashboard; act: Act }) {
  const w = d.week;
  return (
    <>
      {w.adjustment && (
        <section className="card">
          <p className="eyebrow">Your adjustment from the last review</p>
          <p>{w.adjustment}</p>
        </section>
      )}
      {(d.review.due || d.review.saved) && <ReviewCard d={d} act={act} />}

      <section className="card trio stats">
        <div><strong>{w.runs.done}/{w.runs.target}</strong><span>Runs · {w.runs.km} km</span></div>
        <div><strong>{w.strength.done}/{w.strength.target}</strong><span>Strength{w.strength.tags.length ? ` · ${w.strength.tags.join(", ")}` : ""}</span></div>
        <div><strong>{w.tennis.done}/{w.tennis.target}</strong><span>Tennis</span></div>
      </section>
      <p className="muted center">{w.votes} votes this week for a healthy body and a healthy mind.</p>

      <section className="card days">
        {w.days.map((day) => (
          <div key={day.date} className={`day ${day.isToday ? "now" : ""}`}>
            <div className="date"><strong>{fmt(day.date, { weekday: "short" })}</strong><span>{fmt(day.date, { day: "numeric" })}</span></div>
            <div className="grow">
              {day.done.map((x, i) => <span key={i} className="chip done">{x.label}</span>)}
              {day.done.length === 0 && day.planned.map((p) => <span key={p} className="chip plan">{SESSION_LABEL[p]}</span>)}
              {day.done.length === 0 && day.planned.length === 0 && <span className="muted">Rest</span>}
            </div>
            <span className={`dot ${day.sleepOk === null ? "" : day.sleepOk ? "ok" : "off"}`} title={day.sleepOk === null ? "No sleep data" : day.sleepOk ? "Sleep target hit" : "Sleep target missed"} />
          </div>
        ))}
        <p className="muted legend"><span className="dot ok" /> sleep target hit <span className="dot off" /> missed</p>
      </section>

      <AddSession d={d} act={act} />
    </>
  );
}

function ReviewCard({ d, act }: { d: Dashboard; act: Act }) {
  const saved = d.review.saved;
  const [form, setForm] = useState({ worked: saved?.worked ?? "", blocked: saved?.blocked ?? "", change: saved?.change ?? "" });
  const [open, setOpen] = useState(!saved);
  const fields: { key: keyof typeof form; label: string }[] = [
    { key: "worked", label: "What worked?" },
    { key: "blocked", label: "What got in the way?" },
    { key: "change", label: "One thing to change or shrink next week" },
  ];
  return (
    <section className="card review">
      <div className="row between">
        <p className="eyebrow">Weekly review · week of {shortDay(d.review.weekStart)}</p>
        {saved && <button className="btn small" onClick={() => setOpen(!open)}>{open ? "Close" : "Edit"}</button>}
      </div>
      <ul>{d.review.summary.map((s) => <li key={s}>{s}</li>)}</ul>
      {open && (
        <form className="stack" onSubmit={async (e) => { e.preventDefault(); if (await act({ action: "review", weekStart: d.review.weekStart, ...form })) setOpen(false); }}>
          {fields.map((f) => (
            <div key={f.key} className="stack tight">
              <label htmlFor={`rv-${f.key}`}>{f.label}</label>
              <textarea id={`rv-${f.key}`} rows={2} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            </div>
          ))}
          <button className="btn primary">Save review</button>
        </form>
      )}
    </section>
  );
}

function AddSession({ d, act }: { d: Dashboard; act: Act }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ kind: "run", date: d.today, minutes: "", km: "" });
  if (!open) return <button className="btn ghost" onClick={() => setOpen(true)}>Log a session by hand</button>;
  return (
    <form className="card stack" onSubmit={async (e) => { e.preventDefault(); if (await act({ action: "addWorkout", ...form })) { setOpen(false); setForm({ ...form, minutes: "", km: "" }); } }}>
      <p className="eyebrow">For sessions WHOOP did not pick up</p>
      <div className="row">
        <div className="stack tight grow">
          <label htmlFor="as-kind">Type</label>
          <select id="as-kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            <option value="run">Run</option><option value="strength">Strength</option><option value="tennis">Tennis</option>
          </select>
        </div>
        <div className="stack tight grow">
          <label htmlFor="as-date">Date</label>
          <input id="as-date" type="date" max={d.today} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </div>
      </div>
      <div className="row">
        <div className="stack tight grow">
          <label htmlFor="as-min">Minutes</label>
          <input id="as-min" inputMode="numeric" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} />
        </div>
        {form.kind === "run" && (
          <div className="stack tight grow">
            <label htmlFor="as-km">Distance (km)</label>
            <input id="as-km" inputMode="decimal" value={form.km} onChange={(e) => setForm({ ...form, km: e.target.value.replace(",", ".") })} />
          </div>
        )}
      </div>
      <div className="row">
        <button className="btn primary" disabled={!form.minutes}>Add session</button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

function Progress({ d }: { d: Dashboard }) {
  const m = d.month;
  const W = 320, H = 110;
  const max = Math.max(m.target, m.km) * 1.05;
  const x = (day: number) => (day / m.daysInMonth) * W;
  const y = (km: number) => H - (km / max) * H;
  const line = ["0," + y(0), ...m.series.map((p) => `${x(p.day)},${y(p.km)}`)].join(" ");
  const status = m.remaining === 0 ? "Goal reached" : m.onPace ? (m.perWeekNeeded <= 14 ? "On track" : "Tight but doable") : "Behind";
  return (
    <>
      <h2>Running in {m.label}</h2>
      <section className="card">
        <div className="row between baseline">
          <p className="big">{m.km}<span> / {m.target} km</span></p>
          <span className={`chip ${m.onPace ? "done" : "missed"}`}>{status}</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`${m.km} of ${m.target} km run so far this month`}>
          <line x1="0" y1={y(0)} x2={W} y2={y(m.target)} className="pace" />
          <polyline points={line} className="actual" />
          {m.series.length > 0 && <circle cx={x(m.series[m.series.length - 1].day)} cy={y(m.km)} r="4" className="dotmark" />}
        </svg>
        <p className="muted legend"><span className="key actual" /> you <span className="key pace" /> even pace to {m.target} km</p>
        <p>
          {m.remaining === 0
            ? "Monthly goal done. Anything from here is a bonus."
            : `${m.remaining} km to go with ${m.daysLeft} ${m.daysLeft === 1 ? "day" : "days"} left after today: about ${m.perWeekNeeded} km per week. Your plan of one short and one long run covers 14 to 20.`}
        </p>
      </section>

      <h2>Consistency, last 30 days</h2>
      <section className="card stack">
        {d.consistency.map((c) => (
          <div key={c.id}>
            <div className="row between">
              <span>{c.label}</span>
              <strong>{c.pct === null ? "–" : `${c.pct}%`}</strong>
            </div>
            <div className="bar" role="img" aria-label={c.pct === null ? `${c.label}: no data yet` : `${c.label}: ${c.pct}%`}><i style={{ width: `${c.pct ?? 0}%` }} /></div>
            <p className="muted small">{c.total ? `${c.hits} of ${c.total}` : ""}{c.total && c.note ? " · " : ""}{c.note ?? ""}</p>
          </div>
        ))}
        <p className="muted small">A missed day lowers the percentage a little and never resets it. Aim for 80%, not 100%.</p>
      </section>

      <h2>What your data says</h2>
      <section className="card stack">
        {d.insights.map((i) => <p key={i}>{i}</p>)}
      </section>
    </>
  );
}

function Settings({ state, act, sync, busy }: { state: AppState; act: Act; sync: () => void; busy: boolean }) {
  const { whoop, dashboard: d } = state;
  const [plan, setPlan] = useState<Record<number, SessionId[]>>(d.config.weekPlan);
  const [cues, setCues] = useState(d.config.cues);
  const [saved, setSaved] = useState(false);
  return (
    <>
      <h2>WHOOP</h2>
      <section className="card stack">
        {whoop.connected ? (
          <>
            <p>Connected. Last synced {whoop.syncedAt ? new Date(whoop.syncedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "never"}.</p>
            <div className="row">
              <button className="btn" onClick={sync} disabled={busy}>{busy ? "Syncing" : "Sync now"}</button>
              <button className="btn" onClick={() => { if (window.confirm("Disconnect WHOOP? The app goes back to sample data. Your supplement ticks and reviews are kept.")) act({ action: "disconnect" }); }}>Disconnect</button>
            </div>
          </>
        ) : whoop.canConnect ? (
          <>
            <p>You are looking at sample data. Connect WHOOP to see your own.</p>
            <a className="btn primary" href="/api/whoop/login">Connect WHOOP</a>
          </>
        ) : (
          <p>You are looking at sample data. To connect WHOOP, the app first needs its WHOOP keys and a password. The steps are in the README.</p>
        )}
        {state.storage === "memory" && <p className="error">Storage is not set up, so anything you log here will be lost. See the README.</p>}
      </section>

      <h2>Weekly plan</h2>
      <form className="card stack" onSubmit={async (e) => { e.preventDefault(); setSaved(await act({ action: "plan", weekPlan: plan, cues })); }}>
        {WEEK_ORDER.map((wd) => (
          <div key={wd} className="row between">
            <label htmlFor={`plan-${wd}`}>{DAY_NAMES[wd]}</label>
            <select id={`plan-${wd}`} value={plan[wd]?.[0] ?? ""} onChange={(e) => { setSaved(false); setPlan({ ...plan, [wd]: e.target.value ? [e.target.value as SessionId] : [] }); }}>
              <option value="">Rest</option>
              {SESSION_IDS.map((s) => <option key={s} value={s}>{SESSION_LABEL[s]}</option>)}
            </select>
          </div>
        ))}
        <div className="stack tight">
          <label htmlFor="cue-b">When do you take Omega-3 and D3?</label>
          <input id="cue-b" value={cues.breakfast} maxLength={80} onChange={(e) => { setSaved(false); setCues({ ...cues, breakfast: e.target.value }); }} />
        </div>
        <div className="stack tight">
          <label htmlFor="cue-s">When do you take the shake and creatine?</label>
          <input id="cue-s" value={cues.shake} maxLength={80} onChange={(e) => { setSaved(false); setCues({ ...cues, shake: e.target.value }); }} />
        </div>
        <button className="btn primary">{saved ? "Saved" : "Save plan"}</button>
      </form>
    </>
  );
}
