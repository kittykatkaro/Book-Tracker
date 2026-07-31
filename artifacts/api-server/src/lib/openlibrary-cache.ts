/**
 * Lightweight in-memory TTL cache for third-party (OpenLibrary) API
 * responses. Several code paths hit OpenLibrary with overlapping keys —
 * single-ISBN scans, bulk/set ISBN imports, and title/author enrichment
 * lookups — so caching here means a book looked up once (by anyone, not
 * just the same user) skips the external call entirely for the rest of
 * the cache's TTL.
 *
 * In-memory rather than DB-backed for the same reason as the import job
 * store (see import-jobs.ts): no extra infrastructure needed for a
 * single-instance deployment. If this app is later split across multiple
 * instances, back this with a `cache` table (key, value, expires_at) or a
 * Redis store instead — the get/set contract below was kept deliberately
 * narrow so either swap is a small, localized change.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

// Simple size guard so a busy server doesn't grow this unboundedly —
// evict the oldest entries (Map preserves insertion order) once we're
// over the limit.
const MAX_ENTRIES = 5000;

function evictIfNeeded(): void {
  if (store.size <= MAX_ENTRIES) return;
  const overflow = store.size - MAX_ENTRIES;
  let i = 0;
  for (const key of store.keys()) {
    if (i++ >= overflow) break;
    store.delete(key);
  }
}

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  evictIfNeeded();
}

export const CACHE_TTL = {
  /** Book metadata rarely changes once published. */
  FOUND: 24 * 60 * 60 * 1000, // 24h
  /** Shorter TTL for misses, in case the record appears/gets fixed upstream. */
  NOT_FOUND: 60 * 60 * 1000, // 1h
} as const;
