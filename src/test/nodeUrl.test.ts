import { describe, it, expect, beforeEach } from 'vitest';
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

describe('getNodeUrl', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('is the origin that served the dashboard', () => {
    setLocation('http://localhost:2528/admin-dashboard/dashboard');
    expect(getNodeUrl()).toBe('http://localhost:2528');
  });

  it('handles the bare /admin-dashboard/ root', () => {
    setLocation('http://localhost:2528/admin-dashboard/');
    expect(getNodeUrl()).toBe('http://localhost:2528');
  });

  /**
   * Core serves the dashboard at `{NODE_PATH_PREFIX}/admin-dashboard/` when the
   * env var is set (core/crates/server/src/admin/service.rs), and the admin API
   * moves under the same prefix. Dropping it would send every request to the
   * wrong path behind a reverse proxy.
   */
  it('preserves a NODE_PATH_PREFIX', () => {
    setLocation('https://gateway.example/node-a/admin-dashboard/applications');
    expect(getNodeUrl()).toBe('https://gateway.example/node-a');
    expect(getAdminApiUrl()).toBe('https://gateway.example/node-a/admin-api');
  });

  it('handles a multi-segment prefix', () => {
    setLocation('https://x.example/a/b/c/admin-dashboard/dashboard');
    expect(getNodeUrl()).toBe('https://x.example/a/b/c');
  });

  it('uses the dev VITE_NODE_URL only when NOT node-served', () => {
    // At the vite dev-server root there is no node behind the origin, so the
    // env fallback is the only usable value.
    setLocation('http://localhost:5173/');
    expect(getNodeUrl()).toBe('http://localhost:2528');
    expect(isDevOverrideActive()).toBe(true);
  });

  it('lets the serving origin outrank a stale VITE_NODE_URL', () => {
    // Regression guard: the env var used to win unconditionally in dev, which
    // pointed every admin-API call — and every SSO hash handed to an app — at
    // whatever port .env named instead of the node serving the page.
    setLocation('http://localhost:2999/admin-dashboard/dashboard');
    expect(getNodeUrl()).toBe('http://localhost:2999');
    expect(isDevOverrideActive()).toBe(false);
  });

  it('never leaves a trailing slash', () => {
    setLocation('http://localhost:2528/admin-dashboard/');
    expect(getNodeUrl().endsWith('/')).toBe(false);
    expect(getAdminApiUrl()).toBe('http://localhost:2528/admin-api');
  });
});

describe('dev override', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('is inactive by default', () => {
    setLocation('http://localhost:2528/admin-dashboard/dashboard');
    expect(isDevOverrideActive()).toBe(false);
  });

  it('?nodeUrl= wins and persists for the session', () => {
    setLocation(
      'http://localhost:5173/admin-dashboard/?nodeUrl=http://localhost:2528',
    );
    expect(getNodeUrl()).toBe('http://localhost:2528');
    expect(isDevOverrideActive()).toBe(true);

    // Survives client-side navigation that drops the query string.
    setLocation('http://localhost:5173/admin-dashboard/applications');
    expect(getNodeUrl()).toBe('http://localhost:2528');
  });

  it('strips a trailing slash from the override', () => {
    setLocation(
      'http://localhost:5173/admin-dashboard/?nodeUrl=http://localhost:2528/',
    );
    expect(getNodeUrl()).toBe('http://localhost:2528');
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
