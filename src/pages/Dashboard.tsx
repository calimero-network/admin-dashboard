import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@calimero-network/calimero-client';
import {
  Store,
  Box,
  KeyRound,
  Package,
  Layers,
  Settings2,
  Globe,
  Download,
  BookOpen,
  Code2,
  ArrowRight,
  ShoppingCart,
} from 'lucide-react';
import { listNamespaces } from '../api/namespaceApi';
import { useToast } from '../contexts/ToastContext';
import { getSettings } from '../utils/settings';
import { getNodeUrl } from '../utils/nodeUrl';
import { useNodeStatus } from '../components/AppShell';
import {
  decodeMetadata,
  appDisplayName,
  appFrontendUrl,
} from '../utils/appUtils';
import { openAppInNewTab, openExternal } from '../utils/openApp';
import './Dashboard.css';

interface HomeApp {
  id: string;
  name: string;
  frontendUrl: string | null;
}

interface Stats {
  installedApps: number;
  contexts: number;
  namespaces: number;
}

const ECOSYSTEM_LINKS = [
  {
    Icon: Globe,
    label: 'Website',
    desc: 'calimero.network',
    href: 'https://calimero.network',
  },
  {
    Icon: Download,
    label: 'Download Desktop',
    desc: 'Multi-node management and node logs',
    href: 'https://calimero.network/download',
  },
  {
    Icon: Store,
    label: 'App Registry',
    desc: 'Browse all apps',
    href: 'https://apps.calimero.network',
  },
  {
    Icon: BookOpen,
    label: 'Documentation',
    desc: 'Guides and API reference',
    href: 'https://docs.calimero.network',
  },
  {
    Icon: Code2,
    label: 'GitHub',
    desc: 'Open source repositories',
    href: 'https://github.com/calimero-network',
  },
] as const;

