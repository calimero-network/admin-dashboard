import React, { useState, useEffect } from 'react';
import { Routes, Route, BrowserRouter, Navigate } from 'react-router-dom';
import {
  ProtectedRoutesWrapper,
  apiClient,
  getAppEndpointKey,
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

import RootKeyProvidersWrapper from './components/keys/RootKeyProvidersWrapper';

import 'bootstrap/dist/css/bootstrap.min.css';

export default function App() {
  const [isAdminApiAvailable, setIsAdminApiAvailable] = useState<
    boolean | null
  >(null);

  useEffect(() => {
    const checkAdminApiAvailability = async () => {
      try {
        const baseUrl = getAppEndpointKey();
        if (!baseUrl) {
          setIsAdminApiAvailable(false);
          return;
        }

        // Try to call the admin API endpoint directly
        const response = await fetch(`${baseUrl}/admin/keys`, {
          method: 'HEAD', // Use HEAD to avoid downloading response body
          headers: {
            'Content-Type': 'application/json',
          },
        });

        // If we get any response other than 404, admin API is available
        if (response.status === 404) {
          setIsAdminApiAvailable(false);
        } else {
          // Status 200, 401, 403, etc. all mean the endpoint exists
          setIsAdminApiAvailable(true);
        }
      } catch (error) {
        // Network error or other issues - assume admin API not available
        setIsAdminApiAvailable(false);
      }
    };

    checkAdminApiAvailability();
  }, []);

  return (
    <BrowserRouter basename="/admin-dashboard">
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
