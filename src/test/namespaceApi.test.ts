import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  leaveNamespace,
  leaveGroup,
  leaveContext,
  updateMemberRole,
  removeGroupMembers,
  addGroupMembers,
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
    expect(call[0]).toContain('/admin-api/groups/grp-1/members');
    expect(JSON.parse(call[1].body)).toEqual({
      members: [{ identity: 'new-key', role: 'Member' }],
    });
  });
});
