import React, { useState, useEffect } from 'react';
import { Routes, Route, BrowserRouter, Navigate } from 'react-router-dom';
import {
  ProtectedRoutesWrapper,
  getAccessToken,
  getRefreshToken,
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
  const [hasValidTokens, setHasValidTokens] = useState<boolean>(false);
  const [isTokenCheckComplete, setIsTokenCheckComplete] =
    useState<boolean>(false);

  useEffect(() => {
    const checkTokens = () => {
      const accessToken = getAccessToken();
      const refreshToken = getRefreshToken();

      const tokensExist = accessToken && refreshToken;
      setHasValidTokens(!!tokensExist);
      setIsTokenCheckComplete(true);
    };

    checkTokens();
  }, []);

  // Show loading state while checking tokens
  if (!isTokenCheckComplete) {
    return <div>Loading...</div>;
  }

  return (
    <BrowserRouter basename="/admin-dashboard">
      <ProtectedRoutesWrapper permissions={['admin']}>
        <Routes>
          {hasValidTokens ? (
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

          {/* Catch all unknown routes and redirect to identity */}
          <Route path="*" element={<Navigate to="/identity" replace />} />
        </Routes>
      </ProtectedRoutesWrapper>
    </BrowserRouter>
  );
}
