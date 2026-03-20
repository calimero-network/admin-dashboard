import React, { useState, useEffect, useCallback } from 'react';
import { Navigation } from '../components/Navigation';
import { apiClient } from '@calimero-network/calimero-client';
import {
  ArrowPathIcon,
  TrashIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
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
  const [createProtocol, setCreateProtocol] = useState('near');
  const [createParams, setCreateParams] = useState('');
  const [creating, setCreating] = useState(false);

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

  useEffect(() => {
    load();
    loadInstalledApps();
  }, [load, loadInstalledApps]);

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

  const handleCreateContext = async () => {
    if (!createAppId.trim()) return;
    setCreating(true);
    try {
      let jsonParams = '';
      if (createParams.trim()) {
        const parsed = JSON.parse(createParams.trim());
        jsonParams = JSON.stringify(parsed);
      }

      const res = await withTimeout(
        apiClient
          .node()
          .createContext(createAppId.trim(), jsonParams, createProtocol),
        CREATE_CONTEXT_TIMEOUT_MS,
        'Context creation is taking too long. The node did not finish the request in time.',
      );
      if (res?.error) throw new Error(res.error.message);
      showToast('Context created successfully', 'success');
      setShowCreateForm(false);
      setCreateAppId('');
      setCreateParams('');
      setCreateProtocol('near');
      await load();
    } catch (e: any) {
      const message = e.message || 'Failed to create context';
      showToast(message, 'error');
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
              Select an installed application and configure context options.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label
                  style={{
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                    fontWeight: 500,
                  }}
                >
                  Protocol
                </label>
                <select
                  className="ctx-start-input"
                  value={createProtocol}
                  onChange={(e) => setCreateProtocol(e.target.value)}
                  style={{ fontFamily: 'inherit' }}
                >
                  <option value="near">near</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label
                  style={{
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                    fontWeight: 500,
                  }}
                >
                  Application
                </label>
                {installedApps.length > 0 ? (
                  <select
                    className="ctx-start-input"
                    value={createAppId}
                    onChange={(e) => setCreateAppId(e.target.value)}
                    style={{ fontFamily: 'inherit' }}
                  >
                    <option value="">Select an application...</option>
                    {installedApps.map((app) => (
                      <option key={app.id} value={app.id}>
                        {parseAppName(app)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="ctx-start-input"
                    placeholder="Application ID"
                    value={createAppId}
                    onChange={(e) => setCreateAppId(e.target.value)}
                  />
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label
                  style={{
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                    fontWeight: 500,
                  }}
                >
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
                  disabled={creating || !createAppId.trim()}
                >
                  {creating ? 'Creating...' : 'Create Context'}
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setShowCreateForm(false);
                    setCreateAppId('');
                    setCreateParams('');
                  }}
                >
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
