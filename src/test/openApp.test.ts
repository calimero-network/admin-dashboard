/* eslint-disable no-script-url */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import {
  buildSsoHash,
  buildAppUrl,
  appTabName,
  openAppInNewTab,
  openExternal,
  isSafeWebUrl,
  isAllowedAppFrontendUrl,
  mintAppTokens,
  APP_TOKEN_PERMISSIONS,
  appFrontendOrigin,
  isAppOriginApproved,
  approveAppOrigin,
  APPROVED_APP_ORIGINS_KEY,
  AppTokenError,
  PopupBlockedError,
  MixedContentError,
  UnsafeUrlError,
} from '../utils/openApp';

const ACCESS_TOKEN = 'header.payload.signature';
const TOKENS = { access_token: 'app.access', refresh_token: 'app.refresh' };

function mintFetch(
  status = 200,
  body: unknown = { data: TOKENS, error: null },
) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response);
}

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

  it('carries node_url and the app token pair', () => {
    const params = new URLSearchParams(buildSsoHash(TOKENS));
    expect(params.get('node_url')).toBe('http://localhost:2528');
    expect(params.get('access_token')).toBe(TOKENS.access_token);
    expect(params.get('refresh_token')).toBe(TOKENS.refresh_token);
  });

  it("NEVER carries the dashboard's own token", () => {
    expect(buildSsoHash(TOKENS, { applicationId: 'app-1' })).not.toContain(
      ACCESS_TOKEN,
    );
  });

  it('sends the application id under both contract keys', () => {
    // mero-js >= 7 reads `application_id`; calimero-client and mero-js 2.x read
    // `app-id`. Sending both keeps every app generation working.
    const params = new URLSearchParams(
      buildSsoHash(TOKENS, { applicationId: 'app-42' }),
    );
    expect(params.get('application_id')).toBe('app-42');
    expect(params.get('app-id')).toBe('app-42');
  });

  it('includes context and executor when provided', () => {
    const params = new URLSearchParams(
      buildSsoHash(TOKENS, { contextId: 'ctx-1', executorPublicKey: 'exec-1' }),
    );
    expect(params.get('context_id')).toBe('ctx-1');
    expect(params.get('executor_public_key')).toBe('exec-1');
  });

  it('only sets dev_mode when developer mode is on', () => {
    expect(new URLSearchParams(buildSsoHash(TOKENS, {})).has('dev_mode')).toBe(
      false,
    );
    expect(
      new URLSearchParams(buildSsoHash(TOKENS, { devMode: true })).get(
        'dev_mode',
      ),
    ).toBe('1');
  });

  it('derives node_url through a NODE_PATH_PREFIX', () => {
    // Production build: the serving origin (plus NODE_PATH_PREFIX) is the node.
    // Under vitest import.meta.env.DEV is true, which takes the dev branch, so
    // stub it — see src/test/nodeUrl.test.ts for why mode, not path, decides.
    vi.stubEnv('DEV', false);
    setLocation('https://host.example/node-a/admin-dashboard/dashboard');
    expect(new URLSearchParams(buildSsoHash(TOKENS)).get('node_url')).toBe(
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
    const url = new URL(buildAppUrl('https://app.example/', TOKENS, {}, 1234));
    expect(url.searchParams.get('_cb')).toBe('1234');
    // The SSO bundle must be in the fragment: a query string would be sent to
    // the app's server and land in its access logs.
    expect(url.hash).toContain('access_token=');
    expect(url.search).not.toContain('access_token');
  });

  it('preserves query params already on the frontend URL', () => {
    const url = new URL(
      buildAppUrl('https://app.example/?theme=dark', TOKENS, {}, 1),
    );
    expect(url.searchParams.get('theme')).toBe('dark');
    expect(url.searchParams.get('_cb')).toBe('1');
  });

  // A hash-routed frontend would otherwise produce two `#`. Only the first
  // delimits the fragment, so the SSO params would end up inside the app's route
  // string and its parser — which expects `key=value&…` — would find nothing.
  it('drops a fragment the frontend URL already carried', () => {
    const out = buildAppUrl('https://app.example/#/dashboard', TOKENS, {}, 1);
    expect(out.split('#').length).toBe(2);
    expect(out).not.toContain('#/dashboard');
    expect(new URL(out).hash).toContain('access_token=');
  });

  it('still attaches the hash when the URL is unparseable', () => {
    const out = buildAppUrl('not a url', TOKENS, { applicationId: 'a' }, 1);
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

describe('mintAppTokens', () => {
  beforeEach(() => {
    setLocation('http://localhost:2528/admin-dashboard/applications');
  });

  it('asks the node for a scoped client key, authorised by our token', async () => {
    const fetchImpl = mintFetch();
    await expect(mintAppTokens({}, fetchImpl)).resolves.toEqual(TOKENS);

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:2528/admin/client-key');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      `Bearer ${ACCESS_TOKEN}`,
    );
    const body = JSON.parse(init.body as string);
    expect(body.permissions).toEqual([...APP_TOKEN_PERMISSIONS]);
    expect(body.ttl_secs).toBeGreaterThan(0);
    expect(body).not.toHaveProperty('context_id');
  });

  it('requests exactly the grants an app session needs', () => {
    expect(new Set(APP_TOKEN_PERMISSIONS)).toEqual(
      new Set([
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
      ]),
    );
    expect(APP_TOKEN_PERMISSIONS).toHaveLength(11);
  });

  it('does not ask for the blob umbrella or node-wide blob listing', () => {
    expect(APP_TOKEN_PERMISSIONS).not.toContain('blob');
    expect(APP_TOKEN_PERMISSIONS).not.toContain('blob:list');
  });

  it('never asks for admin', () => {
    expect(APP_TOKEN_PERMISSIONS).not.toContain('admin');
    expect(APP_TOKEN_PERMISSIONS.some((p) => p.startsWith('admin'))).toBe(
      false,
    );
  });

  it('scopes to the context when opening one', async () => {
    const fetchImpl = mintFetch();
    await mintAppTokens(
      { contextId: 'ctx-1', executorPublicKey: 'exec-1' },
      fetchImpl,
    );
    const body = JSON.parse(
      (fetchImpl.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body.context_id).toBe('ctx-1');
    expect(body.context_identity).toBe('exec-1');
  });

  it('surfaces the node refusal', async () => {
    const fetchImpl = mintFetch(403, {
      data: null,
      error: 'Token does not have admin permissions',
    });
    await expect(mintAppTokens({}, fetchImpl)).rejects.toThrow(
      /Token does not have admin permissions/,
    );
  });

  it('refuses a 200 without a token pair', async () => {
    await expect(
      mintAppTokens({}, mintFetch(200, { data: null, error: null })),
    ).rejects.toBeInstanceOf(AppTokenError);
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

  function fakeTab() {
    return {
      location: { replace: vi.fn() },
      opener: {} as unknown,
      close: vi.fn(),
    };
  }

  it('opens about:blank synchronously, then navigates with the minted pair', async () => {
    const tab = fakeTab();
    const open = vi.fn().mockReturnValue(tab);
    window.open = open;

    const pending = openAppInNewTab(
      'https://app.example/',
      { applicationId: 'app-9' },
      mintFetch(),
    );
    expect(open).toHaveBeenCalledWith('about:blank', 'app-app-9');
    expect(tab.location.replace).not.toHaveBeenCalled();

    await pending;
    expect(tab.location.replace).toHaveBeenCalledTimes(1);
    const url = tab.location.replace.mock.calls[0]?.[0] as string;
    expect(url).toContain('https://app.example/');
    expect(url).toContain(`access_token=${TOKENS.access_token}`);
    expect(url).not.toContain(ACCESS_TOKEN);
  });

  it('never passes noopener to window.open', async () => {
    // Regression guard. Per the HTML spec `noopener` in the feature string makes
    // window.open() return null, so we could never navigate the tab: the user
    // got a bogus "popup blocked" error next to an empty tab.
    window.open = vi.fn().mockReturnValue(fakeTab());

    await openAppInNewTab('https://app.example/', {}, mintFetch());

    const features = (window.open as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[2];
    expect(features).toBeUndefined();
  });

  it('severs window.opener before navigating', async () => {
    // Must happen while the tab is still on about:blank — after a cross-origin
    // navigation the property is unreachable from here.
    const tab = fakeTab();
    window.open = vi.fn().mockReturnValue(tab);

    await openAppInNewTab('https://app.example/', {}, mintFetch());

    expect(tab.opener).toBeNull();
  });

  it('closes the blank tab when the mint fails', async () => {
    const tab = fakeTab();
    window.open = vi.fn().mockReturnValue(tab);

    await expect(
      openAppInNewTab('https://app.example/', {}, mintFetch(500, null)),
    ).rejects.toBeInstanceOf(AppTokenError);
    expect(tab.close).toHaveBeenCalled();
    expect(tab.location.replace).not.toHaveBeenCalled();
  });

  it('throws PopupBlockedError when the browser refuses', async () => {
    window.open = vi.fn().mockReturnValue(null);
    const fetchImpl = mintFetch();
    await expect(
      openAppInNewTab('https://app.example/', {}, fetchImpl),
    ).rejects.toBeInstanceOf(PopupBlockedError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses an http app frontend from an https dashboard', async () => {
    setLocation('https://node.example/admin-dashboard/applications');
    const open = vi.fn();
    window.open = open;
    await expect(
      openAppInNewTab('http://localhost:5173/', {}, mintFetch()),
    ).rejects.toBeInstanceOf(MixedContentError);
    // No blank tab should be left behind.
    expect(open).not.toHaveBeenCalled();
  });

  it('allows an https app frontend from an https dashboard', async () => {
    setLocation('https://node.example/admin-dashboard/applications');
    const tab = fakeTab();
    window.open = vi.fn().mockReturnValue(tab);
    await openAppInNewTab('https://app.example/', {}, mintFetch());
    expect(tab.location.replace).toHaveBeenCalled();
  });

  it.each([
    'javascript:alert(document.domain)//',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'blob:https://node.example/abc',
    '/relative/path',
    'not a url',
    '',
  ])('refuses a non-http(s) frontend %j without opening a tab', async (url) => {
    const open = vi.fn();
    window.open = open;
    const fetchImpl = mintFetch();
    await expect(openAppInNewTab(url, {}, fetchImpl)).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
    expect(open).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('isSafeWebUrl', () => {
  it('accepts absolute http(s) URLs only', () => {
    expect(isSafeWebUrl('https://app.example/')).toBe(true);
    expect(isSafeWebUrl('http://localhost:5173/')).toBe(true);
    expect(isSafeWebUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeWebUrl(' javascript:alert(1)')).toBe(false);
    expect(isSafeWebUrl('data:text/html,x')).toBe(false);
    expect(isSafeWebUrl('//evil.example/')).toBe(false);
  });
});

describe('isAllowedAppFrontendUrl', () => {
  const originalOpen = window.open;
  afterEach(() => {
    window.open = originalOpen;
  });

  it('matches the desktop: https anywhere, http on loopback only', () => {
    expect(isAllowedAppFrontendUrl('https://app.example/')).toBe(true);
    expect(isAllowedAppFrontendUrl('http://localhost:5173/')).toBe(true);
    expect(isAllowedAppFrontendUrl('http://127.0.0.1:5173/')).toBe(true);
    expect(isAllowedAppFrontendUrl('http://[::1]:5173/')).toBe(true);
    expect(isAllowedAppFrontendUrl('http://app.example/')).toBe(false);
    expect(isAllowedAppFrontendUrl('javascript:alert(1)')).toBe(false);
  });

  it('refuses a remote http frontend without opening a tab', async () => {
    const open = vi.fn();
    window.open = open;
    await expect(
      openAppInNewTab('http://app.example/', {}, mintFetch()),
    ).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(open).not.toHaveBeenCalled();
  });
});

describe('openExternal', () => {
  const originalOpen = window.open;
  afterEach(() => {
    window.open = originalOpen;
  });

  it('opens http(s) links with noopener', () => {
    const open = vi.fn();
    window.open = open;
    openExternal('https://github.com/calimero-network');
    expect(open).toHaveBeenCalledWith(
      'https://github.com/calimero-network',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('refuses a javascript: link', () => {
    const open = vi.fn();
    window.open = open;
    expect(() => openExternal('javascript:alert(1)')).toThrow(UnsafeUrlError);
    expect(open).not.toHaveBeenCalled();
  });
});

describe('approved app origins', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('derives the origin of a frontend URL', () => {
    expect(appFrontendOrigin('https://app.example:8443/x/y?z=1#h')).toBe(
      'https://app.example:8443',
    );
    expect(appFrontendOrigin('not a url')).toBeNull();
  });

  it('trusts nothing by default', () => {
    expect(isAppOriginApproved('app-1', 'https://app.example')).toBe(false);
  });

  it('remembers an origin per application', () => {
    approveAppOrigin('app-1', 'https://app.example');
    expect(isAppOriginApproved('app-1', 'https://app.example')).toBe(true);
    expect(isAppOriginApproved('app-2', 'https://app.example')).toBe(false);
  });

  it('stops trusting when the origin changes', () => {
    approveAppOrigin('app-1', 'https://app.example');
    expect(isAppOriginApproved('app-1', 'https://other.example')).toBe(false);
    expect(isAppOriginApproved('app-1', 'http://app.example')).toBe(false);
    approveAppOrigin('app-1', 'https://other.example');
    expect(isAppOriginApproved('app-1', 'https://app.example')).toBe(false);
  });

  it('treats corrupt storage as untrusted', () => {
    localStorage.setItem(APPROVED_APP_ORIGINS_KEY, '{nope');
    expect(isAppOriginApproved('app-1', 'https://app.example')).toBe(false);
    localStorage.setItem(APPROVED_APP_ORIGINS_KEY, '["https://app.example"]');
    expect(isAppOriginApproved('0', 'https://app.example')).toBe(false);
  });
});
