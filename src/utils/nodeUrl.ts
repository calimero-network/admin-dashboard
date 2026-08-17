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
 * cannot silently apply in a real deployment: the env fallback is dev-only, and
 * the query param is restricted to loopback targets once the bundle is
 * node-served — see `isAllowedOverride()`.
 */

const DEV_OVERRIDE_KEY = 'calimero-admin-dev-node-url';
const MARKER = '/admin-dashboard';

/**
 * Are we being served by a node, or by the vite dev server?
 *
 * This is NOT decidable from the path: `base: '/admin-dashboard/'` means the dev
 * server also serves us from `/admin-dashboard/`, so a path check would make
 * `pnpm dev` treat localhost:5173 as the node and send every admin-API call to
 * the dev server. The build mode is the only reliable discriminator — a
 * production bundle is only ever served by a node (or by `vite preview`, which
 * deliberately stands in for one).
 */
function isNodeServed(): boolean {
  return !import.meta.env.DEV;
}

/** Loopback hosts — the only override targets a production build will accept. */
function isLoopback(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '[::1]' ||
      hostname.endsWith('.localhost')
    );
  } catch {
    return false;
  }
}

/**
 * May this override apply?
 *
 * In a dev build, always: you ran `pnpm dev` yourself, there is no attacker in
 * that loop. In a production build there is — a production bundle is only ever
 * served by a real node, so an override there can only have arrived in a link
 * someone clicked. Since `getNodeUrl()` decides where the admin API lives AND
 * what `node_url`/`access_token` go into the SSO hash handed to opened apps
 * (openApp.ts), an unrestricted override turns one crafted link into token
 * exfiltration: `https://real-node/admin-dashboard/?nodeUrl=https://evil.example`
 * would aim every authenticated call at evil.example for the rest of the session.
 *
 * Loopback is the line that keeps the escape hatch useful and the attack inert.
 * It still covers every legitimate use — `pnpm dev` on :5173 against merod on
 * :2528, and the live e2e suite, which serves a production build through `vite
 * preview` and points it at a merod on localhost (e2e-live/fixtures/live.ts) —
 * while an attacker gains nothing by pointing a victim at their own machine.
 */
function isAllowedOverride(url: string): boolean {
  return !isNodeServed() || isLoopback(url);
}

/**
 * An explicit, session-scoped override from `?nodeUrl=`. Highest precedence,
 * because the user asked for it directly — but only where `isAllowedOverride()`
 * permits it.
 *
 * The stored value is re-checked on every read, not just when it is written: the
 * value outlives the query string that set it, and a bundle can be reloaded in
 * the same tab under different rules.
 */
function readExplicitOverride(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const fromQuery = new URLSearchParams(window.location.search).get(
      'nodeUrl',
    );
    if (fromQuery) {
      if (!isAllowedOverride(fromQuery)) return null;
      sessionStorage.setItem(DEV_OVERRIDE_KEY, fromQuery);
      return fromQuery;
    }
    const stored = sessionStorage.getItem(DEV_OVERRIDE_KEY);
    return stored && isAllowedOverride(stored) ? stored : null;
  } catch {
    // sessionStorage can throw in hardened/private modes.
    return null;
  }
}

/**
 * `VITE_NODE_URL`, honoured only in a dev build. In production the serving
 * origin is authoritative and this is ignored entirely, so a stale `.env` can
 * never redirect a deployed dashboard's admin-API calls or the SSO hash it hands
 * to applications.
 */
function readEnvFallback(): string | null {
  if (isNodeServed()) return null;
  const fromEnv = import.meta.env['VITE_NODE_URL'] as string | undefined;
  return fromEnv && fromEnv.trim() ? fromEnv : null;
}

/**
 * The base URL of the node this dashboard administers, without a trailing
 * slash. Append `/admin-api/...` to reach the admin API.
 *
 * Precedence: explicit `?nodeUrl=` (any target in dev, loopback only once
 * node-served) > the serving origin (production) > `VITE_NODE_URL` (dev only) >
 * the origin as a last resort.
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
