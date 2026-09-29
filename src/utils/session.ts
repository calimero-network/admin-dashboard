/**
 * Ending the dashboard's session — on the node, not just in this tab.
 *
 * Clearing localStorage alone leaves the refresh token exchangeable on the node
 * until it expires: anyone who copied it (a shared machine, a leaked backup of
 * the browser profile) can keep minting admin tokens after "Logout". The node's
 * `POST /auth/logout` retires it (calimero-network/core#4190).
 *
 * Not `POST /admin/revoke`: that revokes the whole KEY, and an admin session's
 * key is the node's root key — revoking it would lock everyone out of the node.
 */
import {
  getRefreshToken,
  clearAccessToken,
  clearRefreshToken,
  clearApplicationId,
  clearContextId,
  clearExecutorPublicKey,
} from '@calimero-network/calimero-client';
import { getNodeUrl } from './nodeUrl';

/** Logout must never hang on an unreachable node. */
export const LOGOUT_TIMEOUT_MS = 3000;

/**
 * Ask the node to retire our refresh token. Best-effort: resolves `false` when
 * there is nothing to retire, the node is unreachable, or it is older than the
 * logout route (a 404) — the caller clears local state either way.
 */
export async function retireSession(
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOGOUT_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${getNodeUrl()}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`Node did not end the session (HTTP ${res.status})`);
    }
    return res.ok;
  } catch (e) {
    console.warn('Could not reach the node to end the session:', e);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Drop every session value the SDK keeps in this browser. */
export function clearLocalSession(): void {
  clearAccessToken();
  clearRefreshToken();
  clearApplicationId();
  clearContextId();
  clearExecutorPublicKey();
}

/** Retire the session on the node, then forget it here. */
export async function endSession(
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await retireSession(fetchImpl);
  clearLocalSession();
}
