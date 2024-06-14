import React, { useEffect } from 'react';
import { Routes, Route, BrowserRouter } from 'react-router-dom';
import { setNodeUrlFromQuery } from './utils/storage';

import Identity from './pages/Identity';
import Applications from './pages/Applications';
import Contexts from './pages/Contexts';
import StartContext from './pages/StartContext';
import ContextDetails from './pages/ContextDetails';
import Export from './pages/Export';
import ApplicationDetails from './pages/ApplicationDetails';
import PublishApplication from './pages/PublishApplication';
import AddRelease from './pages/AddRelease';
import Metamask from './pages/Metamask';
import AddNearRootKey from './pages/AddNearRootKey';
import AddMetamaskRootKey from './pages/AddMetamaskRootKey';
import Authenticate from './pages/Authenticate';
import AddRootKey from './pages/AddRootKey';
import SetupPage from './pages/setup';
import Near from './pages/Near';
import ProtectedRoute from './components/protectedRoutes/ProtectedRoute';

import 'bootstrap/dist/css/bootstrap.min.css';

export default function App() {
  useEffect(() => {
    setNodeUrlFromQuery();
  }, []);

  return (
    <>
      <BrowserRouter basename="/admin-dashboard">
        <Routes>
          <Route path="/" element={<SetupPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/auth" element={<Authenticate />} />
            <Route path="/auth/near" element={<Near />} />
            <Route path="/auth/metamask" element={<Metamask />} />
            <Route path="/identity" element={<Identity />} />
            <Route path="/identity/root-key" element={<AddRootKey />} />
            <Route
              path="/identity/root-key/near"
              element={<AddNearRootKey />}
            />
            <Route
              path="/identity/root-key/metamask"
              element={<AddMetamaskRootKey />}
            />
            <Route path="/applications" element={<Applications />} />
            <Route path="/applications/:id" element={<ApplicationDetails />} />
            <Route
              path="/publish-application"
              element={<PublishApplication />}
            />
            <Route
              path="/applications/:id/add-release"
              element={<AddRelease />}
            />
            <Route path="/contexts" element={<Contexts />} />
            <Route path="/contexts/start-context" element={<StartContext />} />
            <Route path="/contexts/:id" element={<ContextDetails />} />
            <Route path="/export" element={<Export />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </>
  );
}
