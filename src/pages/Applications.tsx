import React, { useEffect, useState, useCallback } from 'react';
import { Navigation } from '../components/Navigation';
import { apiClient } from '@calimero-network/calimero-client';
import { parseAppMetadata } from '../utils/metadata';
import { ArrowPathIcon, TrashIcon } from '@heroicons/react/24/outline';
import './ApplicationsPage.css';

// Legacy type exports kept for compatibility with old component files
export interface Application {
  id: string;
  blob: string;
  version: string | null;
  source: string;
  contract_app_id: string | null;
  name: string | null;
  description: string | null;
  repository: string | null;
  owner: string | null;
}

export interface Package {
  id: string;
  name: string;
  description: string;
  repository: string;
  owner: string;
  version: string;
}

export interface Release {
  version: string;
  notes: string;
  path: string;
  hash: string;
}

export interface Applications {
  available: Application[];
  owned: Application[];
  installed: Application[];
}

interface InstalledApp {
  id: string;
  source: string;
  name: string | null;
  version: string | null;
  description: string | null;
}

export default function ApplicationsPage() {
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    msg: string;
    type: 'success' | 'error';
  } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.node().getInstalledApplications();
      if (res.error) throw new Error(res.error.message);
      const rawApps =
        (res.data as any)?.data?.apps ?? (res.data as any)?.apps ?? [];
      setApps(
        rawApps.map((a: any) => {
          const meta = parseAppMetadata(a.metadata);
          return {
            id: a.id,
            source: a.source,
            name: meta?.applicationName || null,
            version: meta?.applicationVersion || null,
            description: meta?.description || null,
          };
        }),
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleUninstall = async (appId: string) => {
    setConfirmId(null);
    setRemoving(appId);
    try {
      // Check if used by any context
      const ctxRes = await apiClient.node().getContexts();
      const usedBy = (
        (ctxRes.data as any)?.data?.contexts ??
        (ctxRes.data as any)?.contexts ??
        []
      )
        .filter((c: any) => c.applicationId === appId)
        .map((c: any) => c.id);

      if (usedBy.length > 0) {
        showToast(
          `Cannot uninstall: used by ${usedBy.length} context(s)`,
          'error',
        );
        return;
      }

      const res = await apiClient.node().uninstallApplication(appId);
      if (res.error) throw new Error(res.error.message);
      showToast('Application uninstalled', 'success');
      await load();
    } catch (e: any) {
      showToast(e.message || 'Uninstall failed', 'error');
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="app-shell">
      <Navigation />
      <main className="page-content">
        <div className="page-header">
          <div className="page-header-left">
            <h1>Applications</h1>
            <p>Installed applications on this node</p>
          </div>
          <button className="btn" onClick={load} disabled={loading}>
            <ArrowPathIcon
              style={{ width: 16, height: 16 }}
              className={loading ? 'spin' : ''}
            />
            Refresh
          </button>
        </div>

        {toast && (
          <div className={`alert alert-${toast.type}`}>{toast.msg}</div>
        )}
        {error && <div className="alert alert-error">{error}</div>}

        {loading && apps.length === 0 ? (
          <div className="apps-list">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="app-row app-row-skeleton">
                <div className="skel-line skel-title" />
                <div className="skel-line skel-short" />
              </div>
            ))}
          </div>
        ) : apps.length === 0 ? (
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
                d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"
              />
            </svg>
            <h3>No applications installed</h3>
            <p>Visit the Marketplace to install apps on this node.</p>
          </div>
        ) : (
          <div className="apps-list">
            {apps.map((app) => (
              <div key={app.id} className="app-row">
                <div className="app-row-icon">
                  {(app.name || app.id).charAt(0).toUpperCase()}
                </div>
                <div className="app-row-info">
                  <div className="app-row-name">{app.name || app.id}</div>
                  {app.version && (
                    <div className="app-row-version">v{app.version}</div>
                  )}
                  {app.description && (
                    <div className="app-row-desc">{app.description}</div>
                  )}
                  <div className="app-row-source" title={app.source}>
                    {app.source}
                  </div>
                </div>
                <div className="app-row-id">
                  <span title={app.id}>{app.id.slice(0, 16)}…</span>
                </div>
                <div className="app-row-actions">
                  {confirmId === app.id ? (
                    <>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleUninstall(app.id)}
                        disabled={removing === app.id}
                      >
                        {removing === app.id ? 'Removing...' : 'Confirm'}
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
                      onClick={() => setConfirmId(app.id)}
                      title="Uninstall"
                    >
                      <TrashIcon style={{ width: 14, height: 14 }} />
                      Uninstall
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
