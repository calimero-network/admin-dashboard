import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import {
  describeBytes,
  formatBytes,
  parseUsage,
  sumUsage,
  usageFor,
} from '../utils/diskUsage';
import { getUsage } from '../api/namespaceApi';
import { useDiskUsage } from '../components/namespaces/useDiskUsage';

vi.mock('@calimero-network/calimero-client', () => ({
  getAppEndpointKey: () => 'http://localhost:2428',
  getAccessToken: () => 'test-token',
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

function okResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);
}

function errResponse(status: number, text: string) {
  return Promise.resolve({
    ok: false,
    status,
    statusText: text,
    text: () => Promise.resolve(text),
  } as unknown as Response);
}

const row = (namespaceId: string, total: number) => ({
  namespaceId,
  contextCount: 1,
  memberCount: 1,
  subgroupCount: 0,
  bytes: { state: total - 6, privateState: 1, delta: 2, governance: 3, total },
});

describe('parseUsage', () => {
  it("reads core's bare body and a data-enveloped one alike", () => {
    const bare = parseUsage({ namespaces: [row('AB', 100)] });
    const wrapped = parseUsage({ data: { namespaces: [row('ab', 100)] } });
    expect(bare.get('ab')?.total).toBe(100);
    expect(wrapped.get('ab')).toEqual(bare.get('ab'));
  });

  it('drops a row with a partial or negative breakdown rather than half-reporting it', () => {
    const usage = parseUsage({
      namespaces: [
        { namespaceId: 'aa', bytes: { state: 1, total: 1 } },
        {
          namespaceId: 'bb',
          bytes: {
            state: -1,
            privateState: 0,
            delta: 0,
            governance: 0,
            total: 0,
          },
        },
        row('cc', 10),
      ],
    });
    expect([...usage.keys()]).toEqual(['cc']);
  });

  it('answers an empty map for anything that is not a usage body', () => {
    for (const junk of [null, undefined, 'x', 42, {}, { namespaces: 'nope' }]) {
      expect(parseUsage(junk).size).toBe(0);
    }
  });
});

describe('sumUsage', () => {
  const usage = parseUsage({ namespaces: [row('aa', 100), row('bb', 50)] });

  it('sums the namespaces asked about, matching ids case-insensitively', () => {
    expect(sumUsage(usage, ['AA', 'bb', 'zz'])).toBe(150);
    expect(usageFor(usage, 'AA')?.total).toBe(100);
  });

  it('is null, not zero, when none of them is reported', () => {
    expect(sumUsage(usage, ['zz'])).toBeNull();
    expect(sumUsage(null, ['aa'])).toBeNull();
    expect(sumUsage(usage, [])).toBeNull();
  });
});

describe('formatBytes', () => {
  it('uses decimal units, trims trailing zeros and keeps a bare zero', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(999)).toBe('999 B');
    expect(formatBytes(1_000)).toBe('1 KB');
    expect(formatBytes(1_500)).toBe('1.5 KB');
    expect(formatBytes(1_234_567)).toBe('1.23 MB');
    expect(formatBytes(12_345_678_901)).toBe('12.3 GB');
    expect(formatBytes(766_000)).toBe('766 KB');
  });
});

describe('describeBytes', () => {
  it('names every column and the shared data that is excluded', () => {
    const text = describeBytes(
      parseUsage({ namespaces: [row('aa', 2_000)] }).get('aa')!,
    );
    expect(text).toContain('2 KB');
    expect(text).toContain('Private');
    expect(text).toContain('History');
    expect(text).toContain('not counted');
  });
});

describe('getUsage', () => {
  it('GETs /admin-api/usage with the bearer token and reads the bare body', async () => {
    mockFetch.mockReturnValueOnce(okResponse({ namespaces: [row('aa', 9)] }));
    const res = await getUsage();
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:2428/admin-api/usage',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    );
    expect(res.namespaces[0]?.bytes.total).toBe(9);
  });

  it('normalises a body with no namespaces to an empty list', async () => {
    mockFetch.mockReturnValueOnce(okResponse({}));
    expect((await getUsage()).namespaces).toEqual([]);
  });

  it('rejects on a refused route', async () => {
    mockFetch.mockReturnValueOnce(errResponse(404, 'not found'));
    await expect(getUsage()).rejects.toThrow('404');
  });
});

describe('useDiskUsage', () => {
  it('exposes the parsed figures', async () => {
    mockFetch.mockReturnValue(okResponse({ namespaces: [row('AA', 42)] }));
    const { result, unmount } = renderHook(() => useDiskUsage());
    await waitFor(() => expect(result.current?.get('aa')?.total).toBe(42));
    unmount();
  });

  it('drops back to null — sizes hidden, never zero — once the node stops answering', async () => {
    let hidden = false;
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden,
    });
    mockFetch.mockReturnValue(okResponse({ namespaces: [row('aa', 42)] }));
    const { result, unmount } = renderHook(() => useDiskUsage());
    await waitFor(() => expect(result.current?.get('aa')?.total).toBe(42));

    mockFetch.mockReturnValue(errResponse(500, 'boom'));
    hidden = true;
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    hidden = false;
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(result.current).toBeNull());
    expect(mockFetch).toHaveBeenCalledTimes(2);
    unmount();
  });
});
