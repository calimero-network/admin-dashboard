import { describe, it, expect, afterEach, vi } from 'vitest';
import { fetchAppVersions, compareSemverDesc } from '../utils/registry';

const REGISTRY = 'https://registry.example/';

function mockBundles(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
  } as unknown as Response);
}

describe('fetchAppVersions', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('returns this package versions newest-first', async () => {
    global.fetch = mockBundles([
      { package: 'com.example.app', appVersion: '1.0.0' },
      { package: 'com.example.app', appVersion: '1.2.0' },
      { package: 'com.example.app', appVersion: '1.1.0' },
    ]) as unknown as typeof fetch;

    const versions = await fetchAppVersions(REGISTRY, 'com.example.app');
    expect(versions.map((v) => v.semver)).toEqual(['1.2.0', '1.1.0', '1.0.0']);
  });

  /**
   * Regression guard: the client sends `?package=` but a registry, proxy or
   * cache that ignores it would otherwise have us offer — and install — a
   * version belonging to a different application.
   */
  it('discards bundles belonging to another package', async () => {
    global.fetch = mockBundles([
      { package: 'com.example.other', appVersion: '9.9.9' },
      { package: 'com.example.app', appVersion: '1.0.0' },
    ]) as unknown as typeof fetch;

    const versions = await fetchAppVersions(REGISTRY, 'com.example.app');
    expect(versions.map((v) => v.semver)).toEqual(['1.0.0']);
  });

  it('drops yanked versions and deduplicates', async () => {
    global.fetch = mockBundles([
      { package: 'com.example.app', appVersion: '2.0.0', yanked: true },
      { package: 'com.example.app', appVersion: '1.0.0' },
      { package: 'com.example.app', appVersion: '1.0.0' },
    ]) as unknown as typeof fetch;

    const versions = await fetchAppVersions(REGISTRY, 'com.example.app');
    expect(versions.map((v) => v.semver)).toEqual(['1.0.0']);
  });

  it('rejects an invalid package id before making a request', async () => {
    const spy = vi.fn();
    global.fetch = spy as unknown as typeof fetch;
    await expect(
      fetchAppVersions(REGISTRY, '../../etc/passwd'),
    ).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('compareSemverDesc', () => {
  it('sorts descending and ranks pre-releases below their release', () => {
    const sorted = ['1.0.0-alpha', '1.0.0', '0.9.9', '1.2.0'].sort(
      compareSemverDesc,
    );
    expect(sorted).toEqual(['1.2.0', '1.0.0', '1.0.0-alpha', '0.9.9']);
  });

  it('ignores build metadata', () => {
    expect(compareSemverDesc('1.0.0+abc', '1.0.0+def')).toBe(0);
  });
});
