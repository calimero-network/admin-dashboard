import {
  getRefreshToken,
  clearAccessToken,
  clearRefreshToken,
  clearApplicationId,
  clearContextId,
  clearExecutorPublicKey,
} from '@calimero-network/calimero-client';
import { getNodeUrl } from './nodeUrl';

export const LOGOUT_TIMEOUT_MS = 3000;

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

export function clearLocalSession(): void {
  clearAccessToken();
  clearRefreshToken();
  clearApplicationId();
  clearContextId();
  clearExecutorPublicKey();
}

export async function endSession(
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await retireSession(fetchImpl);
  clearLocalSession();
}
