import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  clearNodeUrlOverride,
  getNodeUrl,
  getAdminApiUrl,
  isDevOverrideActive,
  isMixedContent,
} from '../utils/nodeUrl';

function setLocation(href: string) {
  const url = new URL(href);
  Object.defineProperty(window, 'location', {
    writable: true,
    configurable: true,
    value: {
      href: url.href,
      origin: url.origin,
      pathname: url.pathname,
      search: url.search,
      protocol: url.protocol,
    },
  });
}

/** Swap in a history whose replaceState updates the stubbed location. */
function stubHistory() {
  Object.defineProperty(window, 'history', {
    writable: true,
    configurable: true,
    value: {
      replaceState: (_s: unknown, _t: string, href: string) =>
        setLocation(new URL(href, window.location.href).href),
    },
  });
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * Production: the serving origin is authoritative, because core bakes this
 * bundle into merod and serves it at `{NODE_PATH_PREFIX}/admin-dashboard/`.
 * `VITE_NODE_URL` is ignored entirely here, so a stale `.env` can never
 * redirect a deployed dashboard's API calls or the SSO hash it hands to apps.
 */
describe('getNodeUrl (production build)', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', false);
  });

  it('is the origin that served the dashboard', () => {
    setLocation('http://localhost:2528/admin-dashboard/dashboard');
    expect(getNodeUrl()).toBe('http://localhost:2528');
  });

  it('handles the bare /admin-dashboard/ root', () => {
    setLocation('http://localhost:2528/admin-dashboard/');
    expect(getNodeUrl()).toBe('http://localhost:2528');
  });

  it('preserves a NODE_PATH_PREFIX', () => {
    setLocation('https://gateway.example/node-a/admin-dashboard/applications');
    expect(getNodeUrl()).toBe('https://gateway.example/node-a');
    expect(getAdminApiUrl()).toBe('https://gateway.example/node-a/admin-api');
  });

  it('handles a multi-segment prefix', () => {
    setLocation('https://x.example/a/b/c/admin-dashboard/dashboard');
    expect(getNodeUrl()).toBe('https://x.example/a/b/c');
  });

  it('never leaves a trailing slash', () => {
    setLocation('http://localhost:2528/admin-dashboard/');
    expect(getNodeUrl().endsWith('/')).toBe(false);
    expect(getAdminApiUrl()).toBe('http://localhost:2528/admin-api');
  });

  it('ignores VITE_NODE_URL', () => {
    setLocation('http://localhost:2528/admin-dashboard/');
    expect(getNodeUrl()).toBe('http://localhost:2528');
    expect(isDevOverrideActive()).toBe(false);
  });

  it('still honours an explicit ?nodeUrl= pointing at loopback', () => {
    setLocation(
      'http://localhost:2528/admin-dashboard/?nodeUrl=http://localhost:2529',
    );
    expect(getNodeUrl()).toBe('http://localhost:2529');
  });

  // A production bundle is only ever served by a real node, so a `?nodeUrl=`
  // here arrived in a link someone clicked. Honouring it would aim the admin API
  // — and the access token in the SSO hash handed to opened apps — at whatever
  // origin the link named.
  it('refuses a ?nodeUrl= pointing off-box', () => {
    setLocation(
      'https://real-node.example/admin-dashboard/?nodeUrl=https://evil.example',
    );
    expect(getNodeUrl()).toBe('https://real-node.example');
    expect(isDevOverrideActive()).toBe(false);
  });

  it('does not keep serving a rejected override from sessionStorage', () => {
    setLocation(
      'https://real-node.example/admin-dashboard/?nodeUrl=https://evil.example',
    );
    expect(getNodeUrl()).toBe('https://real-node.example');

    setLocation('https://real-node.example/admin-dashboard/applications');
    expect(getNodeUrl()).toBe('https://real-node.example');
  });

  // A loopback override captured while `pnpm dev` was running must not leak into
  // a production bundle later loaded in the same tab, either — it only survives
  // because loopback is allowed outright.
  it('re-checks the stored override on every read', () => {
    sessionStorage.setItem(
      'calimero-admin-dev-node-url',
      'https://evil.example',
    );
    setLocation('https://real-node.example/admin-dashboard/');
    expect(getNodeUrl()).toBe('https://real-node.example');
  });
});

