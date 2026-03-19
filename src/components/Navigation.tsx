import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  HomeIcon,
  ShoppingBagIcon,
  CubeIcon,
  RectangleGroupIcon,
  KeyIcon,
  DocumentTextIcon,
  ArrowRightStartOnRectangleIcon,
} from '@heroicons/react/24/outline';
import {
  getAccessToken,
  getRefreshToken,
  clearAccessToken,
  clearApplicationId,
  clearContextId,
  clearExecutorPublicKey,
  clearAppEndpoint,
} from '@calimero-network/calimero-client';
import './Navigation.css';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', Icon: HomeIcon },
  { path: '/marketplace', label: 'Marketplace', Icon: ShoppingBagIcon },
  { path: '/applications', label: 'Applications', Icon: CubeIcon },
  { path: '/blobs', label: 'Blobs', Icon: DocumentTextIcon },
  { path: '/contexts', label: 'Contexts', Icon: RectangleGroupIcon },
  { path: '/identity', label: 'Identity', Icon: KeyIcon },
];

export function Navigation() {
  const location = useLocation();

  const hasTokens = () => {
    return !!(getAccessToken() && getRefreshToken());
  };

  const logout = () => {
    clearAccessToken();
    clearApplicationId();
    clearContextId();
    clearExecutorPublicKey();
    clearAppEndpoint();
    window.location.reload();
  };

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        <span className="sidebar-logo-dot" />
        <span className="sidebar-logo-text">Calimero</span>
        <span className="sidebar-logo-sub">Admin</span>
      </div>

      <div className="sidebar-nav">
        {navItems
          .filter(item => item.path !== '/identity' || hasTokens())
          .map(({ path, label, Icon }) => (
            <Link
              key={path}
              to={path}
              className={`sidebar-nav-item${isActive(path) ? ' active' : ''}`}
            >
              <Icon className="sidebar-nav-icon" />
              {label}
            </Link>
          ))}
      </div>

      <div className="sidebar-footer">
        <button className="sidebar-logout" onClick={logout}>
          <ArrowRightStartOnRectangleIcon className="sidebar-nav-icon" />
          Logout
        </button>
      </div>
    </nav>
  );
}
