import React, { useEffect, useState } from 'react';
import { Navigation } from '../components/Navigation';
import {
  apiClient,
  getAppEndpointKey,
} from '@calimero-network/calimero-client';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingBagIcon,
  CubeTransparentIcon,
  KeyIcon,
  Square2StackIcon,
  RectangleStackIcon,
  GlobeAltIcon,
  ArrowDownTrayIcon,
  BookOpenIcon,
  CodeBracketSquareIcon,
} from '@heroicons/react/24/outline';
import { listNamespaces } from '../api/namespaceApi';
import './Dashboard.css';

interface Stats {
  installedApps: number;
  contexts: number;
  namespaces: number;
  nodeStatus: 'online' | 'offline' | 'checking';
  nodeUrl: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({
    installedApps: 0,
    contexts: 0,
    namespaces: 0,
    nodeStatus: 'checking',
    nodeUrl: getAppEndpointKey() || 'Not configured',
  });

  useEffect(() => {
    const load = async () => {
      const nodeUrl = getAppEndpointKey();

      // Check node health and fetch node info
      let nodeStatus: 'online' | 'offline' = 'offline';
      try {
        if (nodeUrl) {
          const res = await fetch(`${nodeUrl}/admin-api/health`);
          if (res.ok) nodeStatus = 'online';
        }
      } catch {}

      // Get installed apps count
      let installedApps = 0;
      try {
        const res = await apiClient.node().getInstalledApplications();
        installedApps = (
          (res.data as any)?.data?.apps ??
          (res.data as any)?.apps ??
          []
        ).length;
      } catch {}

      // Get contexts count
      let contexts = 0;
      try {
        const res = await apiClient.node().getContexts();
        contexts = (
          (res.data as any)?.data?.contexts ??
          (res.data as any)?.contexts ??
          []
        ).length;
      } catch {}

      // Get namespaces count
      let namespaces = 0;
      try {
        const nsList = await listNamespaces();
        namespaces = Array.isArray(nsList) ? nsList.length : 0;
      } catch {}

      setStats((prev) => ({
        ...prev,
        nodeStatus,
        installedApps,
        contexts,
        namespaces,
      }));
    };
    load();
  }, []);

  return (
    <div className="app-shell">
      <Navigation />
      <main className="page-content">
        <div className="page-header">
          <div className="page-header-left">
            <h1>Dashboard</h1>
            <p>Node overview and quick actions</p>
          </div>
        </div>

        {/* Node status banner */}
        <div className={`dash-status-banner ${stats.nodeStatus}`}>
          <span className={`dash-status-dot ${stats.nodeStatus}`} />
          <span className="dash-status-label">
            {stats.nodeStatus === 'checking' && 'Connecting to node...'}
            {stats.nodeStatus === 'online' && 'Node is online'}
            {stats.nodeStatus === 'offline' && 'Node is offline or unreachable'}
          </span>
          <span className="dash-status-url">
            {getAppEndpointKey() || 'Not configured'}
          </span>
        </div>

        {/* Stats grid */}
        <div className="dash-stats-grid">
          <div
            className="dash-stat-card"
            onClick={() => navigate('/applications')}
          >
            <div className="dash-stat-value">{stats.installedApps}</div>
            <div className="dash-stat-label">Installed Applications</div>
            <div className="dash-stat-hint">View all →</div>
          </div>
          <div className="dash-stat-card" onClick={() => navigate('/contexts')}>
            <div className="dash-stat-value">{stats.contexts}</div>
            <div className="dash-stat-label">Active Contexts</div>
            <div className="dash-stat-hint">View all →</div>
          </div>
          <div
            className="dash-stat-card"
            onClick={() => navigate('/namespaces')}
          >
            <div className="dash-stat-value">{stats.namespaces}</div>
            <div className="dash-stat-label">Namespaces</div>
            <div className="dash-stat-hint">View all →</div>
          </div>
          <div
            className="dash-stat-card"
            onClick={() => navigate('/marketplace')}
          >
            <div className="dash-stat-value accent">+</div>
            <div className="dash-stat-label">Install New App</div>
            <div className="dash-stat-hint">Browse marketplace →</div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="dash-section">
          <h2 className="dash-section-title">Quick Actions</h2>
          <div className="dash-actions-grid">
            <button
              className="dash-action-card"
              onClick={() => navigate('/marketplace')}
            >
              <ShoppingBagIcon className="dash-action-icon" />
              <span className="dash-action-label">Browse Marketplace</span>
              <span className="dash-action-desc">
                Install apps from the registry
              </span>
            </button>
            <button
              className="dash-action-card"
              onClick={() => navigate('/contexts')}
            >
              <CubeTransparentIcon className="dash-action-icon" />
              <span className="dash-action-label">Manage Contexts</span>
              <span className="dash-action-desc">
                Create or delete app contexts
              </span>
            </button>
            <button
              className="dash-action-card"
              onClick={() => navigate('/identity')}
            >
              <KeyIcon className="dash-action-icon" />
              <span className="dash-action-label">Identity & Keys</span>
              <span className="dash-action-desc">
                Manage root and client keys
              </span>
            </button>
            <button
              className="dash-action-card"
              onClick={() => navigate('/applications')}
            >
              <Square2StackIcon className="dash-action-icon" />
              <span className="dash-action-label">Applications</span>
              <span className="dash-action-desc">
                Manage installed applications
              </span>
            </button>
            <button
              className="dash-action-card"
              onClick={() => navigate('/namespaces')}
            >
              <RectangleStackIcon className="dash-action-icon" />
              <span className="dash-action-label">Namespaces</span>
              <span className="dash-action-desc">
                Manage namespaces, groups, and members
              </span>
            </button>
          </div>
        </div>

        {/* Ecosystem Links */}
        <div className="dash-section">
          <h2 className="dash-section-title">Ecosystem</h2>
          <div className="dash-actions-grid">
            {(
              [
                {
                  icon: GlobeAltIcon,
                  label: 'Website',
                  desc: 'calimero.network',
                  href: 'https://calimero.network',
                },
                {
                  icon: ArrowDownTrayIcon,
                  label: 'Download Desktop',
                  desc: 'Get the desktop app',
                  href: 'https://calimero.network/download',
                },
                {
                  icon: ShoppingBagIcon,
                  label: 'App Registry',
                  desc: 'Browse all apps',
                  href: 'https://apps.calimero.network',
                },
                {
                  icon: BookOpenIcon,
                  label: 'Documentation',
                  desc: 'Guides and API reference',
                  href: 'https://docs.calimero.network',
                },
                {
                  icon: CodeBracketSquareIcon,
                  label: 'GitHub',
                  desc: 'Open source repositories',
                  href: 'https://github.com/calimero-network',
                },
              ] as const
            ).map(({ icon: Icon, label, desc, href }) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="dash-action-card"
                style={{ textDecoration: 'none' }}
              >
                <Icon className="dash-action-icon" />
                <span className="dash-action-label">{label}</span>
                <span className="dash-action-desc">{desc}</span>
              </a>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
