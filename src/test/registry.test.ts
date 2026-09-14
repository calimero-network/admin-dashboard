import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  fetchAppVersions,
  fetchPackageAssets,
  compareSemverDesc,
} from '../utils/registry';

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

describe('fetchPackageAssets', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  /** The shape the registry actually answers with, verbatim. */
  const WIRE = {
    assets: [
      {
        id: 'b2',
        kind: 'image',
        contentType: 'image/png',
        bytes: 118344,
        alt: 'Login2',
        order: 1,
        url: '/api/v2/packages/com.calimero.mdtest-good/assets/b2/raw',
        thumbUrl: '/api/v2/packages/com.calimero.mdtest-good/assets/b2/raw',
        hasThumb: false,
      },
      {
        id: 'a1',
        kind: 'image',
        contentType: 'image/png',
        bytes: 118344,
        alt: 'Login Screen',
        order: 0,
        url: '/api/v2/packages/com.calimero.mdtest-good/assets/a1/raw',
        thumbUrl: '/api/v2/packages/com.calimero.mdtest-good/assets/a1/thumb',
        hasThumb: true,
      },
    ],
    state: 'approved',
  };

  const mock = (body: unknown, ok = true, status = 200) =>
    vi.fn().mockResolvedValue({
      ok,
      status,
      statusText: 'OK',
      json: async () => body,
    } as unknown as Response);

  it('resolves the registry relative URLs to absolute ones', async () => {
    // ⚠️ THE BUG THIS EXISTS FOR. The registry answers with a ROOT-RELATIVE
    // path, and an <img src> resolves that against whatever origin is running
    // the app rather than the registry. In the dashboard that is the vite dev
    // server, which answered with "The server is configured with a public base
    // URL of /admin-dashboard/ — did you mean to visit
    // /admin-dashboard/api/v2/packages/…/raw instead?" and every preview
    // rendered broken.
    global.fetch = mock(WIRE);
    const assets = await fetchPackageAssets(
      REGISTRY,
      'com.calimero.mdtest-good',
    );

    expect(assets).toHaveLength(2);
    for (const a of assets) {
      expect(a.url?.startsWith('https://registry.example/api/v2/')).toBe(true);
      expect(a.thumbUrl?.startsWith('https://registry.example/api/v2/')).toBe(
        true,
      );
    }
  });

  it('reads thumbUrl, and only when the registry says a thumb exists', async () => {
    // The wire field is `thumbUrl`; spelling it `thumbnailUrl` yields undefined
    // on every asset and silently serves the full image instead.
    global.fetch = mock(WIRE);
    const [first, second] = await fetchPackageAssets(REGISTRY, 'com.x');

    // a1 has a real thumb, so the thumb URL differs from the full image.
    expect(first?.thumbUrl).toContain('/a1/thumb');
    expect(first?.url).toContain('/a1/raw');
    // b2 has none: the thumb falls back to the full image rather than to a
    // path the registry would 404.
    expect(second?.thumbUrl).toBe(second?.url);
  });

  it('honours the registry running order', async () => {
    global.fetch = mock(WIRE);
    const assets = await fetchPackageAssets(REGISTRY, 'com.x');
    expect(assets.map((a) => a.id)).toEqual(['a1', 'b2']);
  });

  it('drops anything that is not an image, but keeps records with no kind', async () => {
    global.fetch = mock({
      assets: [
        { id: 'vid', kind: 'video', url: '/api/v2/a/raw' },
        { id: 'old', url: '/api/v2/b/raw' },
      ],
    });
    const assets = await fetchPackageAssets(REGISTRY, 'com.x');
    expect(assets.map((a) => a.id)).toEqual(['old']);
  });

  it('treats a 404 or a throw as "nothing to show", not an error', async () => {
    global.fetch = mock(null, false, 404);
    expect(await fetchPackageAssets(REGISTRY, 'com.x')).toEqual([]);

    global.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    expect(await fetchPackageAssets(REGISTRY, 'com.x')).toEqual([]);
  });
});
