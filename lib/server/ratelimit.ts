import "server-only";

type Bucket = number[];
const g = globalThis as unknown as { __dfdRate?: Map<string, Bucket> };
const buckets = (g.__dfdRate ??= new Map());

/** Sliding-window limiter. Returns true when the call is allowed. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t: number) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}

export function sweepRateLimits() {
  const now = Date.now();
  for (const [k, hits] of buckets) {
    if (!hits.length || now - hits[hits.length - 1] > 24 * 3600_000) buckets.delete(k);
  }
}
