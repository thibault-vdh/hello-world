// Loads everything a request needs and builds the dashboard.

import { passwordSet } from "./auth";
import { emptyManual, resolveConfig } from "./config";
import { demoData } from "./demo";
import { buildDashboard } from "./engine";
import { getKey, setKey, storageKind } from "./store";
import type { Config, Dashboard, Manual } from "./types";
import { loadWhoop, whoopConfigured, whoopConnected } from "./whoop";

export interface AppState {
  dashboard: Dashboard;
  source: "whoop" | "sample";
  whoop: { configured: boolean; connected: boolean; canConnect: boolean; syncedAt: number; error?: string };
  storage: "redis" | "file" | "memory";
}

// Manual logs made against sample data are kept apart from real ones.
const manualKey = (live: boolean) => (live ? "manual:live" : "manual:sample");

export async function loadManual(live: boolean): Promise<Manual> {
  return { ...emptyManual(), ...(await getKey<Manual>(manualKey(live))) };
}

export const saveManual = (live: boolean, m: Manual) => setKey(manualKey(live), m);
export const loadConfig = async () => resolveConfig(await getKey<Partial<Config>>("config"));
export const saveConfig = (c: Config) => setKey("config", c);

export async function loadState(today: string, forceSync = false): Promise<AppState> {
  const configured = whoopConfigured();
  const connected = configured && (await whoopConnected());
  const [manual, config] = await Promise.all([loadManual(connected), loadConfig()]);
  let body = demoData(today);
  let syncedAt = 0;
  let error: string | undefined;
  if (connected) {
    const w = await loadWhoop(forceSync);
    body = w.data;
    syncedAt = w.syncedAt;
    error = w.error;
  }
  return {
    dashboard: buildDashboard(body, manual, config, today),
    source: connected ? "whoop" : "sample",
    whoop: { configured, connected, canConnect: configured && passwordSet(), syncedAt, error },
    storage: storageKind(),
  };
}

export const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
