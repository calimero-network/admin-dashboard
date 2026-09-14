import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { apiClient } from '@calimero-network/calimero-client';
import { RefreshCw, Package } from 'lucide-react';
import ContextMenu from '../components/ContextMenu';
import InstalledAppCard, {
  InstalledAppMenu,
} from '../components/InstalledAppCard';
import Skeleton from '../components/Skeleton';
import ConfirmAction from './ConfirmAction';
import { useToast } from '../contexts/ToastContext';
import { getSettings } from '../utils/settings';
import {
  decodeMetadata,
  appDisplayName,
  appFrontendUrl,
  parseApiError,
  type AppMetadata,
} from '../utils/appUtils';
import { openAppInNewTab } from '../utils/openApp';
import { compareSemverDesc } from '../utils/registry';
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

type SortKey = 'name-asc' | 'name-desc' | 'version' | 'size';

const SORT_LABELS: Record<SortKey, string> = {
  'name-asc': 'Name (A–Z)',
  'name-desc': 'Name (Z–A)',
  version: 'Version',
  size: 'Size (largest)',
};

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
  // ⚠️ THE TABLE THIS GRID REPLACED HAD SORTABLE COLUMNS. Dropping to cards
  // would have quietly removed that, so the three sorts it offered — name,
  // version, size — survive here as an explicit control.
  const [sort, setSort] = useState<SortKey>('name-asc');
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

  const sortedApps = useMemo(() => {
    const name = (a: InstalledApplication) =>
      appDisplayName(a, decodeMetadata(a.metadata)).toLowerCase();
    const version = (a: InstalledApplication) =>
      decodeMetadata(a.metadata)?.version ?? a.version ?? '';
    const out = [...apps];
    switch (sort) {
      case 'name-desc':
        return out.sort((a, b) => name(b).localeCompare(name(a)));
      case 'version':
        return out.sort((a, b) => compareSemverDesc(version(a), version(b)));
      case 'size':
        return out.sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
      default:
        return out.sort((a, b) => name(a).localeCompare(name(b)));
    }
  }, [apps, sort]);

  const openMenuApp = openMenuAppId
    ? apps.find((a) => a.id === openMenuAppId) ?? null
    : null;

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
        <div className="installed-apps-controls">
          <label className="installed-sort">
            <span className="installed-sort-label">Sort</span>
            <select
              className="installed-sort-select"
              data-testid="installed-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => void load()}
            className="installed-refresh-btn"
            disabled={loading}
            title="Refresh"
            aria-label="Refresh"
          >
            <RefreshCw size={15} className={loading ? 'spinning' : ''} />
          </button>
        </div>
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
          <div className="installed-apps-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="app-card installed-app-card" aria-hidden>
                <div className="app-card-top">
                  <Skeleton
                    variant="rectangular"
                    width="48px"
                    height="48px"
                    borderRadius="12px"
                  />
                  <div className="app-card-headings">
                    <Skeleton variant="text" width="62%" height="14px" />
                    <Skeleton variant="text" width="80%" height="11px" />
                  </div>
                </div>
                <Skeleton variant="text" width="100%" height="12px" />
                <Skeleton variant="text" width="70%" height="12px" />
                <div className="installed-app-actions">
                  <Skeleton
                    variant="rectangular"
                    width="72px"
                    height="28px"
                    borderRadius="6px"
                  />
                  <Skeleton
                    variant="rectangular"
                    width="32px"
                    height="28px"
                    borderRadius="6px"
                  />
                </div>
              </div>
            ))}
          </div>
        ) : sortedApps.length === 0 ? (
          <div className="empty-state">
            <Package size={48} className="empty-icon" />
            <h3>No applications installed</h3>
            <p>Visit the Marketplace to install apps on this node.</p>
          </div>
        ) : (
          <div
            className="installed-apps-grid"
            data-testid="installed-apps-grid"
          >
            {sortedApps.map((app, index) => {
              const m = meta(app);
              return (
                <InstalledAppCard
                  key={app.id || `installed-${index}`}
                  app={app}
                  metadata={m}
                  menuOpen={openMenuAppId === app.id}
                  onContextMenu={(e) => handleRowContextMenu(e, app)}
                  onToggleMenu={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setMenuPos({
                      top: rect.bottom + 4,
                      right: window.innerWidth - rect.right,
                    });
                    setOpenMenuAppId(openMenuAppId === app.id ? null : app.id);
                  }}
                  onOpen={(frontendUrl) => handleOpen(frontendUrl, app)}
                />
              );
            })}
          </div>
        )}

        {openMenuApp && menuPos && (
          <InstalledAppMenu
            style={{ top: menuPos.top, right: menuPos.right }}
            onCopyId={() => {
              setOpenMenuAppId(null);
              void navigator.clipboard.writeText(openMenuApp.id);
              toast.success('ID copied');
            }}
            onUninstall={() => {
              setOpenMenuAppId(null);
              requestUninstall(
                openMenuApp.id,
                appDisplayName(
                  openMenuApp,
                  decodeMetadata(openMenuApp.metadata),
                ),
              );
            }}
          />
        )}
      </main>
    </div>
  );
}
