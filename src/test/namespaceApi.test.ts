import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  leaveNamespace,
  leaveGroup,
  leaveContext,
  updateMemberRole,
  removeGroupMembers,
  addGroupMembers,
  createGroupInNamespace,
  listGroupMembers,
  listNamespaces,
  listSubgroups,
  setGroupMetadata,
} from '../api/namespaceApi';

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
    await updateMemberRole('grp-1', 'identity-pub-key', 'Admin');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:2428/admin-api/groups/grp-1/members/identity-pub-key/role',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ role: 'Admin' }),
      }),
    );
  });

  it('PUTs role to Member (demote)', async () => {
    mockFetch.mockReturnValueOnce(okResponse());
    await updateMemberRole('grp-1', 'identity-pub-key', 'Member');
    const call = mockFetch.mock.calls[0];
    expect(call).toBeDefined();
    if (!call) return;
    expect(JSON.parse(call[1].body)).toEqual({ role: 'Member' });
  });

  it('throws on non-OK response', async () => {
    mockFetch.mockReturnValueOnce(errResponse(400, 'Bad Request'));
    await expect(
      updateMemberRole('grp-1', 'identity-pub-key', 'Admin'),
    ).rejects.toThrow('400');
  });
});

// ── removeGroupMembers (kick) ─────────────────────────────────────────────────

describe('removeGroupMembers (kick)', () => {
  it('POSTs to /members/remove with identity list', async () => {
    mockFetch.mockReturnValueOnce(okResponse());
    await removeGroupMembers('grp-1', { members: ['identity-pub-key'] });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:2428/admin-api/groups/grp-1/members/remove',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ members: ['identity-pub-key'] }),
      }),
    );
  });

  it('throws on non-OK response', async () => {
    mockFetch.mockReturnValueOnce(errResponse(403, 'Forbidden'));
    await expect(
      removeGroupMembers('grp-1', { members: ['key'] }),
    ).rejects.toThrow('403');
  });
});

// ── addGroupMembers ───────────────────────────────────────────────────────────

describe('addGroupMembers', () => {
  it('POSTs new member with role', async () => {
    mockFetch.mockReturnValueOnce(okResponse());
    await addGroupMembers('grp-1', {
      members: [{ identity: 'new-key', role: 'Member' }],
    });
    const call = mockFetch.mock.calls[0];
    expect(call).toBeDefined();
    if (!call) return;
    expect(call[0]).toContain('/admin-api/groups/grp-1/members');
    expect(JSON.parse(call[1].body)).toEqual({
      members: [{ identity: 'new-key', role: 'Member' }],
    });
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

  it('listGroupMembers reads { members, selfIdentity } — NOT { data }', async () => {
    mockFetch.mockReturnValueOnce(
      okResponse({
        members: [{ identity: 'k1', role: 'Admin', name: 'Fran' }],
        selfIdentity: 'k1',
      }),
    );
    const result = await listGroupMembers('grp-1');
    expect(result.members).toHaveLength(1);
    expect(result.selfIdentity).toBe('k1');
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
