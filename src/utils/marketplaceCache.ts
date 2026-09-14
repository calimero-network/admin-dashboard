/**
 * Marketplace cache utility
 *
 * Caches raw registry app data (before installed-status is applied) so that
 * navigating back to the Marketplace page does not trigger a slow re-fetch
 * every time.
 *
 * Design:
 *  - Raw AppSummary[] from each registry is stored in localStorage + in-memory.
 *  - Installed status is NOT cached – it is applied on top by the Marketplace
 *    component using the live installedAppIds set.
 *  - A TTL controls when the cache is considered stale and a background
 *    refresh is triggered.
 *  - The cache automatically invalidates when the list of configured
 *    registries changes.
 *  - install / uninstall operations only need to update the installed-status
 *    overlay; however, callers can also call `invalidateMarketplaceCache()` if
 *    they want a full re-fetch on next load.
 */

import type { AppSummary } from './registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegistryApps {
  registry: string;
  apps: AppSummary[];
}

interface CacheEntry {
  /** Sorted, serialised registry URL list so we can detect config changes */
  registriesKey: string;
  /** The cached registry results */
  results: RegistryApps[];
  /** Unix-ms timestamp when the cache was written */
  timestamp: number;
  /** Simple content fingerprint for change-detection */
  contentHash: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * ⚠️ THE KEY CARRIES A SCHEMA VERSION, AND IT HAS TO.
 *
 * This cache stores whole `AppSummary` objects. When that type gains a field —
 * as it just did with icon, verified, links, wasm and minRuntimeVersion — every
 * existing user still holds entries written under the OLD shape, and the
 * Marketplace serves them cache-first. The result is a card with no icon and a
 * detail page with no Links or Size section, on a build that renders all of
 * them correctly: nothing errors, the data is simply absent, and it stays that
 * way until a background revalidation happens to land.
 *
 * Bumping this suffix whenever the stored shape changes turns that into a
 * one-time refetch. It is cheap: the entry is a listing that is refetched on a
 * 5-minute TTL anyway.
 */
const CACHE_SCHEMA = 'v2';
const STORAGE_KEY = `calimero-marketplace-cache-${CACHE_SCHEMA}`;

/** Default time-to-live: 5 minutes */
const DEFAULT_TTL_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// In-memory singleton (survives within a single SPA session)
// ---------------------------------------------------------------------------

let memoryCache: CacheEntry | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a deterministic key from a list of registry URLs */
function buildRegistriesKey(registries: string[]): string {
  return [...registries]
    .map((u) => u.replace(/\/+$/, '').toLowerCase())
    .sort()
    .join('|');
}

/** Cheap content fingerprint so we can tell if the registry payload changed */
function computeContentHash(results: RegistryApps[]): string {
  const parts: string[] = [];
  for (const { registry, apps } of results) {
    for (const app of apps) {
      parts.push(`${registry}::${app.id}::${app.latest_version}`);
    }
  }
  parts.sort();
  const raw = parts.join('\n');

  // djb2 hash → base-36 string
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 33) ^ raw.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

// ---------------------------------------------------------------------------
// Read / Write
// ---------------------------------------------------------------------------

function readFromStorage(): CacheEntry | null {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    if (!json) return null;
    return JSON.parse(json) as CacheEntry;
  } catch {
    return null;
  }
}

function writeToStorage(entry: CacheEntry): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch (err) {
    console.warn('Failed to write marketplace cache to localStorage:', err);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get cached marketplace data.
 *
 * Returns `null` when there is no usable cache (first load or registries
 * changed). Otherwise returns the cached results together with an `isStale`
 * flag the caller can use to decide whether to trigger a background refresh.
 */
export function getMarketplaceCache(
  registries: string[],
  ttlMs: number = DEFAULT_TTL_MS,
): { results: RegistryApps[]; isStale: boolean } | null {
  const key = buildRegistriesKey(registries);

  // Try memory cache first (fastest)
  if (memoryCache && memoryCache.registriesKey === key) {
    const age = Date.now() - memoryCache.timestamp;
    return { results: memoryCache.results, isStale: age > ttlMs };
  }

  // Fall back to localStorage
  const stored = readFromStorage();
  if (stored && stored.registriesKey === key) {
    // Populate memory cache
    memoryCache = stored;
    const age = Date.now() - stored.timestamp;
    return { results: stored.results, isStale: age > ttlMs };
  }

  return null;
}

/**
 * Store fresh marketplace data in the cache.
 *
 * Returns `true` if the content actually changed compared to the previous
 * cache (useful for deciding whether to update React state).
 */
export function setMarketplaceCache(
  registries: string[],
  results: RegistryApps[],
): boolean {
  const key = buildRegistriesKey(registries);
  const hash = computeContentHash(results);

  const changed = memoryCache?.contentHash !== hash;

  const entry: CacheEntry = {
    registriesKey: key,
    results,
    timestamp: Date.now(),
    contentHash: hash,
  };

  memoryCache = entry;
  writeToStorage(entry);

  return changed;
}

/**
 * Invalidate the cache entirely. The next call to `getMarketplaceCache` will
 * return `null`, forcing a fresh fetch.
 */
export function invalidateMarketplaceCache(): void {
  memoryCache = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Touch the cache timestamp without changing the data. Useful after a
 * background refresh confirms the data hasn't changed (resets the TTL
 * without triggering a re-render).
 */
export function touchMarketplaceCache(): void {
  if (memoryCache) {
    memoryCache.timestamp = Date.now();
    writeToStorage(memoryCache);
  }
}
