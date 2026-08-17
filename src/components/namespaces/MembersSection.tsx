import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownIcon,
  ArrowPathIcon,
  ArrowUpIcon,
  UserMinusIcon,
  UserPlusIcon,
} from '@heroicons/react/24/outline';
import {
  addGroupMembers,
  listGroupMembers,
  removeGroupMembers,
  setMemberMetadata,
  updateMemberRole,
  type GroupMember,
  type GroupMembersResult,
  type GroupRole,
} from '../../api/namespaceApi';
import {
  ConfirmButton,
  CopyBtn,
  RenameField,
  errorMessage,
  truncate,
  type ShowToast,
} from './shared';

/**
 * Roles, least- to most-privileged. Promote/demote step one rung along this
 * ladder; `ReadOnlyTee` is absent on purpose — core only ever grants it via
 * TEE attestation and rejects it on this endpoint.
 */
const ROLE_LADDER: GroupRole[] = ['ReadOnly', 'Member', 'Admin'];

function neighbour(role: string, direction: 1 | -1): GroupRole | null {
  const index = ROLE_LADDER.indexOf(role as GroupRole);
  if (index === -1) return null;
  return ROLE_LADDER[index + direction] ?? null;
}

/**
 * Members of a namespace or subgroup — the same endpoint backs both, because a
 * namespace IS a group (a root one).
 */
