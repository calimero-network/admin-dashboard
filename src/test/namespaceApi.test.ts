import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  leaveNamespace,
  leaveGroup,
  leaveContext,
  getNodeIdentity,
  looksLikeAccountId,
  updateMemberRole,
  removeGroupMembers,
  addGroupMembers,
  createGroupInNamespace,
  listGroupMembers,
  listNamespaces,
  listSubgroups,
  setGroupMetadata,
} from '../api/namespaceApi';

/**
 * Ids in these fixtures are shaped the way the wire shapes them, because the
 * shapes are half of what is under test: an ACCOUNT is 64 hex characters and a
 * KEY is base58. Since core 0.11.0-rc.23 every member call but `add` names the
 * account, and using a stand-in string like 'identity-pub-key' everywhere hides
 * exactly the mix-up these tests are here to catch.
 */
const ACCOUNT = 'a'.repeat(64);
const OTHER_ACCOUNT = 'b'.repeat(64);
const PUBLIC_KEY = '2Fb1JXPZQZmGRoLPS9F6JsPRRTL1cKnQfCzYAeZLmDaG';

// Mock calimero-client before importing namespaceApi
vi.mock('@calimero-network/calimero-client', () => ({
  getAppEndpointKey: () => 'http://localhost:2428',
  getAccessToken: () => 'test-token',
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

function okResponse(body: unknown = '') {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return Promise.resolve({
    ok: true,
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(typeof body === 'string' ? {} : body),
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

beforeEach(() => {
  mockFetch.mockReset();
});

// ── leaveNamespace ────────────────────────────────────────────────────────────

describe('leaveNamespace', () => {
  it('POSTs to /admin-api/namespaces/:id/leave', async () => {
    mockFetch.mockReturnValueOnce(okResponse());
    await leaveNamespace('ns-abc');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:2428/admin-api/namespaces/ns-abc/leave',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws on non-OK response', async () => {
    mockFetch.mockReturnValueOnce(errResponse(403, 'Forbidden'));
    await expect(leaveNamespace('ns-abc')).rejects.toThrow('403');
  });
});

// ── leaveGroup ────────────────────────────────────────────────────────────────

describe('leaveGroup', () => {
  it('POSTs to /admin-api/groups/:id/leave', async () => {
    mockFetch.mockReturnValueOnce(okResponse());
    await leaveGroup('grp-xyz');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:2428/admin-api/groups/grp-xyz/leave',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws on non-OK response', async () => {
    mockFetch.mockReturnValueOnce(errResponse(500, 'Server Error'));
    await expect(leaveGroup('grp-xyz')).rejects.toThrow('500');
  });
});

// ── leaveContext ──────────────────────────────────────────────────────────────

describe('leaveContext', () => {
  it('POSTs to /admin-api/contexts/:id/leave', async () => {
    mockFetch.mockReturnValueOnce(okResponse());
    await leaveContext('ctx-123');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:2428/admin-api/contexts/ctx-123/leave',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws on non-OK response', async () => {
    mockFetch.mockReturnValueOnce(errResponse(404, 'Not Found'));
    await expect(leaveContext('ctx-123')).rejects.toThrow('404');
  });
});

// ── updateMemberRole (promote / demote) ───────────────────────────────────────

describe('updateMemberRole', () => {
  it('PUTs role to Admin (promote)', async () => {
    mockFetch.mockReturnValueOnce(okResponse());
    // The path segment is core's `:account`, so this is the 64-hex account
    // the listing returned — not the key the member signs with.
    await updateMemberRole('grp-1', ACCOUNT, 'Admin');
    expect(mockFetch).toHaveBeenCalledWith(
      `http://localhost:2428/admin-api/groups/grp-1/members/${ACCOUNT}/role`,
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ role: 'Admin' }),
      }),
    );
  });

  it('PUTs role to Member (demote)', async () => {
    mockFetch.mockReturnValueOnce(okResponse());
    await updateMemberRole('grp-1', ACCOUNT, 'Member');
    const call = mockFetch.mock.calls[0];
    expect(call).toBeDefined();
    if (!call) return;
    expect(JSON.parse(call[1].body)).toEqual({ role: 'Member' });
  });

  it('throws on non-OK response', async () => {
    mockFetch.mockReturnValueOnce(errResponse(400, 'Bad Request'));
    await expect(updateMemberRole('grp-1', ACCOUNT, 'Admin')).rejects.toThrow(
      '400',
    );
  });
});

// ── removeGroupMembers (kick) ─────────────────────────────────────────────────

describe('removeGroupMembers (kick)', () => {
  it('POSTs to /members/remove with an ACCOUNT list', async () => {
    mockFetch.mockReturnValueOnce(okResponse());
    await removeGroupMembers('grp-1', { members: [OTHER_ACCOUNT] });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:2428/admin-api/groups/grp-1/members/remove',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ members: [OTHER_ACCOUNT] }),
      }),
    );
  });

  it('throws on non-OK response', async () => {
    mockFetch.mockReturnValueOnce(errResponse(403, 'Forbidden'));
    await expect(
      removeGroupMembers('grp-1', { members: [OTHER_ACCOUNT] }),
    ).rejects.toThrow('403');
  });
});

// ── addGroupMembers ───────────────────────────────────────────────────────────

describe('addGroupMembers', () => {
  // The ONE member call that still names a key. An add's subject may hold no
  // account on this node yet — the account is a hash of a genesis the node only
  // learns once they have joined — so requiring one would make the endpoint
  // uncallable in exactly the case it exists for.
  it('POSTs new member as a KEY, not an account', async () => {
    mockFetch.mockReturnValueOnce(okResponse());
    await addGroupMembers('grp-1', {
      members: [{ identity: PUBLIC_KEY, role: 'Member' }],
    });
    const call = mockFetch.mock.calls[0];
    expect(call).toBeDefined();
    if (!call) return;
    expect(call[0]).toContain('/admin-api/groups/grp-1/members');
    expect(JSON.parse(call[1].body)).toEqual({
      members: [{ identity: PUBLIC_KEY, role: 'Member' }],
    });
  });
});

// ── Account vs key ────────────────────────────────────────────────────────────

describe('looksLikeAccountId', () => {
  // The UI uses this to stop an account being pasted into the add-member box,
  // which is the one field that wants a key. Base58 has no `0`, so a
  // 64-character all-hex string is an account with near-certainty.
  it('recognises a 64-hex account', () => {
    expect(looksLikeAccountId(ACCOUNT)).toBe(true);
    expect(looksLikeAccountId(`  ${ACCOUNT}  `)).toBe(true);
  });

  it('rejects a base58 public key', () => {
    expect(looksLikeAccountId(PUBLIC_KEY)).toBe(false);
    expect(looksLikeAccountId('')).toBe(false);
    expect(looksLikeAccountId('a'.repeat(63))).toBe(false);
  });
});

// ── Node identity ─────────────────────────────────────────────────────────────

describe('getNodeIdentity', () => {
  // rc.23 deleted `GET /namespaces/:id/identity` (#3522). It took a namespace
  // and answered with the node's account whichever one you passed, so this
  // route has no namespace in it at all — that is the entire change.
  it('GETs the node-level route and unwraps { data }', async () => {
    mockFetch.mockReturnValueOnce(
      okResponse({
        data: {
          accountId: ACCOUNT,
          deviceId: 'd'.repeat(64),
          publicKey: PUBLIC_KEY,
          accountRootPublicKey: 'r'.repeat(64),
        },
      }),
    );
    const identity = await getNodeIdentity();
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:2428/admin-api/identity',
      expect.anything(),
    );
    expect(identity.accountId).toBe(ACCOUNT);
    expect(identity.publicKey).toBe(PUBLIC_KEY);
  });

  // A node that has taken part in nothing holds neither a device nor an
  // account root, so there is no account to report rather than an empty one.
  // Callers treat the rejection as "unknown", never as a failure worth a toast.
  it('rejects when the node has no identity yet', async () => {
    mockFetch.mockReturnValueOnce(
      errResponse(404, JSON.stringify({ error: 'this node holds neither' })),
    );
    await expect(getNodeIdentity()).rejects.toThrow('404');
  });
});

// ── Response envelopes ────────────────────────────────────────────────────────
//
// These three endpoints do NOT share an envelope, and each was previously
// unwrapped as if it did — which produced a silently empty list rather than an
// error, so members and subgroups never rendered at all.

describe('response envelopes', () => {
  it('listNamespaces reads { data: [...] }', async () => {
    mockFetch.mockReturnValueOnce(
      okResponse({ data: [{ namespaceId: 'ns-1', name: 'Team' }] }),
    );
    const result = await listNamespaces();
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Team');
  });

  // rc.23 carries `members` and NOTHING else — `selfIdentity` is gone. The
  // fixture keeps the ids account-shaped so a reader can see what a row holds.
  it('listGroupMembers reads { members } — NOT { data }', async () => {
    mockFetch.mockReturnValueOnce(
      okResponse({
        members: [{ identity: ACCOUNT, role: 'Admin', name: 'Fran' }],
      }),
    );
    const result = await listGroupMembers('grp-1');
    expect(result.members).toHaveLength(1);
    expect(result.members[0]?.identity).toBe(ACCOUNT);
    // Nothing may reintroduce a self field by reading it off the response.
    expect(Object.keys(result)).toEqual(['members']);
  });

  it('listSubgroups reads { subgroups } — NOT { data }', async () => {
    mockFetch.mockReturnValueOnce(
      okResponse({ subgroups: [{ groupId: 'g-1', name: 'engineering' }] }),
    );
    const result = await listSubgroups('grp-1');
    expect(result).toEqual([{ groupId: 'g-1', name: 'engineering' }]);
  });

  it('surfaces the node error message rather than the raw body', async () => {
    mockFetch.mockReturnValueOnce(
      errResponse(
        400,
        JSON.stringify({ error: 'namespace_id must be a root group' }),
      ),
    );
    await expect(listSubgroups('grp-1')).rejects.toThrow(
      '400: namespace_id must be a root group',
    );
  });
});

// ── Naming ────────────────────────────────────────────────────────────────────

describe('names', () => {
  it('createGroupInNamespace sends groupName, the key core actually reads', async () => {
    mockFetch.mockReturnValueOnce(okResponse({ data: { groupId: 'g-1' } }));
    await createGroupInNamespace('ns-1', {
      groupName: 'engineering',
      visibility: 'open',
    });
    const call = mockFetch.mock.calls[0];
    expect(call).toBeDefined();
    if (!call) return;
    const body = JSON.parse(call[1].body);
    // `name` alone is dropped by serde on this endpoint — that is the
    // long-standing "subgroup names don't persist" bug.
    expect(body.groupName).toBe('engineering');
    expect(body.visibility).toBe('open');
  });

  it('setGroupMetadata always sends a data map, since core replaces the record', async () => {
    mockFetch.mockReturnValueOnce(okResponse());
    await setGroupMetadata('g-1', { name: 'design' });
    const call = mockFetch.mock.calls[0];
    expect(call).toBeDefined();
    if (!call) return;
    expect(call[0]).toContain('/admin-api/groups/g-1/metadata');
    expect(call[1].method).toBe('PUT');
    expect(JSON.parse(call[1].body)).toEqual({ name: 'design', data: {} });
  });
});
