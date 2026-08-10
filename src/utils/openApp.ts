/**
 * Open an installed application's frontend in a new browser tab, handing it an
 * SSO bundle in the URL hash.
 *
 * This is the web counterpart of the desktop's `openAppFrontend`
 * (tauri-app/apps/desktop/src/utils/appUtils.ts). The desktop opens a Tauri
 * window (or a native per-app launcher); we can only open a tab. The auth
 * hand-off is the same URL-hash contract, with one deliberate difference
 * documented under "Why no refresh_token" below.
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

export class MixedContentError extends Error {
  constructor(url: string) {
    super(
      `Cannot open ${url}: this dashboard is served over HTTPS and the app frontend is HTTP, ` +
        'which the browser blocks as mixed content.',
    );
    this.name = 'MixedContentError';
  }
}

/**
 * Build the SSO hash fragment handed to an app frontend.
 *
 * Why no `refresh_token`
 * ---------------------
 * Refresh tokens are single-use since core 0.11.0 (calimero-network/core#3083):
 * each POST /auth/refresh consumes the presented token, and re-presenting a
 * consumed one is treated as theft — the node revokes the whole token family and
 * every holder is logged out. The desktop works around this with a token broker:
 * it keeps the only real refresh token and serves app windows' refreshes over
 * Tauri IPC, handing them a sentinel value instead.
 *
 * A browser tab on a different origin cannot be brokered — we cannot intercept
 * its fetch. So we hand over the ACCESS token only. mero-react is built for
 * exactly this: `resolveTokenAdoption` merges rather than replaces precisely
 * because "hosts are dropping refresh_token from the SSO hash"
 * (mero-react/src/auth/token-adoption.ts). The app tab runs on the access token
 * until it expires and then falls back to its own login against the node.
 *
 * Both `application_id` and `app-id` are sent: mero-js >= 7 reads
 * `application_id` (mero-js/src/auth/index.ts), while calimero-client and
 * mero-js 2.x read `app-id`. An app that only knows one key ignores the other.
 */
export function buildSsoHash(opts: OpenAppOptions = {}): string {
  const params = new URLSearchParams();
  params.set('node_url', getNodeUrl());

  const accessToken = getAccessToken();
  if (accessToken) params.set('access_token', accessToken);

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
  opts: OpenAppOptions = {},
  now: number = Date.now(),
): string {
  const hash = buildSsoHash(opts);
  try {
    const u = new URL(frontendUrl);
    u.searchParams.set('_cb', String(now));
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
export function openAppInNewTab(
  frontendUrl: string,
  opts: OpenAppOptions = {},
): Window {
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

  // `replace` so the app is not reachable by pressing Back to about:blank.
  tab.location.replace(buildAppUrl(frontendUrl, opts));
  return tab;
}

/**
 * Open an arbitrary external URL (registry, docs) in a new tab.
 *
 * `noopener` is safe here — unlike openAppInNewTab we never need the returned
 * handle, so the null return value the flag forces costs us nothing.
 */
export function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}
