import { describe, it, expect } from 'vitest';
import {
  decodeMetadata,
  appDisplayName,
  appFrontendUrl,
  formatSize,
  kebabCase,
  truncateId,
  parseApiError,
} from '../utils/appUtils';

/**
 * The exact shape `BundleManifest::to_metadata_json` emits
 * (core/crates/bundle/src/lib.rs) for a bundle install — flat fields plus a
 * nested `links` block. Verified against mero-blocks, whose Cargo.toml declares
 * `frontend = "https://mero-blocks.vercel.app/"`.
 */
const CORE_METADATA = {
  package: 'com.calimero.meroblocks',
  version: '0.1.1',
  name: 'Mero Blocks',
  description: 'Minecraft-style P2P voxel sandbox — the world is a context.',
  author: 'Calimero',
  icon: 'data:image/png;base64,AAA',
  tags: ['game', 'sandbox'],
  links: {
    frontend: 'https://mero-blocks.vercel.app/',
    github: 'https://github.com/calimero-network/mero-blocks',
  },
};

const asBytes = (o: unknown): number[] =>
  Array.from(new TextEncoder().encode(JSON.stringify(o)));

const asBase64 = (o: unknown): string => {
  const bytes = new TextEncoder().encode(JSON.stringify(o));
  return btoa(String.fromCharCode(...bytes));
};

describe('decodeMetadata', () => {
  it('decodes the byte-array form the admin API returns', () => {
    const meta = decodeMetadata(asBytes(CORE_METADATA));
    expect(meta?.name).toBe('Mero Blocks');
    expect(meta?.version).toBe('0.1.1');
    expect(meta?.links?.frontend).toBe('https://mero-blocks.vercel.app/');
  });

  it('decodes the base64 form', () => {
    expect(decodeMetadata(asBase64(CORE_METADATA))?.name).toBe('Mero Blocks');
  });

  it('passes through an already-decoded object', () => {
    expect(decodeMetadata(CORE_METADATA)?.name).toBe('Mero Blocks');
  });

  it('decodes multi-byte characters correctly', () => {
    // A Latin-1 `atob` alone mangles the em-dash into mojibake; this is why the
    // decode goes through TextDecoder('utf-8').
    const meta = decodeMetadata(asBase64(CORE_METADATA));
    expect(meta?.description).toContain('—');
    expect(meta?.description).not.toContain('â€');
  });

  it('returns null for empty, absent or corrupt metadata', () => {
    expect(decodeMetadata(undefined)).toBeNull();
    expect(decodeMetadata(null)).toBeNull();
    expect(decodeMetadata([])).toBeNull();
    expect(decodeMetadata('not base64 json!!')).toBeNull();
    expect(
      decodeMetadata(Array.from(new TextEncoder().encode('{oops'))),
    ).toBeNull();
  });

  /**
   * Regression guard for the bug this port fixes: the pre-port dashboard read
   * `applicationName` / `applicationVersion`, keys core has never emitted for a
   * bundle install, so every app rendered nameless and unopenable.
   */
  it('does not depend on the legacy applicationName schema', () => {
    const meta = decodeMetadata(asBytes(CORE_METADATA));
    expect(meta).not.toBeNull();
    expect(
      (meta as unknown as Record<string, unknown>)['applicationName'],
    ).toBeUndefined();
    expect(appDisplayName({ id: 'hash' }, meta)).toBe('Mero Blocks');
  });
});

describe('appDisplayName', () => {
  it('prefers name, then alias, then row name, then id', () => {
    expect(appDisplayName({ id: 'i' }, { name: 'N', alias: 'A' })).toBe('N');
    expect(appDisplayName({ id: 'i' }, { alias: 'A' })).toBe('A');
    expect(appDisplayName({ id: 'i', name: 'R' }, null)).toBe('R');
    expect(appDisplayName({ id: 'i' }, null)).toBe('i');
    expect(appDisplayName({}, null)).toBe('Unknown');
  });
});

describe('appFrontendUrl', () => {
  it('reads links.frontend', () => {
    expect(appFrontendUrl({ links: { frontend: 'https://x/' } })).toBe(
      'https://x/',
    );
  });

  it('is null when the bundle declares no frontend', () => {
    expect(appFrontendUrl({ name: 'x' })).toBeNull();
    expect(appFrontendUrl({ links: {} })).toBeNull();
    expect(appFrontendUrl(null)).toBeNull();
  });
});

describe('formatSize', () => {
  it('formats KB and MB, and dashes on absent size', () => {
    expect(formatSize(2048)).toBe('2.00 KB');
    expect(formatSize(5 * 1024 * 1024)).toBe('5.00 MB');
    expect(formatSize(0)).toBe('—');
    expect(formatSize(undefined)).toBe('—');
  });
});

describe('kebabCase', () => {
  it('matches the desktop deep-link slug derivation', () => {
    expect(kebabCase('Mero Chat')).toBe('mero-chat');
    expect(kebabCase('  Mero__Blocks!! ')).toBe('mero-blocks');
  });
});

describe('truncateId', () => {
  it('middle-truncates only when longer than the budget', () => {
    expect(truncateId('short')).toBe('short');
    expect(truncateId('0123456789abcdefghij')).toBe('0123456789…efghij');
  });
});

describe('parseApiError', () => {
  it('unwraps a JSON body from an SDK HTTPError', () => {
    expect(
      parseApiError({ status: 403, bodyText: '{"error":"not permitted"}' }),
    ).toBe('403: not permitted');
  });

  it('falls back to raw body text', () => {
    expect(parseApiError({ status: 500, bodyText: 'boom' })).toBe('500: boom');
  });

  it('handles plain Errors and unknowns', () => {
    expect(parseApiError(new Error('nope'))).toBe('nope');
    expect(parseApiError(null)).toBe('Unknown error');
  });

  it('caps very long bodies', () => {
    const out = parseApiError({ bodyText: 'x'.repeat(500) });
    expect(out.length).toBeLessThanOrEqual(201);
    expect(out.endsWith('…')).toBe(true);
  });
});
