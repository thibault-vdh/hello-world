// Tiny key-value store. Uses Upstash Redis (the free store Vercel offers) when
// its env vars are present, a local JSON file otherwise, and memory as a last
// resort when the filesystem is read-only.

import { promises as fs } from "node:fs";
import path from "node:path";

const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const file = path.join(process.cwd(), ".data", "store.json");
const memory = new Map<string, unknown>();
let fileBroken = false;

export function storageKind(): "redis" | "file" | "memory" {
  return url && token ? "redis" : fileBroken ? "memory" : "file";
}

async function redis(command: unknown[]): Promise<unknown> {
  const res = await fetch(url!, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Storage error ${res.status}`);
  return ((await res.json()) as { result: unknown }).result;
}

async function readFile(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return {};
  }
}

export async function getKey<T>(key: string): Promise<T | null> {
  if (url && token) {
    const raw = (await redis(["GET", `foundations:${key}`])) as string | null;
    return raw ? (JSON.parse(raw) as T) : null;
  }
  if (memory.has(key)) return memory.get(key) as T;
  return ((await readFile())[key] as T) ?? null;
}

export async function setKey(key: string, value: unknown): Promise<void> {
  if (url && token) {
    await redis(["SET", `foundations:${key}`, JSON.stringify(value)]);
    return;
  }
  if (!fileBroken) {
    try {
      const all = await readFile();
      all[key] = value;
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, JSON.stringify(all));
      return;
    } catch {
      fileBroken = true;
    }
  }
  memory.set(key, value);
}

export async function deleteKey(key: string): Promise<void> {
  if (url && token) {
    await redis(["DEL", `foundations:${key}`]);
    return;
  }
  memory.delete(key);
  try {
    const all = await readFile();
    delete all[key];
    await fs.writeFile(file, JSON.stringify(all));
  } catch {
    /* nothing stored on disk */
  }
}
