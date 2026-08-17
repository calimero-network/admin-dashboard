import { describe, it, expect } from 'vitest';
import bs58 from 'bs58';
import {
  decodeInvitation,
  encodeInvitation,
  namespaceIdFromInvitation,
} from '../utils/invitations';

/**
 * The invitation code is the one artefact users move BETWEEN clients, so its
 * encoding is a contract, not an implementation detail: the desktop app ships
 * `btoa(JSON.stringify(payload))` and reads codes back with `atob`.
 */

const PAYLOAD = {
  invitation: {
    invitation: {
      inviter_identity: 'aa'.repeat(32),
      // `ContextGroupId` is a 32-byte array on the wire.
      group_id: [0x0a, 0xff, 0x00, ...Array(29).fill(1)],
      expiration_timestamp: 123,
      secret_salt: Array(32).fill(0),
      invited_role: 1,
    },
    inviter_signature: 'bb'.repeat(64),
  },
  groupName: 'Team workspace',
};

describe('encodeInvitation', () => {
  it('produces base64 that plain atob can read (desktop-app compatible)', () => {
    const code = encodeInvitation(PAYLOAD);
    expect(JSON.parse(atob(code))).toEqual(PAYLOAD);
  });

  it('round-trips through decodeInvitation', () => {
    expect(decodeInvitation(encodeInvitation(PAYLOAD))).toEqual(PAYLOAD);
  });
});

describe('decodeInvitation', () => {
  it('accepts raw JSON', () => {
    expect(decodeInvitation(JSON.stringify(PAYLOAD))).toEqual(PAYLOAD);
  });

  it('accepts base58, which earlier dashboard builds emitted', () => {
    const legacy = bs58.encode(
      new TextEncoder().encode(JSON.stringify(PAYLOAD)),
    );
    expect(decodeInvitation(legacy)).toEqual(PAYLOAD);
  });

  it('wraps a bare invitation in the { invitation } envelope the API wants', () => {
    const bare = JSON.stringify(PAYLOAD.invitation);
    expect(decodeInvitation(bare)).toEqual({ invitation: PAYLOAD.invitation });
  });

  it('rejects junk with a readable error', () => {
    expect(() => decodeInvitation('not-a-code')).toThrow(/invitation code/i);
    expect(() => decodeInvitation('   ')).toThrow(/empty/i);
  });
});

describe('namespaceIdFromInvitation', () => {
  it('hex-encodes the signed group id — the joiner has no other source', () => {
    const id = namespaceIdFromInvitation(PAYLOAD);
    expect(id.startsWith('0aff00')).toBe(true);
    expect(id).toHaveLength(64);
  });

  it('throws when the code carries no group id', () => {
    expect(() =>
      namespaceIdFromInvitation({ invitation: { invitation: {} } }),
    ).toThrow(/group id/i);
  });
});
