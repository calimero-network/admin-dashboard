/**
 * Single-node binding.
 *
 * This dashboard is not a standalone site: core bakes
 * `admin-dashboard-build.zip` into merod at build time
 * (core/crates/server/build.rs) and serves it at
 * `{NODE_PATH_PREFIX}/admin-dashboard/` (core/crates/server/src/admin/service.rs).
 *
 * So the node we administer is *the origin that served us*. There is exactly
 * one, it can never change at runtime, and asking the user to type a node URL
 * is both redundant and a way to get into a broken state. That is why there is
 * no node picker and no multi-node UI anywhere in this app — unlike Calimero
 * Desktop, which owns local merod processes and can legitimately have several.
 *
 * The dev override exists because `pnpm dev` serves us from :5173 while the node
 * is on :2528. It is deliberately explicit (query param or build-time env) so it
 * cannot silently apply in a real deployment.
 */

const DEV_OVERRIDE_KEY = 'calimero-admin-dev-node-url';
const MARKER = '/admin-dashboard';

/** True when the current path is one core serves this bundle from. */
function isNodeServed(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.includes(MARKER);
}

/**
 * An explicit, session-scoped override from `?nodeUrl=`. Highest precedence,
 * because the user asked for it directly.
 */
function readExplicitOverride(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const fromQuery = new URLSearchParams(window.location.search).get(
      'nodeUrl',
    );
    if (fromQuery) {
      sessionStorage.setItem(DEV_OVERRIDE_KEY, fromQuery);
      return fromQuery;
    }
    return sessionStorage.getItem(DEV_OVERRIDE_KEY);
  } catch {
    // sessionStorage can throw in hardened/private modes.
    return null;
  }
}

/**
 * `VITE_NODE_URL`, honoured ONLY in dev and ONLY when we are not node-served.
 *
 * The ordering matters: a stale `.env` must never outrank the origin we were
 * actually loaded from. It once did, and the effect was that every request —
 * and every SSO hash handed to an app — pointed at whatever port `.env`
 * happened to name rather than at the node serving the page.
 */
function readEnvFallback(): string | null {
  if (!import.meta.env.DEV) return null;
  if (isNodeServed()) return null;
  const fromEnv = import.meta.env['VITE_NODE_URL'] as string | undefined;
  return fromEnv && fromEnv.trim() ? fromEnv : null;
}

/**
 * The base URL of the node this dashboard administers, without a trailing
 * slash. Append `/admin-api/...` to reach the admin API.
 *
 * Precedence: explicit `?nodeUrl=` > the serving origin > dev `VITE_NODE_URL`.
 */
export function getNodeUrl(): string {
  const explicit = readExplicitOverride();
  if (explicit) return explicit.replace(/\/+$/, '');

  if (typeof window === 'undefined') return '';

  if (isNodeServed()) {
    const { origin, pathname } = window.location;
    // Honour NODE_PATH_PREFIX: when set, core serves us from
    // `{prefix}/admin-dashboard/` and the admin API lives at
    // `{prefix}/admin-api`.
    const i = pathname.indexOf(MARKER);
    const prefix = i > 0 ? pathname.slice(0, i) : '';
    return `${origin}${prefix}`.replace(/\/+$/, '');
  }

  const env = readEnvFallback();
  if (env) return env.replace(/\/+$/, '');

  return window.location.origin.replace(/\/+$/, '');
}

/** The admin API base, e.g. `http://localhost:2528/admin-api`. */
export function getAdminApiUrl(): string {
  return `${getNodeUrl()}/admin-api`;
}

/** True when the dashboard is pointed at a node other than its own origin. */
export function isDevOverrideActive(): boolean {
  return readExplicitOverride() !== null || readEnvFallback() !== null;
}

/**
 * True when we are served over https but the given URL is http. Browsers block
 * such a navigation as mixed content, so callers should surface a real error
 * instead of opening a tab that dies silently.
 */
export function isMixedContent(targetUrl: string): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.protocol !== 'https:') return false;
  try {
    return new URL(targetUrl).protocol === 'http:';
  } catch {
    return false;
  }
}
