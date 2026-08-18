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
  looksLikeAccountId,
  removeGroupMembers,
  setMemberMetadata,
  updateMemberRole,
  type GroupMember,
  type GroupMembersResult,
  type GroupRole,
} from '../../api/namespaceApi';
import { useNodeIdentity } from './useNodeIdentity';
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
 *
 * Every id in this table is an ACCOUNT (64 hex). Since core 0.11.0-rc.23 a
 * membership row is keyed by the person, not by one of their device keys, so
 * two devices belonging to one person are one row here.
 */
export function MembersSection({
  groupId,
  showToast,
  onLoaded,
}: {
  groupId: string;
  showToast: ShowToast;
  /**
   * Reports the member list up to the page, which needs it for the member count
   * and — matched against this node's account — to decide whether the header
   * offers Delete (admin) or Leave (everyone else). The page reads the account
   * from `useNodeIdentity()` itself; the list no longer carries it.
   */
  onLoaded?: (result: GroupMembersResult) => void;
}) {
  const [members, setMembers] = useState<GroupMember[]>([]);
  // Which row is "you". rc.23 removed `selfIdentity` from the member-list
  // response, so this is the node's own account compared against each row.
  const nodeIdentity = useNodeIdentity();
  const selfAccount = nodeIdentity?.accountId;
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

  const publish = useCallback((next: GroupMember[]) => {
    onLoadedRef.current?.({ members: next });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listGroupMembers(groupId);
      setMembers(result.members);
      publish(result.members);
    } catch (e: unknown) {
      showToast(errorMessage(e, 'Failed to load members'), 'error');
      setMembers([]);
      publish([]);
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

  const changeRole = async (account: string, role: GroupRole) => {
    setBusy(account);
    try {
      await updateMemberRole(groupId, account, role);
      setMembers((prev) => {
        const next = prev.map((m) =>
          m.identity === account ? { ...m, role } : m,
        );
        publish(next);
        return next;
      });
      showToast(`Role set to ${role}`, 'success');
    } catch (e: unknown) {
      showToast(errorMessage(e, 'Failed to update role'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (account: string) => {
    setBusy(account);
    try {
      // `members` here is a list of ACCOUNTS — the same ids the listing gave
      // us. Sending the key a member signs with addresses nobody.
      await removeGroupMembers(groupId, { members: [account] });
      setMembers((prev) => {
        const next = prev.filter((m) => m.identity !== account);
        publish(next);
        return next;
      });
      showToast('Member removed', 'success');
    } catch (e: unknown) {
      showToast(errorMessage(e, 'Failed to remove member'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const rename = async (account: string, name: string) => {
    setBusy(account);
    try {
      await setMemberMetadata(groupId, account, { name });
      setMembers((prev) =>
        prev.map((m) => (m.identity === account ? { ...m, name } : m)),
      );
      showToast('Member renamed', 'success');
    } catch (e: unknown) {
      showToast(errorMessage(e, 'Failed to rename member'), 'error');
    } finally {
      setBusy(null);
    }
  };

  // Add is the only member call that names a KEY rather than an account, so an
  // id copied out of the table below (an account) silently addresses nobody
  // here. Warn on the shape rather than let the node answer with a bare error.
  const pastedAnAccount = looksLikeAccountId(newIdentity);

  const add = async () => {
    const identity = newIdentity.trim();
    if (!identity || pastedAnAccount) return;
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
            placeholder="Public key (base58)"
            aria-label="Public key of the new member"
            title="A public key, base58 — NOT the 64-hex account shown in the table. An add is the one call whose subject may not have an account on this node yet."
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
            disabled={adding || !newIdentity.trim() || pastedAnAccount}
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
          {pastedAnAccount && (
            <p className="ns-muted" data-testid="ns-add-member-hint">
              That looks like an account (64 hex). Add takes the public key the
              person signs with, in base58 — the account is what the node
              derives and shows back in the table.
            </p>
          )}
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
              <th title="The member's account, 64 hex characters. A person, not a device key — one person with two devices is one row.">
                Account
              </th>
              <th>Role</th>
              <th className="ns-table-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const isSelf = !!selfAccount && m.identity === selfAccount;
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
