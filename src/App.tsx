import React from "react";
import { Routes, Route, BrowserRouter } from "react-router-dom";
import Identity from "./pages/Identity";
import Applications from "./pages/Applications";
import Contexts from "./pages/Contexts";
import StartContext from "./pages/StartContext";
import ContextDetails from "./pages/ContextDetails";
import Export from "./pages/Export";
import ApplicationDetails from "./pages/ApplicationDetails";
import PublishApplication from "./pages/PublishApplication";
import AddRelease from "./pages/AddRelease";
import Metamask from "./pages/Metamask";

import "bootstrap/dist/css/bootstrap.min.css";
import Near from "./pages/near";
import AddNearRootKey from "./pages/AddNearRootKey";
import AddMetamaskRootKey from "./pages/AddMetamaskRootKey";
import Authenticate from "./pages/Authenticate";
import AddRootKey from "./pages/AddRootKey";

export default function App() {
  return (
    <>
      <BrowserRouter basename="/admin-dashboard">
        <Routes>
          <Route path="/" element={<Authenticate />} />
          <Route path="/near" element={<Near />} />
          <Route path="/metamask" element={<Metamask />} />
          <Route path="/identity" element={<Identity />} />
          <Route path="/identity/root-key" element={<AddRootKey />} />
          <Route path="/identity/root-key/near" element={<AddNearRootKey />} />
          <Route
            path="/identity/root-key/metamask"
            element={<AddMetamaskRootKey />}
          />
          <Route path="/applications" element={<Applications />} />
          <Route path="/applications/:id" element={<ApplicationDetails />} />
          <Route path="/publish-application" element={<PublishApplication />} />
          <Route
            path="/applications/:id/add-release"
            element={<AddRelease />}
          />
          <Route path="/contexts" element={<Contexts />} />
          <Route path="/contexts/start-context" element={<StartContext />} />
          <Route path="/contexts/:id" element={<ContextDetails />} />
          <Route path="/export" element={<Export />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}
