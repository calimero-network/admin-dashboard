import React, { useState, useEffect } from 'react';
import { Routes, Route, BrowserRouter, Navigate } from 'react-router-dom';
import {
  ProtectedRoutesWrapper,
  getAppEndpointKey,
  getAuthEndpointURL,
} from '@calimero-network/calimero-client';

import Identity from './pages/Identity';
import ApplicationsPage from './pages/Applications';
import Contexts from './pages/Contexts';
import StartContext from './pages/StartContext';
import JoinContext from './pages/JoinContext';
import ContextDetails from './pages/ContextDetails';
import Export from './pages/Export';
import ApplicationDetails from './pages/ApplicationDetails';
import PublishApplication from './pages/PublishApplication';
import AddRelease from './pages/AddRelease';
import AddRootKey from './pages/AddRootKey';
import InstallApplication from './pages/InstallApplication';
import BlobsPage from './pages/Blobs';

import RootKeyProvidersWrapper from './components/keys/RootKeyProvidersWrapper';

import 'bootstrap/dist/css/bootstrap.min.css';

export default function App() {
  const [isAdminApiAvailable, setIsAdminApiAvailable] = useState<
    boolean | null
  >(null);

  useEffect(() => {
    const checkAdminApiAvailability = async () => {
      try {
        const baseUrl = getAuthEndpointURL();
        if (!baseUrl) {
          setIsAdminApiAvailable(false);
          return;
        }

        const response = await fetch(`${baseUrl}/admin/keys`, {
          method: 'HEAD',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.status === 404) {
          setIsAdminApiAvailable(false);
        } else {
          setIsAdminApiAvailable(true);
        }
      } catch (error) {
        setIsAdminApiAvailable(false);
      }
    };

    checkAdminApiAvailability();
  }, []);

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
      <ProtectedRoutesWrapper permissions={['admin']}>
        <Routes>
          {isAdminApiAvailable ? (
            <>
              <Route path="/" element={<Navigate to="/identity" replace />} />
              <Route path="/identity" element={<Identity />} />
              <Route path="/identity/root-key" element={<AddRootKey />} />
              <Route
                path="/identity/root-key/:providerId"
                element={<RootKeyProvidersWrapper />}
              />
            </>
          ) : (
            <Route path="/" element={<Navigate to="/applications" replace />} />
          )}

          <Route path="/applications" element={<ApplicationsPage />} />
          <Route
            path="/applications/install"
            element={<InstallApplication />}
          />
          <Route path="/applications/:id" element={<ApplicationDetails />} />
          <Route path="/publish-application" element={<PublishApplication />} />
          <Route
            path="/applications/:id/add-release"
            element={<AddRelease />}
          />

          {/* Context routes */}
          <Route path="/contexts" element={<Contexts />} />
          <Route path="/contexts/start-context" element={<StartContext />} />
          <Route path="/contexts/join-context" element={<JoinContext />} />
          <Route path="/contexts/:id" element={<ContextDetails />} />

          {/* Blobs route */}
          <Route path="/blobs" element={<BlobsPage />} />

          {/* Export route */}
          <Route path="/export" element={<Export />} />

          {/* Catch all unknown routes and redirect appropriately */}
          <Route
            path="*"
            element={
              <Navigate
                to={isAdminApiAvailable ? '/identity' : '/applications'}
                replace
              />
            }
          />
        </Routes>
      </ProtectedRoutesWrapper>
    </BrowserRouter>
  );
}
