import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Home,
  Server,
  Layers,
  Box,
  Package,
  Store,
  FileText,
  KeyRound,
  Settings2,
  LogOut,
} from 'lucide-react';
import {
  clearAccessToken,
  clearRefreshToken,
  clearApplicationId,
  clearContextId,
  clearExecutorPublicKey,
} from '@calimero-network/calimero-client';
import { getSettings } from '../utils/settings';
import calimeroLogo from '../assets/calimero-logo.svg';
import './Sidebar.css';

interface NavItem {
  path: string;
  label: string;
  Icon: typeof Home;
  /** Only shown when Developer Mode is on. */
  devOnly?: boolean;
}

/**
 * Nav order mirrors the desktop's sidebar, extended with the pages that only
 * exist here (Blobs, Identity). Node diagnostics is dev-only, matching how the
 * desktop gates its Nodes tab; Namespaces and Contexts are always visible
 * because they are the point of an admin tool.
 */
const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', label: 'Home', Icon: Home },
  { path: '/node', label: 'Node', Icon: Server, devOnly: true },
  { path: '/namespaces', label: 'Namespaces', Icon: Layers },
  { path: '/contexts', label: 'Contexts', Icon: Box },
  { path: '/applications', label: 'Applications', Icon: Package },
  { path: '/marketplace', label: 'Marketplace', Icon: Store },
  { path: '/blobs', label: 'Blobs', Icon: FileText },
  { path: '/identity', label: 'Identity', Icon: KeyRound },
];

export default function Sidebar() {
  const location = useLocation();
  const developerMode = getSettings().developerMode;

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  const logout = () => {
    clearAccessToken();
    clearRefreshToken();
    clearApplicationId();
    clearContextId();
    clearExecutorPublicKey();
    window.location.reload();
  };

  const items = NAV_ITEMS.filter((item) => !item.devOnly || developerMode);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          {/* The logo is an asset, not inlined markup: the previous inline SVG
              had fill="#fafafa" baked into every path, so the wordmark vanished
              on a light background. The filter flips it per theme instead. */}
          <img src={calimeroLogo} alt="Calimero" className="logo-icon" />
          <span className="sidebar-logo-sub">ADMIN</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Main">
        {items.map(({ path, label, Icon }) => (
          <Link
            key={path}
            to={path}
            className={`sidebar-nav-item${isActive(path) ? ' active' : ''}`}
            title={label}
            aria-current={isActive(path) ? 'page' : undefined}
          >
            <Icon className="nav-icon" size={20} />
            <span className="nav-label">{label}</span>
          </Link>
        ))}
      </nav>

      <div className="sidebar-footer">
        <Link
          to="/settings"
          className={`sidebar-nav-item${isActive('/settings') ? ' active' : ''}`}
          title="Settings"
          aria-current={isActive('/settings') ? 'page' : undefined}
        >
          <Settings2 className="nav-icon" size={20} />
          <span className="nav-label">Settings</span>
        </Link>
        <button
          type="button"
          className="sidebar-nav-item sidebar-logout"
          onClick={logout}
        >
          <LogOut className="nav-icon" size={20} />
          <span className="nav-label">Logout</span>
        </button>
      </div>
    </aside>
  );
}
