/**
 * Open an installed application's frontend in a new browser tab, handing it an
 * SSO bundle in the URL hash.
 *
 * This is the web counterpart of the desktop's `openAppFrontend`
 * (tauri-app/apps/desktop/src/utils/appUtils.ts). The desktop opens a Tauri
 * window (or a native per-app launcher); we can only open a tab. The auth
 * hand-off is the same URL-hash contract.
 */
import { getAccessToken } from '@calimero-network/calimero-client';
import { getNodeUrl, isMixedContent } from './nodeUrl';

export interface OpenAppOptions {
  /** Node-assigned application id. Used for the tab name and the SSO hash. */
  applicationId?: string;
  contextId?: string;
  executorPublicKey?: string;
  /** Forwarded as `dev_mode=1` so apps can surface advanced diagnostics. */
  devMode?: boolean;
}

export class PopupBlockedError extends Error {
  constructor() {
    super(
      'The browser blocked the new tab. Allow pop-ups for this node, then try again.',
    );
    this.name = 'PopupBlockedError';
  }
}

export class UnsafeUrlError extends Error {
  constructor(url: string) {
    super(
      `Refusing to open ${url}: app frontends must be served over HTTPS (or HTTP on localhost), and links must be http(s).`,
    );
    this.name = 'UnsafeUrlError';
  }
}

export function isSafeWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

export function isAllowedAppFrontendUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol === 'https:') return u.hostname !== '';
  const loopback =
    u.hostname === 'localhost' ||
    u.hostname === '127.0.0.1' ||
    u.hostname === '[::1]';
  return u.protocol === 'http:' && loopback;
}

export class MixedContentError extends Error {
  constructor(url: string) {
    super(
      `Cannot open ${url}: this dashboard is served over HTTPS and the app frontend is HTTP, ` +
        'which the browser blocks as mixed content.',
    );
    this.name = 'MixedContentError';
  }
}

export const APP_TOKEN_PERMISSIONS: readonly string[] = [
  'context:create',
  'context:list',
  'context:execute',
  'context:subscribe',
  'application:list',
  'namespace',
  'group',
  'blob:add',
  'blob:get',
  'blob:remove',
  'context:alias',
];

export const APP_TOKEN_TTL_SECS = 24 * 60 * 60;

export const APPROVED_APP_ORIGINS_KEY = 'approved-app-origins';

export function appFrontendOrigin(url: string): string | null {
  try {
    const { origin } = new URL(url);
    return origin && origin !== 'null' ? origin : null;
  } catch {
    return null;
  }
}

