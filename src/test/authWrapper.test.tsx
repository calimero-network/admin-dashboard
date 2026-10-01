import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

import AuthWrapper from '../components/AuthWrapper';

const sdk = vi.hoisted(() => ({
  store: new Map<string, string>(),
  login: vi.fn(),
}));

vi.mock('@calimero-network/calimero-client', () => ({
  setAppEndpointKey: (url: string) => sdk.store.set('app-url', url),
  setAuthEndpointURL: (url: string) => sdk.store.set('auth-url', url),
  getAccessToken: () => sdk.store.get('access') ?? null,
  getRefreshToken: () => sdk.store.get('refresh') ?? null,
  setAccessToken: vi.fn(),
  setRefreshToken: vi.fn(),
  setContextAndIdentityFromJWT: vi.fn(),
  clearAccessToken: vi.fn(),
  clearRefreshToken: vi.fn(),
  apiClient: {
    auth: () => ({ login: sdk.login }),
    node: () => ({
      getInstalledApplications: () => Promise.resolve({ data: [] }),
    }),
  },
}));

vi.mock('../pages/LoginPage', () => ({
  default: ({ onLogin }: { onLogin: () => void }) => (
    <button data-testid="login" onClick={onLogin}>
      login
    </button>
  ),
}));

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
      hash: url.hash,
      protocol: url.protocol,
    },
  });
}

beforeEach(() => {
  sdk.store.clear();
  sdk.login.mockReset();
  sessionStorage.clear();
  vi.stubEnv('DEV', false);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('AuthWrapper endpoint seeding', () => {
  it('re-seeds a stale auth endpoint from the serving node on load', async () => {
    sdk.store.set('auth-url', 'http://stale.example:2528');
    sdk.store.set('app-url', 'http://stale.example:2528');
    setLocation('https://node.example/admin-dashboard/dashboard');

    render(<AuthWrapper>ok</AuthWrapper>);

    await screen.findByTestId('login');
    expect(sdk.store.get('auth-url')).toBe('https://node.example');
    expect(sdk.store.get('app-url')).toBe('https://node.example');
  });

  it('re-seeds it before validating a stored session', async () => {
    sdk.store.set('auth-url', 'http://stale.example:2528');
    sdk.store.set('access', 'a.jwt');
    sdk.store.set('refresh', 'r.jwt');
    setLocation('https://node.example/admin-dashboard/dashboard');

    render(<AuthWrapper>ok</AuthWrapper>);

    expect(await screen.findByText('ok')).toBeInTheDocument();
    expect(sdk.store.get('auth-url')).toBe('https://node.example');
  });

  it('logs in against the same endpoint it seeds', async () => {
    setLocation('https://node.example/admin-dashboard/dashboard');

    render(<AuthWrapper>ok</AuthWrapper>);
    (await screen.findByTestId('login')).click();

    expect(sdk.login).toHaveBeenCalledTimes(1);
    expect(sdk.login.mock.calls[0]?.[0]).toMatchObject({
      url: sdk.store.get('auth-url'),
    });
  });
});
