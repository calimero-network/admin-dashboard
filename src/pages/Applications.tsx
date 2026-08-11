import React, { useEffect, useState, useCallback, useRef } from 'react';
import { apiClient } from '@calimero-network/calimero-client';
import {
  RefreshCw,
  MoreHorizontal,
  Trash2,
  Copy,
  ExternalLink,
} from 'lucide-react';
import DataTable from '../components/DataTable';
import ContextMenu from '../components/ContextMenu';
import Skeleton from '../components/Skeleton';
import ConfirmAction from './ConfirmAction';
import { useToast } from '../contexts/ToastContext';
import { getSettings } from '../utils/settings';
import {
  decodeMetadata,
  appDisplayName,
  appFrontendUrl,
  formatSize,
  parseApiError,
  type AppMetadata,
} from '../utils/appUtils';
import { openAppInNewTab } from '../utils/openApp';
import './InstalledApps.css';

interface InstalledApplication {
  id: string;
  name?: string | null;
  version?: string | null;
  metadata?: number[] | string;
  size?: number;
  source?: string;
}

/** Keep the skeleton up this long so it never flashes. Matches the desktop. */
const SKELETON_MIN_MS = 1000;

export default function ApplicationsPage() {
  const toast = useToast();
  const [apps, setApps] = useState<InstalledApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    app: InstalledApplication;
  } | null>(null);
  const [openMenuAppId, setOpenMenuAppId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(
    null,
  );
  const [confirm, setConfirm] = useState<{
    appId: string;
    appName: string;
  } | null>(null);
  const [uninstalling, setUninstalling] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!openMenuAppId) return;
    const close = () => setOpenMenuAppId(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openMenuAppId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const start = Date.now();
    try {
      const res = await apiClient.node().getInstalledApplications();
      if (res.error) throw new Error(res.error.message);
      const raw = res.data as
        | {
            apps?: InstalledApplication[];
            data?: { apps?: InstalledApplication[] };
          }
        | undefined;
      const list = raw?.data?.apps ?? raw?.apps ?? [];
      if (mounted.current) setApps(Array.isArray(list) ? list : []);
    } catch (e) {
      if (mounted.current) {
        setError(parseApiError(e));
        setApps([]);
      }
    } finally {
      const remaining = SKELETON_MIN_MS - (Date.now() - start);
      if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Open an app's frontend in a new tab.
   *
   * Must stay synchronous: `openAppInNewTab` calls `window.open`, and any
   * `await` before it spends the user-activation, after which the browser
   * blocks the tab. (The desktop awaits a token warm-up here; it can, because a
   * Tauri window is not subject to popup blocking.)
   */
  const handleOpen = (frontendUrl: string, app: InstalledApplication) => {
    try {
      openAppInNewTab(frontendUrl, {
        applicationId: app.id,
        devMode: getSettings().developerMode,
      });
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Failed to open application',
      );
    }
  };

  const requestUninstall = (appId: string, appName: string) =>
    setConfirm({ appId, appName });

  const doUninstall = async () => {
    if (!confirm) return;
    const { appId, appName } = confirm;
    setUninstalling(true);
    try {
      // Guard kept from the pre-port dashboard: the node will happily orphan a
      // context whose application is gone, so refuse while one is still bound.
      const ctxRes = await apiClient.node().getContexts();
      // Without this the guard fails open: a failed fetch leaves `contexts` as
      // [], `usedBy` empty, and the uninstall proceeds as if nothing were bound
      // — exactly the case the guard exists for.
      if (ctxRes.error) {
        throw new Error(
          `could not check whether "${appName}" is still in use (${ctxRes.error.message})`,
        );
      }
      const ctxRaw = ctxRes.data as
        | {
            contexts?: { applicationId?: string }[];
            data?: { contexts?: { applicationId?: string }[] };
          }
        | undefined;
      const contexts = ctxRaw?.data?.contexts ?? ctxRaw?.contexts ?? [];
      const usedBy = contexts.filter((c) => c.applicationId === appId);
      if (usedBy.length > 0) {
        toast.error(
          `Cannot uninstall "${appName}": still used by ${usedBy.length} context(s).`,
        );
        return;
      }

      const res = await apiClient.node().uninstallApplication(appId);
      if (res.error) throw new Error(res.error.message);
      toast.success(`"${appName}" uninstalled`);
      setConfirm(null);
      await load();
    } catch (e) {
      toast.error(`Failed to uninstall: ${parseApiError(e)}`);
    } finally {
      setUninstalling(false);
    }
  };

  const handleRowContextMenu = useCallback(
    (e: React.MouseEvent, app: InstalledApplication) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, app });
    },
    [],
  );

  const meta = (app: InstalledApplication): AppMetadata | null =>
    decodeMetadata(app.metadata);

  if (confirm) {
    return (
      <ConfirmAction
        title="Uninstall Application"
        message="Are you sure you want to uninstall this application? This action cannot be undone."
        itemName={confirm.appName}
        actionLabel={uninstalling ? 'Uninstalling…' : 'Uninstall'}
        onConfirm={doUninstall}
        onCancel={() => setConfirm(null)}
        breadcrumbs={[
          { label: 'Applications', onClick: () => setConfirm(null) },
          { label: 'Uninstall Application' },
        ]}
      />
    );
  }

  return (
    <div className="installed-apps-page">
      <header className="installed-apps-header">
        <div>
          <h1>Applications</h1>
          <p>Manage your installed applications</p>
        </div>
        <button
          onClick={() => void load()}
          className="installed-refresh-btn"
          disabled={loading}
          title="Refresh"
          aria-label="Refresh"
        >
          <RefreshCw size={15} className={loading ? 'spinning' : ''} />
        </button>
      </header>

      <main className="installed-apps-main">
        {error && <div className="error-message">{error}</div>}

        {contextMenu &&
          (() => {
            const m = meta(contextMenu.app);
            const name = appDisplayName(contextMenu.app, m);
            const frontendUrl = appFrontendUrl(m);
            const items: {
              label: string;
              onClick: () => void;
              danger?: boolean;
            }[] = [];
            if (frontendUrl) {
              items.push({
                label: 'Open in new tab',
                onClick: () => handleOpen(frontendUrl, contextMenu.app),
              });
            }
            items.push({
              label: 'Copy ID',
              onClick: () => {
                void navigator.clipboard.writeText(contextMenu.app.id);
                toast.success('ID copied');
              },
            });
            items.push({
              label: 'Uninstall',
              onClick: () => requestUninstall(contextMenu.app.id, name),
              danger: true,
            });
            return (
              <ContextMenu
                x={contextMenu.x}
                y={contextMenu.y}
                items={items}
                onClose={() => setContextMenu(null)}
              />
            );
          })()}

        {loading ? (
          <div className="data-table-container data-table-compact">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '25%' }}>Name</th>
                  <th style={{ width: '12%' }}>Version</th>
                  <th style={{ width: '10%' }}>Size</th>
                  <th style={{ width: '33%' }}>Description</th>
                  <th style={{ width: '20%' }} />
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td>
                      <Skeleton variant="text" width="60%" height="13px" />
                    </td>
                    <td>
                      <Skeleton variant="text" width="45%" height="13px" />
                    </td>
                    <td>
                      <Skeleton variant="text" width="55%" height="13px" />
                    </td>
                    <td>
                      <Skeleton variant="text" width="80%" height="13px" />
                    </td>
                    <td>
                      <div
                        style={{
                          display: 'flex',
                          gap: 6,
                          justifyContent: 'flex-end',
                        }}
                      >
                        <Skeleton
                          variant="rectangular"
                          width="52px"
                          height="26px"
                          borderRadius="6px"
                        />
                        <Skeleton
                          variant="rectangular"
                          width="28px"
                          height="26px"
                          borderRadius="6px"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <DataTable
            data={apps}
            compact
            onRowContextMenu={handleRowContextMenu}
            keyExtractor={(app, index) => app.id || `installed-${index}`}
            columns={[
              {
                key: 'name',
                label: 'Name',
                sortable: true,
                width: '25%',
                sortValue: (app) => appDisplayName(app, meta(app)),
                render: (app) => (
                  <div className="table-cell-name">
                    <div className="table-cell-primary">
                      {appDisplayName(app, meta(app))}
                    </div>
                    <div className="table-cell-secondary">
                      ID: {app.id ? `${app.id.substring(0, 16)}…` : 'N/A'}
                    </div>
                  </div>
                ),
              },
              {
                key: 'version',
                label: 'Version',
                sortable: true,
                width: '12%',
                sortValue: (app) =>
                  meta(app)?.version ?? app.version ?? 'Unknown',
                render: (app) => meta(app)?.version ?? app.version ?? 'Unknown',
              },
              {
                key: 'size',
                label: 'Size',
                sortable: true,
                width: '10%',
                sortValue: (app) => app.size ?? 0,
                render: (app) => formatSize(app.size),
              },
              {
                key: 'description',
                label: 'Description',
                width: '33%',
                render: (app) => {
                  const d = meta(app)?.description;
                  return d ? (
                    <div className="table-cell-description" title={d}>
                      {d.length > 80 ? `${d.substring(0, 80)}…` : d}
                    </div>
                  ) : (
                    <span className="table-cell-empty">—</span>
                  );
                },
              },
              {
                key: 'actions',
                label: '',
                width: '20%',
                render: (app) => {
                  const m = meta(app);
                  const name = appDisplayName(app, m);
                  const frontendUrl = appFrontendUrl(m);
                  return (
                    <div className="table-cell-actions">
                      {frontendUrl && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpen(frontendUrl, app);
                          }}
                          className="btn-open"
                          data-testid="open-app"
                          title={`Open ${name} in a new tab`}
                        >
                          Open
                          <ExternalLink size={12} />
                        </button>
                      )}
                      <div
                        className="app-actions-more"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="btn-more"
                          title="More options"
                          aria-label="More options"
                          onClick={(e) => {
                            const rect =
                              e.currentTarget.getBoundingClientRect();
                            setMenuPos({
                              top: rect.bottom + 4,
                              right: window.innerWidth - rect.right,
                            });
                            setOpenMenuAppId(
                              openMenuAppId === app.id ? null : app.id,
                            );
                          }}
                        >
                          <MoreHorizontal size={15} />
                        </button>
                        {openMenuAppId === app.id && menuPos && (
                          <div
                            className="app-actions-dropdown"
                            style={{
                              position: 'fixed',
                              top: menuPos.top,
                              right: menuPos.right,
                            }}
                          >
                            <button
                              className="dropdown-item"
                              onClick={() => {
                                setOpenMenuAppId(null);
                                void navigator.clipboard.writeText(app.id);
                                toast.success('ID copied');
                              }}
                            >
                              <Copy size={13} />
                              Copy ID
                            </button>
                            <div className="dropdown-divider" />
                            <button
                              className="dropdown-item dropdown-item-danger"
                              onClick={() => {
                                setOpenMenuAppId(null);
                                requestUninstall(app.id, name);
                              }}
                            >
                              <Trash2 size={13} />
                              Uninstall
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                },
              },
            ]}
            emptyMessage={
              <div className="empty-state">
                <h3>No applications installed</h3>
                <p>Visit the Marketplace to install apps on this node.</p>
              </div>
            }
          />
        )}
      </main>
    </div>
  );
}