function readApprovedOrigins(): Record<string, string> {
  try {
    const raw = localStorage.getItem(APPROVED_APP_ORIGINS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

export function isAppOriginApproved(
  applicationId: string,
  origin: string,
): boolean {
  return readApprovedOrigins()[applicationId] === origin;
}

export function approveAppOrigin(applicationId: string, origin: string): void {
  try {
    const all = readApprovedOrigins();
    all[applicationId] = origin;
    localStorage.setItem(APPROVED_APP_ORIGINS_KEY, JSON.stringify(all));
  } catch {
    return;
  }
}

export interface AppTokens {
  access_token: string;
  refresh_token: string;
}

export class AppTokenError extends Error {
  constructor(detail: string) {
    super(`Could not create a session for this app: ${detail}`);
    this.name = 'AppTokenError';
  }
}

export async function mintAppTokens(
  opts: OpenAppOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<AppTokens> {
  const adminToken = getAccessToken();
  if (!adminToken) throw new AppTokenError('not logged in');

  const body: Record<string, unknown> = {
    permissions: [...APP_TOKEN_PERMISSIONS],
    ttl_secs: APP_TOKEN_TTL_SECS,
  };
  if (opts.contextId && opts.executorPublicKey) {
    body['context_id'] = opts.contextId;
    body['context_identity'] = opts.executorPublicKey;
  }

  let res: Response;
  try {
    res = await fetchImpl(`${getNodeUrl()}/admin/client-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new AppTokenError(e instanceof Error ? e.message : 'network error');
  }

  const json = (await res.json().catch(() => null)) as {
    data?: Partial<AppTokens> | null;
    error?: string | { message?: string } | null;
  } | null;
  const tokens = json?.data;
  if (!res.ok || !tokens?.access_token || !tokens.refresh_token) {
    const err = json?.error;
    const detail =
      (typeof err === 'string' ? err : err?.message) || `HTTP ${res.status}`;
    throw new AppTokenError(detail);
  }
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  };
}

export function buildSsoHash(
  tokens: AppTokens,
  opts: OpenAppOptions = {},
): string {
  const params = new URLSearchParams();
  params.set('node_url', getNodeUrl());
  params.set('access_token', tokens.access_token);
  params.set('refresh_token', tokens.refresh_token);

  if (opts.applicationId) {
    params.set('application_id', opts.applicationId);
    params.set('app-id', opts.applicationId);
  }
  if (opts.contextId) params.set('context_id', opts.contextId);
  if (opts.executorPublicKey) {
    params.set('executor_public_key', opts.executorPublicKey);
  }
  if (opts.devMode) params.set('dev_mode', '1');

  return params.toString();
}

/**
 * Compose the full URL an app tab should navigate to: cache-busted document URL
 * plus the SSO hash.
 *
 * The `_cb` query param mirrors the desktop: without it a webview/tab can serve
 * a stale cached index.html pointing at an old bundle. It goes in the query, not
 * the hash, so it never disturbs the SSO fragment.
 */
export function buildAppUrl(
  frontendUrl: string,
  tokens: AppTokens,
  opts: OpenAppOptions = {},
  now: number = Date.now(),
): string {
  const hash = buildSsoHash(tokens, opts);
  try {
    const u = new URL(frontendUrl);
    u.searchParams.set('_cb', String(now));
    // Drop any fragment the frontend URL carried. A hash-routed app
    // (`https://app.example/#/dashboard`) would otherwise yield two `#`, and
    // since only the first delimits the fragment the SSO params would land
    // inside the app's route string — the receiving parser looks for
    // `key=value&…` and finds none, so the hand-off silently fails. Losing the
    // deep link is the lesser cost: the app strips this fragment once it has
    // adopted the tokens anyway.
    u.hash = '';
    return `${u.toString()}#${hash}`;
  } catch {
    // Non-absolute or unparseable frontend URL — append naively rather than
    // dropping the SSO bundle entirely.
    return `${frontendUrl}#${hash}`;
  }
}

/**
 * Stable tab name per application, so re-clicking "Open" refocuses the existing
 * tab instead of piling up duplicates — the web analogue of the desktop's
 * stable `app-<applicationId>` window label. Restricted to [A-Za-z0-9-] so a
 * crafted id cannot inject window-feature syntax.
 */
export function appTabName(applicationId?: string): string {
  if (!applicationId) return '_blank';
  return `app-${applicationId.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 60)}`;
}

/**
 * Open an app frontend in a new tab.
 *
 * IMPORTANT: this must be called synchronously from a user gesture (a click
 * handler). Any `await` before `window.open` costs us the user-activation and
 * the browser blocks the tab. The desktop version awaits a token warm-up first;
 * doing that here would break every "Open" button, so instead we open
 * `about:blank` immediately and only then navigate it.
 *
 * @throws {MixedContentError} https dashboard -> http app frontend
 * @throws {PopupBlockedError} the browser refused the tab
 */
export async function openAppInNewTab(
  frontendUrl: string,
  opts: OpenAppOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<Window> {
  if (!isAllowedAppFrontendUrl(frontendUrl)) {
    throw new UnsafeUrlError(frontendUrl);
  }
  if (isMixedContent(frontendUrl)) {
    throw new MixedContentError(frontendUrl);
  }

  // Do NOT put `noopener` in the feature string. Per the HTML spec, `noopener`
  // makes window.open() return null — which would leave us holding no handle,
  // unable to navigate the tab, reporting a bogus "popup blocked" error, and
  // leaving a blank tab behind. We still need the handle because the URL is only
  // known after the tab exists (opening about:blank first is what preserves the
  // user-activation).
  const tab = window.open('about:blank', appTabName(opts.applicationId));
  if (!tab) throw new PopupBlockedError();

  // Sever the opener manually instead. This must happen while the tab is still
  // on about:blank: once it navigates cross-origin the property is no longer
  // reachable from here. Without it the app tab keeps a `window.opener` handle
  // back into this admin origin.
  try {
    tab.opener = null;
  } catch {
    // Some engines make `opener` read-only; the tab is still sandboxed by the
    // usual cross-origin rules, so continue rather than refusing to open.
  }

  let tokens: AppTokens;
  try {
    tokens = await mintAppTokens(opts, fetchImpl);
  } catch (e) {
    tab.close();
    throw e;
  }

  // `replace` so the app is not reachable by pressing Back to about:blank.
  tab.location.replace(buildAppUrl(frontendUrl, tokens, opts));
  return tab;
}

/**
 * Open an arbitrary external URL (registry, docs) in a new tab.
 *
 * `noopener` is safe here — unlike openAppInNewTab we never need the returned
 * handle, so the null return value the flag forces costs us nothing.
 */
export function openExternal(url: string): void {
  if (!isSafeWebUrl(url)) throw new UnsafeUrlError(url);
  window.open(url, '_blank', 'noopener,noreferrer');
}
