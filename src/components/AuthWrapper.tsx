import React, { useState, useEffect, useCallback } from 'react';
import {
  getAppEndpointKey, setAppEndpointKey,
  getAccessToken, getRefreshToken,
  setAccessToken, setRefreshToken,
  setContextAndIdentityFromJWT,
  clearAppEndpoint, clearAccessToken, clearRefreshToken,
  clearApplicationId, clearContextId, clearExecutorPublicKey,
  apiClient,
} from '@calimero-network/calimero-client';
import ConnectPage from '../pages/ConnectPage';
import LoginPage from '../pages/LoginPage';

type AuthState = 'loading' | 'no-url' | 'needs-login' | 'authenticated';

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>('loading');

  const checkAuth = useCallback(async () => {
    setState('loading');

    // Handle OAuth callback tokens in URL hash
    const fragment = window.location.hash.substring(1);
    const fragmentParams = new URLSearchParams(fragment);
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
        window.location.pathname + window.location.search + (newFragment ? `#${newFragment}` : ''),
      );
      setState('authenticated');
      return;
    }

    // No URL configured yet
    if (!getAppEndpointKey()) {
      setState('no-url');
      return;
    }

    // If tokens exist, validate them against a real protected endpoint
    // NOTE: /admin-api/is-authed is public and always returns 200 — cannot be used for token validation
    if (getAccessToken() && getRefreshToken()) {
      try {
        const res = await apiClient.node().getInstalledApplications();
        if (res.error?.code === 401 || (res.error as any)?.code === '401') {
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

    // No tokens — admin dashboard always requires auth
    setState('needs-login');
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const handleConnect = (url: string) => {
    setAppEndpointKey(url);
    checkAuth();
  };

  const handleLogin = () => {
    const url = getAppEndpointKey();
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
    clearAppEndpoint();
    clearAccessToken();
    clearRefreshToken();
    clearApplicationId();
    clearContextId();
    clearExecutorPublicKey();
    checkAuth();
  };

  if (state === 'loading') {
    return (
      <div style={{
        width: '100vw', height: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#09090b',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          border: '3px solid #27272a', borderTopColor: '#a5ff11',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
      </div>
    );
  }

  if (state === 'no-url') {
    return <ConnectPage onConnect={handleConnect} />;
  }

  if (state === 'needs-login') {
    return <LoginPage onLogin={handleLogin} onReset={handleReset} />;
  }

  return <>{children}</>;
}
