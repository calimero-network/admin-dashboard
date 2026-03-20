import React from 'react';
import { Routes, Route, BrowserRouter, Navigate } from 'react-router-dom';
import AuthWrapper from './components/AuthWrapper';

import Identity from './pages/Identity';
import ApplicationsPage from './pages/Applications';
import ContextsPage from './pages/Contexts';
import AddRootKey from './pages/AddRootKey';
import NotFound from './pages/NotFound';
import RootKeyProvidersWrapper from './components/keys/RootKeyProvidersWrapper';
import Dashboard from './pages/Dashboard';
import NewMarketplace from './pages/NewMarketplace';
import BlobsPage from './pages/Blobs';

export default function App() {
  const getBasePath = () => {
    const path = window.location.pathname;
    if (path.includes('/admin-dashboard')) {
      return path.substring(0, path.indexOf('/admin-dashboard') + '/admin-dashboard'.length);
    }
    return '/admin-dashboard';
  };

  return (
    <BrowserRouter basename={getBasePath()}>
      <AuthWrapper>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/marketplace" element={<NewMarketplace />} />
          <Route path="/applications" element={<ApplicationsPage />} />
          <Route path="/blobs" element={<BlobsPage />} />
          <Route path="/contexts" element={<ContextsPage />} />
          <Route path="/identity" element={<Identity />} />
          <Route path="/identity/root-key" element={<AddRootKey />} />
          <Route path="/identity/root-key/:providerId" element={<RootKeyProvidersWrapper />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthWrapper>
    </BrowserRouter>
  );
}
