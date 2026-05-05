import React, { useState, useEffect, useCallback } from 'react';
import bs58 from 'bs58';
import { Navigation } from '../components/Navigation';
import { apiClient } from '@calimero-network/calimero-client';
import {
  ArrowPathIcon,
  TrashIcon,
  ChevronRightIcon,
  PlusIcon,
  ArrowLeftIcon,
  DocumentDuplicateIcon,
  UserPlusIcon,
  UserMinusIcon,
} from '@heroicons/react/24/outline';
import {
  listNamespaces,
  getNamespaceIdentity,
  createNamespace,
  deleteNamespace,
  createNamespaceInvitation,
  joinNamespace,
  createGroupInNamespace,
  listNamespaceGroups,
  getGroupInfo,
  listGroupMembers,
  listGroupContexts,
  listSubgroups,
  addGroupMembers,
  removeGroupMembers,
  updateMemberRole,
  createGroupInvitation,
  joinGroup,
  setSubgroupVisibility,
  leaveNamespace,
  leaveGroup,
  leaveContext,
  type Namespace,
  type GroupInfo,
  type GroupMember,
  type GroupContextEntry,
  type SubgroupEntry,
} from '../api/namespaceApi';
import './NamespacesPage.css';

type View =
  | { type: 'list' }
  | { type: 'namespace'; ns: Namespace }
  | { type: 'group'; ns: Namespace; groupId: string };

interface Toast {
  msg: string;
  type: 'success' | 'error';
}