export function MembersSection({
  groupId,
  showToast,
  onLoaded,
}: {
  groupId: string;
  showToast: ShowToast;
  /**
   * Reports the member list up to the page, which needs it for the member
   * count and — via `selfIdentity` — to decide whether the header offers
   * Delete (admin) or Leave (everyone else).
   */
  onLoaded?: (result: GroupMembersResult) => void;
}) {
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [selfIdentity, setSelfIdentity] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newIdentity, setNewIdentity] = useState('');
  const [newRole, setNewRole] = useState<GroupRole>('Member');
  const [adding, setAdding] = useState(false);

  // Keep the callback in a ref: callers pass an inline arrow, so depending on
  // it directly would re-run the fetch on every render of the page.
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  const publish = useCallback(
    (next: GroupMember[], identity: string | undefined) => {
      onLoadedRef.current?.({ members: next, selfIdentity: identity });
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listGroupMembers(groupId);
      setMembers(result.members);
      setSelfIdentity(result.selfIdentity);
      publish(result.members, result.selfIdentity);
    } catch (e: unknown) {
      showToast(errorMessage(e, 'Failed to load members'), 'error');
      setMembers([]);
      publish([], undefined);
    } finally {
      setLoading(false);
    }
    // `showToast` is recreated by some callers; the group id is the only real
    // input, and `publish` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, publish]);

  useEffect(() => {
    load();
  }, [load]);

  const changeRole = async (identity: string, role: GroupRole) => {
    setBusy(identity);
    try {
      await updateMemberRole(groupId, identity, role);
      setMembers((prev) => {
        const next = prev.map((m) =>
          m.identity === identity ? { ...m, role } : m,
        );
        publish(next, selfIdentity);
        return next;
      });
      showToast(`Role set to ${role}`, 'success');
    } catch (e: unknown) {
      showToast(errorMessage(e, 'Failed to update role'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (identity: string) => {
    setBusy(identity);
    try {
      await removeGroupMembers(groupId, { members: [identity] });
      setMembers((prev) => {
        const next = prev.filter((m) => m.identity !== identity);
        publish(next, selfIdentity);
        return next;
      });
      showToast('Member removed', 'success');
    } catch (e: unknown) {
      showToast(errorMessage(e, 'Failed to remove member'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const rename = async (identity: string, name: string) => {
    setBusy(identity);
    try {
      await setMemberMetadata(groupId, identity, { name });
      setMembers((prev) =>
        prev.map((m) => (m.identity === identity ? { ...m, name } : m)),
      );
      showToast('Member renamed', 'success');
    } catch (e: unknown) {
      showToast(errorMessage(e, 'Failed to rename member'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const add = async () => {
    const identity = newIdentity.trim();
    if (!identity) return;
    setAdding(true);
    try {
      await addGroupMembers(groupId, {
        members: [{ identity, role: newRole }],
      });
      showToast('Member added', 'success');
      setShowAdd(false);
      setNewIdentity('');
      setNewRole('Member');
      await load();
    } catch (e: unknown) {
      showToast(errorMessage(e, 'Failed to add member'), 'error');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="ns-section" data-testid="ns-members-section">
      <div className="ns-section-header">
        <h2>Members ({loading ? '…' : members.length})</h2>
        <div className="ns-section-actions">
          <button className="btn btn-sm" onClick={load} disabled={loading}>
            <ArrowPathIcon
              style={{ width: 14, height: 14 }}
              className={loading ? 'spin' : ''}
            />
            Refresh
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setShowAdd((v) => !v)}
          >
            <UserPlusIcon style={{ width: 14, height: 14 }} />
            Add Member
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="ns-inline-form">
          <input
            className="ns-input"
            type="text"
            placeholder="Identity (public key)"
            value={newIdentity}
            onChange={(e) => setNewIdentity(e.target.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
          <select
            className="ns-input"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as GroupRole)}
            style={{ width: 130, flex: 'none' }}
            aria-label="Role for the new member"
          >
            {ROLE_LADDER.slice()
              .reverse()
              .map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
          </select>
          <button
            className="btn btn-primary btn-sm"
            onClick={add}
            disabled={adding || !newIdentity.trim()}
          >
            {adding ? 'Adding…' : 'Add'}
          </button>
          <button
            className="btn btn-sm"
            onClick={() => {
              setShowAdd(false);
              setNewIdentity('');
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {loading ? (
        <p className="ns-muted">Loading members…</p>
      ) : members.length === 0 ? (
        <p className="ns-muted">No members.</p>
      ) : (
        <table className="ns-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Identity</th>
              <th>Role</th>
              <th className="ns-table-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const isSelf = !!selfIdentity && m.identity === selfIdentity;
              const higher = neighbour(m.role, 1);
              const lower = neighbour(m.role, -1);
              return (
                <tr key={m.identity}>
                  <td>
                    <span className="ns-member-name">
                      {m.name ?? <span className="ns-muted">—</span>}
                      {isSelf && <span className="ns-you-badge">you</span>}
                    </span>
                    <RenameField
                      value={m.name}
                      placeholder="Member name"
                      busy={busy === m.identity}
                      onSave={(name) => rename(m.identity, name)}
                    />
                  </td>
                  <td className="mono">
                    <span title={m.identity}>{truncate(m.identity)}</span>
                    <CopyBtn value={m.identity} />
                  </td>
                  <td>
                    <select
                      className="ns-role-select"
                      value={m.role}
                      onChange={(e) =>
                        changeRole(m.identity, e.target.value as GroupRole)
                      }
                      disabled={busy === m.identity}
                      data-role={String(m.role).toLowerCase()}
                      aria-label={`Role of ${m.name ?? m.identity}`}
                    >
                      {/* A role the node assigned but that we don't offer
                          (e.g. ReadOnlyTee) still has to render, or the select
                          would silently show the wrong value. */}
                      {(ROLE_LADDER as string[]).includes(m.role) ? null : (
                        <option value={m.role}>{m.role}</option>
                      )}
                      {ROLE_LADDER.slice()
                        .reverse()
                        .map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td className="ns-table-right">
                    <div className="ns-row-actions">
                      {higher && (
                        <button
                          className="btn btn-sm"
                          onClick={() => changeRole(m.identity, higher)}
                          disabled={busy === m.identity}
                          title={`Promote to ${higher}`}
                        >
                          <ArrowUpIcon style={{ width: 13, height: 13 }} />
                          Promote
                        </button>
                      )}
                      {lower && (
                        <button
                          className="btn btn-sm"
                          onClick={() => changeRole(m.identity, lower)}
                          disabled={busy === m.identity}
                          title={`Demote to ${lower}`}
                        >
                          <ArrowDownIcon style={{ width: 13, height: 13 }} />
                          Demote
                        </button>
                      )}
                      {/* Removing yourself is "leave", which lives in the page
                          header and cascades properly — don't offer it here. */}
                      {!isSelf && (
                        <ConfirmButton
                          label="Remove"
                          busyLabel="Removing…"
                          busy={busy === m.identity}
                          onConfirm={() => remove(m.identity)}
                          icon={
                            <UserMinusIcon style={{ width: 13, height: 13 }} />
                          }
                          title="Remove member from this group"
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
