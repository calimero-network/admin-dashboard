import React, { ReactNode } from 'react';
import { Routes, Route, BrowserRouter, Navigate } from 'react-router-dom';
import AuthWrapper from './components/AuthWrapper';
import AppShell from './components/AppShell';

import Dashboard from './pages/Dashboard';
import Marketplace from './pages/Marketplace';
import ApplicationsPage from './pages/Applications';
import BlobsPage from './pages/Blobs';
import NamespacesPage from './pages/Namespaces';
import NodePage from './pages/Node';
import SettingsPage from './pages/Settings';
import Identity from './pages/Identity';
import AddRootKey from './pages/AddRootKey';
import RootKeyProvidersWrapper from './components/keys/RootKeyProvidersWrapper';
import NotFound from './pages/NotFound';

/** Wrap a page in the shared chrome (sidebar + header + status pill). */
function Shell({ title, children }: { title: string; children: ReactNode }) {
  return <AppShell title={title}>{children}</AppShell>;
}

export default function App() {
  const getBasePath = () => {
    const path = window.location.pathname;
    if (path.includes('/admin-dashboard')) {
      return path.substring(
        0,
        path.indexOf('/admin-dashboard') + '/admin-dashboard'.length,
      );
    }
    return '/admin-dashboard';
  };

  return (
    <BrowserRouter basename={getBasePath()}>
      <AuthWrapper>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/dashboard"
            element={
              <Shell title="Home">
                <Dashboard />
              </Shell>
            }
          />
          <Route
            path="/marketplace"
            element={
              <Shell title="Marketplace">
                <Marketplace />
              </Shell>
            }
          />
          <Route
            path="/applications"
            element={
              <Shell title="Applications">
                <ApplicationsPage />
              </Shell>
            }
          />
          <Route
            path="/blobs"
            element={
              <Shell title="Blobs">
                <BlobsPage />
              </Shell>
            }
          />
          {/* Contexts have no page of their own: a context always belongs to
              exactly one group, so it is managed inside its namespace. Old
              links (and the desktop app's deep links) still resolve. */}
          <Route
            path="/contexts"
            element={<Navigate to="/namespaces" replace />}
          />
          <Route
            path="/namespaces"
            element={
              <Shell title="Namespaces">
                <NamespacesPage />
              </Shell>
            }
          />
          <Route
            path="/node"
            element={
              <Shell title="Node">
                <NodePage />
              </Shell>
            }
          />
          <Route
            path="/settings"
            element={
              <Shell title="Settings">
                <SettingsPage />
              </Shell>
            }
          />
          <Route
            path="/identity"
            element={
              <Shell title="Identity">
                <Identity />
              </Shell>
            }
          />
          <Route path="/identity/root-key" element={<AddRootKey />} />
          <Route
            path="/identity/root-key/:providerId"
            element={<RootKeyProvidersWrapper />}
          />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthWrapper>
    </BrowserRouter>
  );
}
