import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
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

  it('still honours an explicit ?nodeUrl=', () => {
    setLocation(
      'http://localhost:2528/admin-dashboard/?nodeUrl=http://other:2529',
    );
    expect(getNodeUrl()).toBe('http://other:2529');
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
