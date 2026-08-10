import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import {
  buildSsoHash,
  buildAppUrl,
  appTabName,
  openAppInNewTab,
  PopupBlockedError,
  MixedContentError,
} from '../utils/openApp';

const ACCESS_TOKEN = 'header.payload.signature';

// vitest hoists vi.mock above the imports, so declaring it after them is safe
// and keeps eslint's import/first rule satisfied.
vi.mock('@calimero-network/calimero-client', () => ({
  getAccessToken: () => ACCESS_TOKEN,
}));

/** Point `window.location` at a node-served dashboard URL. */
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

describe('buildSsoHash', () => {
  beforeEach(() => {
    setLocation('http://localhost:2528/admin-dashboard/applications');
    sessionStorage.clear();
  });

  it('carries node_url and the access token', () => {
    const params = new URLSearchParams(buildSsoHash());
    expect(params.get('node_url')).toBe('http://localhost:2528');
    expect(params.get('access_token')).toBe(ACCESS_TOKEN);
  });

  /**
   * The load-bearing assertion of this whole feature. Refresh tokens are
   * single-use (core#3083): if an app tab rotated ours, the node would read our
   * next refresh as token_reuse and revoke the entire family, logging the user
   * out of the dashboard AND every other app. The desktop avoids this with an
   * IPC broker; a cross-origin browser tab cannot be brokered, so the refresh
   * token must never leave this origin.
   */
  it('NEVER sends a refresh_token', () => {
    const params = new URLSearchParams(
      buildSsoHash({ applicationId: 'app-1' }),
    );
    expect(params.has('refresh_token')).toBe(false);
    expect(buildSsoHash()).not.toContain('refresh_token');
  });

  it('sends the application id under both contract keys', () => {
    // mero-js >= 7 reads `application_id`; calimero-client and mero-js 2.x read
    // `app-id`. Sending both keeps every app generation working.
    const params = new URLSearchParams(
      buildSsoHash({ applicationId: 'app-42' }),
    );
    expect(params.get('application_id')).toBe('app-42');
    expect(params.get('app-id')).toBe('app-42');
  });

  it('includes context and executor when provided', () => {
    const params = new URLSearchParams(
      buildSsoHash({ contextId: 'ctx-1', executorPublicKey: 'exec-1' }),
    );
    expect(params.get('context_id')).toBe('ctx-1');
    expect(params.get('executor_public_key')).toBe('exec-1');
  });

  it('only sets dev_mode when developer mode is on', () => {
    expect(new URLSearchParams(buildSsoHash({})).has('dev_mode')).toBe(false);
    expect(
      new URLSearchParams(buildSsoHash({ devMode: true })).get('dev_mode'),
    ).toBe('1');
  });

  it('derives node_url through a NODE_PATH_PREFIX', () => {
    // Production build: the serving origin (plus NODE_PATH_PREFIX) is the node.
    // Under vitest import.meta.env.DEV is true, which takes the dev branch, so
    // stub it — see src/test/nodeUrl.test.ts for why mode, not path, decides.
    vi.stubEnv('DEV', false);
    setLocation('https://host.example/node-a/admin-dashboard/dashboard');
    expect(new URLSearchParams(buildSsoHash()).get('node_url')).toBe(
      'https://host.example/node-a',
    );
    vi.unstubAllEnvs();
  });
});

describe('buildAppUrl', () => {
  beforeEach(() => {
    setLocation('http://localhost:2528/admin-dashboard/applications');
  });

  it('cache-busts in the query and keeps auth in the hash', () => {
    const url = new URL(buildAppUrl('https://app.example/', {}, 1234));
    expect(url.searchParams.get('_cb')).toBe('1234');
    // The SSO bundle must be in the fragment: a query string would be sent to
    // the app's server and land in its access logs.
    expect(url.hash).toContain('access_token=');
    expect(url.search).not.toContain('access_token');
  });

  it('preserves query params already on the frontend URL', () => {
    const url = new URL(buildAppUrl('https://app.example/?theme=dark', {}, 1));
    expect(url.searchParams.get('theme')).toBe('dark');
    expect(url.searchParams.get('_cb')).toBe('1');
  });

  it('still attaches the hash when the URL is unparseable', () => {
    const out = buildAppUrl('not a url', { applicationId: 'a' }, 1);
    expect(out).toContain('#');
    expect(out).toContain('application_id=a');
  });
});

describe('appTabName', () => {
  it('is stable per application so re-opening refocuses one tab', () => {
    expect(appTabName('abc123')).toBe('app-abc123');
    expect(appTabName('abc123')).toBe(appTabName('abc123'));
  });

  it('strips characters that could craft window features', () => {
    expect(appTabName('a/b:c_d e')).toBe('app-a-b-c-d-e');
  });

  it('falls back to _blank without an id', () => {
    expect(appTabName()).toBe('_blank');
  });
});

describe('openAppInNewTab', () => {
  const originalOpen = window.open;

  beforeEach(() => {
    setLocation('http://localhost:2528/admin-dashboard/applications');
  });

  afterEach(() => {
    window.open = originalOpen;
  });

  it('opens about:blank first, then navigates', () => {
    // Opening about:blank synchronously is what preserves the user-activation;
    // navigating afterwards is what avoids a popup block.
    const replace = vi.fn();
    const fakeTab = { location: { replace }, opener: {} } as unknown as Window;
    const open = vi.fn().mockReturnValue(fakeTab);
    window.open = open;

    openAppInNewTab('https://app.example/', { applicationId: 'app-9' });

    expect(open).toHaveBeenCalledWith('about:blank', 'app-app-9');
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0]?.[0]).toContain('https://app.example/');
  });

  it('never passes noopener to window.open', () => {
    // Regression guard. Per the HTML spec `noopener` in the feature string makes
    // window.open() return null, so we could never navigate the tab: the user
    // got a bogus "popup blocked" error next to an empty tab.
    const replace = vi.fn();
    window.open = vi.fn().mockReturnValue({
      location: { replace },
      opener: {},
    } as unknown as Window);

    openAppInNewTab('https://app.example/');

    const features = (window.open as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[2];
    expect(features).toBeUndefined();
  });

  it('severs window.opener before navigating', () => {
    // Must happen while the tab is still on about:blank — after a cross-origin
    // navigation the property is unreachable from here.
    const tab = { location: { replace: vi.fn() }, opener: {} } as unknown as {
      opener: unknown;
    };
    window.open = vi.fn().mockReturnValue(tab as unknown as Window);

    openAppInNewTab('https://app.example/');

    expect(tab.opener).toBeNull();
  });

  it('throws PopupBlockedError when the browser refuses', () => {
    window.open = vi.fn().mockReturnValue(null);
    expect(() => openAppInNewTab('https://app.example/')).toThrow(
      PopupBlockedError,
    );
  });

  it('refuses an http app frontend from an https dashboard', () => {
    setLocation('https://node.example/admin-dashboard/applications');
    const open = vi.fn();
    window.open = open;
    expect(() => openAppInNewTab('http://app.example/')).toThrow(
      MixedContentError,
    );
    // No blank tab should be left behind.
    expect(open).not.toHaveBeenCalled();
  });

  it('allows an https app frontend from an https dashboard', () => {
    setLocation('https://node.example/admin-dashboard/applications');
    const replace = vi.fn();
    window.open = vi
      .fn()
      .mockReturnValue({ location: { replace } } as unknown as Window);
    expect(() => openAppInNewTab('https://app.example/')).not.toThrow();
    expect(replace).toHaveBeenCalled();
  });
});
