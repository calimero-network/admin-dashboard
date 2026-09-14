/**
 * Formatting for application cards, shared by the Marketplace listing, the
 * application detail page and the installed-apps grid.
 *
 * Ported from app-registry's `packages/frontend/src/lib/utils.ts` so the three
 * surfaces that show the same bundles describe them with the same words. Keep
 * them in step.
 *
 * ⚠️ EVERY ONE OF THESE RETURNS `null` RATHER THAN A PLACEHOLDER. The values
 * they format are legitimately absent in production data — measured against the
 * live registry, `installSize` is null for **21 of 21** bundles and
 * `publishedAt` for 20 of 21 — so a formatter that invents `0 bytes` or
 * `Invalid Date` would be confidently wrong on almost every card. Returning null
 * lets the caller omit the row instead.
 */

export { resolveCategory } from './registry';

/** `204472` -> `"200 KB"`. Null for an unknown size. */
export function formatBytes(bytes?: number | null): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
    return null;
  }
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // One decimal below 10 ("1.2 MB"), none above ("200 KB") — the extra digit is
  // noise at three figures and makes card rows ragged.
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** ISO timestamp -> `"2 days ago"`. Null for a missing or unparseable date. */
export function formatRelativeDate(iso?: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;

  const seconds = Math.round((Date.now() - then) / 1000);
  // Clock skew or a just-written timestamp can land microseconds in the future;
  // "in 0 seconds" is worse than "just now".
  if (seconds < 60) return 'just now';

  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'minute'],
    [24, 'hour'],
    [7, 'day'],
    [4.345, 'week'],
    [12, 'month'],
    [Number.POSITIVE_INFINITY, 'year'],
  ];
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  let value = seconds / 60;
  for (const [divisor, unit] of steps) {
    if (Math.abs(value) < divisor) return rtf.format(-Math.round(value), unit);
    value /= divisor;
  }
  return rtf.format(-Math.round(value), 'year');
}

/** Human label for a category slug: `art-design` -> `Art & Design`. */
export function formatCategory(category?: string | null): string | null {
  if (!category) return null;
  if (category === 'art-design') return 'Art & Design';
  if (category === 'developer-tools') return 'Developer Tools';
  return category
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * A stable hue for an app with no icon, derived from its package id so the same
 * app gets the same tint on every render and every machine rather than
 * flickering between reloads.
 */
export function fallbackHue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

/** Middle-truncate a long public key for a card byline. */
export function shortenKey(key?: string | null): string | null {
  if (!key || key === 'unknown') return null;
  return key.length > 14 ? `${key.slice(0, 6)}…${key.slice(-4)}` : key;
}