function truncate(str: string, max = 24): string {
  return str.length > max ? `${str.slice(0, 10)}…${str.slice(-10)}` : str;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

function encodeInvitation(obj: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  return bs58.encode(bytes);
}

function decodeInvitation(input: string): unknown {
  const trimmed = input.trim();
  // Try base58 first, fall back to raw JSON
  try {
    const bytes = bs58.decode(trimmed);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return JSON.parse(trimmed);
  }
}

function CopyBtn({ value }: { value: string }) {
  return (
    <button
      className="ns-copy-btn"
      title="Copy"
      onClick={(e) => {
        e.stopPropagation();
        copyToClipboard(value);
      }}
    >
      <DocumentDuplicateIcon style={{ width: 12, height: 12 }} />
    </button>
  );
}

export default function NamespacesPage() {
  const [view, setView] = useState<View>({ type: 'list' });
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const goBack = () => {
    if (view.type === 'group') {
      setView({ type: 'namespace', ns: view.ns });
    } else if (view.type === 'namespace') {
      setView({ type: 'list' });
    }
  };

  return (
    <div className="app-shell">
      <Navigation />
      <main className="page-content">
        {toast && (
          <div className={`alert alert-${toast.type} ns-toast`}>
            {toast.msg}
          </div>
        )}
        {view.type === 'list' && (
          <NamespaceList
            onOpen={(ns) => setView({ type: 'namespace', ns })}
            showToast={showToast}
          />
        )}
        {view.type === 'namespace' && (
          <NamespaceDetail
            ns={view.ns}
            onBack={goBack}
            onOpenGroup={(groupId) =>
              setView({ type: 'group', ns: view.ns, groupId })
            }
            showToast={showToast}
          />
        )}
        {view.type === 'group' && (
          <GroupDetail
            ns={view.ns}
            groupId={view.groupId}
            onBack={goBack}
            onOpenSubgroup={(groupId) =>
              setView({ type: 'group', ns: view.ns, groupId })
            }
            showToast={showToast}
          />
        )}
      </main>
    </div>
  );
}

// ── Namespace List ──────────────────────────────────────────────────────────

function NamespaceList({
  onOpen,
  showToast,
}: {
  onOpen: (ns: Namespace) => void;
  showToast: (msg: string, type: 'success' | 'error') => void;
}) {
  const [namespaces, setNamespaces] = useState<Namespace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createAppId, setCreateAppId] = useState('');
  const [createUpgradePolicy, setCreateUpgradePolicy] = useState('Automatic');
  const [createAlias, setCreateAlias] = useState('');
  const [creating, setCreating] = useState(false);
  const [installedApps, setInstalledApps] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [useCustomAppId, setUseCustomAppId] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listNamespaces();
      setNamespaces(Array.isArray(result) ? result : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    apiClient
      .node()
      .getInstalledApplications()
      .then((res) => {
        const apps: Array<{ id: string; metadata: number[] }> =
          (res.data as any)?.data?.apps ?? (res.data as any)?.apps ?? [];
        setInstalledApps(
          apps.map((app) => {
            let name = app.id;
            try {
              const decoded = JSON.parse(
                new TextDecoder().decode(new Uint8Array(app.metadata ?? [])),
              );
              if (decoded.name) name = decoded.name;
            } catch {}
            return { id: app.id, name };
          }),
        );
      })
      .catch(() => {});
  }, [load]);

  const handleDelete = async (namespaceId: string) => {
    setConfirmDelete(null);
    setDeleting(namespaceId);
    try {
      await deleteNamespace(namespaceId);
      showToast('Namespace deleted', 'success');
      await load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Delete failed', 'error');
    } finally {
      setDeleting(null);
    }
  };

  const handleCreate = async () => {
    if (!createAppId.trim()) return;
    setCreating(true);
    try {
      await createNamespace({
        applicationId: createAppId.trim(),
        upgradePolicy: createUpgradePolicy,
        alias: createAlias.trim() || undefined,
      });
      showToast('Namespace created', 'success');
      setShowCreateForm(false);
      setCreateAppId('');
      setCreateAlias('');
      setUseCustomAppId(false);
      await load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Create failed', 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Namespaces</h1>
          <p>Manage namespaces, groups, and their members</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={load} disabled={loading}>
            <ArrowPathIcon
              style={{ width: 16, height: 16 }}
              className={loading ? 'spin' : ''}
            />
            Refresh
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setShowCreateForm((v) => !v)}
          >
            <PlusIcon style={{ width: 16, height: 16 }} />
            New Namespace
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {showCreateForm && (
        <div className="ctx-start-form">
          <h3 className="ctx-start-title">Create Namespace</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="ns-form-field">
              <label>Application</label>
              {installedApps.length > 0 && !useCustomAppId ? (
                <>
                  <select
                    className="ctx-start-input"
                    value={createAppId}
                    onChange={(e) => setCreateAppId(e.target.value)}
                    style={{ fontFamily: 'inherit' }}
                  >
                    <option value="">Select an installed application…</option>
                    {installedApps.map((app) => (
                      <option key={app.id} value={app.id}>
                        {app.name !== app.id
                          ? `${app.name} — ${app.id.slice(0, 16)}…`
                          : app.id}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="ns-toggle-link"
                    onClick={() => {
                      setUseCustomAppId(true);
                      setCreateAppId('');
                    }}
                  >
                    Enter ID manually
                  </button>
                </>
              ) : (
                <>
                  <input
                    className="ctx-start-input"
                    type="text"
                    placeholder="Application ID"
                    value={createAppId}
                    onChange={(e) => setCreateAppId(e.target.value)}
                  />
                  {installedApps.length > 0 && (
                    <button
                      type="button"
                      className="ns-toggle-link"
                      onClick={() => {
                        setUseCustomAppId(false);
                        setCreateAppId('');
                      }}
                    >
                      Pick from installed apps
                    </button>
                  )}
                </>
              )}
            </div>
            <div className="ns-form-field">
              <label>Upgrade Policy</label>
              <select
                className="ctx-start-input"
                value={createUpgradePolicy}
                onChange={(e) => setCreateUpgradePolicy(e.target.value)}
              >
                <option value="Automatic">
                  Automatic — upgrade as soon as new version available
                </option>
                <option value="LazyOnAccess">
                  LazyOnAccess — upgrade on next use
                </option>
                <option value="Coordinated">
                  Coordinated — manual/scheduled upgrade
                </option>
              </select>
            </div>
            <div className="ns-form-field">
              <label>Alias (optional)</label>
              <input
                className="ctx-start-input"
                type="text"
                placeholder="e.g. my-namespace"
                value={createAlias}
                onChange={(e) => setCreateAlias(e.target.value)}
              />
            </div>
            <div className="ctx-start-row">
              <button
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={creating || !createAppId.trim()}
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
              <button
                className="btn"
                onClick={() => {
                  setShowCreateForm(false);
                  setCreateAppId('');
                  setCreateAlias('');
                  setUseCustomAppId(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && namespaces.length === 0 ? (
        <div className="ctx-list">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="ctx-row ctx-row-skeleton">
              <div className="skel-line skel-title" />
              <div className="skel-line skel-short" />
            </div>
          ))}
        </div>
      ) : namespaces.length === 0 ? (
        <div className="empty-state">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776"
            />
          </svg>
          <h3>No namespaces found</h3>
          <p>Create a namespace to get started.</p>
        </div>
      ) : (
        <table
          style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}
        >
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
              {[
                'Namespace ID',
                'Application',
                'Members',
                'Contexts',
                'Groups',
                'Policy',
                'Actions',
              ].map((h, i) => (
                <th
                  key={h}
                  style={{
                    textAlign:
                      i >= 2 && i <= 5 ? 'center' : i === 6 ? 'right' : 'left',
                    padding: '8px 12px',
                    color: 'var(--text-secondary)',
                    fontWeight: 500,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {namespaces.map((ns) => (
              <tr
                key={ns.namespaceId}
                style={{
                  borderBottom: '1px solid var(--border-color)',
                  cursor: 'pointer',
                }}
                onClick={() => onOpen(ns)}
              >
                <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>
                  <span title={ns.namespaceId}>{truncate(ns.namespaceId)}</span>
                  <CopyBtn value={ns.namespaceId} />
                  {ns.alias && (
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: 11,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {ns.alias}
                    </span>
                  )}
                </td>
                <td
                  style={{
                    padding: '10px 12px',
                    fontFamily: 'monospace',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span title={ns.targetApplicationId}>
                    {truncate(ns.targetApplicationId)}
                  </span>
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                  {ns.memberCount}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                  {ns.contextCount}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                  {ns.subgroupCount}
                </td>
                <td
                  style={{
                    padding: '10px 12px',
                    textAlign: 'center',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {ns.upgradePolicy}
                </td>
                <td
                  style={{ padding: '10px 12px', textAlign: 'right' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      justifyContent: 'flex-end',
                    }}
                  >
                    <button className="btn btn-sm" onClick={() => onOpen(ns)}>
                      <ChevronRightIcon style={{ width: 14, height: 14 }} />
                      View
                    </button>
                    {confirmDelete === ns.namespaceId ? (
                      <>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(ns.namespaceId)}
                          disabled={deleting === ns.namespaceId}
                        >
                          {deleting === ns.namespaceId
                            ? 'Deleting…'
                            : 'Confirm'}
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={() => setConfirmDelete(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        className="btn btn-sm"
                        onClick={() => setConfirmDelete(ns.namespaceId)}
                        title="Delete namespace"
                      >
                        <TrashIcon style={{ width: 14, height: 14 }} />
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

// ── Namespace Detail ────────────────────────────────────────────────────────

function NamespaceDetail({
  ns: initialNs,
  onBack,
  onOpenGroup,
  showToast,
}: {
  ns: Namespace;
  onBack: () => void;
  onOpenGroup: (groupId: string) => void;
  showToast: (msg: string, type: 'success' | 'error') => void;
}) {
  const [ns, setNs] = useState<Namespace>(initialNs);
  const [groups, setGroups] = useState<SubgroupEntry[]>([]);
  const [identity, setIdentity] = useState<string | null>(null);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupAlias, setGroupAlias] = useState('');
  const [groupVisibility, setGroupVisibility] = useState<'open' | 'restricted'>(
    'open',
  );
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [invitation, setInvitation] = useState<string | null>(null);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [joinJson, setJoinJson] = useState('');
  const [showJoin, setShowJoin] = useState(false);
  const [joining, setJoining] = useState(false);
  const [confirmLeaveNs, setConfirmLeaveNs] = useState(false);
  const [leavingNs, setLeavingNs] = useState(false);

  const loadGroups = useCallback(async () => {
    setLoadingGroups(true);
    try {
      const result = await listNamespaceGroups(ns.namespaceId);
      setGroups(Array.isArray(result) ? result : []);
    } catch {
      setGroups([]);
    } finally {
      setLoadingGroups(false);
    }
  }, [ns.namespaceId]);

  useEffect(() => {
    loadGroups();
    getNamespaceIdentity(ns.namespaceId)
      .then((id) => setIdentity(id.publicKey))
      .catch(() => setIdentity(null));
  }, [ns.namespaceId, loadGroups]);

  const handleCreateGroup = async () => {
    setCreatingGroup(true);
    try {
      const result = await createGroupInNamespace(ns.namespaceId, {
        groupAlias: groupAlias.trim() || undefined,
      });
      await setSubgroupVisibility(result.groupId, groupVisibility).catch(
        () => {},
      );
      showToast(`Group created: ${truncate(result.groupId)}`, 'success');
      setShowCreateGroup(false);
      setGroupAlias('');
      setGroupVisibility('open');
      await loadGroups();
      setNs((prev) => ({ ...prev, subgroupCount: prev.subgroupCount + 1 }));
    } catch (e: unknown) {
      showToast(
        e instanceof Error ? e.message : 'Failed to create group',
        'error',
      );
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleCreateInvitation = async () => {
    setCreatingInvite(true);
    try {
      const result = await createNamespaceInvitation(ns.namespaceId);
      setInvitation(encodeInvitation(result));
    } catch (e: unknown) {
      showToast(
        e instanceof Error ? e.message : 'Failed to create invitation',
        'error',
      );
    } finally {
      setCreatingInvite(false);
    }
  };

  const handleJoin = async () => {
    setJoining(true);
    try {
      const parsed = decodeInvitation(joinJson) as Record<string, unknown>;
      const invitationPayload = parsed.invitation ?? parsed;
      await joinNamespace(ns.namespaceId, { invitation: invitationPayload });
      showToast('Joined namespace', 'success');
      setShowJoin(false);
      setJoinJson('');
    } catch (e: unknown) {
      showToast(
        e instanceof Error ? e.message : 'Failed to join namespace',
        'error',
      );
    } finally {
      setJoining(false);
    }
  };

  const handleLeaveNamespace = async () => {
    setConfirmLeaveNs(false);
    setLeavingNs(true);
    try {
      await leaveNamespace(ns.namespaceId);
      showToast('Left namespace', 'success');
      onBack();
    } catch (e: unknown) {
      showToast(
        e instanceof Error ? e.message : 'Failed to leave namespace',
        'error',
      );
    } finally {
      setLeavingNs(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <button className="btn" onClick={onBack} style={{ marginRight: 8 }}>
            <ArrowLeftIcon style={{ width: 14, height: 14 }} />
            Back
          </button>
          <div>
            <h1>
              {ns.alias || truncate(ns.namespaceId, 20)}
              <CopyBtn value={ns.namespaceId} />
            </h1>
            <p style={{ fontFamily: 'monospace', fontSize: 12 }}>
              {truncate(ns.namespaceId, 32)}
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="ns-stats-row">
        <div className="ns-stat-card">
          <div className="ns-stat-value">{ns.memberCount}</div>
          <div className="ns-stat-label">Members</div>
        </div>
        <div className="ns-stat-card">
          <div className="ns-stat-value">{ns.contextCount}</div>
          <div className="ns-stat-label">Contexts</div>
        </div>
        <div className="ns-stat-card">
          <div className="ns-stat-value">{ns.subgroupCount}</div>
          <div className="ns-stat-label">Groups</div>
        </div>
        <div className="ns-stat-card">
          <div className="ns-stat-value ns-stat-small">{ns.upgradePolicy}</div>
          <div className="ns-stat-label">Upgrade Policy</div>
        </div>
      </div>

      {/* Application */}
      <div className="ns-section">
        <h2>Application</h2>
        <div className="ns-kv-row">
          <span className="ns-kv-label">Target Application ID</span>
          <span className="ns-kv-value mono">
            {truncate(ns.targetApplicationId, 40)}
            <CopyBtn value={ns.targetApplicationId} />
          </span>
        </div>
        {identity && (
          <div className="ns-kv-row">
            <span className="ns-kv-label">Namespace Public Key</span>
            <span className="ns-kv-value mono">
              {truncate(identity, 40)}
              <CopyBtn value={identity} />
            </span>
          </div>
        )}
      </div>

      {/* Groups */}
      <div className="ns-section">
        <div className="ns-section-header">
          <h2>Groups ({groups.length})</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-sm"
              onClick={loadGroups}
              disabled={loadingGroups}
            >
              <ArrowPathIcon
                style={{ width: 14, height: 14 }}
                className={loadingGroups ? 'spin' : ''}
              />
              Refresh
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setShowCreateGroup((v) => !v)}
            >
              <PlusIcon style={{ width: 14, height: 14 }} />
              New Group
            </button>
          </div>
        </div>

        {showCreateGroup && (
          <div className="ns-inline-form">
            <input
              className="ctx-start-input"
              type="text"
              placeholder="Alias (optional)"
              value={groupAlias}
              onChange={(e) => setGroupAlias(e.target.value)}
            />
            <select
              className="ctx-start-input"
              value={groupVisibility}
              onChange={(e) =>
                setGroupVisibility(e.target.value as 'open' | 'restricted')
              }
              style={{ width: 130 }}
              title="Visibility: Open = parent group members can join automatically; Restricted = invite only"
            >
              <option value="open">Open (public)</option>
              <option value="restricted">Restricted (private)</option>
            </select>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleCreateGroup}
              disabled={creatingGroup}
            >
              {creatingGroup ? 'Creating…' : 'Create Group'}
            </button>
            <button
              className="btn btn-sm"
              onClick={() => {
                setShowCreateGroup(false);
                setGroupAlias('');
                setGroupVisibility('open');
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {loadingGroups ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            Loading groups…
          </p>
        ) : groups.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            No groups in this namespace.
          </p>
        ) : (
          <div className="ns-group-list">
            {groups.map((g) => (
              <button
                key={g.groupId}
                className="ns-group-row"
                onClick={() => onOpenGroup(g.groupId)}
              >
                <span className="mono" title={g.groupId}>
                  {truncate(g.groupId)}
                </span>
                {g.alias && <span className="ns-group-alias">{g.alias}</span>}
                <ChevronRightIcon
                  style={{ width: 14, height: 14, marginLeft: 'auto' }}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Invitation */}
      <div className="ns-section">
        <h2>Membership</h2>
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 12,
          }}
        >
          <button
            className="btn btn-sm"
            onClick={handleCreateInvitation}
            disabled={creatingInvite}
          >
            {creatingInvite ? 'Generating…' : 'Create Invitation'}
          </button>
          <button className="btn btn-sm" onClick={() => setShowJoin((v) => !v)}>
            Join Namespace
          </button>
          {confirmLeaveNs ? (
            <>
              <button
                className="btn btn-danger btn-sm"
                onClick={handleLeaveNamespace}
                disabled={leavingNs}
              >
                {leavingNs ? 'Leaving…' : 'Confirm Leave'}
              </button>
              <button
                className="btn btn-sm"
                onClick={() => setConfirmLeaveNs(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              className="btn btn-sm"
              onClick={() => setConfirmLeaveNs(true)}
            >
              Leave Namespace
            </button>
          )}
        </div>

        {invitation && (
          <div className="ns-invitation-box">
            <div className="ns-invitation-header">
              <span>Invitation code — share this with the new member</span>
              <button
                className="ns-copy-btn"
                onClick={() => copyToClipboard(invitation)}
              >
                <DocumentDuplicateIcon style={{ width: 13, height: 13 }} />
                Copy
              </button>
            </div>
            <textarea
              className="ns-invitation-textarea"
              readOnly
              value={invitation}
              rows={3}
            />
          </div>
        )}

        {showJoin && (
          <div
            className="ns-inline-form"
            style={{ flexDirection: 'column', alignItems: 'stretch' }}
          >
            <label
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                marginBottom: 4,
              }}
            >
              Paste invitation code
            </label>
            <textarea
              className="ctx-start-input"
              style={{
                fontFamily: 'monospace',
                fontSize: 12,
                resize: 'vertical',
              }}
              rows={3}
              value={joinJson}
              onChange={(e) => setJoinJson(e.target.value)}
              placeholder="Paste base58 invitation code or raw JSON…"
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleJoin}
                disabled={joining || !joinJson.trim()}
              >
                {joining ? 'Joining…' : 'Join'}
              </button>
              <button
                className="btn btn-sm"
                onClick={() => {
                  setShowJoin(false);
                  setJoinJson('');
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Group Detail ────────────────────────────────────────────────────────────

function GroupDetail({
  ns,
  groupId,
  onBack,
  onOpenSubgroup,
  showToast,
}: {
  ns: Namespace;
  groupId: string;
  onBack: () => void;
  onOpenSubgroup: (groupId: string) => void;
  showToast: (msg: string, type: 'success' | 'error') => void;
}) {
  const [groupInfo, setGroupInfo] = useState<GroupInfo | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [contexts, setContexts] = useState<GroupContextEntry[]>([]);
  const [subgroups, setSubgroups] = useState<SubgroupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newIdentity, setNewIdentity] = useState('');
  const [newRole, setNewRole] = useState('Member');
  const [addingMember, setAddingMember] = useState(false);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<string | null>(null);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [joinJson, setJoinJson] = useState('');
  const [showJoin, setShowJoin] = useState(false);
  const [joining, setJoining] = useState(false);
  const [confirmLeaveGroup, setConfirmLeaveGroup] = useState(false);
  const [leavingGroup, setLeavingGroup] = useState(false);
  const [confirmLeaveCtx, setConfirmLeaveCtx] = useState<string | null>(null);
  const [leavingCtx, setLeavingCtx] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [info, mems, ctxs, subs] = await Promise.allSettled([
        getGroupInfo(groupId),
        listGroupMembers(groupId),
        listGroupContexts(groupId),
        listSubgroups(groupId),
      ]);
      if (info.status === 'fulfilled') setGroupInfo(info.value);
      if (mems.status === 'fulfilled')
        setMembers(Array.isArray(mems.value) ? mems.value : []);
      if (ctxs.status === 'fulfilled')
        setContexts(Array.isArray(ctxs.value) ? ctxs.value : []);
      if (subs.status === 'fulfilled')
        setSubgroups(Array.isArray(subs.value) ? subs.value : []);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleRemoveMember = async (identity: string) => {
    setConfirmRemove(null);
    setRemoving(identity);
    try {
      await removeGroupMembers(groupId, { members: [identity] });
      showToast('Member removed', 'success');
      setMembers((prev) => prev.filter((m) => m.identity !== identity));
    } catch (e: unknown) {
      showToast(
        e instanceof Error ? e.message : 'Failed to remove member',
        'error',
      );
    } finally {
      setRemoving(null);
    }
  };

  const handleAddMember = async () => {
    if (!newIdentity.trim()) return;
    setAddingMember(true);
    try {
      await addGroupMembers(groupId, {
        members: [{ identity: newIdentity.trim(), role: newRole }],
      });
      showToast('Member added', 'success');
      setShowAddMember(false);
      setNewIdentity('');
      setNewRole('Member');
      await loadAll();
    } catch (e: unknown) {
      showToast(
        e instanceof Error ? e.message : 'Failed to add member',
        'error',
      );
    } finally {
      setAddingMember(false);
    }
  };

  const handleRoleChange = async (identity: string, role: string) => {
    setUpdatingRole(identity);
    try {
      await updateMemberRole(groupId, identity, role);
      setMembers((prev) =>
        prev.map((m) => (m.identity === identity ? { ...m, role } : m)),
      );
      showToast('Role updated', 'success');
    } catch (e: unknown) {
      showToast(
        e instanceof Error ? e.message : 'Failed to update role',
        'error',
      );
    } finally {
      setUpdatingRole(null);
    }
  };

  const handleCreateInvitation = async () => {
    setCreatingInvite(true);
    try {
      const result = await createGroupInvitation(groupId);
      setInvitation(encodeInvitation(result));
    } catch (e: unknown) {
      showToast(
        e instanceof Error ? e.message : 'Failed to create invitation',
        'error',
      );
    } finally {
      setCreatingInvite(false);
    }
  };

  const handleJoinGroup = async () => {
    setJoining(true);
    try {
      const parsed = decodeInvitation(joinJson) as Record<string, unknown>;
      const invitationPayload = parsed.invitation ?? parsed;
      await joinGroup({ invitation: invitationPayload });
      showToast('Joined group', 'success');
      setShowJoin(false);
      setJoinJson('');
    } catch (e: unknown) {
      showToast(
        e instanceof Error ? e.message : 'Failed to join group',
        'error',
      );
    } finally {
      setJoining(false);
    }
  };

  const handleLeaveGroup = async () => {
    setConfirmLeaveGroup(false);
    setLeavingGroup(true);
    try {
      await leaveGroup(groupId);
      showToast('Left group', 'success');
      onBack();
    } catch (e: unknown) {
      showToast(
        e instanceof Error ? e.message : 'Failed to leave group',
        'error',
      );
    } finally {
      setLeavingGroup(false);
    }
  };

  const handleLeaveContext = async (contextId: string) => {
    setConfirmLeaveCtx(null);
    setLeavingCtx(contextId);
    try {
      await leaveContext(contextId);
      showToast('Left context', 'success');
      setContexts((prev) => prev.filter((c) => c.contextId !== contextId));
    } catch (e: unknown) {
      showToast(
        e instanceof Error ? e.message : 'Failed to leave context',
        'error',
      );
    } finally {
      setLeavingCtx(null);
    }
  };

  const alias = groupInfo?.alias;

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <button className="btn" onClick={onBack} style={{ marginRight: 8 }}>
            <ArrowLeftIcon style={{ width: 14, height: 14 }} />
            Back
          </button>
          <div>
            <h1>
              {alias || truncate(groupId, 20)}
              <CopyBtn value={groupId} />
            </h1>
            <p style={{ fontFamily: 'monospace', fontSize: 12 }}>
              {truncate(groupId, 32)} &middot; namespace:{' '}
              {ns.alias || truncate(ns.namespaceId)}
            </p>
          </div>
        </div>
        <button className="btn btn-sm" onClick={loadAll} disabled={loading}>
          <ArrowPathIcon
            style={{ width: 14, height: 14 }}
            className={loading ? 'spin' : ''}
          />
          Refresh
        </button>
      </div>

      {groupInfo && (
        <div className="ns-stats-row">
          <div className="ns-stat-card">
            <div className="ns-stat-value">{groupInfo.memberCount}</div>
            <div className="ns-stat-label">Members</div>
          </div>
          <div className="ns-stat-card">
            <div className="ns-stat-value">{groupInfo.contextCount}</div>
            <div className="ns-stat-label">Contexts</div>
          </div>
          <div className="ns-stat-card">
            <div className="ns-stat-value ns-stat-small">
              {groupInfo.upgradePolicy}
            </div>
            <div className="ns-stat-label">Upgrade Policy</div>
          </div>
          <div className="ns-stat-card">
            <div className="ns-stat-value ns-stat-small">
              {groupInfo.defaultVisibility || '—'}
            </div>
            <div className="ns-stat-label">Visibility</div>
          </div>
        </div>
      )}

      {/* Members */}
      <div className="ns-section">
        <div className="ns-section-header">
          <h2>Members ({members.length})</h2>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setShowAddMember((v) => !v)}
          >
            <UserPlusIcon style={{ width: 14, height: 14 }} />
            Add Member
          </button>
        </div>

        {showAddMember && (
          <div className="ns-inline-form">
            <input
              className="ctx-start-input"
              type="text"
              placeholder="Identity (public key)"
              value={newIdentity}
              onChange={(e) => setNewIdentity(e.target.value)}
              style={{ flex: 1 }}
            />
            <select
              className="ctx-start-input"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              style={{ width: 120 }}
            >
              <option value="Admin">Admin</option>
              <option value="Member">Member</option>
              <option value="ReadOnly">ReadOnly</option>
            </select>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleAddMember}
              disabled={addingMember || !newIdentity.trim()}
            >
              {addingMember ? 'Adding…' : 'Add'}
            </button>
            <button
              className="btn btn-sm"
              onClick={() => {
                setShowAddMember(false);
                setNewIdentity('');
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {loading ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            Loading members…
          </p>
        ) : members.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            No members.
          </p>
        ) : (
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
              marginTop: 8,
            }}
          >
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                {['Identity', 'Alias', 'Role', 'Actions'].map((h, i) => (
                  <th
                    key={h}
                    style={{
                      textAlign: i === 3 ? 'right' : 'left',
                      padding: '6px 12px',
                      color: 'var(--text-secondary)',
                      fontWeight: 500,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr
                  key={m.identity}
                  style={{ borderBottom: '1px solid var(--border-color)' }}
                >
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>
                    <span title={m.identity}>{truncate(m.identity)}</span>
                    <CopyBtn value={m.identity} />
                  </td>
                  <td
                    style={{
                      padding: '8px 12px',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {m.alias || '—'}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <select
                      className="ns-role-select"
                      value={m.role}
                      onChange={(e) =>
                        handleRoleChange(m.identity, e.target.value)
                      }
                      disabled={updatingRole === m.identity}
                      data-role={m.role.toLowerCase()}
                    >
                      <option value="Admin">Admin</option>
                      <option value="Member">Member</option>
                      <option value="ReadOnly">ReadOnly</option>
                    </select>
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {m.role !== 'Admin' && (
                        <button
                          className="btn btn-sm"
                          onClick={() => handleRoleChange(m.identity, 'Admin')}
                          disabled={updatingRole === m.identity}
                          title="Promote to Admin"
                        >
                          Promote
                        </button>
                      )}
                      {m.role === 'Admin' && (
                        <button
                          className="btn btn-sm"
                          onClick={() => handleRoleChange(m.identity, 'Member')}
                          disabled={updatingRole === m.identity}
                          title="Demote to Member"
                        >
                          Demote
                        </button>
                      )}
                      {confirmRemove === m.identity ? (
                        <>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleRemoveMember(m.identity)}
                            disabled={removing === m.identity}
                          >
                            {removing === m.identity ? 'Kicking…' : 'Confirm'}
                          </button>
                          <button
                            className="btn btn-sm"
                            onClick={() => setConfirmRemove(null)}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          className="btn btn-sm"
                          onClick={() => setConfirmRemove(m.identity)}
                          title="Kick member"
                        >
                          <UserMinusIcon style={{ width: 14, height: 14 }} />
                          Kick
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Contexts */}
      <div className="ns-section">
        <h2>Contexts ({contexts.length})</h2>
        {loading ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            Loading contexts…
          </p>
        ) : contexts.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            No contexts in this group.
          </p>
        ) : (
          <div className="ns-group-list">
            {contexts.map((c) => (
              <div
                key={c.contextId}
                className="ns-group-row"
                style={{ cursor: 'default' }}
              >
                <span className="mono" title={c.contextId}>
                  {truncate(c.contextId)}
                </span>
                {c.alias && <span className="ns-group-alias">{c.alias}</span>}
                <CopyBtn value={c.contextId} />
                <span style={{ marginLeft: 'auto' }}>
                  {confirmLeaveCtx === c.contextId ? (
                    <>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleLeaveContext(c.contextId)}
                        disabled={leavingCtx === c.contextId}
                        style={{ marginLeft: 8 }}
                      >
                        {leavingCtx === c.contextId ? 'Leaving…' : 'Confirm'}
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={() => setConfirmLeaveCtx(null)}
                        style={{ marginLeft: 4 }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn btn-sm"
                      onClick={() => setConfirmLeaveCtx(c.contextId)}
                      style={{ marginLeft: 8 }}
                    >
                      Leave
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Subgroups */}
      <div className="ns-section">
        <h2>Subgroups ({subgroups.length})</h2>
        {loading ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            Loading subgroups…
          </p>
        ) : subgroups.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            No subgroups.
          </p>
        ) : (
          <div className="ns-group-list">
            {subgroups.map((g) => (
              <button
                key={g.groupId}
                className="ns-group-row"
                onClick={() => onOpenSubgroup(g.groupId)}
              >
                <span className="mono" title={g.groupId}>
                  {truncate(g.groupId)}
                </span>
                {g.alias && <span className="ns-group-alias">{g.alias}</span>}
                <ChevronRightIcon
                  style={{ width: 14, height: 14, marginLeft: 'auto' }}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Membership / Invitation */}
      <div className="ns-section">
        <h2>Membership</h2>
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 12,
          }}
        >
          <button
            className="btn btn-sm"
            onClick={handleCreateInvitation}
            disabled={creatingInvite}
          >
            {creatingInvite ? 'Generating…' : 'Create Group Invitation'}
          </button>
          <button className="btn btn-sm" onClick={() => setShowJoin((v) => !v)}>
            Join Group
          </button>
          {confirmLeaveGroup ? (
            <>
              <button
                className="btn btn-danger btn-sm"
                onClick={handleLeaveGroup}
                disabled={leavingGroup}
              >
                {leavingGroup ? 'Leaving…' : 'Confirm Leave'}
              </button>
              <button
                className="btn btn-sm"
                onClick={() => setConfirmLeaveGroup(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              className="btn btn-sm"
              onClick={() => setConfirmLeaveGroup(true)}
            >
              Leave Group
            </button>
          )}
        </div>

        {invitation && (
          <div className="ns-invitation-box">
            <div className="ns-invitation-header">
              <span>
                Group invitation code — share this with the new member
              </span>
              <button
                className="ns-copy-btn"
                onClick={() => copyToClipboard(invitation)}
              >
                <DocumentDuplicateIcon style={{ width: 13, height: 13 }} />
                Copy
              </button>
            </div>
            <textarea
              className="ns-invitation-textarea"
              readOnly
              value={invitation}
              rows={3}
            />
          </div>
        )}

        {showJoin && (
          <div
            className="ns-inline-form"
            style={{ flexDirection: 'column', alignItems: 'stretch' }}
          >
            <label
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                marginBottom: 4,
              }}
            >
              Paste group invitation code
            </label>
            <textarea
              className="ctx-start-input"
              style={{
                fontFamily: 'monospace',
                fontSize: 12,
                resize: 'vertical',
              }}
              rows={3}
              value={joinJson}
              onChange={(e) => setJoinJson(e.target.value)}
              placeholder="Paste base58 invitation code or raw JSON…"
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleJoinGroup}
                disabled={joining || !joinJson.trim()}
              >
                {joining ? 'Joining…' : 'Join'}
              </button>
              <button
                className="btn btn-sm"
                onClick={() => {
                  setShowJoin(false);
                  setJoinJson('');
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
