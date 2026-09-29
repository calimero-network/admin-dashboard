import { describe, it, expect, vi, beforeEach } from 'vitest';

import { endSession, retireSession } from '../utils/session';

const store = vi.hoisted(() => ({
  refresh: 'refresh.jwt' as string | null,
  cleared: [] as string[],
}));

vi.mock('@calimero-network/calimero-client', () => ({
  getRefreshToken: () => store.refresh,
  clearAccessToken: () => store.cleared.push('access'),
  clearRefreshToken: () => store.cleared.push('refresh'),
  clearApplicationId: () => store.cleared.push('app'),
  clearContextId: () => store.cleared.push('context'),
  clearExecutorPublicKey: () => store.cleared.push('executor'),
}));

vi.mock('../utils/nodeUrl', () => ({
  getNodeUrl: () => 'http://localhost:2528',
}));

function fetchReturning(status: number) {
  return vi.fn().mockResolvedValue({ ok: status < 300, status } as Response);
}

describe('retireSession', () => {
  beforeEach(() => {
    store.refresh = 'refresh.jwt';
    store.cleared = [];
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('posts our refresh token to the node logout route', async () => {
    const fetchImpl = fetchReturning(200);
    await expect(retireSession(fetchImpl)).resolves.toBe(true);

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:2528/auth/logout');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      refresh_token: 'refresh.jwt',
    });
  });

  it('never calls /admin/revoke', async () => {
    const fetchImpl = fetchReturning(200);
    await retireSession(fetchImpl);
    for (const call of fetchImpl.mock.calls) {
      expect(String(call[0])).not.toContain('/admin/revoke');
    }
  });

  it('does nothing without a refresh token', async () => {
    store.refresh = null;
    const fetchImpl = fetchReturning(200);
    await expect(retireSession(fetchImpl)).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports a node without the route (404) as not retired', async () => {
    await expect(retireSession(fetchReturning(404))).resolves.toBe(false);
  });

  it('survives an unreachable node', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('offline'));
    await expect(retireSession(fetchImpl)).resolves.toBe(false);
  });
});

describe('endSession', () => {
  beforeEach(() => {
    store.refresh = 'refresh.jwt';
    store.cleared = [];
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('retires on the node before clearing locally', async () => {
    const order: string[] = [];
    const fetchImpl = vi.fn().mockImplementation(async () => {
      order.push(`fetch:${store.cleared.length}`);
      return { ok: true, status: 200 } as Response;
    });
    await endSession(fetchImpl);
    expect(order).toEqual(['fetch:0']);
    expect(store.cleared).toEqual([
      'access',
      'refresh',
      'app',
      'context',
      'executor',
    ]);
  });

  it('still clears locally when the node is unreachable', async () => {
    await endSession(vi.fn().mockRejectedValue(new TypeError('offline')));
    expect(store.cleared).toContain('refresh');
    expect(store.cleared).toContain('access');
  });
});
