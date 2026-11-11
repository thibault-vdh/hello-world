// WHOOP API v2: OAuth, fetching, and normalising into the app's own shapes.
// Reference: https://developer.whoop.com/api

import { localParts } from "./dates";
import { deleteKey, getKey, setKey } from "./store";
import type { BodyData, Kind, Night, Recovery, Workout } from "./types";

const AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
const TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
const API = "https://api.prod.whoop.com/developer";
const SCOPES = "offline read:recovery read:workout read:sleep";
const HISTORY_DAYS = 90;
const SYNC_EVERY_MS = 15 * 60_000;

interface Tokens { access: string; refresh: string; expiresAt: number }
interface Cache extends BodyData { syncedAt: number }

export const whoopConfigured = () => !!(process.env.WHOOP_CLIENT_ID && process.env.WHOOP_CLIENT_SECRET);
export const whoopConnected = async () => !!(await getKey<Tokens>("whoop:tokens"));

export function authorizeUrl(redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: process.env.WHOOP_CLIENT_ID!,
    redirect_uri: redirectUri,
    scope: SCOPES,
    state,
  });
  return `${AUTH_URL}?${q}`;
}

async function tokenRequest(params: Record<string, string>): Promise<Tokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...params,
      client_id: process.env.WHOOP_CLIENT_ID!,
      client_secret: process.env.WHOOP_CLIENT_SECRET!,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`WHOOP token request failed (${res.status})`);
  const t = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  const tokens = { access: t.access_token, refresh: t.refresh_token, expiresAt: Date.now() + t.expires_in * 1000 };
  await setKey("whoop:tokens", tokens);
  return tokens;
}

export const exchangeCode = (code: string, redirectUri: string) =>
  tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });

export async function disconnect(): Promise<void> {
  await deleteKey("whoop:tokens");
  await deleteKey("whoop:data");
}

async function accessToken(): Promise<string> {
  const t = await getKey<Tokens>("whoop:tokens");
  if (!t) throw new Error("WHOOP is not connected");
  if (t.expiresAt > Date.now() + 60_000) return t.access;
  return (await tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh, scope: "offline" })).access;
}

async function collection<T>(path: string, token: string, start: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | undefined;
  do {
    const q = new URLSearchParams({ limit: "25", start });
    if (next) q.set("nextToken", next);
    const res = await fetch(`${API}${path}?${q}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!res.ok) throw new Error(`WHOOP ${path} failed (${res.status})`);
    const page = (await res.json()) as { records: T[]; next_token?: string };
    out.push(...page.records);
    next = page.next_token || undefined;
  } while (next);
  return out;
}

export function classifySport(name: string): Kind {
  const s = (name ?? "").toLowerCase();
  if (s.includes("tennis") && !s.includes("table")) return "tennis";
  if (s.includes("run")) return "run";
  if (/weight|strength|lifting|functional|crossfit|calisthenics|core|resistance/.test(s)) return "strength";
  return "other";
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function normalizeWorkout(r: any): Workout | null {
  if (!r?.start || !r?.end) return null;
  const meters = r.score?.distance_meter;
  return {
    id: String(r.id),
    source: "whoop",
    kind: classifySport(r.sport_name),
    sport: r.sport_name ?? "activity",
    date: localParts(r.start, r.timezone_offset).date,
    minutes: (new Date(r.end).getTime() - new Date(r.start).getTime()) / 60_000,
    km: typeof meters === "number" && meters > 0 ? meters / 1000 : undefined,
    strain: r.score?.strain,
  };
}

export function normalizeSleep(r: any): Night | null {
  if (r?.nap || r?.score_state !== "SCORED" || !r.score?.stage_summary) return null;
  const s = r.score.stage_summary;
  const start = localParts(r.start, r.timezone_offset);
  const end = localParts(r.end, r.timezone_offset);
  const inBedMin = s.total_in_bed_time_milli / 60_000;
  return {
    id: String(r.id),
    date: end.date,
    asleepAt: start.date === end.date ? start.minutes : start.minutes - 1440,
    wokeAt: end.minutes,
    asleepMin: (s.total_in_bed_time_milli - s.total_awake_time_milli - (s.total_no_data_time_milli ?? 0)) / 60_000,
    inBedMin,
  };
}

export function normalizeRecovery(r: any, nightDateBySleepId: Map<string, string>): Recovery | null {
  const date = nightDateBySleepId.get(String(r?.sleep_id));
  if (!date || r.score_state !== "SCORED" || r.score?.recovery_score == null) return null;
  return { date, score: r.score.recovery_score, hrv: r.score.hrv_rmssd_milli, rhr: r.score.resting_heart_rate };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const byKey = <T>(items: T[], key: (t: T) => string) => [...new Map(items.map((i) => [key(i), i])).values()];

/** Returns cached WHOOP data, refreshing it from the API when stale. */
export async function loadWhoop(force = false): Promise<{ data: BodyData; syncedAt: number; error?: string }> {
  const cache = await getKey<Cache>("whoop:data");
  if (cache && !force && Date.now() - cache.syncedAt < SYNC_EVERY_MS) return { data: cache, syncedAt: cache.syncedAt };
  try {
    const token = await accessToken();
    // First sync pulls the history; later syncs re-read the last few days.
    const since = new Date(cache ? cache.syncedAt - 3 * 86_400_000 : Date.now() - HISTORY_DAYS * 86_400_000).toISOString();
    const [w, s, r] = await Promise.all([
      collection<unknown>("/v2/activity/workout", token, since),
      collection<unknown>("/v2/activity/sleep", token, since),
      collection<unknown>("/v2/recovery", token, since),
    ]);
    const notNull = <T>(x: T | null): x is T => x !== null;
    const nights = byKey([...(cache?.nights ?? []), ...s.map(normalizeSleep).filter(notNull)], (n) => n.id);
    const sleepDates = new Map(nights.map((n) => [n.id, n.date]));
    const cutoff = new Date(Date.now() - (HISTORY_DAYS + 30) * 86_400_000).toISOString().slice(0, 10);
    const fresh: Cache = {
      workouts: byKey([...(cache?.workouts ?? []), ...w.map(normalizeWorkout).filter(notNull)], (x) => x.id).filter((x) => x.date >= cutoff),
      nights: nights.filter((n) => n.date >= cutoff),
      recoveries: byKey([...(cache?.recoveries ?? []), ...r.map((x) => normalizeRecovery(x, sleepDates)).filter(notNull)], (x) => x.date).filter((x) => x.date >= cutoff),
      syncedAt: Date.now(),
    };
    await setKey("whoop:data", fresh);
    return { data: fresh, syncedAt: fresh.syncedAt };
  } catch (e) {
    const error = e instanceof Error ? e.message : "WHOOP sync failed";
    return { data: cache ?? { workouts: [], nights: [], recoveries: [] }, syncedAt: cache?.syncedAt ?? 0, error };
  }
}
