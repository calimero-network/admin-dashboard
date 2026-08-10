import React, { useState, useEffect, useCallback } from 'react';
import {
  setAppEndpointKey,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
  setContextAndIdentityFromJWT,
  clearAccessToken,
  clearRefreshToken,
  clearApplicationId,
  clearContextId,
  clearExecutorPublicKey,
  apiClient,
} from '@calimero-network/calimero-client';
import LoginPage from '../pages/LoginPage';
import { getNodeUrl } from '../utils/nodeUrl';

/**
 * `no-url` is gone compared with the pre-port flow: there is no ConnectPage and
 * no node picker, because the node URL is derived from the origin that served
 * this bundle (see utils/nodeUrl.ts).
 */
type AuthState = 'loading' | 'needs-login' | 'authenticated';

export default function AuthWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<AuthState>('loading');

  const checkAuth = useCallback(async () => {
    setState('loading');

    // The SDK keeps the node URL in its own storage; seed it from the origin on
    // every load so a stale value from a previous deployment can never win.
    setAppEndpointKey(getNodeUrl());

    // Adopt tokens handed back by the auth frontend in the URL hash.
    const fragmentParams = new URLSearchParams(
      window.location.hash.substring(1),
    );
    const encodedAccessToken = fragmentParams.get('access_token');
    const encodedRefreshToken = fragmentParams.get('refresh_token');

    if (encodedAccessToken && encodedRefreshToken) {
      const accessToken = decodeURIComponent(encodedAccessToken);
      const refreshToken = decodeURIComponent(encodedRefreshToken);
      setAccessToken(accessToken);
      setRefreshToken(refreshToken);
      setContextAndIdentityFromJWT(accessToken);
      fragmentParams.delete('access_token');
      fragmentParams.delete('refresh_token');
      const newFragment = fragmentParams.toString();
      window.history.replaceState(
        {},
        '',
        window.location.pathname +
          window.location.search +
          (newFragment ? `#${newFragment}` : ''),
      );
      setState('authenticated');
      return;
    }

    // Validate stored tokens against a real protected endpoint.
    // NOTE: /admin-api/is-authed is public and always 200s — it cannot be used
    // to test a token.
    if (getAccessToken() && getRefreshToken()) {
      try {
        const res = await apiClient.node().getInstalledApplications();
        const code = res.error?.code as number | string | undefined;
        if (code === 401 || code === '401') {
          clearAccessToken();
          clearRefreshToken();
          setState('needs-login');
        } else {
          setState('authenticated');
        }
      } catch {
        setState('needs-login');
      }
      return;
    }

    setState('needs-login');
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  const handleLogin = () => {
    const url = getNodeUrl();
    if (!url) return;
    try {
      apiClient.auth().login({
        url: new URL(url).origin,
        callbackUrl: window.location.href,
        permissions: ['admin'],
        applicationId: '',
        applicationPath: '',
      });
    } catch (e) {
      console.error('Login redirect failed:', e);
    }
  };

  const handleReset = () => {
    clearAccessToken();
    clearRefreshToken();
    clearApplicationId();
    clearContextId();
    clearExecutorPublicKey();
    void checkAuth();
  };

  if (state === 'loading') {
    return (
      <div className="auth-loading" data-testid="auth-loading">
        <div className="auth-loading-spinner" />
      </div>
    );
  }

  if (state === 'needs-login') {
    return <LoginPage onLogin={handleLogin} onReset={handleReset} />;
  }

  return <>{children}</>;
}
