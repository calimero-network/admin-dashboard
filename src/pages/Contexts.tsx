import React, { useState, useEffect, useCallback } from 'react';
import { Navigation } from '../components/Navigation';
import { apiClient } from '@calimero-network/calimero-client';
import {
  ArrowPathIcon,
  TrashIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import {
  createContext as createContextApi,
  setSubgroupVisibility,
  listNamespaces,
  listNamespaceGroups,
  type Namespace,
  type SubgroupEntry,
} from '../api/namespaceApi';
import './ContextsPage.css';

// Legacy type export kept for compatibility with old component files
export interface Invitation {
  id: string;
  contextId: string;
  inviterId: string;
  inviteeId: string;
}

interface ContextItem {
  id: string;
  applicationId: string;
}

interface InstalledApp {
  id: string;
  source?: string;
  metadata?: number[];
}

const CREATE_CONTEXT_TIMEOUT_MS = 15000;

function parseAppName(app: InstalledApp): string {
  try {
    const decoded = JSON.parse(
      new TextDecoder().decode(new Uint8Array(app.metadata || [])),
    );
    if (decoded.name) return decoded.name;
  } catch {}
  return app.id;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

export default function ContextsPage() {
  const [contexts, setContexts] = useState<ContextItem[]>([]);
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    msg: string;
    type: 'success' | 'error';
  } | null>(null);

  // Create context form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createAppId, setCreateAppId] = useState('');
  const [createParams, setCreateParams] = useState('');
  const [createAlias, setCreateAlias] = useState('');
  const [creating, setCreating] = useState(false);
  const [useCustomAppId, setUseCustomAppId] = useState(false);

  // Namespace + group selection
  const [namespaces, setNamespaces] = useState<Namespace[]>([]);
  const [selectedNamespaceId, setSelectedNamespaceId] = useState('');
  const [namespaceGroups, setNamespaceGroups] = useState<SubgroupEntry[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [useCustomGroupId, setUseCustomGroupId] = useState(false);
  const [createVisibility, setCreateVisibility] = useState<
    'open' | 'restricted'
  >('open');

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadInstalledApps = useCallback(async () => {
    try {
      const res = await apiClient.node().getInstalledApplications();
      setInstalledApps(
        (res.data as any)?.data?.apps ?? (res.data as any)?.apps ?? [],
      );
    } catch {}
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.node().getContexts();
      if (res.error) throw new Error(res.error.message);
      setContexts(
        (res.data as any)?.data?.contexts ?? (res.data as any)?.contexts ?? [],
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadNamespaces = useCallback(async () => {
    try {
      const list = await listNamespaces();
      setNamespaces(Array.isArray(list) ? list : []);
    } catch {
      setNamespaces([]);
    }
  }, []);

  const handleNamespaceChange = useCallback(async (nsId: string) => {
    setSelectedNamespaceId(nsId);
    setSelectedGroupId('');
    setNamespaceGroups([]);
    if (!nsId) return;
    setLoadingGroups(true);
    try {
      const groups = await listNamespaceGroups(nsId);
      setNamespaceGroups(Array.isArray(groups) ? groups : []);
    } catch {
      setNamespaceGroups([]);
    } finally {
      setLoadingGroups(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadInstalledApps();
    loadNamespaces();
  }, [load, loadInstalledApps, loadNamespaces]);

  const handleDelete = async (contextId: string) => {
    setConfirmId(null);
    setRemoving(contextId);
    try {
      const res = await apiClient.node().deleteContext(contextId);
      if (res.error) throw new Error(res.error.message);
      showToast('Context deleted', 'success');
      await load();
    } catch (e: any) {
      showToast(e.message || 'Delete failed', 'error');
    } finally {
      setRemoving(null);
    }
  };

  const resetCreateForm = () => {
    setShowCreateForm(false);
    setCreateAppId('');
    setCreateParams('');
    setCreateAlias('');
    setSelectedNamespaceId('');
    setNamespaceGroups([]);
    setSelectedGroupId('');
    setUseCustomAppId(false);
    setUseCustomGroupId(false);
    setCreateVisibility('open');
  };

  const handleCreateContext = async () => {
    if (!createAppId.trim() || !selectedGroupId.trim()) return;
    setCreating(true);
    try {
      const raw = createParams.trim() || '{}';
      const initializationParams = Array.from(
        new TextEncoder().encode(JSON.stringify(JSON.parse(raw))),
      );

      const result = await withTimeout(
        createContextApi({
          applicationId: createAppId.trim(),
          groupId: selectedGroupId.trim(),
          alias: createAlias.trim() || undefined,
          initializationParams,
        }),
        CREATE_CONTEXT_TIMEOUT_MS,
        'Context creation is taking too long. The node did not finish the request in time.',
      );

      // Apply visibility to the group that was used (or auto-created)
      const gid = result.groupId ?? selectedGroupId.trim();
      if (gid) {
        await setSubgroupVisibility(gid, createVisibility).catch(() => {});
      }

      showToast('Context created successfully', 'success');
      resetCreateForm();
      await load();
    } catch (e: any) {
      showToast(e.message || 'Failed to create context', 'error');
    } finally {
      setCreating(false);
    }
  };

  const truncate = (str: string, max = 32) =>
    str.length > max ? str.slice(0, max) + '...' : str;

  return (
    <div className="app-shell">
      <Navigation />
      <main className="page-content">
        <div className="page-header">
          <div className="page-header-left">
            <h1>Contexts</h1>
            <p>Active application contexts on this node</p>
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
              New Context
            </button>
          </div>
        </div>

        {toast && (
          <div className={`alert alert-${toast.type}`}>{toast.msg}</div>
        )}
        {error && <div className="alert alert-error">{error}</div>}

        {showCreateForm && (
          <div className="ctx-start-form">
            <h3 className="ctx-start-title">Create New Context</h3>
            <p className="ctx-start-desc">
              Select an application and group, then configure context options.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Application */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="ctx-field-label">Application</label>
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
                          {parseAppName(app)}
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
                      type="text"
                      className="ctx-start-input"
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

              {/* Group */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="ctx-field-label">Group</label>
                {!useCustomGroupId ? (
                  <>
                    {namespaces.length > 0 && (
                      <select
                        className="ctx-start-input"
                        value={selectedNamespaceId}
                        onChange={(e) => handleNamespaceChange(e.target.value)}
                        style={{ fontFamily: 'inherit' }}
                      >
                        <option value="">Select a namespace…</option>
                        {namespaces.map((ns) => (
                          <option key={ns.namespaceId} value={ns.namespaceId}>
                            {ns.alias
                              ? `${ns.alias} — ${ns.namespaceId.slice(0, 12)}…`
                              : ns.namespaceId.slice(0, 24) + '…'}
                          </option>
                        ))}
                      </select>
                    )}
                    {selectedNamespaceId && (
                      <select
                        className="ctx-start-input"
                        value={selectedGroupId}
                        onChange={(e) => setSelectedGroupId(e.target.value)}
                        style={{ fontFamily: 'inherit' }}
                        disabled={loadingGroups}
                      >
                        <option value="">
                          {loadingGroups
                            ? 'Loading groups…'
                            : namespaceGroups.length === 0
                              ? 'No groups found'
                              : 'Select a group…'}
                        </option>
                        {namespaceGroups.map((g) => (
                          <option key={g.groupId} value={g.groupId}>
                            {g.alias
                              ? `${g.alias} — ${g.groupId.slice(0, 12)}…`
                              : g.groupId.slice(0, 24) + '…'}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      className="ns-toggle-link"
                      onClick={() => {
                        setUseCustomGroupId(true);
                        setSelectedGroupId('');
                        setSelectedNamespaceId('');
                        setNamespaceGroups([]);
                      }}
                    >
                      Enter group ID manually
                    </button>
                  </>
                ) : (
                  <>
                    <input
                      type="text"
                      className="ctx-start-input"
                      placeholder="Group ID (hex)"
                      value={selectedGroupId}
                      onChange={(e) => setSelectedGroupId(e.target.value)}
                    />
                    <button
                      type="button"
                      className="ns-toggle-link"
                      onClick={() => {
                        setUseCustomGroupId(false);
                        setSelectedGroupId('');
                      }}
                    >
                      Pick from namespace
                    </button>
                  </>
                )}
              </div>

              {/* Visibility */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="ctx-field-label">
                  Visibility{' '}
                  <span
                    style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}
                  >
                    (applies to the group)
                  </span>
                </label>
                <select
                  className="ctx-start-input"
                  value={createVisibility}
                  onChange={(e) =>
                    setCreateVisibility(e.target.value as 'open' | 'restricted')
                  }
                  style={{ fontFamily: 'inherit' }}
                >
                  <option value="open">
                    Open — parent group members can join automatically
                  </option>
                  <option value="restricted">
                    Restricted — invite only (private)
                  </option>
                </select>
              </div>

              {/* Context alias */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="ctx-field-label">
                  Context Alias{' '}
                  <span
                    style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}
                  >
                    (optional)
                  </span>
                </label>
                <input
                  type="text"
                  className="ctx-start-input"
                  placeholder="e.g. my-context"
                  value={createAlias}
                  onChange={(e) => setCreateAlias(e.target.value)}
                />
              </div>

              {/* Init params */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="ctx-field-label">
                  Initialization Params{' '}
                  <span
                    style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}
                  >
                    (JSON, optional)
                  </span>
                </label>
                <textarea
                  className="ctx-start-input"
                  placeholder='{"key": "value"}'
                  value={createParams}
                  onChange={(e) => setCreateParams(e.target.value)}
                  rows={3}
                  style={{ resize: 'vertical', fontFamily: 'monospace' }}
                />
              </div>

              <div className="ctx-start-row" style={{ marginTop: 4 }}>
                <button
                  className="btn btn-primary"
                  onClick={handleCreateContext}
                  disabled={
                    creating || !createAppId.trim() || !selectedGroupId.trim()
                  }
                >
                  {creating ? 'Creating...' : 'Create Context'}
                </button>
                <button className="btn" onClick={resetCreateForm}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {loading && contexts.length === 0 ? (
          <div className="ctx-list">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="ctx-row ctx-row-skeleton">
                <div className="skel-line skel-title" />
                <div className="skel-line skel-short" />
              </div>
            ))}
          </div>
        ) : contexts.length === 0 ? (
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
                d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
              />
            </svg>
            <h3>No contexts found</h3>
            <p>
              Click "New Context" to create one from an installed application.
            </p>
          </div>
        ) : (
          <table
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}
          >
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '8px 12px',
                    color: 'var(--text-secondary)',
                    fontWeight: 500,
                  }}
                >
                  Context ID
                </th>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '8px 12px',
                    color: 'var(--text-secondary)',
                    fontWeight: 500,
                  }}
                >
                  Application ID
                </th>
                <th
                  style={{
                    textAlign: 'right',
                    padding: '8px 12px',
                    color: 'var(--text-secondary)',
                    fontWeight: 500,
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {contexts.map((ctx) => (
                <tr
                  key={ctx.id}
                  style={{ borderBottom: '1px solid var(--border-color)' }}
                >
                  <td
                    style={{
                      padding: '10px 12px',
                      fontFamily: 'monospace',
                      color: 'var(--text-primary)',
                    }}
                    title={ctx.id}
                  >
                    {truncate(ctx.id, 32)}
                  </td>
                  <td
                    style={{
                      padding: '10px 12px',
                      fontFamily: 'monospace',
                      color: 'var(--text-secondary)',
                    }}
                    title={ctx.applicationId}
                  >
                    {truncate(ctx.applicationId, 32)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        justifyContent: 'flex-end',
                      }}
                    >
                      {confirmId === ctx.id ? (
                        <>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDelete(ctx.id)}
                            disabled={removing === ctx.id}
                          >
                            {removing === ctx.id
                              ? 'Deleting...'
                              : 'Confirm Delete'}
                          </button>
                          <button
                            className="btn btn-sm"
                            onClick={() => setConfirmId(null)}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          className="btn btn-sm"
                          onClick={() => setConfirmId(ctx.id)}
                          title="Delete context"
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
      </main>
    </div>
  );
}