export default function Dashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const { state: nodeState, error: nodeError } = useNodeStatus();
  const [stats, setStats] = useState<Stats>({
    installedApps: 0,
    contexts: 0,
    namespaces: 0,
  });
  const [apps, setApps] = useState<HomeApp[]>([]);
  const [loadingApps, setLoadingApps] = useState(true);

  const load = useCallback(async () => {
    let installedApps = 0;
    try {
      const res = await apiClient.node().getInstalledApplications();
      const raw = res.data as
        | { apps?: unknown[]; data?: { apps?: unknown[] } }
        | undefined;
      const list = (raw?.data?.apps ?? raw?.apps ?? []) as {
        id: string;
        name?: string | null;
        metadata?: number[] | string;
      }[];
      installedApps = list.length;
      setApps(
        list.map((app) => {
          const meta = decodeMetadata(app.metadata);
          return {
            id: app.id,
            name: appDisplayName(app, meta),
            frontendUrl: appFrontendUrl(meta),
          };
        }),
      );
    } catch {
      // Leave the grid empty; the stat card shows 0.
    } finally {
      setLoadingApps(false);
    }

    let contexts = 0;
    try {
      const res = await apiClient.node().getContexts();
      const raw = res.data as
        | { contexts?: unknown[]; data?: { contexts?: unknown[] } }
        | undefined;
      contexts = (raw?.data?.contexts ?? raw?.contexts ?? []).length;
    } catch {
      // ignore
    }

    let namespaces = 0;
    try {
      const list = await listNamespaces();
      namespaces = Array.isArray(list) ? list.length : 0;
    } catch {
      // ignore
    }

    setStats({ installedApps, contexts, namespaces });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Synchronous by necessity — see utils/openApp.ts. */
  const openApp = (app: HomeApp) => {
    if (!app.frontendUrl) {
      navigate('/applications');
      return;
    }
    try {
      openAppInNewTab(app.frontendUrl, {
        applicationId: app.id,
        devMode: getSettings().developerMode,
      });
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Failed to open application',
      );
    }
  };

  return (
    <div className="page-content dashboard-page">
      <div className="welcome-section">
        <h2>Welcome to Admin Dashboard</h2>
        <p className="welcome-description">
          Your gateway to decentralized applications. Get started by installing
          apps from the marketplace.
        </p>
      </div>

      {/* Node Status card, matching the desktop's home screen. The desktop's
          "Restart Node" button is deliberately absent: a browser tab cannot
          start a process. */}
      <div className="status-cards-simple">
        <div className="status-card-simple">
          <div className="status-header-simple">
            <h3>Node Status</h3>
            <div
              className={`status-badge ${nodeState === 'online' ? 'connected' : 'disconnected'}`}
              data-testid="home-node-status"
            >
              <div className="status-dot" />
              {nodeState === 'checking'
                ? 'Connecting…'
                : nodeState === 'online'
                  ? 'Connected'
                  : 'Disconnected'}
            </div>
          </div>
          <p className="status-node-url">
            <code>{getNodeUrl()}</code>
          </p>
          {nodeState === 'offline' && (
            <div className="status-error-block">
              <p className="status-error">{nodeError ?? 'Node unreachable'}</p>
              <p className="status-error-hint">
                This dashboard is served by the node, so it cannot restart it.
                Check the node process on the host, or manage it with Calimero
                Desktop.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="dash-stats-grid">
        <button
          type="button"
          className="dash-stat-card"
          onClick={() => navigate('/applications')}
        >
          <div className="dash-stat-value">{stats.installedApps}</div>
          <div className="dash-stat-label">Installed Applications</div>
          <div className="dash-stat-hint">View all →</div>
        </button>
        <button
          type="button"
          className="dash-stat-card"
          onClick={() => navigate('/contexts')}
        >
          <div className="dash-stat-value">{stats.contexts}</div>
          <div className="dash-stat-label">Active Contexts</div>
          <div className="dash-stat-hint">View all →</div>
        </button>
        <button
          type="button"
          className="dash-stat-card"
          onClick={() => navigate('/namespaces')}
        >
          <div className="dash-stat-value">{stats.namespaces}</div>
          <div className="dash-stat-label">Namespaces</div>
          <div className="dash-stat-hint">View all →</div>
        </button>
        <button
          type="button"
          className="dash-stat-card"
          onClick={() => navigate('/marketplace')}
        >
          <div className="dash-stat-value accent">+</div>
          <div className="dash-stat-label">Install New App</div>
          <div className="dash-stat-hint">Browse marketplace →</div>
        </button>
      </div>

      {apps.length > 0 && (
        <div className="recent-apps-section">
          <div className="section-header">
            <h3>Your Applications</h3>
            <button
              type="button"
              onClick={() => navigate('/applications')}
              className="view-all-link"
            >
              View All
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="home-apps-grid">
            {apps.slice(0, 4).map((app) => (
              <button
                key={app.id}
                type="button"
                onClick={() => openApp(app)}
                className="app-card-mini"
                data-testid="home-app-card"
                title={
                  app.frontendUrl
                    ? `Open ${app.name} in a new tab`
                    : `View ${app.name} details`
                }
              >
                <Package className="app-icon" size={28} />
                <span className="app-name">{app.name}</span>
                {app.frontendUrl && (
                  <span className="app-card-open-hint">Open</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {!loadingApps && apps.length === 0 && (
        <div className="empty-state-card">
          <Package size={48} className="empty-icon" />
          <h3>No Applications Installed</h3>
          <p>
            Get started by browsing the marketplace and installing your first
            app.
          </p>
          <button
            type="button"
            onClick={() => navigate('/marketplace')}
            className="btn-browse-marketplace"
          >
            <ShoppingCart size={16} className="browse-icon" />
            Browse Marketplace
          </button>
        </div>
      )}

      <div className="dash-section">
        <h2 className="dash-section-title">Quick Actions</h2>
        <div className="dash-actions-grid">
          <button
            className="dash-action-card"
            onClick={() => navigate('/marketplace')}
          >
            <Store className="dash-action-icon" />
            <span className="dash-action-label">Browse Marketplace</span>
            <span className="dash-action-desc">
              Discover and install new applications
            </span>
          </button>
          <button
            className="dash-action-card"
            onClick={() => navigate('/applications')}
          >
            <Package className="dash-action-icon" />
            <span className="dash-action-label">Applications</span>
            <span className="dash-action-desc">
              View and manage your applications
            </span>
          </button>
          <button
            className="dash-action-card"
            onClick={() => navigate('/settings')}
          >
            <Settings2 className="dash-action-icon" />
            <span className="dash-action-label">Settings</span>
            <span className="dash-action-desc">
              Configure theme, registries, and dashboard settings
            </span>
          </button>
          <button
            className="dash-action-card"
            onClick={() => navigate('/namespaces')}
          >
            <Layers className="dash-action-icon" />
            <span className="dash-action-label">Namespaces</span>
            <span className="dash-action-desc">
              Manage namespaces, groups, and members
            </span>
          </button>
          <button
            className="dash-action-card"
            onClick={() => navigate('/contexts')}
          >
            <Box className="dash-action-icon" />
            <span className="dash-action-label">Manage Contexts</span>
            <span className="dash-action-desc">
              Create or delete app contexts
            </span>
          </button>
          <button
            className="dash-action-card"
            onClick={() => navigate('/identity')}
          >
            <KeyRound className="dash-action-icon" />
            <span className="dash-action-label">Identity &amp; Keys</span>
            <span className="dash-action-desc">
              Manage root and client keys
            </span>
          </button>
        </div>
      </div>

      <div className="dash-section">
        <h2 className="dash-section-title">Ecosystem</h2>
        <div className="dash-actions-grid">
          {ECOSYSTEM_LINKS.map(({ Icon, label, desc, href }) => (
            <button
              key={href}
              type="button"
              className="dash-action-card"
              onClick={() => openExternal(href)}
            >
              <Icon className="dash-action-icon" />
              <span className="dash-action-label">{label}</span>
              <span className="dash-action-desc">{desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