/**
 * Dev: `base: '/admin-dashboard/'` means the DEV SERVER also serves from
 * /admin-dashboard/, so the path cannot tell dev from node-served — only the
 * build mode can. A path-based check made `pnpm dev` treat localhost:5173 as the
 * node and point every admin-API call at the dev server.
 */
describe('getNodeUrl (dev server)', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', true);
  });

  it('uses VITE_NODE_URL even on the /admin-dashboard/ path', () => {
    setLocation('http://localhost:5173/admin-dashboard/dashboard');
    expect(getNodeUrl()).toBe('http://localhost:2528');
    expect(isDevOverrideActive()).toBe(true);
  });

  it('lets an explicit ?nodeUrl= outrank VITE_NODE_URL', () => {
    setLocation(
      'http://localhost:5173/admin-dashboard/?nodeUrl=http://localhost:2529',
    );
    expect(getNodeUrl()).toBe('http://localhost:2529');
  });

  it('?nodeUrl= persists for the session', () => {
    setLocation(
      'http://localhost:5173/admin-dashboard/?nodeUrl=http://localhost:2529',
    );
    expect(getNodeUrl()).toBe('http://localhost:2529');

    // Survives client-side navigation that drops the query string.
    setLocation('http://localhost:5173/admin-dashboard/applications');
    expect(getNodeUrl()).toBe('http://localhost:2529');
  });

  it('strips a trailing slash from the override', () => {
    setLocation(
      'http://localhost:5173/admin-dashboard/?nodeUrl=http://localhost:2529/',
    );
    expect(getNodeUrl()).toBe('http://localhost:2529');
  });
});

describe('isMixedContent', () => {
  it('flags http targets from an https page', () => {
    setLocation('https://node.example/admin-dashboard/');
    expect(isMixedContent('http://app.example/')).toBe(true);
    expect(isMixedContent('https://app.example/')).toBe(false);
  });

  it('allows anything from an http page', () => {
    setLocation('http://localhost:2528/admin-dashboard/');
    expect(isMixedContent('http://app.example/')).toBe(false);
    expect(isMixedContent('https://app.example/')).toBe(false);
  });

  it('does not flag an unparseable URL', () => {
    setLocation('https://node.example/admin-dashboard/');
    expect(isMixedContent('not a url')).toBe(false);
  });
});

describe('clearNodeUrlOverride', () => {
  // The bug this exists for: "Clear session" cleared tokens and ids but not the
  // node override, so a dashboard once pointed at another node stayed pointed
  // at it for the rest of the browser session with no way back.
  //
  // Asserted in a PRODUCTION build so the serving origin is the thing the
  // override has to give way to. In a dev build `VITE_NODE_URL` from .env is a
  // legitimate fallback and would muddy what is being tested.
  beforeEach(() => {
    vi.stubEnv('DEV', false);
    stubHistory();
  });

  it('forgets a stored override so the serving origin wins again', () => {
    setLocation(
      'http://localhost:2528/admin-dashboard/?nodeUrl=http://localhost:2529',
    );
    expect(getNodeUrl()).toBe('http://localhost:2529');

    clearNodeUrlOverride();

    expect(isDevOverrideActive()).toBe(false);
    expect(getNodeUrl()).toBe('http://localhost:2528');
  });

  it('strips ?nodeUrl= from the address bar, not just storage', () => {
    // ⚠️ THE HALF-FIX FAILS HERE. readExplicitOverride reads the query FIRST
    // and re-persists it, so clearing sessionStorage alone re-pins on the very
    // next call and the reset looks like it did nothing at all.
    setLocation(
      'http://localhost:2528/admin-dashboard/?nodeUrl=http://localhost:2529',
    );
    getNodeUrl();

    clearNodeUrlOverride();

    expect(window.location.search).not.toContain('nodeUrl');
    expect(getNodeUrl()).toBe('http://localhost:2528');
  });

  it('is a no-op when nothing was overridden', () => {
    setLocation('http://localhost:2528/admin-dashboard/');
    expect(() => clearNodeUrlOverride()).not.toThrow();
    expect(getNodeUrl()).toBe('http://localhost:2528');
  });
});
