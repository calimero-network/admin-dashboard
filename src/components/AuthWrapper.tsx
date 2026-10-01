import React, { useState, useEffect, useCallback } from 'react';
import {
  setAppEndpointKey,
  setAuthEndpointURL,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
  setContextAndIdentityFromJWT,
  clearAccessToken,
  clearRefreshToken,
  apiClient,
} from '@calimero-network/calimero-client';
import LoginPage from '../pages/LoginPage';
import {
  clearNodeUrlOverride,
  getAuthEndpointUrl,
  getNodeUrl,
} from '../utils/nodeUrl';
import {
  beginLogin,
  consumeLoginState,
  stripLoginState,
} from '../utils/loginState';
import { endSession } from '../utils/session';

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
  // Kept in state so the login screen's "Node:" line is driven by the same read
  // that seeds the SDK, rather than by a getNodeUrl() call during render that
  // React has no reason to re-run.
  const [nodeUrl, setNodeUrl] = useState<string>(() => getNodeUrl());

  const checkAuth = useCallback(async () => {
    setState('loading');

    // The SDK keeps the node URL in its own storage; seed it from the origin on
    // every load so a stale value from a previous deployment can never win.
    const resolvedNodeUrl = getNodeUrl();
    setAppEndpointKey(resolvedNodeUrl);
    setAuthEndpointURL(getAuthEndpointUrl());
    setNodeUrl(resolvedNodeUrl);

    // Adopt tokens handed back by the auth frontend in the URL hash.
    const fragmentParams = new URLSearchParams(
      window.location.hash.substring(1),
    );
    const encodedAccessToken = fragmentParams.get('access_token');
    const encodedRefreshToken = fragmentParams.get('refresh_token');

    const hasHashTokens = Boolean(encodedAccessToken && encodedRefreshToken);
    const stateMatches = hasHashTokens && consumeLoginState();
    if (hasHashTokens && !stateMatches) {
      console.warn(
        'Ignoring tokens in the URL: they do not answer a login started here.',
      );
      fragmentParams.delete('access_token');
      fragmentParams.delete('refresh_token');
      const rest = fragmentParams.toString();
      window.history.replaceState(
        {},
        '',
        window.location.pathname +
          stripLoginState(window.location.search) +
          (rest ? `#${rest}` : ''),
      );
    }

    if (stateMatches && encodedAccessToken && encodedRefreshToken) {
      // A malformed hash (bad percent-encoding, an unparseable JWT) throws
      // synchronously here. `checkAuth` is invoked as `void checkAuth()`, so the
      // rejection is swallowed, `setState` is never reached and the app sits on
      // the spinner forever — unrecoverable without hand-editing the URL. Fall
      // back to the login screen and strip the bad hash so a reload is clean.
      try {
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
            stripLoginState(window.location.search) +
            (newFragment ? `#${newFragment}` : ''),
        );
        setState('authenticated');
      } catch (e) {
        console.error('Could not adopt tokens from the URL hash:', e);
        window.history.replaceState(
          {},
          '',
          window.location.pathname + stripLoginState(window.location.search),
        );
        setState('needs-login');
      }
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
      } catch (e) {
        // Only a confirmed 401 means the stored tokens are bad; that is handled
        // above. Anything reaching here is the REQUEST failing — offline, DNS,
        // CORS, a 5xx, a node still booting — and treating that as "not logged
        // in" signs the user out over a network blip, discarding tokens that
        // were fine. Stay authenticated and let the node-status pill report
        // that the node is unreachable.
        console.warn('Could not reach the node to validate the session:', e);
        setState('authenticated');
      }
      return;
    }

    setState('needs-login');
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  const handleLogin = () => {
    if (!getNodeUrl()) return;
    try {
      apiClient.auth().login({
        url: getAuthEndpointUrl(),
        callbackUrl: beginLogin(),
        permissions: ['admin'],
        applicationId: '',
        applicationPath: '',
      });
    } catch (e) {
      console.error('Login redirect failed:', e);
    }
  };

  const handleReset = async () => {
    await endSession();
    // ⚠️ THE NODE OVERRIDE IS PART OF THE SESSION. A `?nodeUrl=` is persisted
    // to sessionStorage and then outranks the serving origin, so without this
    // "Clear session" could not unpin a dashboard that had once been pointed
    // at another node — it cleared the tokens and left the target.
    // `checkAuth` re-seeds the SDK from getNodeUrl() immediately below, so the
    // client follows the reset rather than keeping the old endpoint.
    clearNodeUrlOverride();
    void checkAuth();
  };

  if (state === 'loading') {
    return (
      <div className="auth-loading" data-testid="auth-loading">
        <div className="auth-loading-spinner" />
        <h2>Setting up Admin Dashboard</h2>
        <p>Checking your node connection and configuration…</p>
      </div>
    );
  }

  if (state === 'needs-login') {
    return (
      <LoginPage
        onLogin={handleLogin}
        onReset={() => void handleReset()}
        nodeUrl={nodeUrl}
      />
    );
  }

  return <>{children}</>;
}
