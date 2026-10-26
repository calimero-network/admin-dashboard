import { describe, it, expect } from 'vitest';

import {
  declaredOutbound,
  outboundRows,
  outboundSelection,
  withPrefix,
  withoutPrefix,
} from '../utils/outbound';
import { decodeMetadata } from '../utils/appUtils';

const STRIPE = 'https://api.stripe.com/v1/';
const TURNSTILE = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const MODEL = 'https://api.model.example/v2/';

describe('declaredOutbound', () => {
  it('reads the top-level `outbound` array core writes into app metadata', () => {
    // The metadata arrives as the bytes of the manifest's metadata JSON
    // (`BundleManifest::to_metadata_json`), exactly as `app_outbound` reads it.
    const bytes = Array.from(
      new TextEncoder().encode(
        JSON.stringify({
          package: 'com.example.forms',
          outbound: [TURNSTILE, STRIPE],
        }),
      ),
    );
    expect(declaredOutbound(decodeMetadata(bytes))).toEqual([
      TURNSTILE,
      STRIPE,
    ]);
  });

  it('is empty when the app declares nothing, or metadata is missing', () => {
    expect(declaredOutbound({ package: 'p' })).toEqual([]);
    expect(declaredOutbound(null)).toEqual([]);
    expect(declaredOutbound(undefined)).toEqual([]);
    expect(declaredOutbound({ outbound: 'https://x.example/' })).toEqual([]);
  });

  it('skips non-strings, empties and duplicates, as the node does', () => {
    expect(
      declaredOutbound({ outbound: [STRIPE, 7, null, '', STRIPE, TURNSTILE] }),
    ).toEqual([STRIPE, TURNSTILE]);
  });
});

describe('outboundSelection', () => {
  const declared = [TURNSTILE, STRIPE, MODEL];

  it('is undefined when the app declares nothing — the field is left out', () => {
    expect(outboundSelection([], new Set())).toBeUndefined();
    expect(outboundSelection([], new Set([STRIPE]))).toBeUndefined();
  });

  it('is "manifest" when every declared prefix is checked', () => {
    expect(outboundSelection(declared, new Set(declared))).toBe('manifest');
  });

  it('is the checked list, in declared order, when some are unchecked', () => {
    expect(outboundSelection(declared, new Set([MODEL, TURNSTILE]))).toEqual([
      TURNSTILE,
      MODEL,
    ]);
  });

  it('is [] when none are checked — reviewed and refused, not unasked', () => {
    expect(outboundSelection(declared, new Set())).toEqual([]);
  });

  it('ignores a checked prefix the app does not declare', () => {
    expect(
      outboundSelection([STRIPE], new Set([STRIPE, 'https://other.example/'])),
    ).toBe('manifest');
  });
});

describe('outboundRows', () => {
  it('classifies approved, reviewed-but-not-approved and unreviewed prefixes', () => {
    expect(
      outboundRows({ prefixes: [STRIPE], reviewed: [STRIPE, TURNSTILE] }, [
        STRIPE,
        TURNSTILE,
        MODEL,
      ]),
    ).toEqual([
      { prefix: STRIPE, status: 'approved' },
      { prefix: MODEL, status: 'awaiting' },
      { prefix: TURNSTILE, status: 'revoked' },
    ]);
  });

  it('without declared prefixes nothing reads as awaiting', () => {
    expect(
      outboundRows({ prefixes: [], reviewed: [STRIPE] }, undefined),
    ).toEqual([{ prefix: STRIPE, status: 'revoked' }]);
  });

  it('with no approval yet, every declared prefix awaits', () => {
    expect(outboundRows(undefined, [STRIPE, MODEL])).toEqual([
      { prefix: STRIPE, status: 'awaiting' },
      { prefix: MODEL, status: 'awaiting' },
    ]);
  });

  it('keeps an approved prefix the app no longer declares', () => {
    expect(outboundRows({ prefixes: [MODEL], reviewed: [MODEL] }, [])).toEqual([
      { prefix: MODEL, status: 'approved' },
    ]);
  });
});

describe('withoutPrefix / withPrefix (the PUT replaces, so the list is whole)', () => {
  it('revoking drops just that prefix', () => {
    expect(withoutPrefix([STRIPE, TURNSTILE], STRIPE)).toEqual([TURNSTILE]);
  });

  it('revoking the last prefix sends [] — revoke everything', () => {
    expect(withoutPrefix([STRIPE], STRIPE)).toEqual([]);
  });

  it('re-approving appends, and never duplicates', () => {
    expect(withPrefix([TURNSTILE], STRIPE)).toEqual([TURNSTILE, STRIPE]);
    expect(withPrefix([STRIPE], STRIPE)).toEqual([STRIPE]);
  });
});
